import { ApiError, apiRequest } from "./api.js";
import {
  buildDeliveryEnqueueBody,
  buildDeliveryProcessBody,
  buildProviderReceiptBody,
  deliveryMetadataExample,
  deliveryVariablesExample,
  mutationErrorFromJson,
  prettyJson
} from "./delivery-utils.js";
import { getState, setError, setLoading, setState } from "./state.js";
import { badge, errorBlock, escapeHtml, formatDateTime, metric, stateBlock, table } from "./ui.js";

const channels = ["push", "waba", "sms", "email"];
const receiptStatuses = ["sent", "delivered", "read", "failed", "expired"];

const deliveryState = {
  enqueue: {
    endpoint: "/api/v1/marketing/delivery/enqueue",
    customer_id: "",
    recipient: "",
    channel: "waba",
    preferred_channels: "waba,sms,email",
    template_code: "welcome_discount",
    locale: getState().locale,
    variables_json: prettyJson(deliveryVariablesExample),
    metadata_json: prettyJson(deliveryMetadataExample),
    campaign_id: "frontend-delivery",
    journey_id: "",
    correlation_id: "",
    idempotency_key: "",
    max_attempts: "3",
    as_of: "",
    include_recommendations: false,
    result: null
  },
  process: {
    limit: "10",
    as_of: "",
    result: null
  },
  lookup: {
    request_id: "",
    result: null
  },
  receipt: {
    provider: "mock-waba",
    provider_message_id: "",
    status: "delivered",
    occurred_at: "",
    metadata_json: prettyJson({ source: "frontend-simulator" }),
    result: null
  }
};

const labels = {
  kk: {
    title: "Delivery / Messages",
    subtitle: "Push, WABA, SMS және Email каскадын басқару",
    enqueue: "Enqueue / Send",
    process: "Process queue",
    lookup: "Request lookup",
    receipt: "Provider receipt",
    endpoint: "Endpoint",
    customer: "Customer ID",
    locale: "Locale",
    recipient: "Recipient metadata",
    channel: "Requested channel",
    channelList: "Cascade channels",
    template: "Template code",
    variables: "Variables JSON",
    metadata: "Metadata JSON",
    campaign: "Campaign ID",
    journey: "Journey ID",
    correlation: "Correlation ID",
    idempotency: "Idempotency key",
    maxAttempts: "Max attempts",
    asOf: "As of",
    includeRecommendations: "Include recommendations",
    submit: "Send",
    run: "Process",
    load: "Load",
    provider: "Provider",
    providerMessage: "Provider message ID",
    status: "Status",
    occurredAt: "Occurred at",
    requestId: "Request ID",
    duplicate: "Duplicate",
    accepted: "Accepted",
    processed: "Processed",
    raw: "Raw response",
    current: "Current",
    cascade: "Cascade",
    timestamps: "Timestamps",
    validation: "Validation details"
  },
  ru: {
    title: "Delivery / Messages",
    subtitle: "Рабочее место для каскада Push, WABA, SMS и Email",
    enqueue: "Enqueue / Send",
    process: "Process queue",
    lookup: "Request lookup",
    receipt: "Provider receipt",
    endpoint: "Endpoint",
    customer: "Customer ID",
    locale: "Locale",
    recipient: "Recipient metadata",
    channel: "Requested channel",
    channelList: "Cascade channels",
    template: "Template code",
    variables: "Variables JSON",
    metadata: "Metadata JSON",
    campaign: "Campaign ID",
    journey: "Journey ID",
    correlation: "Correlation ID",
    idempotency: "Idempotency key",
    maxAttempts: "Max attempts",
    asOf: "As of",
    includeRecommendations: "Include recommendations",
    submit: "Send",
    run: "Process",
    load: "Load",
    provider: "Provider",
    providerMessage: "Provider message ID",
    status: "Status",
    occurredAt: "Occurred at",
    requestId: "Request ID",
    duplicate: "Duplicate",
    accepted: "Accepted",
    processed: "Processed",
    raw: "Raw response",
    current: "Current",
    cascade: "Cascade",
    timestamps: "Timestamps",
    validation: "Validation details"
  },
  en: {
    title: "Delivery / Messages",
    subtitle: "Operational workspace for Push, WABA, SMS, and Email cascade delivery",
    enqueue: "Enqueue / Send",
    process: "Process queue",
    lookup: "Request lookup",
    receipt: "Provider receipt",
    endpoint: "Endpoint",
    customer: "Customer ID",
    locale: "Locale",
    recipient: "Recipient metadata",
    channel: "Requested channel",
    channelList: "Cascade channels",
    template: "Template code",
    variables: "Variables JSON",
    metadata: "Metadata JSON",
    campaign: "Campaign ID",
    journey: "Journey ID",
    correlation: "Correlation ID",
    idempotency: "Idempotency key",
    maxAttempts: "Max attempts",
    asOf: "As of",
    includeRecommendations: "Include recommendations",
    submit: "Send",
    run: "Process",
    load: "Load",
    provider: "Provider",
    providerMessage: "Provider message ID",
    status: "Status",
    occurredAt: "Occurred at",
    requestId: "Request ID",
    duplicate: "Duplicate",
    accepted: "Accepted",
    processed: "Processed",
    raw: "Raw response",
    current: "Current",
    cascade: "Cascade",
    timestamps: "Timestamps",
    validation: "Validation details"
  }
};

export function syncDeliveryLocale(locale) {
  deliveryState.enqueue.locale = locale;
  setState({});
}

export function wireDeliveryEvents() {
  document.addEventListener("submit", async (event) => {
    if (event.target.id === "deliveryEnqueueForm") {
      event.preventDefault();
      deliveryState.enqueue = { ...deliveryState.enqueue, ...readFormWithChecks(event.target, ["include_recommendations"]) };
      await enqueueDelivery();
    }
    if (event.target.id === "deliveryProcessForm") {
      event.preventDefault();
      deliveryState.process = { ...deliveryState.process, ...readForm(event.target) };
      await processQueue();
    }
    if (event.target.id === "deliveryLookupForm") {
      event.preventDefault();
      deliveryState.lookup = { ...deliveryState.lookup, ...readForm(event.target) };
      await lookupRequest();
    }
    if (event.target.id === "deliveryReceiptForm") {
      event.preventDefault();
      deliveryState.receipt = { ...deliveryState.receipt, ...readForm(event.target) };
      await submitProviderReceipt();
    }
  });
}

export function renderDeliveryWorkspace(container) {
  if (!container) {
    return;
  }
  const state = getState();
  const text = translator(state.locale);
  const customerId = state.customerId || deliveryState.enqueue.customer_id || "";

  container.innerHTML = `
    <div class="panel-heading">
      <div>
        <h2>${escapeHtml(text("title"))}</h2>
        <p>${escapeHtml(text("subtitle"))}</p>
      </div>
      <div class="marketing-context" aria-label="Delivery context">
        ${badge(`customer: ${customerId || "-"}`, "soft")}
        ${badge(`locale: ${state.locale}`, "neutral")}
        ${state.tenantId ? badge(`tenant: ${state.tenantId}`, "soft") : ""}
      </div>
    </div>
    <div class="grid two delivery-layout">
      ${renderEnqueueCard(state, text, customerId)}
      ${renderProcessCard(state, text)}
      ${renderLookupCard(state, text)}
      ${renderReceiptCard(state, text)}
    </div>
  `;
}

async function enqueueDelivery() {
  const state = getState();
  const built = buildDeliveryEnqueueBody(deliveryState.enqueue, state.customerId, state.locale);
  if (!built.ok) {
    setError("deliveryEnqueue", normalizeError(new ApiError(mutationErrorFromJson(built.error))));
    return;
  }

  setLoading("deliveryEnqueue", true);
  setError("deliveryEnqueue", null);
  deliveryState.enqueue.result = null;
  try {
    const result = await apiRequest(deliveryState.enqueue.endpoint, {
      method: "POST",
      locale: state.locale,
      idempotencyKey: built.body.idempotency_key || built.body.correlation_id,
      body: built.body
    });
    deliveryState.enqueue.result = result;
    if (result?.delivery_request_id) {
      deliveryState.lookup.request_id = result.delivery_request_id;
    }
    setState({});
  } catch (error) {
    setError("deliveryEnqueue", normalizeError(error));
  } finally {
    setLoading("deliveryEnqueue", false);
  }
}

async function processQueue() {
  setLoading("deliveryProcess", true);
  setError("deliveryProcess", null);
  deliveryState.process.result = null;
  try {
    const result = await apiRequest("/api/v1/marketing/delivery/process", {
      method: "POST",
      locale: getState().locale,
      body: buildDeliveryProcessBody(deliveryState.process)
    });
    deliveryState.process.result = result;
    const delivery = (result?.data || []).find((item) => item.provider_message_id) || result?.data?.[0];
    if (delivery) {
      deliveryState.lookup.request_id = delivery.metadata?.delivery_request_id || deliveryState.lookup.request_id;
      deliveryState.receipt.provider = delivery.provider || deliveryState.receipt.provider;
      deliveryState.receipt.provider_message_id = delivery.provider_message_id || deliveryState.receipt.provider_message_id;
    }
    setState({});
  } catch (error) {
    setError("deliveryProcess", normalizeError(error));
  } finally {
    setLoading("deliveryProcess", false);
  }
}

async function lookupRequest() {
  const requestId = deliveryState.lookup.request_id.trim();
  if (!requestId) {
    setError("deliveryLookup", normalizeError(new ApiError({
      status: 0,
      code: "frontend_validation",
      message: "request_id is required",
      details: [{ field: "request_id", reason: "required" }]
    })));
    return;
  }

  setLoading("deliveryLookup", true);
  setError("deliveryLookup", null);
  deliveryState.lookup.result = null;
  try {
    deliveryState.lookup.result = await apiRequest(`/api/v1/marketing/delivery/requests/${encodeURIComponent(requestId)}`, {
      locale: getState().locale
    });
    setState({});
  } catch (error) {
    setError("deliveryLookup", normalizeError(error));
  } finally {
    setLoading("deliveryLookup", false);
  }
}

async function submitProviderReceipt() {
  const built = buildProviderReceiptBody(deliveryState.receipt);
  if (!built.ok) {
    setError("deliveryReceipt", normalizeError(new ApiError(mutationErrorFromJson(built.error))));
    return;
  }
  const provider = deliveryState.receipt.provider.trim();
  if (!provider) {
    setError("deliveryReceipt", normalizeError(new ApiError({
      status: 0,
      code: "frontend_validation",
      message: "provider is required",
      details: [{ field: "provider", reason: "required" }]
    })));
    return;
  }

  setLoading("deliveryReceipt", true);
  setError("deliveryReceipt", null);
  deliveryState.receipt.result = null;
  try {
    deliveryState.receipt.result = await apiRequest(`/api/v1/messages/provider-receipts/${encodeURIComponent(provider)}`, {
      method: "POST",
      locale: getState().locale,
      body: built.body
    });
    setState({});
  } catch (error) {
    setError("deliveryReceipt", normalizeError(error));
  } finally {
    setLoading("deliveryReceipt", false);
  }
}

function renderEnqueueCard(state, text, customerId) {
  const form = deliveryState.enqueue;
  return `
    <article class="surface delivery-card">
      <h3>${escapeHtml(text("enqueue"))}</h3>
      <form id="deliveryEnqueueForm" class="form-grid delivery-form">
        ${select("endpoint", text("endpoint"), form.endpoint, [["/api/v1/marketing/delivery/enqueue", "/api/v1/marketing/delivery/enqueue"], ["/api/v1/messages/send", "/api/v1/messages/send"]])}
        ${input("customer_id", text("customer"), form.customer_id || customerId)}
        ${input("recipient", text("recipient"), form.recipient, "text", "+77017578320")}
        ${select("channel", text("channel"), form.channel, channels.map((channel) => [channel, channel.toUpperCase()]))}
        ${input("preferred_channels", text("channelList"), form.preferred_channels)}
        ${input("template_code", text("template"), form.template_code)}
        ${select("locale", text("locale"), form.locale || state.locale, [["kk", "KK"], ["ru", "RU"], ["en", "EN"]])}
        ${input("campaign_id", text("campaign"), form.campaign_id)}
        ${input("journey_id", text("journey"), form.journey_id)}
        ${input("correlation_id", text("correlation"), form.correlation_id)}
        ${input("idempotency_key", text("idempotency"), form.idempotency_key)}
        ${input("max_attempts", text("maxAttempts"), form.max_attempts, "number")}
        ${input("as_of", text("asOf"), form.as_of || localDateTimeValue(), "datetime-local")}
        ${check("include_recommendations", text("includeRecommendations"), form.include_recommendations)}
        ${textarea("variables_json", text("variables"), form.variables_json)}
        ${textarea("metadata_json", text("metadata"), form.metadata_json)}
        <button class="primary" type="submit" ${state.loading.has("deliveryEnqueue") ? "disabled" : ""}>${escapeHtml(text("submit"))}</button>
      </form>
      ${state.errors.deliveryEnqueue ? errorBlock(state.errors.deliveryEnqueue, text("validation")) : ""}
      ${state.loading.has("deliveryEnqueue") ? stateBlock("loading", text("submit")) : renderEnqueueResult(form.result, text)}
    </article>
  `;
}

function renderProcessCard(state, text) {
  const form = deliveryState.process;
  return `
    <article class="surface delivery-card">
      <h3>${escapeHtml(text("process"))}</h3>
      <form id="deliveryProcessForm" class="form-grid delivery-form compact-delivery-form">
        ${input("limit", "Limit", form.limit, "number")}
        ${input("as_of", text("asOf"), form.as_of || localDateTimeValue(), "datetime-local")}
        <button class="primary sky" type="submit" ${state.loading.has("deliveryProcess") ? "disabled" : ""}>${escapeHtml(text("run"))}</button>
      </form>
      ${state.errors.deliveryProcess ? errorBlock(state.errors.deliveryProcess, text("validation")) : ""}
      ${state.loading.has("deliveryProcess") ? stateBlock("loading", text("run")) : renderProcessResult(form.result, state.locale, text)}
    </article>
  `;
}

function renderLookupCard(state, text) {
  const form = deliveryState.lookup;
  return `
    <article class="surface delivery-card">
      <h3>${escapeHtml(text("lookup"))}</h3>
      <form id="deliveryLookupForm" class="form-grid delivery-form compact-delivery-form">
        ${input("request_id", text("requestId"), form.request_id)}
        <button class="primary lavender" type="submit" ${state.loading.has("deliveryLookup") ? "disabled" : ""}>${escapeHtml(text("load"))}</button>
      </form>
      ${state.errors.deliveryLookup ? errorBlock(state.errors.deliveryLookup, text("validation")) : ""}
      ${state.loading.has("deliveryLookup") ? stateBlock("loading", text("load")) : renderLookupResult(form.result, state.locale, text)}
    </article>
  `;
}

function renderReceiptCard(state, text) {
  const form = deliveryState.receipt;
  return `
    <article class="surface delivery-card">
      <h3>${escapeHtml(text("receipt"))}</h3>
      <form id="deliveryReceiptForm" class="form-grid delivery-form">
        ${input("provider", text("provider"), form.provider)}
        ${input("provider_message_id", text("providerMessage"), form.provider_message_id)}
        ${select("status", text("status"), form.status, receiptStatuses.map((status) => [status, status]))}
        ${input("occurred_at", text("occurredAt"), form.occurred_at || localDateTimeValue(), "datetime-local")}
        ${textarea("metadata_json", text("metadata"), form.metadata_json)}
        <button class="primary coral" type="submit" ${state.loading.has("deliveryReceipt") ? "disabled" : ""}>${escapeHtml(text("submit"))}</button>
      </form>
      ${state.errors.deliveryReceipt ? errorBlock(state.errors.deliveryReceipt, text("validation")) : ""}
      ${state.loading.has("deliveryReceipt") ? stateBlock("loading", text("submit")) : renderReceiptResult(form.result, text)}
    </article>
  `;
}

function renderEnqueueResult(result, text) {
  if (!result) {
    return stateBlock("empty", text("raw"));
  }
  return `
    <div class="result-card mint-fade delivery-result">
      <div class="mini-metrics">
        ${metric(text("requestId"), result.delivery_request_id || "-")}
        ${metric("Delivery ID", result.delivery_id || "-")}
        ${metric(text("status"), result.status || result.data?.status || "-")}
      </div>
      <dl class="detail-list compact">
        <div><dt>${escapeHtml(text("provider"))}</dt><dd>${escapeHtml(result.provider || "-")}</dd></div>
        <div><dt>${escapeHtml(text("correlation"))}</dt><dd>${escapeHtml(result.correlation_id || "-")}</dd></div>
        <div><dt>${escapeHtml(text("duplicate"))}</dt><dd>${badge(result.duplicate === true ? "true" : "false", result.duplicate ? "warning" : "success")}</dd></div>
      </dl>
      ${jsonPanel(text("raw"), result)}
    </div>
  `;
}

function renderProcessResult(result, locale, text) {
  if (!result) {
    return stateBlock("empty", text("raw"));
  }
  const deliveries = result.data || [];
  return `
    <div class="result-card sky-fade delivery-result">
      <div class="mini-metrics">
        ${metric(text("processed"), String(result.processed ?? deliveries.length))}
        ${metric("Deliveries", String(deliveries.length))}
        ${metric(text("status"), result.ok ? "ok" : "-")}
      </div>
      ${renderDeliveryTable(deliveries, locale, text)}
      ${jsonPanel(text("raw"), result)}
    </div>
  `;
}

function renderLookupResult(result, locale, text) {
  if (!result) {
    return stateBlock("empty", text("raw"));
  }
  const request = result.data || result.request || result;
  const deliveries = result.deliveries || request.deliveries || [];
  return `
    <div class="result-card lavender-fade delivery-result">
      <div class="mini-metrics">
        ${metric(text("requestId"), request.id || "-")}
        ${metric(text("status"), request.status || "-")}
        ${metric(text("current"), request.current_delivery_id || "-")}
      </div>
      <dl class="detail-list compact">
        <div><dt>${escapeHtml(text("customer"))}</dt><dd>${escapeHtml(request.customer_id || "-")}</dd></div>
        <div><dt>${escapeHtml(text("template"))}</dt><dd>${escapeHtml(request.template_code || "-")}</dd></div>
        <div><dt>${escapeHtml(text("cascade"))}</dt><dd>${escapeHtml((request.cascade_channels || []).join(" -> ") || "-")}</dd></div>
        <div><dt>${escapeHtml(text("correlation"))}</dt><dd>${escapeHtml(request.correlation_id || "-")}</dd></div>
        <div><dt>${escapeHtml(text("timestamps"))}</dt><dd>${escapeHtml(formatTimeline(request, locale))}</dd></div>
      </dl>
      ${renderSkippedChannels(request.skipped_channels || [], locale)}
      ${renderDeliveryTable(deliveries, locale, text)}
      ${jsonPanel(text("raw"), result)}
    </div>
  `;
}

function renderReceiptResult(result, text) {
  if (!result) {
    return stateBlock("empty", text("raw"));
  }
  return `
    <div class="result-card coral-fade delivery-result">
      <div class="mini-metrics">
        ${metric("Delivery ID", result.delivery_id || "-")}
        ${metric(text("accepted"), result.accepted === true ? "true" : "false")}
        ${metric(text("status"), result.data?.status || "-")}
      </div>
      <dl class="detail-list compact">
        <div><dt>event_type</dt><dd>${escapeHtml(result.event_type || "-")}</dd></div>
        <div><dt>${escapeHtml(text("duplicate"))}</dt><dd>${badge(result.duplicate === true ? "true" : "false", result.duplicate ? "warning" : "success")}</dd></div>
      </dl>
      ${jsonPanel(text("raw"), result)}
    </div>
  `;
}

function renderDeliveryTable(deliveries, locale, text) {
  if (!deliveries.length) {
    return "";
  }
  return table(
    [text("requestId"), "Delivery ID", text("channel"), text("status"), text("provider"), text("providerMessage"), "Attempts", text("timestamps")],
    deliveries.map((delivery) => `
      <tr>
        <td>${escapeHtml(delivery.metadata?.delivery_request_id || "-")}</td>
        <td>${escapeHtml(delivery.id || "-")}</td>
        <td>${escapeHtml(delivery.channel || "-")}</td>
        <td>${badge(delivery.status || "-", statusTone(delivery.status))}</td>
        <td>${escapeHtml(delivery.provider || "-")}</td>
        <td>${escapeHtml(delivery.provider_message_id || "-")}</td>
        <td>${escapeHtml(String(delivery.attempt_count ?? 0))}${delivery.failure_code ? ` / ${escapeHtml(delivery.failure_code)}` : ""}</td>
        <td>${escapeHtml(formatTimeline(delivery, locale))}</td>
      </tr>
    `),
    text("raw")
  );
}

function renderSkippedChannels(items, locale) {
  if (!items.length) {
    return "";
  }
  return `<div class="event-row">${items
    .map((item) => badge(`${item.channel}: ${item.reason} @ ${formatDateTime(item.skipped_at, locale)}`, "warning"))
    .join("")}</div>`;
}

function jsonPanel(title, value) {
  return `<details class="campaign-json-panel" open><summary>${escapeHtml(title)}</summary><pre class="json-panel">${escapeHtml(prettyJson(value))}</pre></details>`;
}

function input(name, label, value, type = "text", placeholder = "") {
  return `<label><span>${escapeHtml(label)}</span><input name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value || "")}" placeholder="${escapeHtml(placeholder)}" /></label>`;
}

function textarea(name, label, value) {
  return `<label class="textarea-field"><span>${escapeHtml(label)}</span><textarea name="${escapeHtml(name)}" spellcheck="false">${escapeHtml(value || "")}</textarea></label>`;
}

function select(name, label, value, options) {
  return `<label><span>${escapeHtml(label)}</span><select name="${escapeHtml(name)}">${options
    .map(([optionValue, optionLabel]) => `<option value="${escapeHtml(optionValue)}" ${String(optionValue) === String(value || "") ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`)
    .join("")}</select></label>`;
}

function check(name, label, checked) {
  return `<label class="check-row"><input name="${escapeHtml(name)}" type="checkbox" ${checked ? "checked" : ""} /><span>${escapeHtml(label)}</span></label>`;
}

function readForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function readFormWithChecks(form, checkNames) {
  const values = readForm(form);
  for (const name of checkNames) {
    values[name] = form.elements[name]?.checked === true;
  }
  return values;
}

function translator(locale) {
  return (key) => labels[locale]?.[key] || labels.ru[key] || key;
}

function normalizeError(error) {
  if (error instanceof ApiError) {
    return error;
  }
  return new ApiError({ status: 0, code: "frontend_error", message: error.message || String(error), details: [] });
}

function localDateTimeValue(date = new Date()) {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatTimeline(record, locale) {
  return [
    ["requested", record.requested_at],
    ["queued", record.queued_at],
    ["sent", record.sent_at],
    ["delivered", record.delivered_at],
    ["read", record.read_at],
    ["failed", record.failed_at],
    ["completed", record.completed_at],
    ["next", record.next_attempt_at]
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${formatDateTime(value, locale)}`)
    .join(" / ") || "-";
}

function statusTone(status) {
  if (["sent", "delivered", "read", "completed", "queued"].includes(status)) {
    return "success";
  }
  if (["failed", "expired", "cancelled"].includes(status)) {
    return "warning";
  }
  return "soft";
}
