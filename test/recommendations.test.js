import assert from "node:assert/strict";
import test from "node:test";
import { createRecommendationEngine } from "../src/modules/recommendations/engine/index.js";
import { createRecommendationMessageBlocks } from "../src/modules/recommendations/message-blocks/index.js";
import { createApp } from "../src/platform/app.js";
import { createSeedData } from "../src/platform/seed-data.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const customerId = "11111111-1111-4111-8111-111111111111";
const branchId = "55555555-5555-4555-8555-555555555555";

test("recommendations filter unavailable sizes and stock", () => {
  const data = createRecommendationData();
  const engine = createRecommendationEngine(data);
  const set = engine.recommendForCustomer({
    customerId,
    tenantId,
    branchId,
    locale: "en",
    limit: 10
  });

  assert.ok(set.data.length > 0);
  assert.equal(set.data.some((item) => item.variant_sku === "RUN-SHOE-001-UK9"), false);
  assert.equal(set.data.some((item) => item.variant_sku === "RUN-SHOE-002-UK10-OOS"), false);
  assert.equal(set.data.every((item) => item.inventory.available > 0), true);
});

test("sport preference ranking is deterministic", () => {
  const data = createRecommendationData();
  data.customers[0].favorite_sports = ["running", "football"];
  const engine = createRecommendationEngine(data);
  const set = engine.recommendForCustomer({
    customerId,
    tenantId,
    branchId,
    locale: "en",
    limit: 2
  });

  assert.equal(set.data[0].sku, "RUN-SHOE-002");
  assert.equal(set.data[0].sport_tags.includes("running"), true);
  assert.ok(set.data[0].score > set.data[1].score);
});

test("recommendations do not include variants without the customer size", () => {
  const data = createRecommendationData();
  const engine = createRecommendationEngine(data);
  const set = engine.recommendForCustomer({
    customerId,
    tenantId,
    branchId,
    locale: "ru"
  });

  assert.equal(set.data.some((item) => item.size.system === "UK" && item.size.value === "9"), false);
  assert.equal(set.data.some((item) => item.size.system === "UK" && item.size.value === "10"), true);
});

test("each recommendation includes a non-PII explanation", () => {
  const data = createRecommendationData();
  const engine = createRecommendationEngine(data);
  const set = engine.recommendForCustomer({
    customerId,
    tenantId,
    branchId,
    locale: "ru"
  });

  assert.equal(set.data.every((item) => item.reason && item.reasons.length > 0), true);
  assert.equal(set.data.some((item) => item.reason.includes("Alibek")), false);
  assert.equal(set.data.some((item) => item.reason.includes("+7701")), false);
});

test("recommendation API returns filtered product recommendations with reasons", async () => {
  const data = createRecommendationData();
  const app = createApp({ data });
  const response = await app.handle(
    "GET",
    `/api/v1/customers/${customerId}/recommendations?branch_id=${branchId}&locale=en&include=message_blocks`,
    { tenantId }
  );
  const body = JSON.parse(response.body);

  assert.equal(response.status, 200);
  assert.equal(body.customer_id, customerId);
  assert.ok(body.data.length > 0);
  assert.equal(body.data.every((item) => item.inventory.available > 0), true);
  assert.equal(body.data.every((item) => item.reason), true);
  assert.equal(body.message_blocks.blocks[0].title, body.data[0].name.value);
});

test("message blocks use localized product names", () => {
  const data = createRecommendationData();
  data.customers[0].favorite_sports = ["running", "football"];
  const blocks = createRecommendationMessageBlocks(data).forCustomer({
    customerId,
    tenantId,
    branchId,
    locale: "en",
    limit: 1
  });

  assert.equal(blocks.blocks.length, 1);
  assert.equal(blocks.blocks[0].title, "Running shoes");
  assert.equal(blocks.blocks[0].cta.label, "View");
});

function createRecommendationData() {
  const data = createSeedData();
  data.products.push(
    productFixture({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
      sku: "RUN-SHOE-002",
      name: { kk: "Жүгіру кроссовкасы", ru: "Беговые кроссовки", en: "Running shoes" },
      sport_tags: ["running"],
      product_type: "shoes"
    }),
    productFixture({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
      sku: "RUN-SHOE-003",
      name: { kk: null, ru: "Кроссовки другого размера", en: "Wrong size shoes" },
      sport_tags: ["running"],
      product_type: "shoes"
    }),
    productFixture({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5",
      sku: "RUN-SHOE-004",
      name: { kk: null, ru: "Нет в наличии", en: "Out of stock shoes" },
      sport_tags: ["running"],
      product_type: "shoes"
    })
  );
  data.product_variants.push(
    variantFixture({
      id: "88888888-8888-4888-8888-888888888890",
      product_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
      variant_sku: "RUN-SHOE-002-UK10",
      size: { system: "UK", value: "10" },
      available: 7
    }),
    variantFixture({
      id: "88888888-8888-4888-8888-888888888891",
      product_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
      variant_sku: "RUN-SHOE-001-UK9",
      size: { system: "UK", value: "9" },
      available: 7
    }),
    variantFixture({
      id: "88888888-8888-4888-8888-888888888892",
      product_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5",
      variant_sku: "RUN-SHOE-002-UK10-OOS",
      size: { system: "UK", value: "10" },
      available: 0
    })
  );

  return data;
}

function productFixture(overrides) {
  return {
    id: overrides.id,
    tenant_id: tenantId,
    status: "active",
    sku: overrides.sku,
    name: overrides.name,
    description: { kk: null, ru: null, en: null },
    brand: "adidas",
    category_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9",
    category_path: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9"],
    sport_tags: overrides.sport_tags,
    product_type: overrides.product_type,
    collection: null,
    season: null,
    attributes: {},
    discount_policy: {
      loyalty_discount_allowed: true,
      global_sale_excluded: false,
      personal_promo_allowed: true
    },
    external_refs: [],
    created_at: "2026-01-01T00:00:00+05:00",
    updated_at: "2026-01-01T00:00:00+05:00",
    version: 1
  };
}

function variantFixture(overrides) {
  return {
    id: overrides.id,
    tenant_id: tenantId,
    product_id: overrides.product_id,
    variant_sku: overrides.variant_sku,
    barcode: null,
    color: { code: "black", name: { kk: null, ru: "Черный", en: "Black" } },
    size: overrides.size,
    price: { amount: "79990.00", currency: "KZT" },
    branch_prices: [],
    inventory: {
      total_available: overrides.available,
      by_branch: [
        {
          branch_id: branchId,
          available: overrides.available,
          reserved: 0
        }
      ]
    },
    status: "active",
    external_refs: [],
    created_at: "2026-01-01T00:00:00+05:00",
    updated_at: "2026-01-01T00:00:00+05:00",
    version: 1
  };
}
