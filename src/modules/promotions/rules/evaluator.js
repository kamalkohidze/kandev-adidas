import { compareMoney, formatMinor, normalizeMoney, parseMoney, subtractMoney, sumMoney } from "../../transactions/ledger/money.js";
import { getAccountTierSnapshot, findLoyaltyAccount } from "../../loyalty/tiers/accounts.js";

const saleDiscountTypes = new Set(["global_sale", "sale"]);
const loyaltyDiscountTypes = new Set(["loyalty"]);
// The current scaffold has no marketing segment read model for early access.
// Promotions therefore consume only public Customer/Loyalty read-model fields.
const earlyAccessTierCodes = new Set(["gold"]);

export function evaluatePromotionCompatibility(data, { coupon, customerId, cart = null, asOf = new Date().toISOString() }) {
  const warnings = [];

  if (!coupon) {
    return invalid("coupon_not_found", warnings);
  }

  if (coupon.customer_id !== customerId) {
    return invalid("coupon_customer_mismatch", warnings);
  }

  const validity = evaluateCouponValidity(coupon, asOf);
  if (!validity.valid) {
    return invalid(validity.reason, warnings);
  }

  if (coupon.eligibility?.requires_early_access && !isEarlyAccessEligible(data, coupon.customer_id, coupon.tenant_id)) {
    return invalid("early_access_not_eligible", warnings);
  }

  if (!cart) {
    return {
      valid: true,
      reason: null,
      warnings,
      discount_percent: coupon.discount_percent,
      discount_amount: "0.00",
      net_amount: null,
      lines: [],
      early_access_eligible: true
    };
  }

  const currency = cart.currency || "KZT";
  const cartHasLoyalty = hasLoyaltyDiscount(cart);
  if (cartHasLoyalty && coupon.stackable_with_loyalty !== true) {
    return invalid("promotion_not_stackable_with_loyalty", warnings);
  }

  const cartHasSale = hasSaleDiscount(cart);
  const lines = (cart.items || []).map((item, index) =>
    evaluateLine({
      data,
      item,
      index,
      tenantId: coupon.tenant_id,
      currency,
      discountPercent: coupon.discount_percent,
      stackableWithSale: coupon.stackable_with_sale === true,
      cartHasSale,
      warnings
    })
  );

  const eligibleLines = lines.filter((line) => line.promotion_discount_allowed);
  if (lines.length > 0 && eligibleLines.length === 0) {
    return {
      valid: false,
      reason: "no_eligible_items",
      warnings,
      discount_percent: coupon.discount_percent,
      discount_amount: "0.00",
      net_amount: sumMoney(lines.map((line) => line.gross_amount)),
      lines,
      early_access_eligible: true
    };
  }

  const grossAmount = sumMoney(lines.map((line) => line.gross_amount));
  const discountAmount = sumMoney(lines.map((line) => line.discount_amount));

  return {
    valid: true,
    reason: null,
    warnings,
    discount_percent: coupon.discount_percent,
    discount_amount: discountAmount,
    net_amount: subtractMoney(grossAmount, discountAmount),
    lines,
    early_access_eligible: true
  };
}

export function evaluateCouponValidity(coupon, asOf = new Date().toISOString()) {
  if (coupon.status === "redeemed") {
    return { valid: false, reason: "coupon_already_redeemed" };
  }

  if (coupon.status === "cancelled") {
    return { valid: false, reason: "coupon_cancelled" };
  }

  if (coupon.status === "expired") {
    return { valid: false, reason: "coupon_expired" };
  }

  const now = new Date(asOf).getTime();
  const validFrom = new Date(coupon.valid_from).getTime();
  const expiresAt = new Date(coupon.expires_at).getTime();

  if (!Number.isFinite(now) || !Number.isFinite(validFrom) || !Number.isFinite(expiresAt)) {
    return { valid: false, reason: "invalid_coupon_dates" };
  }

  if (now < validFrom) {
    return { valid: false, reason: "coupon_not_started" };
  }

  if (now >= expiresAt) {
    return { valid: false, reason: "coupon_expired" };
  }

  return { valid: true, reason: null };
}

export function isEarlyAccessEligible(data, customerId, tenantId) {
  const customer = (data.customers || []).find((candidate) => candidate.id === customerId && matchesTenant(candidate, tenantId));
  if (!customer || customer.status !== "active") {
    return false;
  }

  if (customer.lifecycle_status === "early_access" || customer.lifecycle_status === "vip") {
    return true;
  }

  const account = findLoyaltyAccount(data, { customerId, tenantId });
  const tier = getAccountTierSnapshot(data, account);
  return earlyAccessTierCodes.has(tier.tier_code) || compareMoney(tier.discount_percent, "15.00") >= 0;
}

export function validatePromotionCart(cart, details, path = "cart") {
  if (cart === undefined || cart === null) {
    return;
  }

  if (!isPlainObject(cart)) {
    details.push({ field: path, reason: "object_required" });
    return;
  }

  if (typeof cart.currency !== "string" || cart.currency.trim() === "") {
    details.push({ field: `${path}.currency`, reason: "required" });
  }

  validateOptionalMoney(cart, "loyalty_discount_percent", details, path);
  validateOptionalMoney(cart, "global_sale_discount_amount", details, path);
  validateOptionalMoney(cart, "sale_discount_amount", details, path);
  validateAppliedDiscounts(cart, details, path);

  if (!Array.isArray(cart.items) || cart.items.length === 0) {
    details.push({ field: `${path}.items`, reason: "non_empty_array_required" });
    return;
  }

  cart.items.forEach((item, index) => {
    if (!isPlainObject(item)) {
      details.push({ field: `${path}.items.${index}`, reason: "object_required" });
      return;
    }

    if (typeof item.sku !== "string" || item.sku.trim() === "") {
      details.push({ field: `${path}.items.${index}.sku`, reason: "required" });
    }

    if (!/^\d+(\.\d{1,3})?$/.test(String(item.quantity ?? "1").trim())) {
      details.push({ field: `${path}.items.${index}.quantity`, reason: "quantity_decimal_string_required" });
    }

    try {
      normalizeMoney(item.unit_price);
    } catch (error) {
      details.push({ field: `${path}.items.${index}.unit_price`, reason: error.message || "money_decimal_string_required" });
    }

    validateOptionalMoney(item, "gross_amount", details, `${path}.items.${index}`);
    validateOptionalMoney(item, "global_sale_discount_amount", details, `${path}.items.${index}`);
    validateOptionalMoney(item, "sale_discount_amount", details, `${path}.items.${index}`);
    validateAppliedDiscounts(item, details, `${path}.items.${index}`);
  });
}

function validateOptionalMoney(target, field, details, path) {
  if (target[field] === undefined) {
    return;
  }

  try {
    normalizeMoney(target[field]);
  } catch (error) {
    details.push({ field: `${path}.${field}`, reason: error.message || "money_decimal_string_required" });
  }
}

function validateAppliedDiscounts(target, details, path) {
  if (target.applied_discounts === undefined) {
    return;
  }

  if (!Array.isArray(target.applied_discounts)) {
    details.push({ field: `${path}.applied_discounts`, reason: "array_required" });
    return;
  }

  target.applied_discounts.forEach((discount, index) => {
    if (!isPlainObject(discount)) {
      details.push({ field: `${path}.applied_discounts.${index}`, reason: "object_required" });
      return;
    }

    validateOptionalMoney(discount, "amount", details, `${path}.applied_discounts.${index}`);
  });
}

function evaluateLine({ data, item, index, tenantId, currency, discountPercent, stackableWithSale, cartHasSale, warnings }) {
  const quantity = item.quantity ?? "1";
  const grossAmount = normalizeMoney(item.gross_amount ?? multiplyMoneyByQuantity(item.unit_price, quantity));
  const catalogPolicy = resolvePromotionPolicy(data, item, tenantId);
  const lineHasSale = cartHasSale || hasSaleDiscount(item);
  let allowed = catalogPolicy.personal_promo_allowed !== false && item.personal_promo_allowed !== false;
  let blockedBySale = false;
  let reason = null;

  if (!allowed) {
    reason = "personal_promo_not_allowed_for_product";
  } else if (lineHasSale && !stackableWithSale) {
    allowed = false;
    blockedBySale = true;
    reason = "promotion_not_stackable_with_sale";
  }

  if (reason) {
    warnings.push({
      code: reason,
      item_index: index,
      sku: item.sku
    });
  }

  const discountAmount = allowed && compareMoney(discountPercent, "0.00") > 0 ? applyPercent(grossAmount, discountPercent) : "0.00";

  return {
    sku: item.sku,
    product_id: catalogPolicy.product_id,
    product_variant_id: catalogPolicy.product_variant_id,
    promotion_discount_allowed: allowed,
    blocked_by_sale: blockedBySale,
    discount_amount: discountAmount,
    gross_amount: grossAmount,
    net_amount: subtractMoney(grossAmount, discountAmount),
    currency
  };
}

function resolvePromotionPolicy(data, item, tenantId) {
  const variant =
    (data.product_variants || []).find(
      (candidate) =>
        matchesTenant(candidate, tenantId) &&
        (candidate.id === item.product_variant_id || candidate.variant_sku === item.sku || candidate.barcode === item.barcode)
    ) || null;
  const product =
    (data.products || []).find(
      (candidate) =>
        matchesTenant(candidate, tenantId) &&
        (candidate.id === item.product_id || candidate.id === variant?.product_id || candidate.sku === item.sku)
    ) || null;

  return {
    product_id: product?.id ?? item.product_id ?? null,
    product_variant_id: variant?.id ?? item.product_variant_id ?? null,
    personal_promo_allowed: product?.discount_policy?.personal_promo_allowed !== false
  };
}

function hasSaleDiscount(target) {
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

function hasLoyaltyDiscount(target) {
  if (!target) {
    return false;
  }

  if (target.loyalty_discount_percent !== undefined && compareMoney(target.loyalty_discount_percent, "0.00") > 0) {
    return true;
  }

  return (target.applied_discounts || []).some((discount) => {
    if (!loyaltyDiscountTypes.has(discount.type)) {
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

function matchesTenant(candidate, tenantId) {
  return !tenantId || candidate.tenant_id === tenantId;
}

function invalid(reason, warnings) {
  return {
    valid: false,
    reason,
    warnings,
    discount_percent: "0.00",
    discount_amount: "0.00",
    net_amount: null,
    lines: [],
    early_access_eligible: reason !== "early_access_not_eligible"
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
