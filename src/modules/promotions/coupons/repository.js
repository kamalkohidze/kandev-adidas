import { randomUUID } from "node:crypto";
import { buildCouponLifecycleEvent } from "../events/factory.js";
import { evaluateCouponValidity, evaluatePromotionCompatibility } from "../rules/evaluator.js";
import { getPromotionPreset } from "./presets.js";

export function issueCoupon(data, request, options = {}) {
  const idempotencyKey = options.idempotencyKey || null;
  const existing = idempotencyKey
    ? ensureArray(data, "promotion_coupons").find((coupon) => coupon.issue_idempotency_key === idempotencyKey)
    : null;

  if (existing) {
    return { coupon: existing, created: false, events: [] };
  }

  const preset = getPromotionPreset(request.promotion_type);
  if (!preset) {
    throw new Error("unsupported_promotion_type");
  }

  const customer = (data.customers || []).find((candidate) => candidate.id === request.customer_id);
  if (!customer) {
    throw new Error("customer_not_found");
  }

  const issuedAt = request.issued_at || options.asOf || new Date().toISOString();
  const validFrom = request.valid_from || issuedAt;
  const expiresAt = request.expires_at || addDays(validFrom, preset.valid_days).toISOString();
  assertValidDateRange(validFrom, expiresAt);
  const code = request.code ? normalizeCouponCode(request.code) : generateCouponCode(preset.code_prefix);

  if (findCoupon(data, { code, customerId: customer.id, tenantId: customer.tenant_id })) {
    throw new Error("coupon_code_already_exists");
  }

  const coupon = {
    id: request.id || randomUUID(),
    tenant_id: customer.tenant_id,
    customer_id: customer.id,
    code,
    promotion_type: request.promotion_type,
    discount_percent: request.discount_percent || preset.discount_percent,
    valid_from: validFrom,
    expires_at: expiresAt,
    issued_at: issuedAt,
    status: "active",
    single_use: request.single_use ?? preset.single_use,
    stackable_with_loyalty: request.stackable_with_loyalty ?? preset.stackable_with_loyalty,
    stackable_with_sale: request.stackable_with_sale ?? preset.stackable_with_sale,
    eligibility: {
      requires_early_access: request.requires_early_access ?? preset.requires_early_access
    },
    redeemed_at: null,
    redemption_ref: null,
    redeemed_idempotency_key: null,
    issue_idempotency_key: idempotencyKey,
    metadata: request.metadata || {},
    created_at: issuedAt,
    updated_at: issuedAt,
    version: 1
  };

  ensureArray(data, "promotion_coupons").push(coupon);
  const event = appendEvent(data, "promotion.coupon.issued", coupon, {
    ...options,
    occurredAt: issuedAt,
    idempotencyKey: idempotencyKey || coupon.id,
    producer: options.producer || "promotions.coupons.repository"
  });

  return { coupon, created: true, events: [event] };
}

export function validateCoupon(data, request, options = {}) {
  const coupon = findCoupon(data, {
    code: request.code,
    customerId: request.customer_id,
    tenantId: options.tenantId || request.tenant_id || null
  });
  const asOf = request.as_of || options.asOf || new Date().toISOString();

  if (!coupon) {
    return {
      valid: false,
      reason: "coupon_not_found",
      coupon: null,
      discount_percent: "0.00",
      discount_amount: "0.00",
      net_amount: null,
      lines: [],
      warnings: [],
      events: []
    };
  }

  const validity = evaluateCouponValidity(coupon, asOf);
  if (validity.reason === "coupon_expired" && coupon.status === "active") {
    coupon.status = "expired";
    coupon.updated_at = asOf;
    coupon.version += 1;
    appendEvent(data, "promotion.coupon.expired", coupon, {
      ...options,
      occurredAt: asOf,
      idempotencyKey: `${coupon.id}:${coupon.expires_at}:expired`,
      producer: options.producer || "promotions.coupons.repository"
    });
  }

  const evaluation = evaluatePromotionCompatibility(data, {
    coupon,
    customerId: request.customer_id,
    cart: request.cart || null,
    asOf
  });

  const event = appendEvent(data, evaluation.valid ? "promotion.coupon.validated" : "promotion.coupon.validation_failed", coupon, {
    ...options,
    occurredAt: asOf,
    idempotencyKey: options.idempotencyKey || `${coupon.id}:${asOf}:validated`,
    producer: options.producer || "promotions.coupons.repository",
    payload: {
      valid: evaluation.valid,
      reason: evaluation.reason,
      discount_amount: evaluation.discount_amount,
      warnings: evaluation.warnings
    }
  });

  return {
    ...evaluation,
    coupon,
    events: [event]
  };
}

export function redeemCoupon(data, request, options = {}) {
  const coupon = findCoupon(data, {
    code: request.code,
    customerId: request.customer_id,
    tenantId: options.tenantId || request.tenant_id || null
  });
  const idempotencyKey = options.idempotencyKey || null;

  if (coupon?.redeemed_idempotency_key && coupon.redeemed_idempotency_key === idempotencyKey) {
    return {
      redeemed: true,
      idempotent: true,
      coupon,
      reason: null,
      discount_percent: coupon.discount_percent,
      discount_amount: coupon.last_redemption?.discount_amount || "0.00",
      net_amount: coupon.last_redemption?.net_amount || null,
      lines: coupon.last_redemption?.lines || [],
      warnings: [],
      events: []
    };
  }

  const validation = validateCoupon(data, request, options);
  if (!validation.valid) {
    return {
      redeemed: false,
      idempotent: false,
      ...validation
    };
  }

  const asOf = request.as_of || options.asOf || new Date().toISOString();
  validation.coupon.status = validation.coupon.single_use ? "redeemed" : "active";
  validation.coupon.redeemed_at = asOf;
  validation.coupon.redemption_ref = request.redemption_ref;
  validation.coupon.redeemed_idempotency_key = idempotencyKey;
  validation.coupon.last_redemption = {
    discount_amount: validation.discount_amount,
    net_amount: validation.net_amount,
    lines: validation.lines
  };
  validation.coupon.updated_at = asOf;
  validation.coupon.version += 1;

  const event = appendEvent(data, "promotion.coupon.redeemed", validation.coupon, {
    ...options,
    occurredAt: asOf,
    idempotencyKey: idempotencyKey || `${validation.coupon.id}:${asOf}:redeemed`,
    producer: options.producer || "promotions.coupons.repository",
    payload: {
      redemption_ref: request.redemption_ref,
      discount_amount: validation.discount_amount,
      net_amount: validation.net_amount
    }
  });

  return {
    redeemed: true,
    idempotent: false,
    ...validation,
    events: [...validation.events, event]
  };
}

export function findCoupon(data, { code, customerId = null, tenantId = null }) {
  const normalizedCode = normalizeCouponCode(code);
  return (
    ensureArray(data, "promotion_coupons").find(
      (coupon) =>
        coupon.code === normalizedCode &&
        (!customerId || coupon.customer_id === customerId) &&
        (!tenantId || coupon.tenant_id === tenantId)
    ) || null
  );
}

function appendEvent(data, eventType, coupon, options = {}) {
  const event = buildCouponLifecycleEvent({
    eventType,
    coupon,
    occurredAt: options.occurredAt || options.asOf,
    correlationId: options.correlationId,
    causationId: options.causationId || null,
    idempotencyKey: options.idempotencyKey,
    locale: options.locale || null,
    producer: options.producer,
    payload: options.payload || {}
  });
  ensureArray(data, "promotion_events").push(event);
  return event;
}

function generateCouponCode(prefix) {
  return `${prefix}-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

function normalizeCouponCode(value) {
  return String(value ?? "").trim().toUpperCase();
}

function addDays(value, days) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function assertValidDateRange(validFrom, expiresAt) {
  const validFromTime = new Date(validFrom).getTime();
  const expiresAtTime = new Date(expiresAt).getTime();

  if (!Number.isFinite(validFromTime) || !Number.isFinite(expiresAtTime)) {
    throw new Error("invalid_coupon_dates");
  }

  if (expiresAtTime <= validFromTime) {
    throw new Error("coupon_expiry_must_be_after_valid_from");
  }
}

function ensureArray(target, field) {
  if (!Array.isArray(target[field])) {
    target[field] = [];
  }

  return target[field];
}
