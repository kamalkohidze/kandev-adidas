export const workflowDefinitionExample = {
  code: "campaign-welcome-preview",
  name: "Campaign welcome preview",
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
        template_code: "welcome_discount",
        preferred_channels: ["push"]
      },
      next_step: "done"
    },
    { code: "done", type: "end" }
  ]
};

export const workflowEventExample = {
  event_id: "frontend-event-001",
  event_type: "customer.registered",
  aggregate_type: "customer",
  aggregate_id: "11111111-1111-4111-8111-111111111111",
  customer_id: "11111111-1111-4111-8111-111111111111",
  occurred_at: "2026-07-28T00:00:00.000Z",
  payload: {
    customer_id: "11111111-1111-4111-8111-111111111111",
    preferred_locale: "ru",
    consent_summary: { push: true, email: true, sms: true, waba: true }
  }
};

export const contentVariablesExample = {
  name: "Alibek",
  discount: "10.00",
  size: "UK 10",
  expires_in_days: 14
};

export function prettyJson(value) {
  return JSON.stringify(value, null, 2);
}

export function parseJsonField(value, field = "body") {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return {
      ok: false,
      error: {
        field,
        reason: "required",
        message: `${field} is required`
      }
    };
  }

  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch (error) {
    return {
      ok: false,
      error: {
        field,
        reason: "invalid_json",
        message: error.message
      }
    };
  }
}

export function buildWorkflowCreateBody(definitionJson) {
  const parsed = parseJsonField(definitionJson, "definition");
  if (!parsed.ok) {
    return parsed;
  }
  return { ok: true, body: { definition: parsed.data } };
}

export function buildWorkflowDryRunBody(fields = {}) {
  const event = parseJsonField(fields.event_json, "event");
  if (!event.ok) {
    return event;
  }

  const body = { event: event.data };
  appendString(body, "as_of", fields.as_of);

  if (fields.mode === "custom") {
    const definition = parseJsonField(fields.definition_json, "definition");
    if (!definition.ok) {
      return definition;
    }
    body.definition = definition.data;
  } else {
    appendString(body, "workflow_code", fields.workflow_code);
  }

  return { ok: true, body };
}

export function buildWorkflowEventBody(fields = {}) {
  const event = parseJsonField(fields.event_json, "event");
  if (!event.ok) {
    return event;
  }

  const body = { event: event.data };
  appendString(body, "as_of", fields.as_of);
  return { ok: true, body };
}

export function buildInstanceAdvanceBody(fields = {}) {
  const body = {};
  appendString(body, "as_of", fields.as_of);
  return body;
}

export function buildContentTemplateBody(fields = {}) {
  const variables = parseJsonField(fields.variables_json, "variables");
  if (!variables.ok) {
    return variables;
  }
  if (!isPlainObject(variables.data)) {
    return {
      ok: false,
      error: {
        field: "variables",
        reason: "object_required",
        message: "variables must be a JSON object"
      }
    };
  }

  const body = {
    variables: variables.data,
    include_recommendations: fields.include_recommendations === true || fields.include_recommendations === "on",
    allow_raw_pii: fields.allow_raw_pii === true || fields.allow_raw_pii === "on"
  };
  appendString(body, "channel", fields.channel);
  appendString(body, "locale", fields.locale);
  appendString(body, "customer_id", fields.customer_id);

  if (body.include_recommendations) {
    body.recommendation = {};
    appendString(body.recommendation, "branch_id", fields.branch_id);
    const limit = parsePositiveInt(fields.limit);
    if (limit !== null) {
      body.recommendation.limit = limit;
    }
  }

  return { ok: true, body };
}

export function mutationErrorFromJson(error) {
  return {
    status: 0,
    code: "frontend_validation",
    message: error.message || error.reason || "Invalid form data",
    details: [{ field: error.field || "body", reason: error.reason || error.message || "invalid" }]
  };
}

export function parsePositiveInt(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  return String(parsed) === raw && parsed > 0 ? parsed : null;
}

function appendString(target, name, value) {
  const normalized = String(value ?? "").trim();
  if (normalized) {
    target[name] = normalized;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
