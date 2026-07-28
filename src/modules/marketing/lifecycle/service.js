import { evaluateLifecycleState } from "./evaluator.js";
import { buildLifecycleStatusChangedEvent, buildRetentionRiskEvent } from "./events/factory.js";

export function createLifecycleService(data, options = {}) {
  const policy = options.policy || {};

  function getCustomerLifecycle({ tenantId, customerId, asOf = new Date().toISOString() }) {
    const validationDetails = validateRequest({ tenantId, customerId, asOf });
    if (validationDetails.length > 0) {
      return {
        ok: false,
        validationDetails
      };
    }

    const customer = findCustomer({ tenantId, customerId });
    if (!customer) {
      return null;
    }

    return {
      ok: true,
      ...evaluateLifecycleState({ customer, data, tenantId, asOf, policy })
    };
  }

  function auditCustomerLifecycle({
    tenantId,
    customerId,
    asOf = new Date().toISOString(),
    correlationId,
    causationId = null,
    producer = "marketing.lifecycle.service"
  }) {
    const lifecycle = getCustomerLifecycle({ tenantId, customerId, asOf });
    if (!lifecycle?.ok) {
      return lifecycle;
    }

    const customer = findCustomer({ tenantId, customerId });
    const previousStatus = latestLifecycleStatus({ tenantId, customerId });
    const events = [];

    if (previousStatus !== lifecycle.lifecycle_status) {
      const statusKey = statusIdempotencyKey({
        tenantId,
        customerId,
        previousStatus,
        nextStatus: lifecycle.lifecycle_status,
        asOf: lifecycle.as_of
      });
      const event = appendLifecycleEvent(statusKey, () =>
        buildLifecycleStatusChangedEvent({
          customer,
          lifecycle,
          previousStatus,
          occurredAt: lifecycle.as_of,
          correlationId,
          causationId,
          idempotencyKey: statusKey,
          producer
        })
      );
      if (event) {
        events.push(event);
      }
    }

    if (lifecycle.retention_risk.at_risk) {
      const riskKey = retentionRiskIdempotencyKey({ tenantId, customerId, lifecycle });
      const event = appendLifecycleEvent(riskKey, () =>
        buildRetentionRiskEvent({
          customer,
          lifecycle,
          occurredAt: lifecycle.as_of,
          correlationId,
          causationId,
          idempotencyKey: riskKey,
          producer
        })
      );
      if (event) {
        events.push(event);
      }
    }

    return {
      ok: true,
      lifecycle,
      events
    };
  }

  function auditTenantLifecycle({ tenantId, asOf = new Date().toISOString(), limit = null } = {}) {
    const validationDetails = validateTenantAudit({ tenantId, asOf });
    if (validationDetails.length > 0) {
      return {
        ok: false,
        validationDetails
      };
    }

    const customers = (data.customers || [])
      .filter((customer) => customer.tenant_id === tenantId)
      .sort((left, right) => left.id.localeCompare(right.id));
    const capped = Number.isInteger(limit) && limit > 0 ? customers.slice(0, limit) : customers;
    const results = capped.map((customer) =>
      auditCustomerLifecycle({ tenantId, customerId: customer.id, asOf })
    );

    return {
      ok: true,
      tenant_id: tenantId,
      evaluated: results.length,
      events: results.flatMap((result) => result.events || []),
      data: results.map((result) => result.lifecycle).filter(Boolean)
    };
  }

  return {
    getCustomerLifecycle,
    auditCustomerLifecycle,
    auditTenantLifecycle
  };

  function findCustomer({ tenantId, customerId }) {
    return (
      (data.customers || []).find(
        (candidate) => candidate.id === customerId && candidate.tenant_id === tenantId
      ) || null
    );
  }

  function latestLifecycleStatus({ tenantId, customerId }) {
    const latest = ensureArray(data, "lifecycle_events")
      .filter(
        (event) =>
          event.tenant_id === tenantId &&
          event.event_type === "marketing.lifecycle.status_changed" &&
          event.payload?.customer_id === customerId
      )
      .sort((left, right) => Date.parse(right.occurred_at) - Date.parse(left.occurred_at))[0];

    return latest?.payload?.to_status ?? null;
  }

  function appendLifecycleEvent(idempotencyKey, createEvent) {
    const events = ensureArray(data, "lifecycle_events");
    const existing = events.find((event) => event.idempotency_key === idempotencyKey);
    if (existing) {
      return null;
    }

    const event = createEvent();
    events.push(event);
    return event;
  }
}

function validateRequest({ tenantId, customerId, asOf }) {
  const details = [];
  if (!isTenantContext(tenantId)) {
    details.push({ field: "tenant_context", reason: "required" });
  }
  if (!customerId || String(customerId).trim() === "") {
    details.push({ field: "customer_id", reason: "required" });
  }
  if (!Number.isFinite(Date.parse(asOf))) {
    details.push({ field: "as_of", reason: "invalid_datetime" });
  }
  return details;
}

function validateTenantAudit({ tenantId, asOf }) {
  const details = [];
  if (!isTenantContext(tenantId)) {
    details.push({ field: "tenant_context", reason: "required" });
  }
  if (!Number.isFinite(Date.parse(asOf))) {
    details.push({ field: "as_of", reason: "invalid_datetime" });
  }
  return details;
}

function statusIdempotencyKey({ tenantId, customerId, previousStatus, nextStatus, asOf }) {
  return [tenantId, customerId, "status", previousStatus || "none", nextStatus, asOf].join(":");
}

function retentionRiskIdempotencyKey({ tenantId, customerId, lifecycle }) {
  const risk = lifecycle.retention_risk;
  return [
    tenantId,
    customerId,
    "retention-risk",
    risk.loyalty_account_id || "none",
    lifecycle.as_of.slice(0, 10),
    risk.retention_gap_amount,
    risk.days_until_recalculation
  ].join(":");
}

function ensureArray(target, field) {
  if (!Array.isArray(target[field])) {
    target[field] = [];
  }

  return target[field];
}

function isTenantContext(value) {
  return typeof value === "string" && value.trim() !== "";
}
