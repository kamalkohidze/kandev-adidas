import { randomUUID } from "node:crypto";
import { normalizeLocale } from "../../../shared/contracts.js";

export function buildCouponLifecycleEvent({
  eventType,
  coupon,
  occurredAt = new Date().toISOString(),
  correlationId,
  causationId = null,
  idempotencyKey,
  locale = null,
  producer = "promotions.coupons",
  payload = {}
}) {
  return {
    event_id: randomUUID(),
    event_type: eventType,
    event_version: 1,
    tenant_id: coupon.tenant_id,
    aggregate_type: "promotion_coupon",
    aggregate_id: coupon.id,
    occurred_at: occurredAt,
    published_at: new Date().toISOString(),
    producer,
    correlation_id: correlationId || coupon.id,
    causation_id: causationId,
    idempotency_key: idempotencyKey || `${coupon.id}:${eventType}:${occurredAt}`,
    partition_key: coupon.customer_id,
    payload: {
      coupon_id: coupon.id,
      code: coupon.code,
      customer_id: coupon.customer_id,
      promotion_type: coupon.promotion_type,
      discount_percent: coupon.discount_percent,
      status: coupon.status,
      valid_from: coupon.valid_from,
      expires_at: coupon.expires_at,
      single_use: coupon.single_use,
      ...payload
    },
    metadata: {
      source_system: producer,
      locale: locale ? normalizeLocale(locale) : null,
      pii: false
    }
  };
}
