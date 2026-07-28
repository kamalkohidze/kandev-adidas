export const deliveryStatuses = [
  "requested",
  "queued",
  "sent",
  "delivered",
  "read",
  "failed",
  "expired",
  "cancelled"
];

const transitions = {
  requested: new Set(["queued", "failed", "cancelled", "expired"]),
  queued: new Set(["sent", "failed", "cancelled", "expired"]),
  sent: new Set(["delivered", "failed", "cancelled", "expired"]),
  delivered: new Set(["read"]),
  read: new Set([]),
  failed: new Set([]),
  expired: new Set([]),
  cancelled: new Set([])
};

export function canTransitionDeliveryStatus(from, to) {
  return transitions[from]?.has(to) === true;
}

export function transitionDeliveryStatus(delivery, nextStatus, asOf, details = {}) {
  if (!deliveryStatuses.includes(nextStatus)) {
    throw new Error(`unsupported_delivery_status:${nextStatus}`);
  }
  if (delivery.status === nextStatus) {
    return delivery;
  }
  if (!canTransitionDeliveryStatus(delivery.status, nextStatus)) {
    throw new Error(`invalid_delivery_transition:${delivery.status}:${nextStatus}`);
  }

  delivery.status = nextStatus;
  delivery.updated_at = asOf;
  delivery.version = (delivery.version || 1) + 1;

  if (nextStatus === "queued") {
    delivery.queued_at = delivery.queued_at || asOf;
  }
  if (nextStatus === "sent") {
    delivery.sent_at = delivery.sent_at || asOf;
  }
  if (nextStatus === "delivered") {
    delivery.delivered_at = delivery.delivered_at || asOf;
  }
  if (nextStatus === "read") {
    delivery.read_at = delivery.read_at || asOf;
  }
  if (["failed", "expired"].includes(nextStatus)) {
    delivery.failed_at = delivery.failed_at || asOf;
    delivery.failure_code = details.failure_code || delivery.failure_code || nextStatus;
    delivery.failure_message = details.failure_message || delivery.failure_message || null;
  }
  if (nextStatus === "cancelled") {
    delivery.failed_at = delivery.failed_at || asOf;
    delivery.failure_code = details.failure_code || delivery.failure_code || "cancelled";
    delivery.failure_message = details.failure_message || delivery.failure_message || null;
  }

  return delivery;
}

