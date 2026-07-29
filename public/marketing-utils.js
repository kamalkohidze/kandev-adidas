export function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildSegmentQuery(filters = {}, locale = "ru") {
  const params = new URLSearchParams();
  appendList(params, "category_ids", filters.category_ids ?? filters.category_id);
  appendList(params, "sport_tags", filters.sport_tags ?? filters.sport_tag);
  appendParam(params, "size_system", filters.size_system);
  appendParam(params, "size_value", filters.size_value);
  appendParam(params, "purchase_within_days", filters.purchase_within_days);
  appendParam(params, "as_of", filters.as_of);
  appendParam(params, "limit", filters.limit);
  appendParam(params, "locale", locale);
  return params.toString();
}

export function buildLifecycleAuditBody(fields = {}, fallbackCustomerId = null) {
  const mode = fields.audit_mode || "customer";
  const body = {};
  appendBody(body, "as_of", fields.as_of);

  if (mode === "customer") {
    appendBody(body, "customer_id", fields.customer_id || fallbackCustomerId);
  } else {
    const limit = parsePositiveInt(fields.limit);
    if (limit !== null) {
      body.limit = limit;
    }
  }

  return body;
}

export function buildCrossSellGenerateBody(fields = {}, locale = "ru") {
  const body = {};
  appendBody(body, "as_of", fields.as_of);
  appendBody(body, "branch_id", fields.branch_id);
  appendBody(body, "locale", fields.locale || locale);

  const limit = parsePositiveInt(fields.limit);
  if (limit !== null) {
    body.limit = limit;
  }

  const scenarioCodes = splitCsv(fields.scenario_codes);
  if (scenarioCodes.length > 0) {
    body.scenario_codes = scenarioCodes;
  }

  return body;
}

export function parsePositiveInt(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  return String(parsed) === raw && parsed > 0 ? parsed : null;
}

function appendList(params, name, value) {
  for (const item of splitCsv(value)) {
    params.append(name, item);
  }
}

function appendParam(params, name, value) {
  const normalized = String(value ?? "").trim();
  if (normalized) {
    params.set(name, normalized);
  }
}

function appendBody(body, name, value) {
  const normalized = String(value ?? "").trim();
  if (normalized) {
    body[name] = normalized;
  }
}
