import { randomUUID } from "node:crypto";
import { evaluateCondition, createWorkflowPublicServices } from "./conditions.js";
import { transitionJourney, transitionStep } from "./state.js";

const defaultMaxStepsPerRun = 50;
const terminalStepStatuses = new Set(["completed", "skipped", "failed"]);

export function createWorkflowService(data, options = {}) {
  const services = options.services || createWorkflowPublicServices(data);
  const now = options.now || (() => new Date().toISOString());

  function createDefinition({ tenantId, definition, asOf = now() }) {
    const normalized = normalizeDefinition({ tenantId, definition, asOf });
    const validationDetails = validateDefinition(normalized);
    if (validationDetails.length > 0) {
      return { ok: false, validationDetails };
    }

    const definitions = ensureArray(data, "workflow_definitions");
    const existing = definitions.find(
      (candidate) => candidate.tenant_id === tenantId && candidate.code === normalized.code
    );
    if (existing) {
      return {
        ok: false,
        validationDetails: [{ field: "code", reason: "already_exists" }]
      };
    }

    definitions.push(normalized);
    return { ok: true, data: toPublicDefinition(normalized) };
  }

  function listDefinitions({ tenantId } = {}) {
    const validationDetails = validateTenant({ tenantId });
    if (validationDetails.length > 0) {
      return { ok: false, validationDetails };
    }

    return {
      ok: true,
      data: ensureArray(data, "workflow_definitions")
        .filter((definition) => definition.tenant_id === tenantId)
        .sort((left, right) => left.code.localeCompare(right.code))
        .map(toPublicDefinition)
    };
  }

  function getDefinition({ tenantId, code }) {
    const validationDetails = validateTenant({ tenantId });
    if (validationDetails.length > 0) {
      return { ok: false, validationDetails };
    }

    const definition = findDefinition({ tenantId, code });
    return definition ? { ok: true, data: toPublicDefinition(definition) } : null;
  }

  function findDefinition({ tenantId, code }) {
    return ensureArray(data, "workflow_definitions").find(
      (definition) => definition.tenant_id === tenantId && definition.code === code
    ) || null;
  }

  function handleEvent({ tenantId, event, asOf = event?.occurred_at || now() }) {
    const validationDetails = validateEventRequest({ tenantId, event, asOf });
    if (validationDetails.length > 0) {
      return { ok: false, validationDetails };
    }

    const canonicalEvent = normalizeEvent({ tenantId, event, asOf });
    const definitions = matchingDefinitions({ tenantId, event: canonicalEvent, asOf });
    const receipts = ensureArray(data, "workflow_event_receipts");
    const started = [];
    const duplicates = [];
    const skipped = [];

    for (const { definition, trigger } of definitions) {
      if (!trigger.matched) {
        skipped.push({
          workflow_code: definition.code,
          reason: "trigger_condition_not_matched",
          trigger
        });
        continue;
      }

      const receiptKey = eventReceiptKey({ tenantId, definition, event: canonicalEvent });
      const existingReceipt = receipts.find((receipt) => receipt.idempotency_key === receiptKey);
      if (existingReceipt) {
        duplicates.push({
          workflow_code: definition.code,
          journey_instance_id: existingReceipt.journey_instance_id,
          idempotency_key: receiptKey
        });
        continue;
      }

      const instance = startInstance({ tenantId, definition, event: canonicalEvent, asOf });
      receipts.push({
        id: randomUUID(),
        tenant_id: tenantId,
        workflow_definition_id: definition.id,
        workflow_code: definition.code,
        event_id: canonicalEvent.event_id,
        idempotency_key: receiptKey,
        journey_instance_id: instance.id,
        created_at: asOf
      });
      started.push(toPublicInstance(instance));
    }

    return {
      ok: true,
      tenant_id: tenantId,
      event_id: canonicalEvent.event_id,
      matched_definitions: definitions.length,
      started: started.length,
      duplicate_count: duplicates.length,
      skipped,
      duplicates,
      data: started
    };
  }

  function advanceInstance({ tenantId, instanceId, asOf = now() }) {
    const validationDetails = validateTenant({ tenantId });
    if (validationDetails.length > 0) {
      return { ok: false, validationDetails };
    }

    const instance = ensureArray(data, "journey_instances").find(
      (candidate) => candidate.id === instanceId && candidate.tenant_id === tenantId
    );
    if (!instance) {
      return null;
    }

    if (!["running", "waiting"].includes(instance.status)) {
      return { ok: true, data: toPublicInstance(instance) };
    }

    const definition = findDefinition({ tenantId, code: instance.workflow_code });
    if (!definition) {
      failInstance(instance, asOf, "workflow_definition_missing");
      return { ok: true, data: toPublicInstance(instance) };
    }

    if (instance.status === "waiting") {
      const stepState = findStepState(instance, instance.current_step_code);
      if (!stepState?.available_at || Date.parse(asOf) < Date.parse(stepState.available_at)) {
        return { ok: true, data: toPublicInstance(instance) };
      }
      transitionJourney(instance, "running", asOf);
    }

    runInstance({ instance, definition, asOf });
    return { ok: true, data: toPublicInstance(instance) };
  }

  function getInstance({ tenantId, instanceId }) {
    const validationDetails = validateTenant({ tenantId });
    if (validationDetails.length > 0) {
      return { ok: false, validationDetails };
    }
    const instance = ensureArray(data, "journey_instances").find(
      (candidate) => candidate.id === instanceId && candidate.tenant_id === tenantId
    );
    return instance ? { ok: true, data: toPublicInstance(instance) } : null;
  }

  function dryRun({ tenantId, definition = null, workflowCode = null, event, asOf = event?.occurred_at || now() }) {
    const validationDetails = validateEventRequest({ tenantId, event, asOf });
    if (validationDetails.length > 0) {
      return { ok: false, validationDetails };
    }

    const sourceDefinition = definition
      ? normalizeDefinition({ tenantId, definition, asOf })
      : findDefinition({ tenantId, code: workflowCode });
    if (!sourceDefinition) {
      return null;
    }

    const definitionValidation = validateDefinition(sourceDefinition);
    if (definitionValidation.length > 0) {
      return { ok: false, validationDetails: definitionValidation };
    }

    const clonedData = structuredClone(data);
    const dryService = createWorkflowService(clonedData, {
      services: createWorkflowPublicServices(clonedData),
      now: () => asOf
    });
    const clonedDefinitions = ensureArray(clonedData, "workflow_definitions");
    if (!clonedDefinitions.some(
      (candidate) => candidate.tenant_id === tenantId && candidate.code === sourceDefinition.code
    )) {
      clonedDefinitions.push(sourceDefinition);
    }
    const result = dryService.handleEvent({
      tenantId,
      event: normalizeEvent({ tenantId, event, asOf }),
      asOf
    });

    return {
      ok: result.ok,
      tenant_id: tenantId,
      dry_run: true,
      workflow_code: sourceDefinition.code,
      started: result.started || 0,
      duplicate_count: result.duplicate_count || 0,
      skipped: result.skipped || [],
      data: result.data || [],
      emitted_events: clonedData.workflow_events || []
    };
  }

  return {
    createDefinition,
    listDefinitions,
    getDefinition,
    handleEvent,
    advanceInstance,
    getInstance,
    dryRun
  };

  function startInstance({ tenantId, definition, event, asOf }) {
    const instance = {
      id: randomUUID(),
      tenant_id: tenantId,
      workflow_definition_id: definition.id,
      workflow_code: definition.code,
      journey_code: definition.journey_code || definition.code,
      status: "running",
      customer_id: resolveCustomerId(event),
      trigger_event_id: event.event_id,
      trigger_event_type: event.event_type,
      correlation_id: event.correlation_id || event.idempotency_key || event.event_id,
      current_step_code: definition.entry_step,
      context: {
        event,
        variables: {},
        outputs: {}
      },
      step_states: definition.steps.map((step) => ({
        step_code: step.code,
        status: "pending",
        available_at: null,
        started_at: null,
        completed_at: null,
        updated_at: asOf,
        output: null,
        decision: null,
        error: null
      })),
      created_at: asOf,
      updated_at: asOf,
      completed_at: null,
      cancelled_at: null,
      failed_at: null,
      version: 1
    };

    ensureArray(data, "journey_instances").push(instance);
    appendWorkflowEvent({
      tenantId,
      eventType: "marketing.journey.started",
      aggregateId: instance.id,
      customerId: instance.customer_id,
      occurredAt: asOf,
      correlationId: instance.correlation_id,
      causationId: event.event_id,
      idempotencyKey: `${instance.id}:started`,
      payload: {
        journey_instance_id: instance.id,
        workflow_code: definition.code,
        journey_code: instance.journey_code,
        customer_id: instance.customer_id,
        trigger_event_type: event.event_type
      }
    });
    runInstance({ instance, definition, asOf });
    return instance;
  }

  function runInstance({ instance, definition, asOf }) {
    let guard = 0;

    while (guard < defaultMaxStepsPerRun && instance.status === "running") {
      guard += 1;
      const step = findStep(definition, instance.current_step_code);
      if (!step) {
        failInstance(instance, asOf, `step_not_found:${instance.current_step_code}`);
        return;
      }

      const stepState = findStepState(instance, step.code);
      if (!stepState || terminalStepStatuses.has(stepState.status)) {
        completeOrMove(instance, definition, step, asOf, step?.next_step || null);
        continue;
      }

      try {
        executeStep({ instance, definition, step, stepState, asOf });
      } catch (error) {
        transitionStep(stepState, "failed", asOf, { error: error.message });
        failInstance(instance, asOf, error.message);
      }
    }

    if (guard >= defaultMaxStepsPerRun && instance.status === "running") {
      failInstance(instance, asOf, "max_steps_per_run_exceeded");
    }
  }

  function executeStep({ instance, definition, step, stepState, asOf }) {
    if (step.condition && step.type !== "condition") {
      const condition = evaluateCondition(step.condition, buildConditionContext(instance, asOf), services);
      if (!condition.matched) {
        transitionStep(stepState, "skipped", asOf, { decision: condition });
        completeOrMove(instance, definition, step, asOf, step.on_skip || step.next_step || null);
        return;
      }
    }

    if (step.type === "condition") {
      transitionStep(stepState, "running", asOf);
      const decision = evaluateCondition(step.condition, buildConditionContext(instance, asOf), services);
      transitionStep(stepState, "completed", asOf, { decision });
      completeOrMove(
        instance,
        definition,
        step,
        asOf,
        decision.matched ? step.next_steps?.true : step.next_steps?.false
      );
      return;
    }

    if (step.type === "delay") {
      if (stepState.status === "waiting") {
        if (Date.parse(asOf) < Date.parse(stepState.available_at)) {
          transitionJourney(instance, "waiting", asOf);
          return;
        }
        transitionStep(stepState, "completed", asOf, { available_at: stepState.available_at });
        completeOrMove(instance, definition, step, asOf, step.next_step || null);
        return;
      }
      transitionStep(stepState, "running", asOf);
      const availableAt = addDelay(asOf, step.delay || {});
      if (Date.parse(asOf) < Date.parse(availableAt)) {
        transitionStep(stepState, "waiting", asOf, { available_at: availableAt });
        transitionJourney(instance, "waiting", asOf);
        instance.current_step_code = step.code;
        return;
      }
      transitionStep(stepState, "completed", asOf, { available_at: availableAt });
      completeOrMove(instance, definition, step, asOf, step.next_step || null);
      return;
    }

    if (step.type === "action") {
      transitionStep(stepState, "running", asOf);
      const output = executeAction({ instance, step, asOf });
      transitionStep(stepState, "completed", asOf, { output });
      completeOrMove(instance, definition, step, asOf, step.next_step || null);
      return;
    }

    if (step.type === "end") {
      transitionStep(stepState, "running", asOf);
      transitionStep(stepState, "completed", asOf);
      transitionJourney(instance, "completed", asOf);
      instance.current_step_code = null;
      return;
    }

    throw new Error(`unsupported_step_type:${step.type}`);
  }

  function executeAction({ instance, step, asOf }) {
    const action = step.action || {};

    if (action.type === "request_delivery") {
      const event = appendWorkflowEvent({
        tenantId: instance.tenant_id,
        eventType: "message.delivery.requested",
        aggregateId: instance.id,
        customerId: instance.customer_id,
        occurredAt: asOf,
        correlationId: instance.correlation_id,
        causationId: instance.trigger_event_id,
        idempotencyKey: `${instance.id}:${step.code}:delivery-requested`,
        payload: {
          journey_instance_id: instance.id,
          workflow_code: instance.workflow_code,
          customer_id: instance.customer_id,
          template_code: action.template_code || null,
          channel: action.channel || null,
          locale: action.locale || instance.context.event.metadata?.locale || null,
          variables: action.variables || {}
        }
      });
      return {
        action_type: action.type,
        event_id: event?.event_id || null,
        note: "Delivery provider execution is intentionally outside workflow task scope."
      };
    }

    if (action.type === "generate_cross_sell_candidates") {
      const result = services.crossSell.generateCandidates({
        tenantId: instance.tenant_id,
        asOf,
        branchId: action.branch_id || null,
        locale: action.locale || instance.context.event.metadata?.locale || null,
        limit: action.limit ?? null,
        scenarioCodes: action.scenario_codes || null
      });
      return {
        action_type: action.type,
        ok: result.ok,
        created: result.created || 0,
        duplicate_count: result.duplicate_count || 0,
        validationDetails: result.validationDetails || []
      };
    }

    if (action.type === "noop" || !action.type) {
      return { action_type: "noop" };
    }

    throw new Error(`unsupported_action_type:${action.type}`);
  }

  function completeOrMove(instance, definition, step, asOf, nextStepCode) {
    if (!nextStepCode) {
      transitionJourney(instance, "completed", asOf);
      instance.current_step_code = null;
      return;
    }
    if (!findStep(definition, nextStepCode)) {
      failInstance(instance, asOf, `next_step_not_found:${nextStepCode}`);
      return;
    }
    instance.current_step_code = nextStepCode;
    instance.updated_at = asOf;
    instance.version += 1;
  }

  function failInstance(instance, asOf, reason) {
    instance.failure_reason = reason;
    transitionJourney(instance, "failed", asOf);
  }

  function matchingDefinitions({ tenantId, event, asOf }) {
    return ensureArray(data, "workflow_definitions")
      .filter((definition) => definition.tenant_id === tenantId && definition.status === "active")
      .filter((definition) => (definition.trigger.event_types || []).includes(event.event_type))
      .map((definition) => ({
        definition,
        trigger: evaluateCondition(definition.trigger.condition, {
          data,
          event,
          tenantId,
          customerId: resolveCustomerId(event),
          asOf
        }, services)
      }));
  }

  function buildConditionContext(instance, asOf) {
    return {
      data,
      event: instance.context.event,
      tenantId: instance.tenant_id,
      customerId: instance.customer_id,
      asOf
    };
  }

  function appendWorkflowEvent({
    tenantId,
    eventType,
    aggregateId,
    customerId,
    occurredAt,
    correlationId,
    causationId,
    idempotencyKey,
    payload
  }) {
    const events = ensureArray(data, "workflow_events");
    const existing = events.find((event) => event.idempotency_key === idempotencyKey);
    if (existing) {
      return existing;
    }

    const event = {
      event_id: randomUUID(),
      event_type: eventType,
      event_version: 1,
      tenant_id: tenantId,
      aggregate_type: eventType === "message.delivery.requested" ? "message_delivery" : "journey",
      aggregate_id: aggregateId,
      occurred_at: occurredAt,
      published_at: occurredAt,
      producer: "marketing.workflow.service",
      correlation_id: correlationId,
      causation_id: causationId || null,
      idempotency_key: idempotencyKey,
      partition_key: customerId || aggregateId,
      payload,
      metadata: {
        source_system: "marketing.workflow",
        locale: null,
        pii: false,
        dry_run: false
      }
    };
    events.push(event);
    return event;
  }
}

function normalizeDefinition({ tenantId, definition, asOf }) {
  const base = isPlainObject(definition) ? structuredClone(definition) : {};
  return {
    id: base.id || randomUUID(),
    tenant_id: tenantId,
    code: nullableString(base.code),
    name: nullableString(base.name) || nullableString(base.code),
    status: base.status || "draft",
    journey_code: nullableString(base.journey_code) || nullableString(base.code),
    trigger: {
      event_types: normalizeList(base.trigger?.event_types ?? base.trigger?.event_type),
      condition: base.trigger?.condition || null
    },
    entry_step: nullableString(base.entry_step) || nullableString(base.steps?.[0]?.code),
    steps: Array.isArray(base.steps) ? base.steps.map(normalizeStep) : [],
    created_at: base.created_at || asOf,
    updated_at: asOf,
    version: Number.isInteger(base.version) ? base.version : 1,
    metadata: isPlainObject(base.metadata) ? base.metadata : {}
  };
}

function normalizeStep(step) {
  if (!isPlainObject(step)) {
    return {
      code: null,
      type: null,
      condition: null,
      action: null,
      delay: null,
      next_step: null,
      next_steps: null,
      on_skip: null,
      metadata: {},
      invalid_shape: true
    };
  }

  return {
    code: nullableString(step.code),
    type: step.type || "action",
    condition: step.condition || null,
    action: step.action || null,
    delay: step.delay || null,
    next_step: nullableString(step.next_step),
    next_steps: isPlainObject(step.next_steps) ? {
      true: nullableString(step.next_steps.true),
      false: nullableString(step.next_steps.false)
    } : null,
    on_skip: nullableString(step.on_skip),
    metadata: isPlainObject(step.metadata) ? step.metadata : {}
  };
}

function validateDefinition(definition) {
  const details = [];
  if (!isTenantContext(definition.tenant_id)) {
    details.push({ field: "tenant_context", reason: "required" });
  }
  if (!definition.code) {
    details.push({ field: "code", reason: "required" });
  }
  if (!["draft", "active", "archived"].includes(definition.status)) {
    details.push({ field: "status", reason: "unsupported" });
  }
  if (definition.trigger.event_types.length === 0) {
    details.push({ field: "trigger.event_types", reason: "required" });
  }
  if (definition.steps.length === 0) {
    details.push({ field: "steps", reason: "required" });
  }

  const stepCodes = new Set();
  for (const [index, step] of definition.steps.entries()) {
    if (!step.code) {
      details.push({ field: `steps.${index}.code`, reason: "required" });
    }
    if (stepCodes.has(step.code)) {
      details.push({ field: `steps.${index}.code`, reason: "duplicate" });
    }
    if (step.code) {
      stepCodes.add(step.code);
    }
    if (step.invalid_shape) {
      details.push({ field: `steps.${index}`, reason: "object_required" });
      continue;
    }
    if (!["condition", "delay", "action", "end"].includes(step.type)) {
      details.push({ field: `steps.${index}.type`, reason: "unsupported" });
    }
    if (step.type === "condition" && !step.next_steps) {
      details.push({ field: `steps.${index}.next_steps`, reason: "required" });
    }
    if (step.type === "delay" && !Number.isFinite(delayMs(step.delay || {}))) {
      details.push({ field: `steps.${index}.delay`, reason: "invalid" });
    }
  }

  if (definition.entry_step && definition.steps.length > 0 && !stepCodes.has(definition.entry_step)) {
    details.push({ field: "entry_step", reason: "step_not_found" });
  }
  for (const [index, step] of definition.steps.entries()) {
    for (const target of [step.next_step, step.next_steps?.true, step.next_steps?.false, step.on_skip]) {
      if (target && !stepCodes.has(target)) {
        details.push({ field: `steps.${index}.next`, reason: `step_not_found:${target}` });
      }
    }
  }

  return details;
}

function validateEventRequest({ tenantId, event, asOf }) {
  const details = validateTenant({ tenantId });
  if (!isPlainObject(event)) {
    details.push({ field: "event", reason: "required" });
    return details;
  }
  if (!event.event_type) {
    details.push({ field: "event.event_type", reason: "required" });
  }
  if (!event.event_id && !event.idempotency_key) {
    details.push({ field: "event.idempotency_key", reason: "required_without_event_id" });
  }
  if (!Number.isFinite(Date.parse(asOf))) {
    details.push({ field: "as_of", reason: "invalid_datetime" });
  }
  return details;
}

function validateTenant({ tenantId }) {
  return isTenantContext(tenantId) ? [] : [{ field: "tenant_context", reason: "required" }];
}

function normalizeEvent({ tenantId, event, asOf }) {
  const eventId = event.event_id || randomUUID();
  return {
    event_id: eventId,
    event_type: event.event_type,
    event_version: event.event_version || 1,
    tenant_id: tenantId,
    aggregate_type: event.aggregate_type || null,
    aggregate_id: event.aggregate_id || event.payload?.customer_id || event.payload?.transaction_id || eventId,
    occurred_at: event.occurred_at || asOf,
    published_at: event.published_at || asOf,
    producer: event.producer || "external",
    correlation_id: event.correlation_id || event.idempotency_key || eventId,
    causation_id: event.causation_id || null,
    idempotency_key: event.idempotency_key || eventId,
    partition_key: event.partition_key || event.payload?.customer_id || event.aggregate_id || eventId,
    payload: isPlainObject(event.payload) ? event.payload : {},
    metadata: isPlainObject(event.metadata) ? event.metadata : { source_system: null, locale: null, pii: false }
  };
}

function eventReceiptKey({ tenantId, definition, event }) {
  return [
    tenantId,
    definition.id,
    event.idempotency_key || event.event_id,
    event.event_type
  ].join(":");
}

function findStep(definition, code) {
  return definition.steps.find((step) => step.code === code) || null;
}

function findStepState(instance, stepCode) {
  return instance.step_states.find((step) => step.step_code === stepCode) || null;
}

function resolveCustomerId(event) {
  return event.payload?.customer_id || (event.aggregate_type === "customer" ? event.aggregate_id : null) || null;
}

function addDelay(asOf, delay) {
  return new Date(Date.parse(asOf) + delayMs(delay)).toISOString();
}

function delayMs(delay) {
  const amount = Number(delay.amount ?? delay.value ?? 0);
  if (!Number.isFinite(amount) || amount < 0) {
    return Number.NaN;
  }
  const unit = delay.unit || "seconds";
  if (unit === "milliseconds") {
    return amount;
  }
  if (unit === "seconds") {
    return amount * 1000;
  }
  if (unit === "minutes") {
    return amount * 60 * 1000;
  }
  if (unit === "hours") {
    return amount * 60 * 60 * 1000;
  }
  if (unit === "days") {
    return amount * 24 * 60 * 60 * 1000;
  }
  return Number.NaN;
}

function ensureArray(target, field) {
  if (!Array.isArray(target[field])) {
    target[field] = [];
  }
  return target[field];
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (value === undefined || value === null || String(value).trim() === "") {
    return [];
  }
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function nullableString(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }
  return String(value).trim();
}

function isTenantContext(value) {
  return typeof value === "string" && value.trim() !== "";
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toPublicDefinition(definition) {
  return structuredClone(definition);
}

function toPublicInstance(instance) {
  return structuredClone(instance);
}
