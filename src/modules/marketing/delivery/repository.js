export function createDeliveryRepository(data = {}) {
  function requests() {
    return ensureArray(data, "delivery_requests");
  }

  function deliveries() {
    return ensureArray(data, "message_deliveries");
  }

  function attempts() {
    return ensureArray(data, "delivery_attempts");
  }

  function events() {
    return ensureArray(data, "delivery_events");
  }

  function findRequestByIdempotency({ tenantId, idempotencyKey }) {
    return requests().find(
      (request) => request.tenant_id === tenantId && request.idempotency_key === idempotencyKey
    ) || null;
  }

  function findRequest({ tenantId, requestId }) {
    return requests().find((request) => request.tenant_id === tenantId && request.id === requestId) || null;
  }

  function findDelivery({ tenantId, deliveryId }) {
    return deliveries().find((delivery) => delivery.tenant_id === tenantId && delivery.id === deliveryId) || null;
  }

  function findDeliveryByProviderMessage({ provider, providerMessageId }) {
    return deliveries().find(
      (delivery) =>
        delivery.provider === provider &&
        delivery.provider_message_id === providerMessageId
    ) || null;
  }

  function listDueDeliveries({ tenantId = null, asOf }) {
    const asOfTime = Date.parse(asOf);
    return deliveries()
      .filter((delivery) => !tenantId || delivery.tenant_id === tenantId)
      .filter((delivery) => delivery.status === "queued")
      .filter((delivery) => Date.parse(delivery.next_attempt_at || delivery.queued_at || delivery.requested_at) <= asOfTime)
      .sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at));
  }

  return {
    requests,
    deliveries,
    attempts,
    events,
    findRequest,
    findRequestByIdempotency,
    findDelivery,
    findDeliveryByProviderMessage,
    listDueDeliveries
  };
}

export function ensureArray(target, field) {
  if (!Array.isArray(target[field])) {
    target[field] = [];
  }
  return target[field];
}

export function cloneRecord(record) {
  return structuredClone(record);
}

