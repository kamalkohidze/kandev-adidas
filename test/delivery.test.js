import assert from "node:assert/strict";
import test from "node:test";
import { createDeliveryService } from "../src/modules/marketing/delivery/index.js";
import { createApp } from "../src/platform/app.js";
import { createSeedData } from "../src/platform/seed-data.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const customerId = "11111111-1111-4111-8111-111111111111";
const asOf = "2026-07-28T00:00:00.000Z";

test("delivery cascade falls back from Push to WABA after provider failure", () => {
  const data = deliveryData();
  const delivery = createDeliveryService(data, {
    providerBehavior: {
      push: { ok: false, retryable: false, failure_code: "push_rejected" },
      waba: { ok: true, provider_message_id: "wamid-cascade-001" }
    }
  });

  const enqueued = delivery.enqueueDelivery({
    tenantId,
    asOf,
    request: baseRequest({ idempotency_key: "cascade-001" })
  });
  const processed = delivery.processDueDeliveries({ tenantId, asOf });

  assert.equal(enqueued.ok, true);
  assert.equal(processed.processed, 2);
  assert.equal(data.message_deliveries.length, 2);
  assert.equal(data.message_deliveries[0].channel, "push");
  assert.equal(data.message_deliveries[0].status, "failed");
  assert.equal(data.message_deliveries[0].failure_code, "push_rejected");
  assert.equal(data.message_deliveries[1].channel, "waba");
  assert.equal(data.message_deliveries[1].status, "sent");
  assert.equal(data.delivery_requests[0].current_delivery_id, data.message_deliveries[1].id);
});

test("delivery status callbacks move sent messages to delivered and read", () => {
  const data = deliveryData();
  const delivery = createDeliveryService(data, {
    providerBehavior: {
      waba: { ok: true, provider_message_id: "wamid-status-001" }
    }
  });

  delivery.enqueueDelivery({
    tenantId,
    asOf,
    request: baseRequest({ channel: "waba", idempotency_key: "status-001" })
  });
  delivery.processDueDeliveries({ tenantId, asOf });

  const delivered = delivery.handleStatusCallback({
    tenantId,
    provider: "mock-waba",
    providerMessageId: "wamid-status-001",
    status: "delivered",
    occurredAt: "2026-07-28T00:01:00.000Z"
  });
  const read = delivery.handleStatusCallback({
    tenantId,
    provider: "mock-waba",
    providerMessageId: "wamid-status-001",
    status: "read",
    occurredAt: "2026-07-28T00:02:00.000Z"
  });

  assert.equal(delivered.ok, true);
  assert.equal(delivered.data.status, "delivered");
  assert.equal(read.ok, true);
  assert.equal(read.data.status, "read");
  assert.equal(data.delivery_requests[0].status, "completed");
  assert.equal(data.delivery_events.some((event) => event.event_type === "message.delivery.status_changed"), true);
});

test("delivery retry limit keeps retryable failures queued until max attempts", () => {
  const data = deliveryData({ channels: ["push"] });
  const delivery = createDeliveryService(data, {
    maxAttempts: 2,
    backoffMs: [60_000],
    providerBehavior: {
      push: [
        { ok: false, retryable: true, failure_code: "timeout" },
        { ok: false, retryable: true, failure_code: "timeout" }
      ]
    }
  });

  delivery.enqueueDelivery({
    tenantId,
    asOf,
    request: baseRequest({ channel: "push", idempotency_key: "retry-001", max_attempts: 2 })
  });
  delivery.processDueDeliveries({ tenantId, asOf });
  const afterFirst = data.message_deliveries[0];
  delivery.processDueDeliveries({ tenantId, asOf: "2026-07-28T00:00:30.000Z" });
  delivery.processDueDeliveries({ tenantId, asOf: "2026-07-28T00:01:00.000Z" });
  delivery.processDueDeliveries({ tenantId, asOf: "2026-07-28T00:02:00.000Z" });

  assert.equal(afterFirst.status, "failed");
  assert.equal(data.message_deliveries[0].attempt_count, 2);
  assert.equal(data.delivery_attempts.length, 2);
  assert.equal(data.delivery_requests[0].status, "failed");
  assert.equal(data.delivery_requests[0].failure_reason, "no_eligible_channel");
});

test("delivery enqueue is idempotent by tenant and idempotency key", () => {
  const data = deliveryData();
  const delivery = createDeliveryService(data);
  const request = baseRequest({ channel: "waba", idempotency_key: "idempotent-001" });

  const first = delivery.enqueueDelivery({ tenantId, asOf, request });
  const second = delivery.enqueueDelivery({ tenantId, asOf, request });

  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(second.data.id, first.data.id);
  assert.equal(data.delivery_requests.length, 1);
  assert.equal(data.message_deliveries.length, 1);
});

test("delivery consent blocks a channel and continues cascade", () => {
  const data = deliveryData();
  data.consents = data.consents.filter((consent) => consent.channel !== "push");
  const delivery = createDeliveryService(data);

  const enqueued = delivery.enqueueDelivery({
    tenantId,
    asOf,
    request: baseRequest({ channel: "push", idempotency_key: "consent-001" })
  });

  assert.equal(enqueued.ok, true);
  assert.equal(enqueued.delivery.channel, "waba");
  assert.equal(data.delivery_requests[0].skipped_channels[0].channel, "push");
  assert.equal(data.delivery_requests[0].skipped_channels[0].reason, "marketing_consent_required");
});

test("delivery missing channel identity blocks channel and continues cascade", () => {
  const data = deliveryData();
  data.identities = data.identities.filter((identity) => identity.type !== "device");
  const delivery = createDeliveryService(data);

  const enqueued = delivery.enqueueDelivery({
    tenantId,
    asOf,
    request: baseRequest({ channel: "push", idempotency_key: "missing-identity-001" })
  });

  assert.equal(enqueued.ok, true);
  assert.equal(enqueued.delivery.channel, "waba");
  assert.equal(enqueued.delivery.recipient_identity_id, "22222222-2222-4222-8222-222222222221");
  assert.equal(data.delivery_requests[0].skipped_channels[0].channel, "push");
  assert.equal(data.delivery_requests[0].skipped_channels[0].reason, "active_identity_required");
  assert.equal(data.message_deliveries.some((delivery) => delivery.recipient_address_masked === "unresolved"), false);
});

test("delivery callback rejects invalid occurred_at without mutating status", async () => {
  const data = deliveryData();
  const app = createApp({ data });

  await app.handle("POST", "/api/v1/messages/send", {
    tenantId,
    body: baseRequest({ channel: "waba", idempotency_key: "bad-callback-time-001", as_of: asOf })
  });
  await app.handle("POST", "/api/v1/marketing/delivery/process", {
    tenantId,
    body: { as_of: asOf }
  });
  const delivery = data.message_deliveries[0];
  const request = data.delivery_requests[0];
  const before = {
    deliveryStatus: delivery.status,
    deliveredAt: delivery.delivered_at,
    updatedAt: delivery.updated_at,
    requestStatus: request.status
  };

  const callback = await app.handle("POST", "/api/v1/messages/provider-receipts/mock-waba", {
    tenantId,
    body: {
      provider_message_id: delivery.provider_message_id,
      status: "delivered",
      occurred_at: "bad-date",
      metadata: {}
    }
  });
  const body = JSON.parse(callback.body);

  assert.equal(callback.status, 400);
  assert.deepEqual(body.error.details, [{ field: "occurred_at", reason: "invalid_datetime" }]);
  assert.equal(delivery.status, before.deliveryStatus);
  assert.equal(delivery.delivered_at, before.deliveredAt);
  assert.equal(delivery.updated_at, before.updatedAt);
  assert.equal(request.status, before.requestStatus);
});

test("delivery API enqueues, processes and accepts provider callbacks", async () => {
  const data = deliveryData();
  const app = createApp({ data });

  const send = await app.handle("POST", "/api/v1/messages/send", {
    tenantId,
    body: baseRequest({ channel: "waba", idempotency_key: "api-001", as_of: asOf })
  });
  const sendBody = JSON.parse(send.body);
  const processed = await app.handle("POST", "/api/v1/marketing/delivery/process", {
    tenantId,
    body: { as_of: asOf }
  });
  const providerMessageId = data.message_deliveries[0].provider_message_id;
  const callback = await app.handle("POST", "/api/v1/messages/provider-receipts/mock-waba", {
    tenantId,
    body: {
      provider_message_id: providerMessageId,
      status: "delivered",
      occurred_at: "2026-07-28T00:01:00.000Z",
      metadata: {}
    }
  });
  const callbackBody = JSON.parse(callback.body);

  assert.equal(send.status, 202);
  assert.equal(sendBody.status, "queued");
  assert.equal(processed.status, 200);
  assert.equal(JSON.parse(processed.body).processed, 1);
  assert.equal(callback.status, 202);
  assert.equal(callbackBody.accepted, true);
  assert.equal(callbackBody.data.status, "delivered");
});

function deliveryData({ channels = ["push", "waba", "sms", "email"] } = {}) {
  const data = createSeedData();
  data.identities.push(
    identity({ id: "delivery-device", type: "device", value: "device-token-001" }),
    identity({ id: "delivery-email", type: "email", value: "alibek@example.test" })
  );
  data.consents = channels.map((channel) => ({
    id: `consent-${channel}`,
    tenant_id: tenantId,
    customer_id: customerId,
    channel,
    purpose: "marketing",
    granted: true,
    source_system: "test",
    evidence_ref: null,
    granted_at: "2026-07-01T00:00:00.000Z",
    revoked_at: null,
    expires_at: null,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    version: 1
  }));
  data.message_templates = channels.map((channel) => template(channel));
  return data;
}

function baseRequest(overrides = {}) {
  return {
    customer_id: customerId,
    template_code: "delivery_offer",
    channel: "push",
    locale: "en",
    variables: { discount: "10.00" },
    campaign_id: "campaign-delivery-test",
    correlation_id: "delivery-test-correlation",
    ...overrides
  };
}

function identity({ id, type, value }) {
  return {
    id,
    tenant_id: tenantId,
    customer_id: customerId,
    type,
    normalized_value: value,
    source_system: "test",
    is_primary: false,
    is_verified: true,
    is_active: true,
    first_seen_at: "2026-07-01T00:00:00.000Z",
    last_seen_at: "2026-07-28T00:00:00.000Z"
  };
}

function template(channel) {
  return {
    id: `delivery-template-${channel}`,
    tenant_id: tenantId,
    status: "active",
    code: "delivery_offer",
    name: `Delivery ${channel}`,
    channel,
    category: "delivery-test",
    locale_variants: {
      kk: { subject: "Жеңілдік", body: "Жеңілдік {{discount}}%", media_refs: [] },
      ru: { subject: "Скидка", body: "Скидка {{discount}}%", media_refs: [] },
      en: { subject: "Discount", body: "Discount {{discount}}%", media_refs: [] }
    },
    variables: [{ name: "discount", type: "decimal", required: true, pii: false, example: "10.00" }],
    provider_metadata: {
      waba_template_name: channel === "waba" ? "delivery_offer" : null,
      email_layout_id: channel === "email" ? "delivery-offer" : null,
      push_category: channel === "push" ? "delivery-test" : null
    },
    approval: {
      required: false,
      status: "approved",
      approved_by: null,
      approved_at: asOf
    },
    created_at: asOf,
    updated_at: asOf,
    version: 1
  };
}

