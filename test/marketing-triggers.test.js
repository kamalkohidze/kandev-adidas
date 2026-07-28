import assert from "node:assert/strict";
import test from "node:test";
import { createMarketingTriggerService } from "../src/modules/marketing/triggers/index.js";
import { createWorkflowService } from "../src/modules/marketing/workflow/index.js";
import { createApp } from "../src/platform/app.js";
import { createSeedData } from "../src/platform/seed-data.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const customerId = "11111111-1111-4111-8111-111111111111";
const loyaltyAccountId = "44444444-4444-4444-8444-444444444444";
const asOf = "2026-07-28T00:00:00.000Z";

test("trigger preset API lists, enables and disables workflow definitions", async () => {
  const data = createSeedData();
  const app = createApp({ data });

  const listed = await app.handle("GET", "/api/v1/marketing/triggers/presets", { tenantId });
  assert.equal(listed.status, 200);
  assert.equal(JSON.parse(listed.body).data.length, 4);

  const enabled = await app.handle("POST", "/api/v1/marketing/triggers/presets/welcome/enable", {
    tenantId,
    body: { as_of: asOf }
  });
  assert.equal(enabled.status, 200);
  assert.equal(JSON.parse(enabled.body).data.enabled, true);
  assert.equal(data.workflow_definitions[0].code, "trigger-welcome");
  assert.equal(data.workflow_definitions[0].status, "active");

  const disabled = await app.handle("POST", "/api/v1/marketing/triggers/presets/welcome/disable", {
    tenantId,
    body: { as_of: asOf }
  });
  assert.equal(disabled.status, 200);
  assert.equal(JSON.parse(disabled.body).data.enabled, false);
  assert.equal(data.workflow_definitions[0].status, "archived");
});

test("welcome trigger starts workflow, carries locale, and sends email follow-up after three days", () => {
  const data = createSeedData();
  enablePresets(data, ["welcome"]);
  const workflow = createWorkflowService(data);

  const result = workflow.handleEvent({
    tenantId,
    event: customerRegisteredEvent("welcome-001", {
      preferred_locale: "en",
      consent_summary: { push: false, sms: false, email: true, waba: true }
    }),
    asOf
  });

  assert.equal(result.started, 1);
  assert.equal(result.data[0].workflow_code, "trigger-welcome");
  assert.equal(result.data[0].status, "waiting");
  const welcomeDelivery = findDelivery(data, "trigger-welcome", "welcome_discount");
  assert.equal(welcomeDelivery.payload.locale, "kk");
  assert.equal(welcomeDelivery.payload.channel, "waba");
  assert.equal(welcomeDelivery.payload.variables.first_name, "Alibek");
  assert.equal(welcomeDelivery.payload.variables.discount_percent, "5.00");
  assert.equal(welcomeDelivery.payload.rendered_template.locale, "kk");

  const waitStep = result.data[0].step_states.find((step) => step.step_code === "wait_before_brand_email");
  assert.equal(waitStep.status, "waiting");
  assert.equal(waitStep.available_at, "2026-07-31T00:00:00.000Z");

  const completed = workflow.advanceInstance({
    tenantId,
    instanceId: result.data[0].id,
    asOf: "2026-07-31T00:00:00.000Z"
  });
  assert.equal(completed.data.status, "completed");
  const emailDelivery = findDelivery(data, "trigger-welcome", "welcome_brand_story");
  assert.equal(emailDelivery.payload.channel, "email");
  assert.equal(emailDelivery.payload.locale, "kk");
});

test("welcome trigger without consent evidence does not infer a delivery channel", () => {
  const data = createSeedData();
  enablePresets(data, ["welcome"]);
  const workflow = createWorkflowService(data);

  const result = workflow.handleEvent({
    tenantId,
    event: customerRegisteredEvent("welcome-no-consent", { consent_summary: undefined }),
    asOf
  });

  assert.equal(result.started, 1);
  const delivery = findDelivery(data, "trigger-welcome");
  assert.equal(delivery.payload.channel, null);
  assert.equal(delivery.payload.eligibility.consent.checked, false);
});

test("birthday trigger respects seven day birthday window", () => {
  const data = createSeedData();
  enablePresets(data, ["birthday"]);
  const workflow = createWorkflowService(data);

  const outside = workflow.handleEvent({
    tenantId,
    event: birthdayDueEvent("birthday-outside", { days_before: 10, due_date: "2026-08-07" }),
    asOf
  });
  assert.equal(outside.started, 0);
  assert.equal(outside.skipped[0].reason, "trigger_condition_not_matched");

  const malformedDueDate = workflow.handleEvent({
    tenantId,
    event: birthdayDueEvent("birthday-malformed-date", { days_before: 7, due_date: "not-a-date" }),
    asOf
  });
  assert.equal(malformedDueDate.started, 0);
  assert.equal(malformedDueDate.skipped[0].reason, "trigger_condition_not_matched");

  const inside = workflow.handleEvent({
    tenantId,
    event: birthdayDueEvent("birthday-inside", { days_before: 7, due_date: "2026-08-04" }),
    asOf
  });
  assert.equal(inside.started, 1);
  assert.equal(inside.data[0].workflow_code, "trigger-birthday");
  const delivery = findDelivery(data, "trigger-birthday");
  assert.equal(delivery.payload.variables.promotion_type, "birthday");
  assert.equal(delivery.payload.variables.expires_in_days, 14);
});

test("abandoned cart trigger sends push after one hour and WABA follow-up at twenty four hours", () => {
  const data = createSeedData();
  enablePresets(data, ["abandoned-cart"]);
  const workflow = createWorkflowService(data);
  const cartAsOf = "2026-07-28T10:00:00.000Z";

  const started = workflow.handleEvent({
    tenantId,
    event: cartAbandonedEvent("cart-001", cartAsOf),
    asOf: cartAsOf
  });

  assert.equal(started.started, 1);
  assert.equal(started.data[0].status, "waiting");
  assert.equal(findDelivery(data, "trigger-abandoned-cart"), null);

  const firstWait = started.data[0].step_states.find((step) => step.step_code === "wait_after_abandonment");
  assert.equal(firstWait.status, "waiting");
  assert.equal(firstWait.available_at, "2026-07-28T11:00:00.000Z");

  const afterPush = workflow.advanceInstance({
    tenantId,
    instanceId: started.data[0].id,
    asOf: "2026-07-28T11:00:00.000Z"
  });
  assert.equal(afterPush.data.status, "waiting");
  const pushDelivery = findDelivery(data, "trigger-abandoned-cart", "abandoned_cart_push");
  assert.equal(pushDelivery.payload.channel, "push");
  assert.equal(pushDelivery.payload.variables.item_name, "RUN-SHOE-001-UK10");
  assert.equal(pushDelivery.payload.variables.item_image_url, "https://cdn.example/run-shoe.jpg");

  const secondWait = afterPush.data.step_states.find((step) => step.step_code === "wait_before_waba_followup");
  assert.equal(secondWait.status, "waiting");
  assert.equal(secondWait.available_at, "2026-07-29T10:00:00.000Z");

  const completed = workflow.advanceInstance({
    tenantId,
    instanceId: started.data[0].id,
    asOf: "2026-07-29T10:00:00.000Z"
  });
  assert.equal(completed.data.status, "completed");
  const wabaDelivery = findDelivery(data, "trigger-abandoned-cart", "abandoned_cart_waba");
  assert.equal(wabaDelivery.payload.channel, "waba");
  assert.equal(wabaDelivery.payload.variables.item_image_url, "https://cdn.example/run-shoe.jpg");
});

test("tier retention trigger requires a positive retention gap", () => {
  const data = createSeedData();
  enablePresets(data, ["tier-retention"]);
  const workflow = createWorkflowService(data);

  const noGap = workflow.handleEvent({
    tenantId,
    event: tierRetentionEvent("tier-gap-zero", { retention_gap_amount: "0.00" }),
    asOf
  });
  assert.equal(noGap.started, 0);

  const withGap = workflow.handleEvent({
    tenantId,
    event: tierRetentionEvent("tier-gap-positive", { retention_gap_amount: "25000.00" }),
    asOf
  });
  assert.equal(withGap.started, 1);
  assert.equal(withGap.data[0].workflow_code, "trigger-tier-retention");
  const delivery = findDelivery(data, "trigger-tier-retention");
  assert.equal(delivery.payload.variables.retention_gap_amount, "25000.00");
  assert.equal(delivery.payload.variables.current_discount_percent, "10.00");
});

function enablePresets(data, presetCodes) {
  const triggers = createMarketingTriggerService(data, { now: () => asOf });
  for (const presetCode of presetCodes) {
    const result = triggers.enablePreset({ tenantId, presetCode, asOf });
    assert.equal(result.ok, true);
  }
}

function findDelivery(data, workflowCode, templateCode = null) {
  return (data.workflow_events || []).find(
    (event) =>
      event.event_type === "message.delivery.requested" &&
      event.payload.workflow_code === workflowCode &&
      (!templateCode || event.payload.template_code === templateCode)
  ) || null;
}

function baseEvent(key, eventType, aggregateType, aggregateId, payload) {
  return {
    event_id: `${key}-event`,
    event_type: eventType,
    event_version: 1,
    tenant_id: tenantId,
    aggregate_type: aggregateType,
    aggregate_id: aggregateId,
    occurred_at: asOf,
    published_at: asOf,
    producer: "test",
    correlation_id: `${key}-correlation`,
    causation_id: null,
    idempotency_key: key,
    partition_key: customerId,
    payload,
    metadata: { source_system: "test", locale: "ru", pii: false }
  };
}

function customerRegisteredEvent(key, overrides = {}) {
  return baseEvent(key, "customer.registered", "customer", customerId, {
    customer_id: customerId,
    registration_channel: "mobile",
    preferred_locale: "ru",
    identities: [{ type: "phone", value_masked: "+7701***", verified: true }],
    consent_summary: { push: true, waba: true, sms: false, email: true },
    ...overrides
  });
}

function birthdayDueEvent(key, overrides = {}) {
  return baseEvent(key, "customer.birthday.due", "customer", customerId, {
    customer_id: customerId,
    birth_date: "1990-08-04",
    due_date: "2026-08-04",
    days_before: 7,
    preferred_locale: "en",
    eligible_channels: ["push"],
    ...overrides
  });
}

function cartAbandonedEvent(key, occurredAt) {
  return {
    ...baseEvent(key, "cart.abandoned", "cart", "cart-0001", {
      cart_id: "cart-0001",
      customer_id: customerId,
      anonymous_id: null,
      channel: "mobile",
      abandoned_at: occurredAt,
      last_activity_at: "2026-07-28T09:45:00.000Z",
      recovery_url: "https://shop.example/cart/cart-0001",
      preferred_locale: "en",
      eligible_channels: ["push", "waba"],
      items: [
        {
          product_variant_id: "88888888-8888-4888-8888-888888888888",
          sku: "RUN-SHOE-001-UK10",
          name: "RUN-SHOE-001-UK10",
          image_url: "https://cdn.example/run-shoe.jpg"
        }
      ]
    }),
    occurred_at: occurredAt,
    published_at: occurredAt
  };
}

function tierRetentionEvent(key, overrides = {}) {
  return baseEvent(key, "loyalty.tier.retention_risk", "loyalty_account", loyaltyAccountId, {
    customer_id: customerId,
    loyalty_account_id: loyaltyAccountId,
    current_tier_code: "silver",
    current_discount_percent: "10.00",
    projected_tier_code: "bronze",
    projected_discount_percent: "5.00",
    retention_gap_amount: "25000.00",
    currency: "KZT",
    days_until_recalculation: 30,
    preferred_locale: "en",
    ...overrides
  });
}
