import assert from "node:assert/strict";
import test from "node:test";
import { createWorkflowService } from "../src/modules/marketing/workflow/index.js";
import { createApp } from "../src/platform/app.js";
import { createSeedData } from "../src/platform/seed-data.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const customerId = "11111111-1111-4111-8111-111111111111";
const asOf = "2026-07-28T00:00:00.000Z";

test("canonical event starts a journey and requests delivery without provider send", () => {
  const data = createSeedData();
  const workflow = createWorkflowService(data);
  const created = workflow.createDefinition({ tenantId, definition: welcomeDefinition(), asOf });
  assert.equal(created.ok, true);

  const result = workflow.handleEvent({ tenantId, event: registeredEvent("event-start-001"), asOf });

  assert.equal(result.ok, true);
  assert.equal(result.started, 1);
  assert.equal(data.journey_instances.length, 1);
  assert.equal(data.journey_instances[0].status, "completed");
  assert.equal(data.workflow_events.some((event) => event.event_type === "marketing.journey.started"), true);
  assert.equal(data.workflow_events.some((event) => event.event_type === "message.delivery.requested"), true);
  assert.equal(data.workflow_events.some((event) => event.provider_message_id), false);
});

test("conditions route steps through public segment service", () => {
  const data = createSeedData();
  const workflow = createWorkflowService(data);
  workflow.createDefinition({ tenantId, definition: sportBranchDefinition(), asOf });

  const result = workflow.handleEvent({ tenantId, event: purchaseEvent("branch-001"), asOf });

  assert.equal(result.started, 1);
  const instance = data.journey_instances[0];
  const branch = instance.step_states.find((step) => step.step_code === "is_football_buyer");
  assert.equal(branch.status, "completed");
  assert.equal(branch.decision.matched, true);

  const delivery = data.workflow_events.find((event) => event.event_type === "message.delivery.requested");
  assert.equal(delivery.payload.template_code, "football_followup");
});

test("canonical event handling is idempotent per workflow definition", () => {
  const data = createSeedData();
  const workflow = createWorkflowService(data);
  workflow.createDefinition({ tenantId, definition: welcomeDefinition(), asOf });
  const event = registeredEvent("idempotent-001");

  const first = workflow.handleEvent({ tenantId, event, asOf });
  const second = workflow.handleEvent({ tenantId, event, asOf });

  assert.equal(first.started, 1);
  assert.equal(second.started, 0);
  assert.equal(second.duplicate_count, 1);
  assert.equal(data.workflow_event_receipts.length, 1);
  assert.equal(data.journey_instances.length, 1);
});

test("dry-run executes workflow definition without mutating original data", () => {
  const data = createSeedData();
  const workflow = createWorkflowService(data);

  const result = workflow.dryRun({
    tenantId,
    definition: welcomeDefinition({ code: "dry-welcome" }),
    event: registeredEvent("dry-001"),
    asOf
  });

  assert.equal(result.ok, true);
  assert.equal(result.dry_run, true);
  assert.equal(result.started, 1);
  assert.equal(result.data[0].status, "completed");
  assert.equal(result.emitted_events.some((event) => event.event_type === "message.delivery.requested"), true);
  assert.equal(data.workflow_definitions?.length || 0, 0);
  assert.equal(data.journey_instances?.length || 0, 0);
  assert.equal(data.workflow_events?.length || 0, 0);
});

test("journey and step state transitions wait and advance delay steps", () => {
  const data = createSeedData();
  const workflow = createWorkflowService(data);
  workflow.createDefinition({ tenantId, definition: delayedDefinition(), asOf });

  const started = workflow.handleEvent({ tenantId, event: registeredEvent("delay-001"), asOf });
  const instanceId = started.data[0].id;
  assert.equal(started.data[0].status, "waiting");
  assert.equal(started.data[0].step_states.find((step) => step.step_code === "wait").status, "waiting");

  const tooEarly = workflow.advanceInstance({
    tenantId,
    instanceId,
    asOf: "2026-07-28T00:29:00.000Z"
  });
  assert.equal(tooEarly.data.status, "waiting");

  const completed = workflow.advanceInstance({
    tenantId,
    instanceId,
    asOf: "2026-07-28T00:30:00.000Z"
  });
  assert.equal(completed.data.status, "completed");
  assert.equal(completed.data.step_states.find((step) => step.step_code === "wait").status, "completed");
  assert.equal(completed.data.step_states.find((step) => step.step_code === "send").status, "completed");
});

test("workflow API creates, views, ingests events and dry-runs definitions", async () => {
  const data = createSeedData();
  const app = createApp({ data });

  const created = await app.handle("POST", "/api/v1/marketing/workflows", {
    tenantId,
    body: welcomeDefinition({ code: "api-welcome" })
  });
  assert.equal(created.status, 201);

  const viewed = await app.handle("GET", "/api/v1/marketing/workflows/api-welcome", { tenantId });
  assert.equal(viewed.status, 200);
  assert.equal(JSON.parse(viewed.body).data.code, "api-welcome");

  const ingested = await app.handle("POST", "/api/v1/marketing/workflows/events", {
    tenantId,
    body: { event: registeredEvent("api-event-001"), as_of: asOf }
  });
  assert.equal(ingested.status, 202);
  assert.equal(JSON.parse(ingested.body).started, 1);

  const dryRun = await app.handle("POST", "/api/v1/marketing/workflows/dry-run", {
    tenantId,
    body: {
      workflow_code: "api-welcome",
      event: registeredEvent("api-dry-001"),
      as_of: asOf
    }
  });
  assert.equal(dryRun.status, 200);
  assert.equal(JSON.parse(dryRun.body).dry_run, true);
});


test("workflow definition validation handles malformed step entries", () => {
  const data = createSeedData();
  const workflow = createWorkflowService(data);

  const result = workflow.createDefinition({
    tenantId,
    asOf,
    definition: {
      code: "malformed-steps",
      name: "Malformed steps",
      status: "active",
      trigger: { event_types: ["customer.registered"] },
      steps: [null]
    }
  });

  assert.equal(result.ok, false);
  assert.equal(data.workflow_definitions?.length || 0, 0);
  assert.equal(
    result.validationDetails.some(
      (detail) => detail.field === "steps.0" && detail.reason === "object_required"
    ),
    true
  );
});

test("workflow event normalization uses trusted tenant context", () => {
  const data = createSeedData();
  const workflow = createWorkflowService(data);
  workflow.createDefinition({ tenantId, definition: welcomeDefinition(), asOf });

  const event = registeredEvent("trusted-tenant-001");
  event.tenant_id = "00000000-0000-4000-8000-000000000099";
  const result = workflow.handleEvent({ tenantId, event, asOf });

  assert.equal(result.started, 1);
  assert.equal(data.journey_instances[0].tenant_id, tenantId);
  assert.equal(data.journey_instances[0].context.event.tenant_id, tenantId);
  assert.equal(data.workflow_events.every((workflowEvent) => workflowEvent.tenant_id === tenantId), true);
});

function welcomeDefinition(overrides = {}) {
  return {
    code: overrides.code || "welcome-on-registration",
    name: "Welcome on registration",
    status: "active",
    trigger: {
      event_types: ["customer.registered"]
    },
    entry_step: "send_welcome",
    steps: [
      {
        code: "send_welcome",
        type: "action",
        action: {
          type: "request_delivery",
          template_code: "welcome_ru",
          channel: "push"
        },
        next_step: "done"
      },
      { code: "done", type: "end" }
    ]
  };
}

function sportBranchDefinition() {
  return {
    code: "sport-branch",
    name: "Sport branch",
    status: "active",
    trigger: {
      event_types: ["transaction.purchase.created"]
    },
    entry_step: "is_football_buyer",
    steps: [
      {
        code: "is_football_buyer",
        type: "condition",
        condition: {
          type: "customer_in_segment",
          segment_code: "buyers-by-sport",
          filters: { sport_tag: "football" }
        },
        next_steps: {
          true: "send_football",
          false: "send_generic"
        }
      },
      {
        code: "send_football",
        type: "action",
        action: { type: "request_delivery", template_code: "football_followup", channel: "push" },
        next_step: "done"
      },
      {
        code: "send_generic",
        type: "action",
        action: { type: "request_delivery", template_code: "generic_followup", channel: "push" },
        next_step: "done"
      },
      { code: "done", type: "end" }
    ]
  };
}

function delayedDefinition() {
  return {
    code: "delayed-welcome",
    name: "Delayed welcome",
    status: "active",
    trigger: { event_types: ["customer.registered"] },
    entry_step: "wait",
    steps: [
      {
        code: "wait",
        type: "delay",
        delay: { amount: 30, unit: "minutes" },
        next_step: "send"
      },
      {
        code: "send",
        type: "action",
        action: { type: "request_delivery", template_code: "delayed_welcome", channel: "push" },
        next_step: "done"
      },
      { code: "done", type: "end" }
    ]
  };
}

function registeredEvent(key) {
  return {
    event_id: `${key}-event`,
    event_type: "customer.registered",
    event_version: 1,
    tenant_id: tenantId,
    aggregate_type: "customer",
    aggregate_id: customerId,
    occurred_at: asOf,
    published_at: asOf,
    producer: "test",
    correlation_id: `${key}-correlation`,
    causation_id: null,
    idempotency_key: key,
    partition_key: customerId,
    payload: {
      customer_id: customerId,
      registration_channel: "mobile",
      preferred_locale: "ru"
    },
    metadata: { source_system: "test", locale: "ru", pii: false }
  };
}

function purchaseEvent(key) {
  return {
    event_id: `${key}-event`,
    event_type: "transaction.purchase.created",
    event_version: 1,
    tenant_id: tenantId,
    aggregate_type: "transaction",
    aggregate_id: "33333333-3333-4333-8333-333333333333",
    occurred_at: asOf,
    published_at: asOf,
    producer: "test",
    correlation_id: `${key}-correlation`,
    causation_id: null,
    idempotency_key: key,
    partition_key: customerId,
    payload: {
      transaction_id: "33333333-3333-4333-8333-333333333333",
      customer_id: customerId,
      channel: "pos",
      occurred_at: "2026-07-15T18:20:00+05:00",
      currency: "KZT",
      net_amount: "71991.00",
      loyalty_eligible_amount: "71991.00",
      source_system: "seed-pos",
      external_transaction_id: "SEED-RECEIPT-0001",
      lines: []
    },
    metadata: { source_system: "test", locale: "ru", pii: false }
  };
}
