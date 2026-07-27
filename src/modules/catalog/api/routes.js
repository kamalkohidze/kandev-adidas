import {
  createJsonResponse,
  createNotFoundResponse,
  createValidationResponse
} from "../../../platform/http.js";
import { createSeedData } from "../../../platform/seed-data.js";
import { normalizeLocale } from "../../../shared/contracts.js";
import { resolveRequestLocale } from "../../i18n/index.js";
import { createCatalogServices } from "../index.js";

// docs/api-contracts.md defines ERP write contracts but no headless catalog read paths.
// These routes therefore use the bounded-context namespace /api/v1/catalog consistently.
export function registerCatalogRoutes(route, data = createSeedData()) {
  const catalog = createCatalogServices(data);

  catalogReadRoute("/api/v1/catalog/products", async ({ query, tenantId, locale }) => {
    const limit = parseLimit(query.get("limit"));
    const branchId = query.get("branch_id");
    const sizeSystem = query.get("size_system");
    const sizeValue = query.get("size_value");
    const inStock = parseBoolean(query.get("in_stock"));

    let products = catalog.products.searchProducts({
      tenantId,
      query: query.get("query") || query.get("q") || "",
      status: query.get("status"),
      brand: query.get("brand"),
      productType: query.get("product_type"),
      sportTag: query.get("sport_tag"),
      locale
    });

    if (branchId || sizeSystem || sizeValue || inStock) {
      const matchingProductIds = new Set(
        catalog.inventory
          .listBalances({
            tenantId,
            branchId,
            sizeSystem,
            sizeValue,
            inStock
          })
          .map((balance) => balance.product_id)
      );
      products = products.filter((product) => matchingProductIds.has(product.id));
    }

    const dataPage = products.slice(0, limit).map((product) => {
      const variants = catalog.variants.listVariants({
        tenantId: product.tenant_id,
        productId: product.id,
        locale
      });
      return {
        ...product,
        variant_count: variants.length
      };
    });

    return paginatedResponse(dataPage, limit, products.length > limit);
  });

  catalogReadRoute("/api/v1/catalog/products/:product_id", async ({
    query,
    params,
    tenantId,
    locale,
    at
  }) => {
    const product = catalog.products.getProduct({
      productId: params.product_id,
      tenantId,
      locale
    });
    if (!product) {
      return createNotFoundResponse(locale);
    }

    const variants = catalog.variants
      .listVariants({
        tenantId: product.tenant_id,
        productId: product.id,
        locale
      })
      .map((variant) => enrichVariant(variant, query, at));

    return createJsonResponse(200, {
      data: {
        ...product,
        variants
      }
    });
  });

  catalogReadRoute("/api/v1/catalog/products/:product_id/variants", async ({
    query,
    params,
    tenantId,
    locale,
    at
  }) => {
    const product = catalog.products.getProduct({
      productId: params.product_id,
      tenantId,
      locale
    });
    if (!product) {
      return createNotFoundResponse(locale);
    }

    const variants = filterVariants(
      catalog.variants.listVariants({
        tenantId: product.tenant_id,
        productId: product.id,
        status: query.get("status"),
        sizeSystem: query.get("size_system"),
        sizeValue: query.get("size_value"),
        colorCode: query.get("color"),
        locale
      }),
      query
    ).map((variant) => enrichVariant(variant, query, at));

    return paginatedResponse(variants, variants.length, false);
  });

  catalogReadRoute("/api/v1/catalog/variants", async ({ query, tenantId, locale, at }) => {
    const limit = parseLimit(query.get("limit"));
    const variants = filterVariants(
      catalog.variants.listVariants({
        tenantId,
        productId: query.get("product_id"),
        status: query.get("status"),
        sizeSystem: query.get("size_system"),
        sizeValue: query.get("size_value"),
        colorCode: query.get("color"),
        query: query.get("query") || query.get("q") || "",
        locale
      }),
      query
    );

    return paginatedResponse(
      variants.slice(0, limit).map((variant) => enrichVariant(variant, query, at)),
      limit,
      variants.length > limit
    );
  });

  catalogReadRoute("/api/v1/catalog/variants/:variant_id", async ({
    query,
    params,
    tenantId,
    locale,
    at
  }) => {
    const variant = catalog.variants.getVariant({
      variantId: params.variant_id,
      tenantId,
      locale
    });
    if (!variant) {
      return createNotFoundResponse(locale);
    }

    return createJsonResponse(200, {
      data: enrichVariant(variant, query, at)
    });
  });

  catalogReadRoute("/api/v1/catalog/variants/:variant_id/price", async ({
    query,
    params,
    tenantId,
    locale,
    at
  }) => {
    const price = catalog.prices.getPrice({
      variantId: params.variant_id,
      tenantId,
      branchId: query.get("branch_id"),
      at
    });
    return price ? createJsonResponse(200, { data: price }) : createNotFoundResponse(locale);
  });

  catalogReadRoute("/api/v1/catalog/prices", async ({ query, tenantId, at }) => {
    const variantId = query.get("variant_id");
    const prices = variantId
      ? [
          catalog.prices.getPrice({
            variantId,
            tenantId,
            branchId: query.get("branch_id"),
            at
          })
        ].filter(Boolean)
      : catalog.prices.listPrices({
          tenantId,
          productId: query.get("product_id"),
          branchId: query.get("branch_id"),
          at
        });
    return paginatedResponse(prices, prices.length, false);
  });

  catalogReadRoute("/api/v1/catalog/variants/:variant_id/inventory", async ({
    query,
    params,
    tenantId,
    locale
  }) => {
    const balance = catalog.inventory.getBalance({
      variantId: params.variant_id,
      tenantId,
      branchId: query.get("branch_id")
    });
    return balance
      ? createJsonResponse(200, { data: balance })
      : createNotFoundResponse(locale);
  });

  catalogReadRoute("/api/v1/catalog/inventory", async ({ query, tenantId }) => {
    const balances = catalog.inventory.listBalances({
      tenantId,
      productId: query.get("product_id"),
      branchId: query.get("branch_id"),
      sizeSystem: query.get("size_system"),
      sizeValue: query.get("size_value"),
      inStock: parseBoolean(query.get("in_stock"))
    });
    return paginatedResponse(balances, balances.length, false);
  });

  function catalogReadRoute(path, handler) {
    route("GET", path, async (request) => {
      const locale = getLocale(request.headers, request.query);
      if (!isTenantContext(request.tenantId)) {
        return createValidationResponse([{ field: "tenant_context", reason: "required" }], locale);
      }

      const at = request.query.get("at") || new Date().toISOString();
      if (!Number.isFinite(Date.parse(at))) {
        return createValidationResponse([{ field: "at", reason: "price_at_invalid" }], locale);
      }

      return handler({ ...request, tenantId: request.tenantId, locale, at });
    });
  }

  function enrichVariant(variant, query, at) {
    return {
      ...variant,
      effective_price: catalog.prices.getPrice({
        variantId: variant.id,
        tenantId: variant.tenant_id,
        branchId: query.get("branch_id"),
        at
      }),
      effective_inventory: catalog.inventory.getBalance({
        variantId: variant.id,
        tenantId: variant.tenant_id,
        branchId: query.get("branch_id")
      })
    };
  }

  function filterVariants(variants, query) {
    const branchId = query.get("branch_id");
    const inStock = parseBoolean(query.get("in_stock"));
    if (!branchId && !inStock) {
      return variants;
    }

    return variants.filter((variant) => {
      const balance = catalog.inventory.getBalance({
        variantId: variant.id,
        tenantId: variant.tenant_id,
        branchId
      });
      return !inStock || balance.available > 0;
    });
  }
}

function isTenantContext(value) {
  return typeof value === "string" && value.trim() !== "";
}

function getLocale(headers, query) {
  const normalizedHeaders =
    typeof headers?.get === "function"
      ? headers
      : Object.fromEntries(
          Object.entries(headers || {}).map(([key, value]) => [key.toLowerCase(), value])
        );
  return normalizeLocale(query.get("locale") || resolveRequestLocale(normalizedHeaders));
}

function paginatedResponse(data, limit, hasMore) {
  return createJsonResponse(200, {
    data,
    page: {
      limit,
      next_cursor: null,
      has_more: hasMore
    }
  });
}

function parseLimit(value) {
  const parsed = Number.parseInt(value || "50", 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 50;
  }
  return Math.min(parsed, 100);
}

function parseBoolean(value) {
  return value === "true" || value === "1";
}
