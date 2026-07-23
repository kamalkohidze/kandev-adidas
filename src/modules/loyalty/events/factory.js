import { randomUUID } from "node:crypto";
import { normalizeLocale } from "../../../shared/contracts.js";

export function buildTierChangedEvent({
  account,
  previousTier,
  currentTier,
  annualSpend,
  occurredAt = new Date().toISOString(),
  correlationId,
  causationId = null,
  idempotencyKey,
  locale = null,
  producer = "loyalty.jobs"
}) {
  return {
    event_id: randomUUID(),
    event_type: "loyalty.tier.changed",
    event_version: 1,
    tenant_id: account.tenant_id,
    aggregate_type: "loyalty_account",
    aggregate_id: account.id,
    occurred_at: occurredAt,
    published_at: new Date().toISOString(),
    producer,
    correlation_id: correlationId || account.id,
    causation_id: causationId,
    idempotency_key: idempotencyKey || `${account.id}:${occurredAt}:tier-changed`,
    partition_key: account.customer_id,
    payload: {
      customer_id: account.customer_id,
      loyalty_account_id: account.id,
      previous_tier_code: previousTier?.tier_code || null,
      previous_discount_percent: previousTier?.discount_percent || "0.00",
      current_tier_code: currentTier.tier_code,
      current_discount_percent: currentTier.discount_percent,
      annual_eligible_spend: annualSpend
    },
    metadata: {
      source_system: producer,
      locale: locale ? normalizeLocale(locale) : null,
      pii: false
    }
  };
}

export function buildDiscountEvaluatedEvent({
  evaluation,
  tenantId,
  customerId,
  occurredAt = new Date().toISOString(),
  correlationId,
  causationId = null,
  idempotencyKey,
  locale = null,
  producer = "loyalty.discount-rules"
}) {
  return {
    event_id: randomUUID(),
    event_type: "loyalty.discount.evaluated",
    event_version: 1,
    tenant_id: tenantId,
    aggregate_type: "discount_evaluation",
    aggregate_id: evaluation.evaluation_id,
    occurred_at: occurredAt,
    published_at: new Date().toISOString(),
    producer,
    correlation_id: correlationId || evaluation.evaluation_id,
    causation_id: causationId,
    idempotency_key: idempotencyKey || evaluation.evaluation_id,
    partition_key: customerId,
    payload: {
      evaluation_id: evaluation.evaluation_id,
      customer_id: customerId,
      discount_percent: evaluation.discount_percent,
      discount_amount: evaluation.discount_amount,
      net_amount: evaluation.net_amount,
      currency: evaluation.currency,
      lines: evaluation.lines.map((line) => ({
        sku: line.sku,
        loyalty_discount_allowed: line.loyalty_discount_allowed,
        discount_amount: line.discount_amount,
        blocked_by_global_sale: Boolean(line.blocked_by_global_sale)
      })),
      warnings: evaluation.warnings
    },
    metadata: {
      source_system: producer,
      locale: locale ? normalizeLocale(locale) : null,
      pii: false
    }
  };
}
