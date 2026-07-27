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

  route("GET", "/api/v1/catalog/products", async ({ headers, query }) => {
    const locale = getLocale(headers, query);
    const limit = parseLimit(query.get("limit"));
    const branchId = query.get("branch_id");
    const sizeSystem = query.get("size_system");
    const sizeValue = query.get("size_value");
    const inStock = parseBoolean(query.get("in_stock"));

    let products = catalog.products.searchProducts({
      tenantId: query.get("tenant_id"),
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
            tenantId: query.get("tenant_id"),
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

  route("GET", "/api/v1/catalog/products/:product_id", async ({
    headers,
    query,
    params
  }) => {
    const locale = getLocale(headers, query);
    const product = catalog.products.getProduct({
      productId: params.product_id,
      tenantId: query.get("tenant_id"),
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
      .map((variant) => enrichVariant(variant, query));

    return createJsonResponse(200, {
      data: {
        ...product,
        variants
      }
    });
  });

  route("GET", "/api/v1/catalog/products/:product_id/variants", async ({
    headers,
    query,
    params
  }) => {
    const locale = getLocale(headers, query);
    const product = catalog.products.getProduct({
      productId: params.product_id,
      tenantId: query.get("tenant_id"),
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
    ).map((variant) => enrichVariant(variant, query));

    return paginatedResponse(variants, variants.length, false);
  });

  route("GET", "/api/v1/catalog/variants", async ({ headers, query }) => {
    const locale = getLocale(headers, query);
    const limit = parseLimit(query.get("limit"));
    const variants = filterVariants(
      catalog.variants.listVariants({
        tenantId: query.get("tenant_id"),
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
      variants.slice(0, limit).map((variant) => enrichVariant(variant, query)),
      limit,
      variants.length > limit
    );
  });

  route("GET", "/api/v1/catalog/variants/:variant_id", async ({
    headers,
    query,
    params
  }) => {
    const locale = getLocale(headers, query);
    const variant = catalog.variants.getVariant({
      variantId: params.variant_id,
      tenantId: query.get("tenant_id"),
      locale
    });
    if (!variant) {
      return createNotFoundResponse(locale);
    }

    return createJsonResponse(200, {
      data: enrichVariant(variant, query)
    });
  });

  route("GET", "/api/v1/catalog/variants/:variant_id/price", async ({
    headers,
    query,
    params
  }) => {
    const locale = getLocale(headers, query);
    let price;
    try {
      price = catalog.prices.getPrice({
        variantId: params.variant_id,
        tenantId: query.get("tenant_id"),
        branchId: query.get("branch_id"),
        at: query.get("at") || new Date().toISOString()
      });
    } catch (error) {
      return createValidationResponse(
        [{ field: "at", reason: error.message }],
        locale
      );
    }
    return price ? createJsonResponse(200, { data: price }) : createNotFoundResponse(locale);
  });

  route("GET", "/api/v1/catalog/prices", async ({ headers, query }) => {
    const locale = getLocale(headers, query);
    const variantId = query.get("variant_id");
    try {
      const prices = variantId
        ? [
            catalog.prices.getPrice({
              variantId,
              tenantId: query.get("tenant_id"),
              branchId: query.get("branch_id"),
              at: query.get("at") || new Date().toISOString()
            })
          ].filter(Boolean)
        : catalog.prices.listPrices({
            tenantId: query.get("tenant_id"),
            productId: query.get("product_id"),
            branchId: query.get("branch_id"),
            at: query.get("at") || new Date().toISOString()
          });
      return paginatedResponse(prices, prices.length, false);
    } catch (error) {
      return createValidationResponse([{ field: "at", reason: error.message }], locale);
    }
  });

  route("GET", "/api/v1/catalog/variants/:variant_id/inventory", async ({
    headers,
    query,
    params
  }) => {
    const locale = getLocale(headers, query);
    const balance = catalog.inventory.getBalance({
      variantId: params.variant_id,
      tenantId: query.get("tenant_id"),
      branchId: query.get("branch_id")
    });
    return balance
      ? createJsonResponse(200, { data: balance })
      : createNotFoundResponse(locale);
  });

  route("GET", "/api/v1/catalog/inventory", async ({ query }) => {
    const balances = catalog.inventory.listBalances({
      tenantId: query.get("tenant_id"),
      productId: query.get("product_id"),
      branchId: query.get("branch_id"),
      sizeSystem: query.get("size_system"),
      sizeValue: query.get("size_value"),
      inStock: parseBoolean(query.get("in_stock"))
    });
    return paginatedResponse(balances, balances.length, false);
  });

  function enrichVariant(variant, query) {
    return {
      ...variant,
      effective_price: catalog.prices.getPrice({
        variantId: variant.id,
        tenantId: variant.tenant_id,
        branchId: query.get("branch_id"),
        at: query.get("at") || new Date().toISOString()
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
