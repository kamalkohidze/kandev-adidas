import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/platform/app.js";
import { createSeedData } from "../src/platform/seed-data.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const productId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const variantId = "88888888-8888-4888-8888-888888888888";
const branchId = "55555555-5555-4555-8555-555555555555";
const catalogContext = { tenantId };

test("catalog product API searches and returns localized canonical products", async () => {
  const app = createApp();
  const response = await app.handle(
    "GET",
    "/api/v1/catalog/products?query=boots&locale=KZ",
    catalogContext
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
    { headers: { "Accept-Language": "en" }, ...catalogContext }
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
    `/api/v1/catalog/variants?size_system=UK&size_value=10&branch_id=${branchId}&in_stock=true`,
    catalogContext
  );
  const variants = JSON.parse(variantsResponse.body);
  const priceResponse = await app.handle(
    "GET",
    `/api/v1/catalog/variants/${variantId}/price?branch_id=${branchId}&at=2026-07-20T00%3A00%3A00%2B05%3A00`,
    catalogContext
  );
  const price = JSON.parse(priceResponse.body);
  const inventoryResponse = await app.handle(
    "GET",
    `/api/v1/catalog/inventory?size_system=UK&size_value=10&branch_id=${branchId}`,
    catalogContext
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
    "/api/v1/catalog/variants/00000000-0000-4000-8000-000000000099",
    catalogContext
  );
  const body = JSON.parse(response.body);

  assert.equal(response.status, 404);
  assert.equal(body.error.code, "not_found");
});

test("catalog API uses only trusted tenant context", async () => {
  const data = createSeedData();
  data.products.push({
    ...structuredClone(data.products[0]),
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9",
    tenant_id: "00000000-0000-4000-8000-000000000002",
    sku: "OTHER-TENANT-PRODUCT"
  });
  const app = createApp({ data });

  const scopedResponse = await app.handle(
    "GET",
    "/api/v1/catalog/products?tenant_id=00000000-0000-4000-8000-000000000002",
    catalogContext
  );
  const missingContextResponse = await app.handle("GET", "/api/v1/catalog/products");
  const scopedBody = JSON.parse(scopedResponse.body);
  const missingContextBody = JSON.parse(missingContextResponse.body);

  assert.equal(scopedResponse.status, 200);
  assert.deepEqual(scopedBody.data.map((product) => product.tenant_id), [tenantId, tenantId]);
  assert.equal(missingContextResponse.status, 400);
  assert.deepEqual(missingContextBody.error.details, [
    { field: "tenant_context", reason: "required" }
  ]);
});

test("catalog node request receives its tenant from the platform resolver", async () => {
  const request = {
    method: "GET",
    url: "/api/v1/catalog/products",
    headers: {}
  };
  const app = createApp({
    resolveTenant: (incomingRequest) => {
      assert.equal(incomingRequest, request);
      return tenantId;
    }
  });
  const response = await app.handleNodeRequest(request);
  const body = JSON.parse(response.body);

  assert.equal(response.status, 200);
  assert.equal(body.data.length, 2);
  assert.deepEqual(body.data.map((product) => product.tenant_id), [tenantId, tenantId]);
});

test("catalog API returns validation response for an invalid effective-price timestamp", async () => {
  const app = createApp();
  const response = await app.handle(
    "GET",
    `/api/v1/catalog/products/${productId}?at=not-a-date`,
    catalogContext
  );
  const body = JSON.parse(response.body);

  assert.equal(response.status, 400);
  assert.deepEqual(body.error.details, [{ field: "at", reason: "price_at_invalid" }]);
});
