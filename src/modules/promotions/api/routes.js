import { createJsonResponse, createValidationResponse } from "../../../platform/http.js";
import { createSeedData } from "../../../platform/seed-data.js";
import { resolveRequestLocale } from "../../i18n/index.js";
import { issueCoupon, redeemCoupon, validateCoupon } from "../coupons/repository.js";
import { listPromotionTypes } from "../coupons/presets.js";
import { validatePromotionCart } from "../rules/evaluator.js";

export function registerPromotionRoutes(route, data = createSeedData()) {
  route("POST", "/api/v1/promotions/coupons", async ({ headers, body }) => {
    const requestLocale = resolveRequestLocale(headers);
    const idempotencyKey = getHeader(headers, "idempotency-key");
    const details = validateIssueRequest(body);

    if (!idempotencyKey) {
      details.push({ field: "Idempotency-Key", reason: "required" });
    }

    if (details.length > 0) {
      return createValidationResponse(details, requestLocale);
    }

    let result;
    try {
      result = issueCoupon(data, body, {
        idempotencyKey,
        correlationId: getHeader(headers, "x-correlation-id") || idempotencyKey,
        locale: requestLocale,
        producer: "promotions.coupons.api"
      });
    } catch (error) {
      return createValidationResponse([{ field: "body", reason: error.message || "invalid_coupon_issue_payload" }], requestLocale);
    }

    return createJsonResponse(result.created ? 201 : 200, {
      coupon: toCouponResponse(result.coupon),
      idempotent: !result.created,
      events: result.events.map((event) => event.event_type)
    });
  });

  route("POST", "/api/v1/promotions/coupons/validate", async ({ headers, body }) => {
    const requestLocale = resolveRequestLocale(headers);
    const details = validateCouponRequest(body, { requireRedemptionRef: false });
    validatePromotionCart(body?.cart, details);

    if (details.length > 0) {
      return createValidationResponse(details, requestLocale);
    }

    const result = validateCoupon(data, body, {
      correlationId: getHeader(headers, "x-correlation-id"),
      locale: requestLocale,
      producer: "promotions.coupons.api"
    });

    return createJsonResponse(200, toValidationResponse(result));
  });

  route("POST", "/api/v1/promotions/coupons/redeem", async ({ headers, body }) => {
    const requestLocale = resolveRequestLocale(headers);
    const idempotencyKey = getHeader(headers, "idempotency-key");
    const details = validateCouponRequest(body, { requireRedemptionRef: true });
    validatePromotionCart(body?.cart, details);

    if (!idempotencyKey) {
      details.push({ field: "Idempotency-Key", reason: "required" });
    }

    if (details.length > 0) {
      return createValidationResponse(details, requestLocale);
    }

    const result = redeemCoupon(data, body, {
      idempotencyKey,
      correlationId: getHeader(headers, "x-correlation-id") || idempotencyKey,
      locale: requestLocale,
      producer: "promotions.coupons.api"
    });

    if (!result.redeemed) {
      return createJsonResponse(409, {
        error: {
          code: "coupon_not_redeemable",
          message: "Coupon cannot be redeemed",
          details: [{ field: "code", reason: result.reason }]
        },
        validation: toValidationResponse(result)
      });
    }

    return createJsonResponse(200, {
      redeemed: true,
      idempotent: result.idempotent,
      coupon: toCouponResponse(result.coupon),
      discount_percent: result.discount_percent,
      discount_amount: result.discount_amount,
      net_amount: result.net_amount,
      lines: toLineResponses(result.lines),
      warnings: result.warnings,
      events: result.events.map((event) => event.event_type)
    });
  });
}

function validateIssueRequest(body) {
  const details = [];

  if (!isPlainObject(body)) {
    return [{ field: "body", reason: "object_required" }];
  }

  requireString(body, "customer_id", details);
  requireString(body, "promotion_type", details);

  if (typeof body.promotion_type === "string" && !listPromotionTypes().includes(body.promotion_type)) {
    details.push({ field: "promotion_type", reason: "unsupported_promotion_type" });
  }

  if (body.discount_percent !== undefined && !/^\d+(\.\d{1,2})?$/.test(String(body.discount_percent))) {
    details.push({ field: "discount_percent", reason: "percent_decimal_string_required" });
  }

  for (const field of ["valid_from", "expires_at", "issued_at"]) {
    if (body[field] !== undefined && Number.isNaN(new Date(body[field]).getTime())) {
      details.push({ field, reason: "datetime_required" });
    }
  }

  if (body.valid_from !== undefined && body.expires_at !== undefined) {
    const validFromTime = new Date(body.valid_from).getTime();
    const expiresAtTime = new Date(body.expires_at).getTime();
    if (Number.isFinite(validFromTime) && Number.isFinite(expiresAtTime) && expiresAtTime <= validFromTime) {
      details.push({ field: "expires_at", reason: "must_be_after_valid_from" });
    }
  }

  return details;
}

function validateCouponRequest(body, { requireRedemptionRef }) {
  const details = [];

  if (!isPlainObject(body)) {
    return [{ field: "body", reason: "object_required" }];
  }

  requireString(body, "customer_id", details);
  requireString(body, "code", details);

  if (requireRedemptionRef) {
    requireString(body, "redemption_ref", details);
  }

  if (body.as_of !== undefined && Number.isNaN(new Date(body.as_of).getTime())) {
    details.push({ field: "as_of", reason: "datetime_required" });
  }

  return details;
}

function toValidationResponse(result) {
  return {
    valid: result.valid,
    reason: result.reason,
    coupon: result.coupon ? toCouponResponse(result.coupon) : null,
    discount_percent: result.discount_percent,
    discount_amount: result.discount_amount,
    net_amount: result.net_amount,
    lines: toLineResponses(result.lines),
    warnings: result.warnings,
    events: result.events.map((event) => event.event_type)
  };
}

function toCouponResponse(coupon) {
  return {
    id: coupon.id,
    tenant_id: coupon.tenant_id,
    customer_id: coupon.customer_id,
    code: coupon.code,
    promotion_type: coupon.promotion_type,
    discount_percent: coupon.discount_percent,
    valid_from: coupon.valid_from,
    expires_at: coupon.expires_at,
    status: coupon.status,
    single_use: coupon.single_use,
    stackable_with_loyalty: coupon.stackable_with_loyalty,
    stackable_with_sale: coupon.stackable_with_sale,
    eligibility: coupon.eligibility,
    redeemed_at: coupon.redeemed_at,
    redemption_ref: coupon.redemption_ref
  };
}

function toLineResponses(lines = []) {
  return lines.map((line) => ({
    sku: line.sku,
    product_id: line.product_id,
    product_variant_id: line.product_variant_id,
    promotion_discount_allowed: line.promotion_discount_allowed,
    blocked_by_sale: line.blocked_by_sale,
    discount_amount: line.discount_amount,
    net_amount: line.net_amount
  }));
}

function requireString(target, field, details) {
  if (typeof target[field] !== "string" || target[field].trim() === "") {
    details.push({ field, reason: "required" });
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getHeader(headers, name) {
  if (typeof headers?.get === "function") {
    return headers.get(name);
  }

  const lowerName = name.toLowerCase();
  const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === lowerName);
  return entry?.[1] || null;
}
