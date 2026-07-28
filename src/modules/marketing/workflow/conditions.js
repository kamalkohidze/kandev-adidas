import { createCrossSellService } from "../cross-sell/index.js";
import { createLifecycleService } from "../lifecycle/index.js";
import { createSegmentService } from "../segments/index.js";
import { evaluateMarketingTriggerCondition } from "../triggers/payload.js";

export function evaluateCondition(condition, context, services = createWorkflowPublicServices(context.data)) {
  if (!condition) {
    return { matched: true, reason: "no_condition" };
  }

  if (Array.isArray(condition.all)) {
    const results = condition.all.map((entry) => evaluateCondition(entry, context, services));
    return {
      matched: results.every((result) => result.matched),
      reason: "all",
      results
    };
  }

  if (Array.isArray(condition.any)) {
    const results = condition.any.map((entry) => evaluateCondition(entry, context, services));
    return {
      matched: results.some((result) => result.matched),
      reason: "any",
      results
    };
  }

  if (condition.not) {
    const result = evaluateCondition(condition.not, context, services);
    return {
      matched: !result.matched,
      reason: "not",
      result
    };
  }

  return evaluateAtomicCondition(condition, context, services);
}

export function createWorkflowPublicServices(data) {
  return {
    segments: createSegmentService(data),
    lifecycle: createLifecycleService(data),
    crossSell: createCrossSellService(data)
  };
}

function evaluateAtomicCondition(condition, context, services) {
  const event = context.event;
  const tenantId = context.tenantId;
  const customerId = context.customerId;
  const asOf = context.asOf;

  if (condition.type === "event_type_is") {
    const expected = listValue(condition.event_type ?? condition.event_types);
    return {
      matched: expected.includes(event.event_type),
      reason: "event_type_is",
      expected,
      actual: event.event_type
    };
  }

  if (condition.type === "event_payload_equals") {
    const actual = getPath(event.payload || {}, condition.path);
    return {
      matched: actual === condition.value,
      reason: "event_payload_equals",
      path: condition.path,
      expected: condition.value,
      actual
    };
  }

  if (condition.type === "event_payload_exists") {
    const actual = getPath(event.payload || {}, condition.path);
    return {
      matched: actual !== undefined && actual !== null,
      reason: "event_payload_exists",
      path: condition.path
    };
  }

  if (condition.type === "customer_in_segment") {
    if (!customerId) {
      return { matched: false, reason: "customer_id_missing" };
    }
    const preview = services.segments.previewAudience({
      tenantId,
      segmentCode: condition.segment_code,
      filters: condition.filters || {},
      asOf,
      limit: 100
    });
    if (!preview?.ok) {
      return {
        matched: false,
        reason: "segment_unavailable",
        validationDetails: preview?.validationDetails || []
      };
    }
    return {
      matched: preview.data.some((entry) => entry.customer_id === customerId),
      reason: "customer_in_segment",
      segment_code: condition.segment_code
    };
  }

  if (condition.type === "lifecycle_status_is") {
    if (!customerId) {
      return { matched: false, reason: "customer_id_missing" };
    }
    const lifecycle = services.lifecycle.getCustomerLifecycle({ tenantId, customerId, asOf });
    if (!lifecycle?.ok) {
      return {
        matched: false,
        reason: "lifecycle_unavailable",
        validationDetails: lifecycle?.validationDetails || []
      };
    }
    const expected = listValue(condition.status ?? condition.statuses);
    return {
      matched: expected.includes(lifecycle.lifecycle_status),
      reason: "lifecycle_status_is",
      expected,
      actual: lifecycle.lifecycle_status
    };
  }

  if (condition.type === "recommended_action_is") {
    if (!customerId) {
      return { matched: false, reason: "customer_id_missing" };
    }
    const lifecycle = services.lifecycle.getCustomerLifecycle({ tenantId, customerId, asOf });
    if (!lifecycle?.ok) {
      return {
        matched: false,
        reason: "lifecycle_unavailable",
        validationDetails: lifecycle?.validationDetails || []
      };
    }
    const expected = listValue(condition.code ?? condition.codes);
    return {
      matched: expected.includes(lifecycle.recommended_action?.code),
      reason: "recommended_action_is",
      expected,
      actual: lifecycle.recommended_action?.code || null
    };
  }

  if (condition.type === "has_cross_sell_candidate") {
    if (!customerId) {
      return { matched: false, reason: "customer_id_missing" };
    }
    const candidates = services.crossSell.listCandidates({
      tenantId,
      customerId,
      scenarioCode: condition.scenario_code || null
    });
    if (!candidates.ok) {
      return {
        matched: false,
        reason: "cross_sell_unavailable",
        validationDetails: candidates.validationDetails
      };
    }
    return {
      matched: candidates.data.some((candidate) => !condition.status || candidate.status === condition.status),
      reason: "has_cross_sell_candidate",
      scenario_code: condition.scenario_code || null
    };
  }

  const triggerCondition = evaluateMarketingTriggerCondition(condition, context);
  if (triggerCondition) {
    return triggerCondition;
  }

  return {
    matched: false,
    reason: "unsupported_condition",
    condition_type: condition.type || null
  };
}

function getPath(value, path) {
  if (!path || typeof path !== "string") {
    return undefined;
  }
  return path.split(".").reduce((current, key) => {
    if (current === null || current === undefined) {
      return undefined;
    }
    return current[key];
  }, value);
}

function listValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  if (value === undefined || value === null) {
    return [];
  }
  return [String(value)];
}
