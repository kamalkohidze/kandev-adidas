import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createApp } from "../src/platform/app.js";
import {
  buildDeliveryEnqueueBody,
  buildDeliveryProcessBody,
  buildProviderReceiptBody,
  prettyJson
} from "../public/delivery-utils.js";

const frontendFiles = [
  "public/app.js",
  "public/catalog-workspaces.js",
  "public/marketing-analytics.js",
  "public/campaign-builder.js",
  "public/delivery-workspace.js"
];

test("frontend static files are served and root panels exist", async () => {
  const app = createApp();
  const index = await app.handle("GET", "/");
  const appJs = await app.handle("GET", "/app.js");
  const deliveryJs = await app.handle("GET", "/delivery-workspace.js");
  const styles = await app.handle("GET", "/styles.css");
  const html = bodyText(index);

  assert.equal(index.status, 200);
  assert.match(index.headers["content-type"], /text\/html/);
  assert.equal(appJs.status, 200);
  assert.equal(deliveryJs.status, 200);
  assert.equal(styles.status, 200);

  for (const id of [
    "overviewPanel",
    "customerPanel",
    "catalogPanel",
    "recommendationsPanel",
    "marketingPanel",
    "campaignsPanel",
    "posPanel",
    "promotionsPanel",
    "deliveryPanel"
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  for (const section of [
    "overview",
    "customer",
    "catalog",
    "recommendations",
    "marketing",
    "campaigns",
    "pos",
    "promotions",
    "delivery"
  ]) {
    assert.match(html, new RegExp(`data-section="${section}"`));
  }
});

test("frontend JavaScript references real backend API paths for covered modules", async () => {
  const source = (await Promise.all(frontendFiles.map((file) => readFile(file, "utf8")))).join("\n");

  for (const path of [
    "/api/v1/health",
    "/api/v1/modules",
    "/api/v1/me/profile",
    "/api/v1/catalog/products",
    "/api/v1/catalog/variants/",
    "/api/v1/catalog/inventory",
    "/api/v1/customers/",
    "/api/v1/recommendations/segments/",
    "/api/v1/pos/discounts/evaluate",
    "/api/v1/pos/transactions",
    "/api/v1/promotions/coupons",
    "/api/v1/marketing/segments",
    "/api/v1/marketing/lifecycle/",
    "/api/v1/marketing/cross-sell/",
    "/api/v1/marketing/workflows",
    "/api/v1/marketing/triggers/",
    "/api/v1/marketing/content/templates",
    "/api/v1/messages/send",
    "/api/v1/marketing/delivery/enqueue",
    "/api/v1/marketing/delivery/process",
    "/api/v1/marketing/delivery/requests/",
    "/api/v1/messages/provider-receipts/"
  ]) {
    assert.equal(source.includes(path), true, `${path} should be referenced by frontend source`);
  }
});

test("delivery frontend helpers build API payloads and validate JSON metadata", () => {
  const enqueue = buildDeliveryEnqueueBody(
    {
      customer_id: "customer-1",
      template_code: "welcome_discount",
      channel: "waba",
      preferred_channels: "waba, sms, email",
      locale: "en",
      variables_json: prettyJson({ name: "Alibek", discount: "10.00" }),
      metadata_json: prettyJson({ source: "test" }),
      recipient: "+77017578320",
      idempotency_key: "frontend-test-001",
      max_attempts: "2",
      include_recommendations: true
    },
    "fallback-customer",
    "ru"
  );

  assert.equal(enqueue.ok, true);
  assert.deepEqual(enqueue.body.preferred_channels, ["waba", "sms", "email"]);
  assert.equal(enqueue.body.customer_id, "customer-1");
  assert.equal(enqueue.body.metadata.recipient, "+77017578320");
  assert.equal(enqueue.body.max_attempts, 2);
  assert.equal(enqueue.body.include_recommendations, true);

  const invalidMetadata = buildProviderReceiptBody({
    provider_message_id: "wamid-1",
    status: "delivered",
    metadata_json: "{bad"
  });
  assert.equal(invalidMetadata.ok, false);
  assert.equal(invalidMetadata.error.field, "metadata");

  const invalidVariables = buildDeliveryEnqueueBody({
    customer_id: "customer-1",
    template_code: "welcome_discount",
    variables_json: "[]",
    metadata_json: "{}"
  });
  assert.equal(invalidVariables.ok, false);
  assert.equal(invalidVariables.error.reason, "object_required");

  assert.deepEqual(buildDeliveryProcessBody({ limit: "5", as_of: "2026-07-29T10:00" }), {
    as_of: "2026-07-29T10:00",
    limit: 5
  });
});

function bodyText(response) {
  return Buffer.isBuffer(response.body) ? response.body.toString("utf8") : String(response.body || "");
}
