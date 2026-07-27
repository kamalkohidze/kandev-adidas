import { canonicalizePrice } from "./money.js";
import { createVariantRepository } from "../variants/repository.js";

export function createPriceRepository(
  data,
  variantRepository = createVariantRepository(data)
) {
  function getPrice({
    variantId,
    tenantId = null,
    branchId = null,
    at = new Date().toISOString()
  }) {
    const variant = variantRepository.findById(variantId, tenantId);
    if (!variant) {
      return null;
    }

    const effectiveAt = parseDate(at, "price_at_invalid");
    const branchPrice = branchId
      ? selectBranchPrice(variant.branch_prices, branchId, effectiveAt)
      : null;

    return {
      variant_id: variant.id,
      product_id: variant.product_id,
      variant_sku: variant.variant_sku,
      branch_id: branchPrice ? branchId : null,
      amount: branchPrice?.amount ?? variant.price.amount,
      currency: branchPrice?.currency ?? variant.price.currency,
      source: branchPrice ? "branch" : "base",
      valid_from: branchPrice?.valid_from ?? null,
      valid_to: branchPrice?.valid_to ?? null,
      requested_branch_id: branchId
    };
  }

  function listPrices({
    tenantId = null,
    productId = null,
    branchId = null,
    at = new Date().toISOString()
  } = {}) {
    return variantRepository
      .list({ tenantId, productId })
      .map((variant) =>
        getPrice({
          variantId: variant.id,
          tenantId,
          branchId,
          at
        })
      );
  }

  function setBasePrice({ variantId, tenantId = null, price, updatedAt = null }) {
    const variant = requireVariant(variantId, tenantId);
    const nextPrice = canonicalizePrice(price);
    const previousPrice = structuredClone(variant.price);
    const changed =
      previousPrice.amount !== nextPrice.amount ||
      previousPrice.currency !== nextPrice.currency;

    if (changed) {
      variant.price = nextPrice;
      touchVariant(variant, updatedAt);
    }

    return {
      variant,
      branch_id: null,
      previous_price: previousPrice,
      current_price: structuredClone(variant.price),
      changed
    };
  }

  function setBranchPrice({
    variantId,
    tenantId = null,
    branchId,
    price,
    validFrom,
    validTo = null,
    updatedAt = null
  }) {
    const variant = requireVariant(variantId, tenantId);
    const normalizedBranchId = requiredString(branchId, "branch_price_branch_id_required");
    const next = {
      branch_id: normalizedBranchId,
      ...canonicalizePrice(price),
      valid_from: validDate(validFrom, "branch_price_valid_from_required"),
      valid_to: validTo === null ? null : validDate(validTo, "branch_price_valid_to_invalid")
    };
    assertDateRange(next.valid_from, next.valid_to);

    const index = variant.branch_prices.findIndex(
      (candidate) =>
        candidate.branch_id === next.branch_id &&
        candidate.currency === next.currency &&
        candidate.valid_from === next.valid_from
    );
    const previousPrice = index >= 0 ? structuredClone(variant.branch_prices[index]) : null;
    const changed = JSON.stringify(previousPrice) !== JSON.stringify(next);

    if (changed) {
      if (index >= 0) {
        variant.branch_prices[index] = next;
      } else {
        variant.branch_prices.push(next);
      }
      touchVariant(variant, updatedAt);
    }

    return {
      variant,
      branch_id: normalizedBranchId,
      previous_price: previousPrice,
      current_price: structuredClone(next),
      changed
    };
  }

  return {
    getPrice,
    listPrices,
    setBasePrice,
    setBranchPrice
  };

  function requireVariant(variantId, tenantId) {
    const variant = variantRepository.findById(variantId, tenantId);
    if (!variant) {
      throw new Error("variant_not_found");
    }
    return variant;
  }
}

export function selectBranchPrice(branchPrices, branchId, at = new Date().toISOString()) {
  const atTime =
    typeof at === "number" && Number.isFinite(at)
      ? at
      : parseDate(at, "price_at_invalid");
  return (
    (branchPrices || [])
      .filter((price) => price.branch_id === branchId)
      .filter((price) => {
        const startsAt = Date.parse(price.valid_from);
        const endsAt = price.valid_to ? Date.parse(price.valid_to) : Number.POSITIVE_INFINITY;
        return startsAt <= atTime && atTime <= endsAt;
      })
      .sort((left, right) => Date.parse(right.valid_from) - Date.parse(left.valid_from))[0] ||
    null
  );
}

function touchVariant(variant, updatedAt) {
  variant.updated_at = updatedAt || new Date().toISOString();
  variant.version += 1;
}

function assertDateRange(validFrom, validTo) {
  if (validTo && Date.parse(validTo) < Date.parse(validFrom)) {
    throw new Error("branch_price_valid_to_before_valid_from");
  }
}

function validDate(value, errorCode) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(errorCode);
  }
  return value;
}

function parseDate(value, errorCode) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    throw new Error(errorCode);
  }
  return time;
}

function requiredString(value, errorCode) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(errorCode);
  }
  return value.trim();
}
