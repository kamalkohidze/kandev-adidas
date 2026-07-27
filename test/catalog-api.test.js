import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/platform/app.js";

const productId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const variantId = "88888888-8888-4888-8888-888888888888";
const branchId = "55555555-5555-4555-8555-555555555555";

test("catalog product API searches and returns localized canonical products", async () => {
  const app = createApp();
  const response = await app.handle(
    "GET",
    "/api/v1/catalog/products?query=boots&locale=KZ"
  );
  const body = JSON.parse(response.body);

  assert.equal(response.status, 200);
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].id, productId);
  assert.equal(body.data[0].name.ru, "Футбольные бутсы");
  assert.equal(body.data[0].display_name, "Футбольные бутсы");
  assert.equal(body.data[0].localization.name_fallback_used, true);
  assert.equal(body.data[0].variant_count, 1);
});

test("catalog product detail includes variants, effective branch price and inventory", async () => {
  const app = createApp();
  const response = await app.handle(
    "GET",
    `/api/v1/catalog/products/${productId}?branch_id=${branchId}`,
    { headers: { "Accept-Language": "en" } }
  );
  const body = JSON.parse(response.body);

  assert.equal(response.status, 200);
  assert.equal(body.data.display_name, "Football boots");
  assert.equal(body.data.variants[0].id, variantId);
  assert.equal(body.data.variants[0].effective_price.amount, "74990.00");
  assert.equal(body.data.variants[0].effective_price.source, "branch");
  assert.equal(body.data.variants[0].effective_inventory.available, 8);
});

test("catalog variant, price and inventory endpoints return size and branch data", async () => {
  const app = createApp();
  const variantsResponse = await app.handle(
    "GET",
    `/api/v1/catalog/variants?size_system=UK&size_value=10&branch_id=${branchId}&in_stock=true`
  );
  const variants = JSON.parse(variantsResponse.body);
  const priceResponse = await app.handle(
    "GET",
    `/api/v1/catalog/variants/${variantId}/price?branch_id=${branchId}&at=2026-07-20T00%3A00%3A00%2B05%3A00`
  );
  const price = JSON.parse(priceResponse.body);
  const inventoryResponse = await app.handle(
    "GET",
    `/api/v1/catalog/inventory?size_system=UK&size_value=10&branch_id=${branchId}`
  );
  const inventory = JSON.parse(inventoryResponse.body);

  assert.equal(variantsResponse.status, 200);
  assert.equal(variants.data.length, 1);
  assert.deepEqual(variants.data[0].size, { system: "UK", value: "10" });
  assert.equal(priceResponse.status, 200);
  assert.equal(price.data.amount, "74990.00");
  assert.equal(price.data.source, "branch");
  assert.equal(inventoryResponse.status, 200);
  assert.equal(inventory.data.length, 1);
  assert.equal(inventory.data[0].available, 8);
  assert.equal(inventory.data[0].branch_id, branchId);
});

test("catalog API returns 404 for unknown canonical IDs", async () => {
  const app = createApp();
  const response = await app.handle(
    "GET",
    "/api/v1/catalog/variants/00000000-0000-4000-8000-000000000099"
  );
  const body = JSON.parse(response.body);

  assert.equal(response.status, 404);
  assert.equal(body.error.code, "not_found");
});
