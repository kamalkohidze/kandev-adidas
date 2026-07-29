import assert from "node:assert/strict";
import test from "node:test";
import {
  buildContentTemplateBody,
  buildInstanceAdvanceBody,
  buildWorkflowCreateBody,
  buildWorkflowDryRunBody,
  buildWorkflowEventBody,
  parseJsonField,
  prettyJson,
  workflowDefinitionExample,
  workflowEventExample
} from "../public/campaign-builder-utils.js";

test("campaign builder validates JSON before building workflow requests", () => {
  const invalid = buildWorkflowCreateBody("{not json}");
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.field, "definition");
  assert.equal(invalid.error.reason, "invalid_json");

  const created = buildWorkflowCreateBody(prettyJson(workflowDefinitionExample));
  assert.equal(created.ok, true);
  assert.equal(created.body.definition.code, "campaign-welcome-preview");
});

test("campaign builder dry-run supports existing workflow and custom definition", () => {
  const existing = buildWorkflowDryRunBody({
    mode: "existing",
    workflow_code: "trigger-welcome",
    event_json: prettyJson(workflowEventExample),
    as_of: "2026-07-28T00:00:00.000Z"
  });
  assert.deepEqual(Object.keys(existing.body).sort(), ["as_of", "event", "workflow_code"]);
  assert.equal(existing.body.workflow_code, "trigger-welcome");

  const custom = buildWorkflowDryRunBody({
    mode: "custom",
    definition_json: prettyJson(workflowDefinitionExample),
    event_json: prettyJson(workflowEventExample)
  });
  assert.equal(custom.ok, true);
  assert.equal(custom.body.definition.code, "campaign-welcome-preview");
  assert.equal(custom.body.event.event_type, "customer.registered");
});

test("campaign builder event and instance advance bodies match workflow API", () => {
  const event = buildWorkflowEventBody({
    event_json: prettyJson(workflowEventExample),
    as_of: "2026-07-28T00:00:00.000Z"
  });
  assert.equal(event.ok, true);
  assert.equal(event.body.event.event_id, "frontend-event-001");
  assert.equal(event.body.as_of, "2026-07-28T00:00:00.000Z");

  assert.deepEqual(buildInstanceAdvanceBody({ as_of: "2026-07-28T00:30:00.000Z" }), {
    as_of: "2026-07-28T00:30:00.000Z"
  });
});

test("campaign builder content body parses variables and recommendation options", () => {
  const body = buildContentTemplateBody({
    channel: "push",
    locale: "en",
    customer_id: "customer-1",
    variables_json: `{"name":"Alibek"}`,
    include_recommendations: "on",
    allow_raw_pii: false,
    branch_id: "branch-1",
    limit: "2"
  });

  assert.equal(body.ok, true);
  assert.deepEqual(body.body.variables, { name: "Alibek" });
  assert.equal(body.body.include_recommendations, true);
  assert.deepEqual(body.body.recommendation, { branch_id: "branch-1", limit: 2 });

  const arrayVariables = buildContentTemplateBody({ variables_json: "[]" });
  assert.equal(arrayVariables.ok, false);
  assert.equal(arrayVariables.error.reason, "object_required");

  const parsed = parseJsonField(`{"a":1}`, "variables");
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.data, { a: 1 });
});
