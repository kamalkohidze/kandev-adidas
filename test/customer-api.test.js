import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/platform/app.js";

test("GET /api/v1/me/profile returns Customer360Profile read model", async () => {
  const app = createApp();
  const response = await app.handle("GET", "/api/v1/me/profile?include=identities,purchase_history", {
    headers: {
      "accept-language": "KZ"
    }
  });

  assert.equal(response.status, 200);
  const body = JSON.parse(response.body);

  assert.equal(body.customer.id, "11111111-1111-4111-8111-111111111111");
  assert.equal(body.customer.preferred_locale, "kk");
  assert.equal(body.loyalty_snapshot.discount_percent, "10.00");
  assert.equal(body.identities[0].value_masked, "+7701***8320");
  assert.equal(body.purchase_history[0].transaction_id, "33333333-3333-4333-8333-333333333333");
});

test("POST /api/v1/customer-identities/resolve matches a canonical CustomerIdentity", async () => {
  const app = createApp();
  const response = await app.handle("POST", "/api/v1/customer-identities/resolve", {
    body: {
      tenant_id: "00000000-0000-4000-8000-000000000001",
      source_system: "pos",
      identity: {
        type: "phone",
        value: "87017578320"
      }
    }
  });

  assert.equal(response.status, 200);
  const body = JSON.parse(response.body);

  assert.equal(body.match_status, "matched");
  assert.equal(body.customer_id, "11111111-1111-4111-8111-111111111111");
  assert.equal(body.identity.value_masked, "+7701***8320");
  assert.equal(body.linked_channels.wallet, true);
});
