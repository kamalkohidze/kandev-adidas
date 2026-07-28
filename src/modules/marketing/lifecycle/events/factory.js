import { randomUUID } from "node:crypto";
import { normalizeLocale } from "../../../../shared/contracts.js";

export function buildLifecycleStatusChangedEvent({
  customer,
  lifecycle,
  previousStatus,
  occurredAt,
  correlationId,
  causationId = null,
  idempotencyKey,
  producer = "marketing.lifecycle"
}) {
  return lifecycleEvent({
    eventType: "marketing.lifecycle.status_changed",
    customer,
    lifecycle,
    occurredAt,
    correlationId,
    causationId,
    idempotencyKey,
    producer,
    payload: {
      customer_id: customer.id,
      from_status: previousStatus,
      to_status: lifecycle.lifecycle_status,
      changed_at: occurredAt,
      last_activity_at: lifecycle.activity.last_at,
      last_activity_type: lifecycle.activity.last_type,
      days_since_last_activity: lifecycle.activity.days_since_last_activity,
      recommended_action: lifecycle.recommended_action
    }
  });
}

export function buildRetentionRiskEvent({
  customer,
  lifecycle,
  occurredAt,
  correlationId,
  causationId = null,
  idempotencyKey,
  producer = "marketing.lifecycle"
}) {
  return lifecycleEvent({
    eventType: "marketing.lifecycle.retention_risk",
    customer,
    lifecycle,
    occurredAt,
    correlationId,
    causationId,
    idempotencyKey,
    producer,
    payload: {
      customer_id: customer.id,
      lifecycle_status: lifecycle.lifecycle_status,
      preferred_locale: customer.preferred_locale,
      recommended_action: lifecycle.recommended_action,
      ...lifecycle.retention_risk
    }
  });
}

function lifecycleEvent({
  eventType,
  customer,
  lifecycle,
  occurredAt,
  correlationId,
  causationId,
  idempotencyKey,
  producer,
  payload
}) {
  return {
    event_id: randomUUID(),
    event_type: eventType,
    event_version: 1,
    tenant_id: customer.tenant_id,
    aggregate_type: "customer",
    aggregate_id: customer.id,
    occurred_at: occurredAt,
    published_at: new Date().toISOString(),
    producer,
    correlation_id: correlationId || customer.id,
    causation_id: causationId,
    idempotency_key: idempotencyKey,
    partition_key: customer.id,
    payload,
    metadata: {
      source_system: producer,
      locale: customer.preferred_locale ? normalizeLocale(customer.preferred_locale) : null,
      pii: false,
      lifecycle_as_of: lifecycle.as_of
    }
  };
}
