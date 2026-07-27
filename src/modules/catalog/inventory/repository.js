import { createVariantRepository } from "../variants/repository.js";

export function createInventoryRepository(
  data,
  variantRepository = createVariantRepository(data)
) {
  function getBalance({ variantId, tenantId = null, branchId = null }) {
    const variant = variantRepository.findById(variantId, tenantId);
    if (!variant) {
      return null;
    }
    return projectBalance(variant, branchId);
  }

  function listBalances({
    tenantId = null,
    productId = null,
    branchId = null,
    sizeSystem = null,
    sizeValue = null,
    inStock = false
  } = {}) {
    return variantRepository
      .list({
        tenantId,
        productId,
        sizeSystem,
        sizeValue
      })
      .map((variant) => projectBalance(variant, branchId))
      .filter((balance) => !inStock || balance.available > 0);
  }

  function setBranchBalance({
    variantId,
    tenantId = null,
    branchId,
    available,
    reserved = 0,
    updatedAt = null
  }) {
    const variant = variantRepository.findById(variantId, tenantId);
    if (!variant) {
      throw new Error("variant_not_found");
    }

    const normalizedBranchId = requiredString(branchId, "inventory_branch_id_required");
    const nextBalance = {
      branch_id: normalizedBranchId,
      available: nonNegativeInteger(available),
      reserved: nonNegativeInteger(reserved)
    };
    const index = variant.inventory.by_branch.findIndex(
      (balance) => balance.branch_id === normalizedBranchId
    );
    const previousBalance =
      index >= 0
        ? structuredClone(variant.inventory.by_branch[index])
        : { branch_id: normalizedBranchId, available: 0, reserved: 0 };
    const changed =
      previousBalance.available !== nextBalance.available ||
      previousBalance.reserved !== nextBalance.reserved;

    if (changed) {
      if (index >= 0) {
        variant.inventory.by_branch[index] = nextBalance;
      } else {
        variant.inventory.by_branch.push(nextBalance);
      }
      variant.inventory.total_available = variant.inventory.by_branch.reduce(
        (total, balance) => total + balance.available,
        0
      );
      variant.updated_at = updatedAt || new Date().toISOString();
      variant.version += 1;
    }

    return {
      variant,
      branch_id: normalizedBranchId,
      previous_balance: previousBalance,
      current_balance: structuredClone(nextBalance),
      changed
    };
  }

  return {
    getBalance,
    listBalances,
    setBranchBalance
  };
}

export function projectBalance(variant, branchId = null) {
  if (branchId) {
    const balance = variant.inventory.by_branch.find(
      (candidate) => candidate.branch_id === branchId
    ) || { branch_id: branchId, available: 0, reserved: 0 };

    return {
      variant_id: variant.id,
      product_id: variant.product_id,
      variant_sku: variant.variant_sku,
      size: structuredClone(variant.size),
      branch_id: branchId,
      available: balance.available,
      reserved: balance.reserved,
      total_available: variant.inventory.total_available
    };
  }

  return {
    variant_id: variant.id,
    product_id: variant.product_id,
    variant_sku: variant.variant_sku,
    size: structuredClone(variant.size),
    branch_id: null,
    available: variant.inventory.total_available,
    reserved: variant.inventory.by_branch.reduce(
      (total, balance) => total + balance.reserved,
      0
    ),
    total_available: variant.inventory.total_available,
    by_branch: structuredClone(variant.inventory.by_branch)
  };
}

function nonNegativeInteger(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("inventory_non_negative_integer_required");
  }
  return value;
}

function requiredString(value, errorCode) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(errorCode);
  }
  return value.trim();
}
