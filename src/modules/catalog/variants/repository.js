import { randomUUID } from "node:crypto";
import { canonicalizePrice } from "../prices/money.js";
import { createProductRepository } from "../products/repository.js";

export const shoeSizeSystems = ["UK", "US", "EU"];

export function createVariantRepository(
  data,
  productRepository = createProductRepository(data)
) {
  const variants = ensureArray(data, "product_variants");

  function findById(variantId, tenantId = null) {
    return (
      variants.find(
        (variant) => variant.id === variantId && (!tenantId || variant.tenant_id === tenantId)
      ) || null
    );
  }

  function findBySku(variantSku, tenantId) {
    const normalizedSku = normalizeSku(variantSku);
    return (
      variants.find(
        (variant) =>
          variant.tenant_id === tenantId &&
          normalizeSku(variant.variant_sku) === normalizedSku
      ) || null
    );
  }

  function findByBarcode(barcode, tenantId) {
    const normalizedBarcode = normalizeBarcode(barcode);
    if (!normalizedBarcode) {
      return null;
    }
    return (
      variants.find(
        (variant) =>
          variant.tenant_id === tenantId &&
          normalizeBarcode(variant.barcode) === normalizedBarcode
      ) || null
    );
  }

  function list({
    tenantId = null,
    productId = null,
    status = null,
    sizeSystem = null,
    sizeValue = null,
    colorCode = null,
    query = ""
  } = {}) {
    const normalizedQuery = String(query).trim().toLocaleLowerCase();

    return variants.filter((variant) => {
      if (tenantId && variant.tenant_id !== tenantId) {
        return false;
      }
      if (productId && variant.product_id !== productId) {
        return false;
      }
      if (status && variant.status !== status) {
        return false;
      }
      if (sizeSystem && variant.size.system !== normalizeSizeSystem(sizeSystem)) {
        return false;
      }
      if (sizeValue && variant.size.value !== String(sizeValue)) {
        return false;
      }
      if (colorCode && variant.color.code !== colorCode) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }

      const searchable = [
        variant.variant_sku,
        variant.barcode,
        variant.color?.code,
        variant.color?.name?.kk,
        variant.color?.name?.ru,
        variant.color?.name?.en,
        variant.size?.system,
        variant.size?.value
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }

  function upsert(input) {
    const existing = input?.id ? findById(input.id, input.tenant_id || null) : null;
    const variant = canonicalizeVariant(input, existing);
    const product = productRepository.findById(variant.product_id, variant.tenant_id);
    if (!product) {
      throw new Error("variant_product_not_found");
    }

    const skuOwner = findBySku(variant.variant_sku, variant.tenant_id);
    if (skuOwner && skuOwner.id !== variant.id) {
      throw new Error("variant_sku_not_unique");
    }

    const barcodeOwner = findByBarcode(variant.barcode, variant.tenant_id);
    if (barcodeOwner && barcodeOwner.id !== variant.id) {
      throw new Error("variant_barcode_not_unique");
    }

    if (existing) {
      Object.assign(existing, variant);
      return { variant: existing, created: false };
    }

    variants.push(variant);
    return { variant, created: true };
  }

  return {
    findByBarcode,
    findById,
    findBySku,
    list,
    upsert
  };
}

export function canonicalizeVariant(input, existing = null) {
  if (!isPlainObject(input)) {
    throw new Error("variant_object_required");
  }

  const now = new Date().toISOString();
  const tenantId = requiredString(
    input.tenant_id ?? existing?.tenant_id,
    "variant_tenant_id_required"
  );
  const variantSku = normalizeSku(input.variant_sku ?? existing?.variant_sku);
  if (!variantSku) {
    throw new Error("variant_sku_required");
  }

  return {
    id: input.id || existing?.id || randomUUID(),
    tenant_id: tenantId,
    product_id: requiredString(
      input.product_id ?? existing?.product_id,
      "variant_product_id_required"
    ),
    variant_sku: variantSku,
    barcode: normalizeBarcode(input.barcode ?? existing?.barcode),
    color: canonicalizeColor(input.color ?? existing?.color),
    size: canonicalizeSize(input.size ?? existing?.size),
    price: canonicalizePrice(input.price ?? existing?.price),
    branch_prices: canonicalizeBranchPrices(
      input.branch_prices ?? existing?.branch_prices ?? []
    ),
    inventory: canonicalizeInventory(input.inventory ?? existing?.inventory),
    status: optionalString(input.status ?? existing?.status) || "active",
    external_refs: canonicalizeExternalRefs(
      input.external_refs ?? existing?.external_refs ?? []
    ),
    created_at: existing?.created_at || input.created_at || now,
    updated_at: input.updated_at || now,
    version: existing ? existing.version + 1 : Number.isInteger(input.version) ? input.version : 1
  };
}

function canonicalizeColor(value = {}) {
  if (!isPlainObject(value)) {
    throw new Error("variant_color_object_required");
  }
  const name = value.name || {};
  if (!isPlainObject(name)) {
    throw new Error("variant_color_name_object_required");
  }

  return {
    code: optionalString(value.code),
    name: {
      kk: optionalString(name.kk),
      ru: optionalString(name.ru),
      en: optionalString(name.en)
    }
  };
}

function canonicalizeSize(value) {
  if (!isPlainObject(value)) {
    throw new Error("variant_size_object_required");
  }

  return {
    system: normalizeSizeSystem(
      requiredString(value.system, "variant_size_system_required")
    ),
    value: requiredString(value.value, "variant_size_value_required")
  };
}

function canonicalizeBranchPrices(values) {
  if (!Array.isArray(values)) {
    throw new Error("variant_branch_prices_array_required");
  }

  return values.map((price) => ({
    branch_id: requiredString(price?.branch_id, "branch_price_branch_id_required"),
    ...canonicalizePrice(price),
    valid_from: validDate(price?.valid_from, "branch_price_valid_from_required"),
    valid_to:
      price?.valid_to === null || price?.valid_to === undefined
        ? null
        : validDate(price.valid_to, "branch_price_valid_to_invalid")
  }));
}

function canonicalizeInventory(value = {}) {
  if (!isPlainObject(value)) {
    throw new Error("variant_inventory_object_required");
  }
  const byBranch = value.by_branch ?? [];
  if (!Array.isArray(byBranch)) {
    throw new Error("variant_inventory_by_branch_array_required");
  }

  return {
    total_available: nonNegativeInteger(value.total_available ?? 0),
    by_branch: byBranch.map((balance) => ({
      branch_id: requiredString(balance?.branch_id, "inventory_branch_id_required"),
      available: nonNegativeInteger(balance?.available ?? 0),
      reserved: nonNegativeInteger(balance?.reserved ?? 0)
    }))
  };
}

function canonicalizeExternalRefs(value) {
  if (!Array.isArray(value)) {
    throw new Error("variant_external_refs_array_required");
  }
  return value.map((reference) => ({
    system: requiredString(reference?.system, "external_ref_system_required"),
    value: requiredString(reference?.value, "external_ref_value_required")
  }));
}

function nonNegativeInteger(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("inventory_non_negative_integer_required");
  }
  return value;
}

function validDate(value, errorCode) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(errorCode);
  }
  return value;
}

function normalizeSizeSystem(value) {
  return String(value).trim().toUpperCase();
}

function normalizeSku(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function normalizeBarcode(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error("variant_barcode_string_or_null_required");
  }
  return value.replace(/\s+/g, "");
}

function optionalString(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error("string_or_null_required");
  }
  return value;
}

function requiredString(value, errorCode) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(errorCode);
  }
  return value.trim();
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
