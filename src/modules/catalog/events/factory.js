import { randomUUID } from "node:crypto";
import { normalizeLocale } from "../../../shared/contracts.js";

export const catalogEventTypes = {
  productUpserted: "catalog.product.upserted",
  priceChanged: "catalog.price.changed",
  inventoryChanged: "catalog.inventory.changed"
};

export function buildProductUpsertedEvent({
  product,
  created,
  occurredAt = product.updated_at,
  ...options
}) {
  return buildCatalogEvent({
    eventType: catalogEventTypes.productUpserted,
    tenantId: product.tenant_id,
    aggregateType: "product",
    aggregateId: product.id,
    occurredAt,
    version: product.version,
    payload: {
      product_id: product.id,
      sku: product.sku,
      status: product.status,
      version: product.version,
      operation: created ? "created" : "updated"
    },
    ...options
  });
}

export function buildPriceChangedEvent({
  variant,
  branchId,
  previousPrice,
  currentPrice,
  occurredAt = variant.updated_at,
  ...options
}) {
  return buildCatalogEvent({
    eventType: catalogEventTypes.priceChanged,
    tenantId: variant.tenant_id,
    aggregateType: "product_variant",
    aggregateId: variant.id,
    occurredAt,
    version: variant.version,
    discriminator: branchId || "base",
    payload: {
      product_id: variant.product_id,
      product_variant_id: variant.id,
      variant_sku: variant.variant_sku,
      branch_id: branchId,
      previous_price: previousPrice,
      current_price: currentPrice
    },
    ...options
  });
}

export function buildInventoryChangedEvent({
  variant,
  branchId,
  previousBalance,
  currentBalance,
  occurredAt = variant.updated_at,
  ...options
}) {
  return buildCatalogEvent({
    eventType: catalogEventTypes.inventoryChanged,
    tenantId: variant.tenant_id,
    aggregateType: "product_variant",
    aggregateId: variant.id,
    occurredAt,
    version: variant.version,
    discriminator: branchId,
    payload: {
      product_id: variant.product_id,
      product_variant_id: variant.id,
      variant_sku: variant.variant_sku,
      size: structuredClone(variant.size),
      branch_id: branchId,
      previous_balance: previousBalance,
      current_balance: currentBalance,
      total_available: variant.inventory.total_available
    },
    ...options
  });
}

export function buildCatalogEvent({
  eventType,
  tenantId,
  aggregateType,
  aggregateId,
  occurredAt,
  version,
  discriminator = "",
  payload,
  correlationId = null,
  causationId = null,
  idempotencyKey = null,
  locale = null,
  sourceSystem = null,
  producer = "catalog"
}) {
  // docs/events.md reserves these canonical names but does not define their payloads.
  // Keep payloads limited to stable canonical identifiers and the changed snapshot.
  return {
    event_id: randomUUID(),
    event_type: eventType,
    event_version: 1,
    tenant_id: tenantId,
    aggregate_type: aggregateType,
    aggregate_id: aggregateId,
    occurred_at: occurredAt || new Date().toISOString(),
    published_at: new Date().toISOString(),
    producer,
    correlation_id: correlationId || aggregateId,
    causation_id: causationId,
    idempotency_key:
      idempotencyKey ||
      [eventType, aggregateId, version, discriminator].filter(Boolean).join(":"),
    partition_key: aggregateId,
    payload: structuredClone(payload),
    metadata: {
      source_system: sourceSystem,
      locale: locale ? normalizeLocale(locale) : null,
      pii: false
    }
  };
}
