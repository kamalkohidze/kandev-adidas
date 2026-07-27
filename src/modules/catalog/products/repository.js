import { randomUUID } from "node:crypto";

export function createProductRepository(data) {
  const products = ensureArray(data, "products");

  function findById(productId, tenantId = null) {
    return (
      products.find(
        (product) => product.id === productId && (!tenantId || product.tenant_id === tenantId)
      ) || null
    );
  }

  function findBySku(sku, tenantId) {
    const normalizedSku = normalizeSku(sku);
    return (
      products.find(
        (product) =>
          product.tenant_id === tenantId && normalizeSku(product.sku) === normalizedSku
      ) || null
    );
  }

  function search({
    tenantId = null,
    query = "",
    status = null,
    brand = null,
    productType = null,
    sportTag = null
  } = {}) {
    const normalizedQuery = String(query).trim().toLocaleLowerCase();

    return products.filter((product) => {
      if (tenantId && product.tenant_id !== tenantId) {
        return false;
      }
      if (status && product.status !== status) {
        return false;
      }
      if (brand && product.brand.toLocaleLowerCase() !== String(brand).toLocaleLowerCase()) {
        return false;
      }
      if (productType && product.product_type !== productType) {
        return false;
      }
      if (sportTag && !product.sport_tags.includes(sportTag)) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }

      const searchable = [
        product.sku,
        product.brand,
        product.name?.kk,
        product.name?.ru,
        product.name?.en,
        product.collection,
        product.season,
        JSON.stringify(product.attributes)
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();

      return searchable.includes(normalizedQuery);
    });
  }

  function upsert(input) {
    const existing = input?.id ? findById(input.id) : null;
    const product = canonicalizeProduct(input, existing);
    if (existing && existing.tenant_id !== product.tenant_id) {
      throw new Error("product_id_tenant_mismatch");
    }
    const skuOwner = findBySku(product.sku, product.tenant_id);

    if (skuOwner && skuOwner.id !== product.id) {
      throw new Error("product_sku_not_unique");
    }

    if (existing) {
      Object.assign(existing, product);
      return { product: existing, created: false };
    }

    products.push(product);
    return { product, created: true };
  }

  return {
    findById,
    findBySku,
    search,
    upsert
  };
}

export function canonicalizeProduct(input, existing = null) {
  if (!isPlainObject(input)) {
    throw new Error("product_object_required");
  }

  const tenantId = requiredString(input.tenant_id ?? existing?.tenant_id, "product_tenant_id_required");
  const sku = normalizeSku(input.sku ?? existing?.sku);
  if (!sku) {
    throw new Error("product_sku_required");
  }

  const name = canonicalizeLocalizedText(input.name ?? existing?.name, true);
  const attributes = input.attributes === undefined ? existing?.attributes || {} : input.attributes;
  if (!isPlainObject(attributes)) {
    throw new Error("product_attributes_object_required");
  }

  const now = new Date().toISOString();
  return {
    id: input.id || existing?.id || randomUUID(),
    tenant_id: tenantId,
    status: optionalString(input.status ?? existing?.status) || "active",
    sku,
    name,
    description: canonicalizeLocalizedText(input.description ?? existing?.description ?? {}),
    brand: requiredString(input.brand ?? existing?.brand, "product_brand_required"),
    category_id: requiredString(
      input.category_id ?? existing?.category_id,
      "product_category_id_required"
    ),
    category_path: cloneStringArray(input.category_path ?? existing?.category_path),
    sport_tags: cloneStringArray(input.sport_tags ?? existing?.sport_tags),
    product_type: requiredString(
      input.product_type ?? existing?.product_type,
      "product_type_required"
    ),
    collection: nullableString(
      input.collection !== undefined ? input.collection : existing?.collection
    ),
    season: nullableString(input.season !== undefined ? input.season : existing?.season),
    attributes: structuredClone(attributes),
    discount_policy: canonicalizeDiscountPolicy(
      input.discount_policy ?? existing?.discount_policy
    ),
    external_refs: canonicalizeExternalRefs(input.external_refs ?? existing?.external_refs),
    created_at: existing?.created_at || input.created_at || now,
    updated_at: existing ? now : input.updated_at || now,
    version: existing ? existing.version + 1 : Number.isInteger(input.version) ? input.version : 1
  };
}

function canonicalizeLocalizedText(value, requireRussian = false) {
  if (!isPlainObject(value)) {
    throw new Error("localized_text_object_required");
  }

  const localized = {
    kk: nullableString(value.kk),
    ru: nullableString(value.ru),
    en: nullableString(value.en)
  };

  if (requireRussian && !localized.ru) {
    throw new Error("product_name_ru_required");
  }

  return localized;
}

function canonicalizeDiscountPolicy(value = {}) {
  if (!isPlainObject(value)) {
    throw new Error("product_discount_policy_object_required");
  }

  return {
    loyalty_discount_allowed: value.loyalty_discount_allowed !== false,
    global_sale_excluded: Boolean(value.global_sale_excluded),
    personal_promo_allowed: value.personal_promo_allowed !== false
  };
}

function canonicalizeExternalRefs(value = []) {
  if (!Array.isArray(value)) {
    throw new Error("product_external_refs_array_required");
  }

  return value.map((reference) => ({
    system: requiredString(reference?.system, "external_ref_system_required"),
    value: requiredString(reference?.value, "external_ref_value_required")
  }));
}

function cloneStringArray(value = []) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("string_array_required");
  }
  return [...value];
}

function nullableString(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error("string_or_null_required");
  }
  return value;
}

function optionalString(value) {
  return nullableString(value);
}

function requiredString(value, errorCode) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(errorCode);
  }
  return value.trim();
}

function normalizeSku(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
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
