export const deliveryVariablesExample = {
  name: "Alibek",
  discount: "10.00"
};

export const deliveryMetadataExample = {
  source_system: "frontend-delivery"
};

export function prettyJson(value) {
  return JSON.stringify(value, null, 2);
}

export function buildDeliveryEnqueueBody(fields = {}, fallbackCustomerId = "", locale = "ru") {
  const variables = parseJsonObjectField(fields.variables_json, "variables", {});
  if (!variables.ok) {
    return variables;
  }
  const metadata = parseJsonObjectField(fields.metadata_json, "metadata", {});
  if (!metadata.ok) {
    return metadata;
  }

  const body = {
    variables: variables.data,
    metadata: metadata.data
  };
  appendString(body, "customer_id", fields.customer_id || fallbackCustomerId);
  appendString(body, "template_code", fields.template_code);
  appendString(body, "channel", fields.channel);
  appendString(body, "locale", fields.locale || locale);
  appendString(body, "campaign_id", fields.campaign_id);
  appendString(body, "journey_id", fields.journey_id);
  appendString(body, "correlation_id", fields.correlation_id);
  appendString(body, "idempotency_key", fields.idempotency_key);
  appendString(body, "as_of", fields.as_of);

  const preferredChannels = splitCsv(fields.preferred_channels);
  if (preferredChannels.length > 0) {
    body.preferred_channels = preferredChannels;
  }
  const maxAttempts = parsePositiveInt(fields.max_attempts);
  if (maxAttempts !== null) {
    body.max_attempts = maxAttempts;
  }
  if (fields.include_recommendations === true || fields.include_recommendations === "on") {
    body.include_recommendations = true;
  }

  const recipient = String(fields.recipient || "").trim();
  if (recipient) {
    body.metadata = {
      ...body.metadata,
      recipient
    };
  }

  return { ok: true, body };
}

export function buildDeliveryProcessBody(fields = {}) {
  const body = {};
  appendString(body, "as_of", fields.as_of);
  const limit = parsePositiveInt(fields.limit);
  if (limit !== null) {
    body.limit = limit;
  }
  return body;
}

export function buildProviderReceiptBody(fields = {}) {
  const metadata = parseJsonObjectField(fields.metadata_json, "metadata", {});
  if (!metadata.ok) {
    return metadata;
  }
  const body = {
    metadata: metadata.data
  };
  appendString(body, "provider_message_id", fields.provider_message_id);
  appendString(body, "status", fields.status);
  appendString(body, "occurred_at", fields.occurred_at);
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

export function parseJsonObjectField(value, field = "body", fallback = {}) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return { ok: true, data: fallback };
  }

  try {
    const data = JSON.parse(raw);
    if (!isPlainObject(data)) {
      return {
        ok: false,
        error: {
          field,
          reason: "object_required",
          message: `${field} must be a JSON object`
        }
      };
    }
    return { ok: true, data };
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

export function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
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
