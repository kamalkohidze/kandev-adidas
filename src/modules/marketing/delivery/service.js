import { randomUUID } from "node:crypto";
import { normalizeLocale } from "../../../shared/contracts.js";
import { createMessageTemplateService } from "../content/index.js";
import { createDeterministicProviderAdapters } from "./adapters.js";
import { cloneRecord, createDeliveryRepository } from "./repository.js";
import { transitionDeliveryStatus } from "./state.js";

export const cascadePolicy = ["push", "waba", "sms", "email"];
const validChannels = new Set(cascadePolicy);
const terminalRequestStatuses = new Set(["completed", "failed", "cancelled"]);
const terminalDeliveryStatuses = new Set(["delivered", "read"]);
const fallbackDeliveryStatuses = new Set(["failed", "expired"]);
const identityTypesByChannel = {
  push: new Set(["device", "app_user"]),
  waba: new Set(["phone"]),
  sms: new Set(["phone"]),
  email: new Set(["email"])
};

export function createDeliveryService(data, options = {}) {
  const repository = options.repository || createDeliveryRepository(data);
  const templates = options.templates || createMessageTemplateService(data);
  const adapters = options.adapters || createDeterministicProviderAdapters(options.providerBehavior || {});
  const now = options.now || (() => new Date().toISOString());
  const maxAttempts = options.maxAttempts || 3;
  const backoffMs = options.backoffMs || [60_000, 300_000, 900_000];

  function enqueueDelivery({ tenantId, request, asOf = now() } = {}) {
    const validationDetails = validateEnqueue({ tenantId, request, asOf });
    if (validationDetails.length > 0) {
      return { ok: false, validationDetails };
    }

    const normalized = normalizeDeliveryRequest({ tenantId, request, asOf });
    const existing = repository.findRequestByIdempotency({
      tenantId,
      idempotencyKey: normalized.idempotency_key
    });
    if (existing) {
      return {
        ok: true,
        duplicate: true,
        data: toPublicRequest(existing),
        delivery: existing.current_delivery_id
          ? toPublicDelivery(repository.findDelivery({ tenantId, deliveryId: existing.current_delivery_id }))
          : null
      };
    }

    repository.requests().push(normalized);
    const delivery = enqueueNextChannel(normalized, asOf);
    appendDeliveryEvent({
      tenantId,
      eventType: "message.delivery.requested",
      aggregateId: normalized.id,
      customerId: normalized.customer_id,
      correlationId: normalized.correlation_id,
      idempotencyKey: `${normalized.id}:requested`,
      occurredAt: asOf,
      payload: {
        delivery_request_id: normalized.id,
        delivery_id: delivery?.id || null,
        template_code: normalized.template_code,
        customer_id: normalized.customer_id,
        cascade_channels: normalized.cascade_channels
      }
    });

    return {
      ok: true,
      duplicate: false,
      data: toPublicRequest(normalized),
      delivery: delivery ? toPublicDelivery(delivery) : null
    };
  }

  function enqueueFromEvent({ tenantId, event, asOf = event?.occurred_at || now() } = {}) {
    if (!event || event.event_type !== "message.delivery.requested") {
      return {
        ok: false,
        validationDetails: [{ field: "event.event_type", reason: "message_delivery_requested_required" }]
      };
    }
    return enqueueDelivery({
      tenantId,
      asOf,
      request: {
        ...event.payload,
        campaign_id: event.payload?.campaign_id || null,
        journey_id: event.payload?.journey_instance_id || event.aggregate_id || null,
        correlation_id: event.correlation_id || event.idempotency_key || event.event_id,
        idempotency_key: event.idempotency_key || event.event_id
      }
    });
  }

  function processDueDeliveries({ tenantId = null, asOf = now(), limit = 50 } = {}) {
    const processed = [];
    let guard = 0;

    while (guard < limit) {
      guard += 1;
      const due = repository.listDueDeliveries({ tenantId, asOf })[0];
      if (!due) {
        break;
      }
      processed.push(processDelivery(due, asOf));
    }

    return {
      ok: true,
      processed: processed.length,
      data: processed
    };
  }

  function handleStatusCallback({
    tenantId = null,
    provider,
    providerMessageId,
    status,
    occurredAt = now(),
    metadata = {}
  } = {}) {
    const validationDetails = [];
    if (!provider) {
      validationDetails.push({ field: "provider", reason: "required" });
    }
    if (!providerMessageId) {
      validationDetails.push({ field: "provider_message_id", reason: "required" });
    }
    if (!status) {
      validationDetails.push({ field: "status", reason: "required" });
    }
    if (!Number.isFinite(Date.parse(occurredAt))) {
      validationDetails.push({ field: "occurred_at", reason: "invalid_datetime" });
    }
    if (validationDetails.length > 0) {
      return {
        ok: false,
        validationDetails
      };
    }

    const delivery = repository.findDeliveryByProviderMessage({ provider, providerMessageId });
    if (!delivery || (tenantId && delivery.tenant_id !== tenantId)) {
      return null;
    }

    if (delivery.status === status) {
      return {
        ok: true,
        accepted: true,
        duplicate: true,
        event_type: "message.delivery.status_changed",
        data: toPublicDelivery(delivery)
      };
    }

    try {
      applyProviderStatus(delivery, status, occurredAt, metadata);
    } catch (error) {
      return {
        ok: false,
        validationDetails: [{ field: "status", reason: error.message }]
      };
    }

    const request = repository.findRequest({
      tenantId: delivery.tenant_id,
      requestId: delivery.metadata.delivery_request_id
    });
    if (request && terminalDeliveryStatuses.has(delivery.status)) {
      completeRequest(request, occurredAt);
    } else if (request && fallbackDeliveryStatuses.has(delivery.status)) {
      fallbackRequest(request, occurredAt);
    }

    appendDeliveryEvent({
      tenantId: delivery.tenant_id,
      eventType: "message.delivery.status_changed",
      aggregateId: delivery.id,
      customerId: delivery.customer_id,
      correlationId: delivery.correlation_id,
      idempotencyKey: `${delivery.id}:${status}:${occurredAt}`,
      occurredAt,
      payload: {
        delivery_id: delivery.id,
        delivery_request_id: delivery.metadata.delivery_request_id,
        provider,
        provider_message_id: providerMessageId,
        status,
        metadata
      }
    });

    return {
      ok: true,
      accepted: true,
      event_type: "message.delivery.status_changed",
      data: toPublicDelivery(delivery),
      request: request ? toPublicRequest(request) : null
    };
  }

  function getRequest({ tenantId, requestId }) {
    const request = repository.findRequest({ tenantId, requestId });
    return request ? { ok: true, data: toPublicRequest(request) } : null;
  }

  function getDelivery({ tenantId, deliveryId }) {
    const delivery = repository.findDelivery({ tenantId, deliveryId });
    return delivery ? { ok: true, data: toPublicDelivery(delivery) } : null;
  }

  return {
    enqueueDelivery,
    enqueueFromEvent,
    processDueDeliveries,
    handleStatusCallback,
    getRequest,
    getDelivery
  };

  function processDelivery(delivery, asOf) {
    const adapter = adapters[delivery.channel];
    const request = repository.findRequest({
      tenantId: delivery.tenant_id,
      requestId: delivery.metadata.delivery_request_id
    });
    if (!adapter || !request || terminalRequestStatuses.has(request.status)) {
      return toPublicDelivery(delivery);
    }

    const attemptNumber = (delivery.attempt_count || 0) + 1;
    const attempt = {
      id: randomUUID(),
      tenant_id: delivery.tenant_id,
      delivery_id: delivery.id,
      delivery_request_id: request.id,
      channel: delivery.channel,
      provider: adapter.provider,
      attempt_number: attemptNumber,
      status: "started",
      started_at: asOf,
      completed_at: null,
      failure_code: null,
      failure_message: null
    };
    repository.attempts().push(attempt);
    delivery.attempt_count = attemptNumber;
    delivery.provider = adapter.provider;

    const result = adapter.send({
      delivery,
      attempt,
      rendered: delivery.metadata.rendered_template
    });

    attempt.completed_at = asOf;
    if (result.ok) {
      attempt.status = "sent";
      delivery.provider = result.provider;
      delivery.provider_message_id = result.provider_message_id;
      delivery.metadata.provider = {
        ...(delivery.metadata.provider || {}),
        ...(result.metadata || {})
      };
      transitionDeliveryStatus(delivery, "sent", asOf);
      if (result.status && result.status !== "sent") {
        applyProviderStatus(delivery, result.status, asOf, result.metadata || {});
      }
      if (terminalDeliveryStatuses.has(delivery.status)) {
        completeRequest(request, asOf);
      }
      return toPublicDelivery(delivery);
    }

    attempt.status = "failed";
    attempt.failure_code = result.failure_code;
    attempt.failure_message = result.failure_message;
    delivery.failure_code = result.failure_code;
    delivery.failure_message = result.failure_message;

    if (result.retryable && attemptNumber < delivery.max_attempts) {
      delivery.next_attempt_at = addMs(asOf, backoffMs[Math.min(attemptNumber - 1, backoffMs.length - 1)]);
      delivery.updated_at = asOf;
      delivery.version += 1;
      return toPublicDelivery(delivery);
    }

    transitionDeliveryStatus(delivery, "failed", asOf, {
      failure_code: result.failure_code,
      failure_message: result.failure_message
    });
    fallbackRequest(request, asOf);
    return toPublicDelivery(delivery);
  }

  function enqueueNextChannel(request, asOf) {
    const startIndex = Math.max(0, request.current_step);

    for (let index = startIndex; index < request.cascade_channels.length; index += 1) {
      const channel = request.cascade_channels[index];
      const eligibility = evaluateChannelEligibility({
        tenantId: request.tenant_id,
        customerId: request.customer_id,
        channel,
        asOf
      });
      if (!eligibility.eligible) {
        rememberSkippedChannel(request, channel, eligibility.reason, asOf);
        continue;
      }

      const rendered = renderTemplateForChannel(request, channel);
      if (!rendered.ok) {
        rememberSkippedChannel(request, channel, rendered.reason || "template_not_found", asOf);
        continue;
      }

      const delivery = createDeliveryRecord({ request, channel, eligibility, rendered, cascadeStep: index + 1, asOf });
      repository.deliveries().push(delivery);
      transitionDeliveryStatus(delivery, "queued", asOf);
      request.status = "queued";
      request.current_step = index;
      request.current_delivery_id = delivery.id;
      request.updated_at = asOf;
      request.version += 1;
      return delivery;
    }

    request.status = "failed";
    request.failure_reason = request.skipped_channels.length > 0
      ? "no_eligible_channel"
      : "cascade_channels_empty";
    request.current_delivery_id = null;
    request.updated_at = asOf;
    request.version += 1;
    return null;
  }

  function fallbackRequest(request, asOf) {
    if (terminalRequestStatuses.has(request.status)) {
      return null;
    }
    request.current_step += 1;
    request.current_delivery_id = null;
    request.updated_at = asOf;
    request.version += 1;
    return enqueueNextChannel(request, asOf);
  }

  function completeRequest(request, asOf) {
    request.status = "completed";
    request.completed_at = request.completed_at || asOf;
    request.updated_at = asOf;
    request.version += 1;
  }

  function renderTemplateForChannel(request, channel) {
    const result = templates.renderTemplate({
      tenantId: request.tenant_id,
      templateCode: request.template_code,
      channel,
      locale: request.locale,
      customerId: request.customer_id,
      variables: request.variables,
      includeRecommendations: request.include_recommendations === true,
      recommendation: request.recommendation || {},
      allowRawPii: false
    });
    if (!result.ok) {
      return { ok: false, reason: result.reason, validationDetails: result.validationDetails || [] };
    }
    return { ok: true, data: result.data };
  }

  function createDeliveryRecord({ request, channel, eligibility, rendered, cascadeStep, asOf }) {
    const identity = eligibility.identity || null;
    return {
      id: randomUUID(),
      tenant_id: request.tenant_id,
      customer_id: request.customer_id,
      campaign_id: request.campaign_id,
      journey_id: request.journey_id,
      template_id: rendered.data.template_id,
      template_code: request.template_code,
      channel,
      locale: rendered.data.locale,
      cascade_step: cascadeStep,
      recipient_identity_id: identity?.id || null,
      recipient_address_masked: identity ? maskAddress(identity.normalized_value, channel) : "unresolved",
      provider: null,
      provider_message_id: null,
      status: "requested",
      requested_at: asOf,
      queued_at: null,
      sent_at: null,
      delivered_at: null,
      read_at: null,
      failed_at: null,
      failure_code: null,
      failure_message: null,
      correlation_id: request.correlation_id,
      idempotency_key: `${request.idempotency_key}:${channel}:${cascadeStep}`,
      attempt_count: 0,
      max_attempts: request.max_attempts,
      next_attempt_at: asOf,
      metadata: {
        delivery_request_id: request.id,
        requested_channel: request.requested_channel,
        consent: eligibility.consent || null,
        rendered_template: rendered.data
      },
      created_at: asOf,
      updated_at: asOf,
      version: 1
    };
  }

  function evaluateChannelEligibility({ tenantId, customerId, channel, asOf }) {
    const customer = (data.customers || []).find(
      (candidate) => candidate.tenant_id === tenantId && candidate.id === customerId
    );
    if (!customer) {
      return { eligible: false, reason: "customer_not_found" };
    }
    if (customer.status !== "active") {
      return { eligible: false, reason: "customer_not_active" };
    }

    const consent = evaluateConsent({ tenantId, customerId, channel, asOf });
    if (!consent.allowed) {
      return { eligible: false, reason: consent.reason, consent };
    }

    const identity = resolveRecipientIdentity({ tenantId, customerId, channel });
    if (!identity) {
      return { eligible: false, reason: "active_identity_required", consent };
    }

    return {
      eligible: true,
      reason: null,
      consent,
      identity
    };
  }

  function evaluateConsent({ tenantId, customerId, channel, asOf }) {
    const records = data.consents;
    if (!Array.isArray(records)) {
      // Consent is canonical but not seeded in scaffold data yet; delivery records this fallback explicitly.
      return { allowed: true, checked: false, reason: "consent_read_model_unavailable" };
    }

    const consent = records.find(
      (record) =>
        record.tenant_id === tenantId &&
        record.customer_id === customerId &&
        record.channel === channel &&
        record.granted === true &&
        isConsentActive(record, asOf)
    );
    if (!consent) {
      return { allowed: false, checked: true, reason: "marketing_consent_required", channel };
    }
    return { allowed: true, checked: true, consent_id: consent.id, channel };
  }

  function resolveRecipientIdentity({ tenantId, customerId, channel }) {
    const allowedTypes = identityTypesByChannel[channel] || new Set();
    return (data.identities || []).find(
      (identity) =>
        identity.tenant_id === tenantId &&
        identity.customer_id === customerId &&
        identity.is_active === true &&
        allowedTypes.has(identity.type)
    ) || null;
  }

  function applyProviderStatus(delivery, status, occurredAt, metadata) {
    if (status === "sent") {
      return;
    }
    const details = {
      failure_code: metadata.failure_code || metadata.code || status,
      failure_message: metadata.failure_message || metadata.message || null
    };
    transitionDeliveryStatus(delivery, status, occurredAt, details);
  }

  function appendDeliveryEvent({
    tenantId,
    eventType,
    aggregateId,
    customerId,
    correlationId,
    idempotencyKey,
    occurredAt,
    payload
  }) {
    const event = {
      event_id: randomUUID(),
      event_type: eventType,
      event_version: 1,
      tenant_id: tenantId,
      aggregate_type: "message_delivery",
      aggregate_id: aggregateId,
      occurred_at: occurredAt,
      published_at: occurredAt,
      producer: "marketing.delivery",
      correlation_id: correlationId,
      causation_id: null,
      idempotency_key: idempotencyKey,
      partition_key: customerId || aggregateId,
      payload,
      metadata: { source_system: "marketing.delivery", locale: null, pii: false }
    };
    repository.events().push(event);
    return event;
  }

  function normalizeDeliveryRequest({ tenantId, request, asOf }) {
    const requestedChannel = normalizeChannel(request.channel || request.requested_channel);
    const cascadeChannels = normalizeCascade(request.preferred_channels || request.cascade_channels, requestedChannel);
    const customer = (data.customers || []).find(
      (candidate) => candidate.tenant_id === tenantId && candidate.id === request.customer_id
    );
    const locale = normalizeLocale(request.locale || customer?.preferred_locale || "ru");
    const idempotencyKey = request.idempotency_key ||
      [
        tenantId,
        request.customer_id,
        request.template_code,
        request.campaign_id || request.journey_id || "direct",
        requestedChannel || cascadeChannels.join("-")
      ].join(":");

    return {
      id: randomUUID(),
      tenant_id: tenantId,
      customer_id: request.customer_id,
      campaign_id: request.campaign_id || null,
      journey_id: request.journey_id || null,
      template_code: request.template_code,
      requested_channel: requestedChannel,
      cascade_channels: cascadeChannels,
      locale,
      variables: isPlainObject(request.variables) ? request.variables : {},
      recommendation: isPlainObject(request.recommendation) ? request.recommendation : {},
      include_recommendations: request.include_recommendations === true,
      status: "requested",
      current_step: 0,
      current_delivery_id: null,
      correlation_id: request.correlation_id || idempotencyKey,
      idempotency_key: idempotencyKey,
      max_attempts: normalizeMaxAttempts(request.max_attempts, maxAttempts),
      skipped_channels: [],
      failure_reason: null,
      completed_at: null,
      metadata: isPlainObject(request.metadata) ? request.metadata : {},
      requested_at: asOf,
      created_at: asOf,
      updated_at: asOf,
      version: 1
    };
  }
}

function validateEnqueue({ tenantId, request, asOf }) {
  const details = [];
  if (!isTenantContext(tenantId)) {
    details.push({ field: "tenant_context", reason: "required" });
  }
  if (!isPlainObject(request)) {
    details.push({ field: "body", reason: "object_required" });
    return details;
  }
  if (!request.customer_id) {
    details.push({ field: "customer_id", reason: "required" });
  }
  if (!request.template_code) {
    details.push({ field: "template_code", reason: "required" });
  }
  if (request.channel && !validChannels.has(String(request.channel))) {
    details.push({ field: "channel", reason: "unsupported_channel" });
  }
  if (!Number.isFinite(Date.parse(asOf))) {
    details.push({ field: "as_of", reason: "invalid_datetime" });
  }
  return details;
}

function normalizeCascade(channels, requestedChannel) {
  const selected = Array.isArray(channels)
    ? channels.map(normalizeChannel).filter(Boolean)
    : requestedChannel
      ? cascadePolicy.slice(cascadePolicy.indexOf(requestedChannel))
      : cascadePolicy;
  const allowed = new Set(selected);
  return cascadePolicy.filter((channel) => allowed.has(channel));
}

function normalizeChannel(value) {
  const channel = String(value || "").trim().toLowerCase();
  return validChannels.has(channel) ? channel : null;
}

function normalizeMaxAttempts(value, fallback) {
  const parsed = Number.parseInt(value ?? fallback, 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 10) : fallback;
}

function rememberSkippedChannel(request, channel, reason, asOf) {
  request.skipped_channels.push({ channel, reason, skipped_at: asOf });
  request.current_step += 1;
  request.updated_at = asOf;
  request.version += 1;
}

function isConsentActive(consent, asOf) {
  const asOfTime = Date.parse(asOf);
  const grantedAt = Date.parse(consent.granted_at || consent.created_at || asOf);
  const revokedAt = Date.parse(consent.revoked_at || "");
  const expiresAt = Date.parse(consent.expires_at || "");

  return Number.isFinite(grantedAt) &&
    grantedAt <= asOfTime &&
    (!Number.isFinite(revokedAt) || revokedAt > asOfTime) &&
    (!Number.isFinite(expiresAt) || expiresAt > asOfTime);
}

function maskAddress(value, channel) {
  const raw = String(value || "");
  if (!raw) {
    return "unresolved";
  }
  if (channel === "email") {
    const [name, domain] = raw.split("@");
    return `${name?.slice(0, 2) || "**"}***@${domain || "***"}`;
  }
  return `${raw.slice(0, 4)}***${raw.slice(-2)}`;
}

function addMs(asOf, amount) {
  return new Date(Date.parse(asOf) + amount).toISOString();
}

function toPublicRequest(request) {
  return request ? cloneRecord(request) : null;
}

function toPublicDelivery(delivery) {
  return delivery ? cloneRecord(delivery) : null;
}

function isTenantContext(value) {
  return typeof value === "string" && value.trim() !== "";
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

