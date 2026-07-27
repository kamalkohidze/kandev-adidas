import assert from "node:assert/strict";
import test from "node:test";
import { createCatalogServices } from "../src/modules/catalog/index.js";
import { createProductRepository } from "../src/modules/catalog/products/repository.js";
import { createVariantRepository } from "../src/modules/catalog/variants/repository.js";
import { createSeedData } from "../src/platform/seed-data.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const productId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const variantId = "88888888-8888-4888-8888-888888888888";
const branchId = "55555555-5555-4555-8555-555555555555";

test("product and variant SKUs are unique inside a tenant", () => {
  const data = createSeedData();
  const products = createProductRepository(data);
  const variants = createVariantRepository(data, products);

  assert.throws(
    () =>
      products.upsert({
        ...structuredClone(data.products[0]),
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9"
      }),
    /product_sku_not_unique/
  );

  assert.throws(
    () =>
      variants.upsert({
        ...structuredClone(data.product_variants[0]),
        id: "88888888-8888-4888-8888-888888888899",
        barcode: "4870000000099"
      }),
    /variant_sku_not_unique/
  );

  const otherTenant = products.upsert({
    ...structuredClone(data.products[0]),
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8",
    tenant_id: "00000000-0000-4000-8000-000000000002"
  });
  assert.equal(otherTenant.created, true);
});

test("canonical Product and ProductVariant IDs cannot move across tenants", () => {
  const data = createSeedData();
  const products = createProductRepository(data);
  const variants = createVariantRepository(data, products);

  assert.throws(
    () =>
      products.upsert({
        ...structuredClone(data.products[0]),
        tenant_id: "00000000-0000-4000-8000-000000000002",
        sku: "CROSS-TENANT-PRODUCT"
      }),
    /product_id_tenant_mismatch/
  );
  assert.throws(
    () =>
      variants.upsert({
        ...structuredClone(data.product_variants[0]),
        tenant_id: "00000000-0000-4000-8000-000000000002",
        variant_sku: "CROSS-TENANT-VARIANT"
      }),
    /variant_id_tenant_mismatch/
  );
});

test("localized product and color values fall back to Russian", () => {
  const catalog = createCatalogServices(createSeedData());
  const product = catalog.products.getProduct({
    productId,
    tenantId,
    locale: "KZ"
  });
  const variant = catalog.variants.getVariant({
    variantId,
    tenantId,
    locale: "kk"
  });

  assert.equal(product.display_name, "Футбольные бутсы");
  assert.equal(product.localization.name_locale, "ru");
  assert.equal(product.localization.name_fallback_used, true);
  assert.equal(variant.display_color_name, "Черный");
  assert.equal(variant.localization.color_locale, "ru");
});

test("product repository preserves flexible nested attributes", () => {
  const data = createSeedData();
  const catalog = createCatalogServices(data);
  const result = catalog.products.upsertProduct({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7",
    tenant_id: tenantId,
    status: "active",
    sku: "ATTR-PRODUCT-001",
    name: { kk: null, ru: "Товар с атрибутами", en: null },
    description: { kk: null, ru: null, en: null },
    brand: "adidas",
    category_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb7",
    category_path: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb7"],
    sport_tags: ["running"],
    product_type: "shoes",
    attributes: {
      waterproof: true,
      materials: ["mesh", "rubber"],
      measurements: { heel_drop_mm: 8 }
    },
    discount_policy: {
      loyalty_discount_allowed: true,
      global_sale_excluded: false,
      personal_promo_allowed: true
    },
    external_refs: []
  });

  assert.deepEqual(result.product.attributes, {
    waterproof: true,
    materials: ["mesh", "rubber"],
    measurements: { heel_drop_mm: 8 }
  });
  assert.equal(result.events[0].event_type, "catalog.product.upserted");
});

test("variant repository supports UK, US and EU size systems", () => {
  const data = createSeedData();
  const variants = createVariantRepository(data);

  for (const [index, system] of ["UK", "US", "EU"].entries()) {
    const result = variants.upsert({
      id: `77777777-7777-4777-8777-77777777777${index}`,
      tenant_id: tenantId,
      product_id: productId,
      variant_sku: `RUN-SHOE-001-${system}-TEST`,
      barcode: `487000000010${index}`,
      color: {
        code: "black",
        name: { kk: null, ru: "Черный", en: "Black" }
      },
      size: { system, value: "10" },
      price: { amount: "79990.00", currency: "KZT" },
      branch_prices: [],
      inventory: { total_available: 0, by_branch: [] },
      status: "active",
      external_refs: []
    });
    assert.equal(result.variant.size.system, system);
  }
});

test("variant upsert rejects inconsistent price periods and inventory totals", () => {
  const data = createSeedData();
  const variants = createVariantRepository(data);

  assert.throws(
    () =>
      variants.upsert({
        ...structuredClone(data.product_variants[0]),
        id: "88888888-8888-4888-8888-888888888877",
        variant_sku: "INVALID-PRICE-RANGE",
        barcode: "4870000000199",
        branch_prices: [
          {
            branch_id: branchId,
            amount: "1.00",
            currency: "KZT",
            valid_from: "2026-08-02T00:00:00Z",
            valid_to: "2026-08-01T00:00:00Z"
          }
        ]
      }),
    /branch_price_valid_to_before_valid_from/
  );
  assert.throws(
    () =>
      variants.upsert({
        ...structuredClone(data.product_variants[0]),
        id: "88888888-8888-4888-8888-888888888876",
        variant_sku: "INVALID-INVENTORY-TOTAL",
        barcode: "4870000000198",
        inventory: {
          total_available: 99,
          by_branch: [{ branch_id: branchId, available: 1, reserved: 0 }]
        }
      }),
    /inventory_total_available_mismatch/
  );
});

test("entity updates replace stale input timestamps before publishing events", () => {
  const data = createSeedData();
  const catalog = createCatalogServices(data);
  const originalProduct = structuredClone(data.products[0]);
  const originalVariant = structuredClone(data.product_variants[0]);
  const productResult = catalog.products.upsertProduct({
    ...originalProduct,
    brand: "adidas-performance"
  });
  const variantResult = catalog.variants.upsertVariant({
    ...originalVariant,
    color: {
      ...originalVariant.color,
      code: "black-updated"
    }
  });

  assert.notEqual(productResult.product.updated_at, originalProduct.updated_at);
  assert.equal(productResult.events[0].occurred_at, productResult.product.updated_at);
  assert.notEqual(variantResult.variant.updated_at, originalVariant.updated_at);
});

test("inventory is selected by size and branch", () => {
  const catalog = createCatalogServices(createSeedData());
  const balances = catalog.inventory.listBalances({
    tenantId,
    branchId,
    sizeSystem: "UK",
    sizeValue: "10",
    inStock: true
  });

  assert.equal(balances.length, 1);
  assert.equal(balances[0].variant_id, variantId);
  assert.equal(balances[0].size.system, "UK");
  assert.equal(balances[0].available, 8);
  assert.equal(balances[0].reserved, 2);
});

test("branch price is selected for its validity window and otherwise falls back to base", () => {
  const catalog = createCatalogServices(createSeedData());
  const branchPrice = catalog.prices.getPrice({
    variantId,
    tenantId,
    branchId,
    at: "2026-07-20T00:00:00+05:00"
  });
  const fallbackPrice = catalog.prices.getPrice({
    variantId,
    tenantId,
    branchId: "55555555-5555-4555-8555-555555555599",
    at: "2026-07-20T00:00:00+05:00"
  });

  assert.equal(branchPrice.amount, "74990.00");
  assert.equal(branchPrice.source, "branch");
  assert.equal(fallbackPrice.amount, "79990.00");
  assert.equal(fallbackPrice.source, "base");
  assert.equal(fallbackPrice.requested_branch_id, "55555555-5555-4555-8555-555555555599");
});

test("price and inventory mutations emit canonical events only on changes", () => {
  const data = createSeedData();
  const catalog = createCatalogServices(data);
  const price = catalog.prices.setBasePrice(
    {
      variantId,
      tenantId,
      price: { amount: "80990", currency: "kzt" },
      updatedAt: "2026-07-27T10:00:00Z"
    },
    { correlationId: "catalog-price-test" }
  );
  const inventory = catalog.inventory.setBranchBalance(
    {
      variantId,
      tenantId,
      branchId,
      available: 7,
      reserved: 3,
      updatedAt: "2026-07-27T10:01:00Z"
    },
    { correlationId: "catalog-inventory-test" }
  );
  const unchanged = catalog.inventory.setBranchBalance({
    variantId,
    tenantId,
    branchId,
    available: 7,
    reserved: 3
  });

  assert.equal(price.current_price.amount, "80990.00");
  assert.equal(price.events[0].event_type, "catalog.price.changed");
  assert.equal(inventory.events[0].event_type, "catalog.inventory.changed");
  assert.equal(inventory.variant.inventory.total_available, 11);
  assert.equal(unchanged.events.length, 0);
  assert.deepEqual(
    data.catalog_events.map((event) => event.event_type),
    ["catalog.price.changed", "catalog.inventory.changed"]
  );
});
