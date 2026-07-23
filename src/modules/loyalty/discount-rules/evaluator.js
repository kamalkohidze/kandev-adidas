import { randomUUID } from "node:crypto";
import {
  compareMoney,
  formatMinor,
  normalizeMoney,
  parseMoney,
  subtractMoney,
  sumMoney
} from "../../transactions/ledger/money.js";
import { buildDiscountEvaluatedEvent } from "../events/factory.js";
import { findLoyaltyAccount, getAccountTierSnapshot } from "../tiers/accounts.js";

const saleDiscountTypes = new Set(["global_sale", "sale"]);

export function evaluateLoyaltyDiscount(data, request, options = {}) {
  const customer = (data.customers || []).find((candidate) => candidate.id === request.customer_id);
  const tenantId = options.tenantId || customer?.tenant_id || request.tenant_id || null;
  const currency = request.cart?.currency || options.currency || "KZT";
  const account = customer ? findLoyaltyAccount(data, { customerId: customer.id, tenantId }) : null;
  const tier = getAccountTierSnapshot(data, account);
  const discountPercent = tier.discount_percent;
  const cartHasGlobalSale = hasGlobalSale(request.cart);
  const warnings = [];
  const lines = (request.cart?.items || []).map((item, index) =>
	    evaluateLine({
	      data,
	      item,
	      index,
	      tenantId,
	      currency,
	      discountPercent,
	      cartHasGlobalSale,
	      warnings
    })
  );
  const grossAmount = sumMoney(lines.map((line) => line.gross_amount));
  const discountAmount = sumMoney(lines.map((line) => line.discount_amount));
  const evaluation = {
    evaluation_id: options.evaluationId || randomUUID(),
    customer_id: request.customer_id,
    tier_code: tier.tier_code,
    discount_percent: discountPercent,
    gross_amount: grossAmount,
    discount_amount: discountAmount,
    net_amount: subtractMoney(grossAmount, discountAmount),
    currency,
    lines: lines.map(({ gross_amount, ...line }) => line),
    warnings
  };

  const event = buildDiscountEvaluatedEvent({
    evaluation,
    tenantId,
    customerId: request.customer_id,
    occurredAt: options.asOf || new Date().toISOString(),
    correlationId: options.correlationId,
    causationId: options.causationId || null,
    idempotencyKey: options.idempotencyKey || evaluation.evaluation_id,
    locale: options.locale || null,
    producer: options.producer || "loyalty.pos-discounts.api"
  });
  ensureArray(data, "loyalty_events").push(event);

  return {
    ...evaluation,
    events: [event]
  };
}

export function validateDiscountEvaluationRequest(body) {
  const details = [];

  if (!isPlainObject(body)) {
    return [{ field: "body", reason: "object_required" }];
  }

  requireString(body, "customer_id", details);
  if (!isPlainObject(body.cart)) {
    details.push({ field: "cart", reason: "object_required" });
    return details;
  }

  requireString(body.cart, "currency", details, "cart.currency");
  if (!Array.isArray(body.cart.items) || body.cart.items.length === 0) {
    details.push({ field: "cart.items", reason: "non_empty_array_required" });
    return details;
  }

  body.cart.items.forEach((item, index) => {
    if (!isPlainObject(item)) {
      details.push({ field: `cart.items.${index}`, reason: "object_required" });
      return;
    }

    requireString(item, "sku", details, `cart.items.${index}.sku`);
    validateDecimalString(item.quantity ?? "1", `cart.items.${index}.quantity`, details);
    validateMoneyLike(item.unit_price, `cart.items.${index}.unit_price`, details);
  });

  return details;
}

function evaluateLine({ data, item, index, tenantId, currency, discountPercent, cartHasGlobalSale, warnings }) {
  const quantity = item.quantity ?? "1";
  const grossAmount = normalizeMoney(item.gross_amount ?? multiplyMoneyByQuantity(item.unit_price, quantity));
  const policy = resolveDiscountPolicy(data, item, tenantId);
  const lineHasGlobalSale = cartHasGlobalSale || hasGlobalSale(item);
  const allowed = policy.loyalty_discount_allowed !== false && item.loyalty_discount_allowed !== false;
  let discountAmount = "0.00";
  let reason = null;

  if (!allowed) {
    reason = "loyalty_discount_not_allowed_for_product";
  } else if (lineHasGlobalSale) {
    reason = "loyalty_not_stackable_with_global_sale";
  } else if (compareMoney(discountPercent, "0.00") > 0) {
    discountAmount = applyPercent(grossAmount, discountPercent);
  }

  if (reason) {
    warnings.push({
      code: reason,
      item_index: index,
      sku: item.sku
    });
  }

  return {
    sku: item.sku,
    product_id: policy.product_id,
    product_variant_id: policy.product_variant_id,
    loyalty_discount_allowed: allowed,
    blocked_by_global_sale: lineHasGlobalSale,
    discount_amount: discountAmount,
    gross_amount: grossAmount,
    net_amount: subtractMoney(grossAmount, discountAmount),
    currency
  };
}

function resolveDiscountPolicy(data, item, tenantId) {
  const variant = (data.product_variants || []).find(
    (candidate) =>
      matchesTenant(candidate, tenantId) &&
      (candidate.id === item.product_variant_id ||
        candidate.variant_sku === item.sku ||
        candidate.barcode === item.barcode)
  ) || null;
  const product = (data.products || []).find(
    (candidate) =>
      matchesTenant(candidate, tenantId) &&
      (candidate.id === item.product_id ||
        candidate.id === variant?.product_id ||
        candidate.sku === item.sku)
  ) || null;

  return {
    product_id: product?.id ?? item.product_id ?? null,
    product_variant_id: variant?.id ?? item.product_variant_id ?? null,
    loyalty_discount_allowed: product?.discount_policy?.loyalty_discount_allowed !== false
  };
}

function matchesTenant(candidate, tenantId) {
  return !tenantId || candidate.tenant_id === tenantId;
}

function hasGlobalSale(target) {
  if (!target) {
    return false;
  }

  if (target.global_sale === true || target.has_global_sale === true) {
    return true;
  }

  for (const field of ["global_sale_discount_amount", "sale_discount_amount"]) {
    if (target[field] !== undefined && compareMoney(target[field], "0.00") > 0) {
      return true;
    }
  }

  return (target.applied_discounts || []).some((discount) => {
    if (!saleDiscountTypes.has(discount.type)) {
      return false;
    }

    return discount.amount === undefined || compareMoney(discount.amount, "0.00") > 0;
  });
}

function applyPercent(amount, percent) {
  const amountMinor = parseMoney(amount);
  const percentMinor = parseMoney(percent);
  return formatMinor(roundDivide(amountMinor * percentMinor, 10000n));
}

function multiplyMoneyByQuantity(amount, quantity) {
  const amountMinor = parseMoney(amount);
  const quantityUnits = parseQuantityUnits(quantity);
  return formatMinor(roundDivide(amountMinor * quantityUnits, 1000n));
}

function parseQuantityUnits(value) {
  const raw = String(value ?? "1").trim();
  if (!/^\d+(\.\d{1,3})?$/.test(raw)) {
    throw new Error("quantity_decimal_string_required");
  }

  const [units, fraction = ""] = raw.split(".");
  return BigInt(units) * 1000n + BigInt(fraction.padEnd(3, "0"));
}

function roundDivide(value, divisor) {
  if (value >= 0n) {
    return (value + divisor / 2n) / divisor;
  }

  return (value - divisor / 2n) / divisor;
}

function requireString(target, field, details, path = field) {
  if (typeof target[field] !== "string" || target[field].trim() === "") {
    details.push({ field: path, reason: "required" });
  }
}

function validateMoneyLike(value, field, details) {
  try {
    normalizeMoney(value);
  } catch (error) {
    details.push({ field, reason: error.message || "money_decimal_string_required" });
  }
}

function validateDecimalString(value, field, details) {
  if (!/^\d+(\.\d{1,3})?$/.test(String(value ?? "").trim())) {
    details.push({ field, reason: "quantity_decimal_string_required" });
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function ensureArray(target, field) {
  if (!Array.isArray(target[field])) {
    target[field] = [];
  }

  return target[field];
}
