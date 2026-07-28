const dayMs = 24 * 60 * 60 * 1000;

export const lifecycleStates = ["new", "active", "sleeping", "gone"];

export const defaultLifecyclePolicy = {
  newWindowDays: 30,
  sleepingAfterDays: 90,
  goneAfterDays: 180,
  retentionRiskWindowDays: 30
};

const purchaseEventTypes = new Set(["transaction.purchase.created"]);
const returnEventTypes = new Set(["transaction.return.created"]);
const cartActivityEventTypes = new Set(["cart.updated", "cart.abandoned"]);
const registrationEventTypes = new Set(["customer.registered"]);
const lifecycleActivityTypes = new Set([
  "registration",
  "registered",
  "purchase",
  "exchange",
  "return",
  "cart",
  "cart_activity",
  "cart_updated"
]);

export function evaluateLifecycleState({ customer, data, tenantId, asOf = new Date().toISOString(), policy = {} }) {
  const effectivePolicy = { ...defaultLifecyclePolicy, ...policy };
  const asOfTime = Date.parse(asOf);

  if (!customer || customer.tenant_id !== tenantId || !Number.isFinite(asOfTime)) {
    return null;
  }

  const facts = buildLifecycleFacts({ customer, data, tenantId, asOfTime });
  const daysSinceRegistration = daysSince(facts.registered_at, asOfTime);
  const daysSinceLastActivity = daysSince(facts.last_activity_at, asOfTime);
  const lifecycleStatus = resolveLifecycleStatus({
    daysSinceRegistration,
    daysSinceLastActivity,
    facts,
    policy: effectivePolicy
  });
  const retentionRisk = evaluateRetentionRisk({
    customer,
    data,
    asOfTime,
    policy: effectivePolicy
  });

  return {
    customer_id: customer.id,
    tenant_id: customer.tenant_id,
    lifecycle_status: lifecycleStatus,
    as_of: new Date(asOfTime).toISOString(),
    registered_at: facts.registered_at,
    last_activity: facts.last_activity,
    activity: {
      last_at: facts.last_activity_at,
      last_type: facts.last_activity?.type || null,
      last_channel: facts.last_activity?.channel || null,
      source_ref: facts.last_activity?.source_ref || null,
      days_since_last_activity: daysSinceLastActivity
    },
    purchases: {
      last_purchase_at: facts.last_purchase_at,
      days_since_last_purchase: daysSince(facts.last_purchase_at, asOfTime)
    },
    returns: {
      last_return_at: facts.last_return_at,
      days_since_last_return: daysSince(facts.last_return_at, asOfTime)
    },
    cart: {
      last_activity_at: facts.last_cart_activity_at,
      days_since_last_activity: daysSince(facts.last_cart_activity_at, asOfTime)
    },
    retention_risk: retentionRisk,
    recommended_action: recommendNextAction({
      lifecycleStatus,
      facts,
      retentionRisk,
      asOfTime
    }),
    policy: {
      new_window_days: effectivePolicy.newWindowDays,
      sleeping_after_days: effectivePolicy.sleepingAfterDays,
      gone_after_days: effectivePolicy.goneAfterDays,
      retention_risk_window_days: effectivePolicy.retentionRiskWindowDays
    }
  };
}

function resolveLifecycleStatus({ daysSinceRegistration, daysSinceLastActivity, facts, policy }) {
  if (!facts.has_commercial_or_cart_activity && daysSinceRegistration !== null && daysSinceRegistration <= policy.newWindowDays) {
    return "new";
  }

  if (daysSinceLastActivity === null) {
    return "gone";
  }

  if (daysSinceLastActivity <= policy.sleepingAfterDays) {
    return "active";
  }

  if (daysSinceLastActivity <= policy.goneAfterDays) {
    return "sleeping";
  }

  return "gone";
}

function buildLifecycleFacts({ customer, data, tenantId, asOfTime }) {
  const facts = {
    registered_at: normalizePastIso(customer.created_at, asOfTime),
    last_activity: null,
    last_activity_at: null,
    last_purchase_at: null,
    last_return_at: null,
    last_cart_activity_at: null,
    has_commercial_or_cart_activity: false
  };

  rememberActivity(facts, {
    type: "registration",
    channel: "customer",
    occurred_at: facts.registered_at,
    source_ref: customer.id
  }, asOfTime);

  rememberProfileActivity(facts, customer.last_activity, asOfTime);
  rememberTransactionFacts(facts, data.transactions || [], customer.id, tenantId, asOfTime);
  rememberEventFacts(facts, collectSourceEvents(data), customer.id, tenantId, asOfTime);

  return facts;
}

function rememberProfileActivity(facts, activity, asOfTime) {
  if (!activity?.occurred_at || !lifecycleActivityTypes.has(String(activity.type || "").toLowerCase())) {
    return;
  }

  const normalizedActivity = {
    type: normalizeActivityType(activity.type),
    channel: activity.channel || null,
    occurred_at: activity.occurred_at,
    source_ref: activity.source_ref || null
  };
  rememberActivity(facts, normalizedActivity, asOfTime);
  rememberTypedActivity(facts, normalizedActivity);
}

function rememberTransactionFacts(facts, transactions, customerId, tenantId, asOfTime) {
  for (const transaction of transactions) {
    if (
      transaction.customer_id !== customerId ||
      transaction.tenant_id !== tenantId ||
      transaction.status !== "completed"
    ) {
      continue;
    }

    if (transaction.type === "purchase" || transaction.type === "exchange") {
      const activity = transactionActivity(transaction, "purchase");
      rememberActivity(facts, activity, asOfTime);
      rememberTypedActivity(facts, activity);
    }

    if (transaction.type === "return") {
      const activity = transactionActivity(transaction, "return");
      rememberActivity(facts, activity, asOfTime);
      rememberTypedActivity(facts, activity);
    }
  }
}

function rememberEventFacts(facts, events, customerId, tenantId, asOfTime) {
  for (const event of events) {
    if (event.tenant_id !== tenantId || String(event.event_type || "").startsWith("marketing.lifecycle.")) {
      continue;
    }

    if (registrationEventTypes.has(event.event_type) && event.payload?.customer_id === customerId) {
      const activity = {
        type: "registration",
        channel: event.payload.registration_channel || null,
        occurred_at: event.occurred_at,
        source_ref: event.aggregate_id
      };
      facts.registered_at = minIso(facts.registered_at, activity.occurred_at, asOfTime);
      rememberActivity(facts, activity, asOfTime);
      continue;
    }

    if (purchaseEventTypes.has(event.event_type) && event.payload?.customer_id === customerId) {
      const activity = eventActivity(event, "purchase", event.payload.occurred_at || event.occurred_at);
      rememberActivity(facts, activity, asOfTime);
      rememberTypedActivity(facts, activity);
      continue;
    }

    if (returnEventTypes.has(event.event_type) && event.payload?.customer_id === customerId) {
      const activity = eventActivity(event, "return", event.payload.occurred_at || event.occurred_at);
      rememberActivity(facts, activity, asOfTime);
      rememberTypedActivity(facts, activity);
      continue;
    }

    if (cartActivityEventTypes.has(event.event_type) && event.payload?.customer_id === customerId) {
      const activity = eventActivity(
        event,
        "cart",
        event.payload.last_activity_at || event.payload.abandoned_at || event.occurred_at
      );
      rememberActivity(facts, activity, asOfTime);
      rememberTypedActivity(facts, activity);
    }
  }
}

function rememberTypedActivity(facts, activity) {
  if (activity.type === "purchase") {
    facts.last_purchase_at = maxIso(facts.last_purchase_at, activity.occurred_at);
    facts.has_commercial_or_cart_activity = true;
  }

  if (activity.type === "return") {
    facts.last_return_at = maxIso(facts.last_return_at, activity.occurred_at);
    facts.has_commercial_or_cart_activity = true;
  }

  if (activity.type === "cart") {
    facts.last_cart_activity_at = maxIso(facts.last_cart_activity_at, activity.occurred_at);
    facts.has_commercial_or_cart_activity = true;
  }
}

function rememberActivity(facts, activity, asOfTime) {
  if (!activity?.occurred_at || !isPastOrPresent(activity.occurred_at, asOfTime)) {
    return;
  }

  if (!facts.last_activity_at || Date.parse(activity.occurred_at) > Date.parse(facts.last_activity_at)) {
    facts.last_activity = activity;
    facts.last_activity_at = activity.occurred_at;
  }
}

function evaluateRetentionRisk({ customer, data, asOfTime, policy }) {
  const account = (data.loyalty_accounts || []).find(
    (candidate) => candidate.customer_id === customer.id && candidate.tenant_id === customer.tenant_id
  );

  if (!account || account.status !== "active") {
    return noRetentionRisk();
  }

  const gapAmount = account.retention_gap_amount?.amount ?? "0.00";
  const gap = Number.parseFloat(gapAmount);
  const validUntilTime = Date.parse(account.tier_valid_until || "");
  const daysUntilRecalculation = Number.isFinite(validUntilTime)
    ? Math.ceil((validUntilTime - asOfTime) / dayMs)
    : null;
  const atRisk = gap > 0 && daysUntilRecalculation !== null && daysUntilRecalculation >= 0 &&
    daysUntilRecalculation <= policy.retentionRiskWindowDays;

  if (!atRisk) {
    return noRetentionRisk({
      loyalty_account_id: account.id,
      retention_gap_amount: normalizeMoneyString(gapAmount),
      currency: account.retention_gap_amount?.currency || account.annual_eligible_spend?.currency || null,
      days_until_recalculation: daysUntilRecalculation
    });
  }

  return {
    at_risk: true,
    risk_level: daysUntilRecalculation <= 7 ? "high" : "medium",
    loyalty_account_id: account.id,
    current_tier_code: account.tier_code || null,
    current_discount_percent: account.discount_percent || account.current_discount_percent || null,
    projected_tier_code: account.projected_tier_code || null,
    projected_discount_percent: account.projected_discount_percent || null,
    retention_gap_amount: normalizeMoneyString(gapAmount),
    currency: account.retention_gap_amount?.currency || account.annual_eligible_spend?.currency || null,
    days_until_recalculation: daysUntilRecalculation
  };
}

function recommendNextAction({ lifecycleStatus, facts, retentionRisk, asOfTime }) {
  if (retentionRisk.at_risk) {
    return {
      code: "retain_tier_incentive",
      priority: "high",
      reason: "loyalty_retention_gap"
    };
  }

  if (facts.last_activity?.type === "return" && daysSince(facts.last_return_at, asOfTime) <= 30) {
    return {
      code: "service_recovery",
      priority: "high",
      reason: "recent_return"
    };
  }

  if (facts.last_activity?.type === "cart" && daysSince(facts.last_cart_activity_at, asOfTime) <= 7) {
    return {
      code: "cart_recovery",
      priority: "medium",
      reason: "recent_cart_activity"
    };
  }

  if (lifecycleStatus === "new") {
    return {
      code: "welcome_journey",
      priority: "medium",
      reason: "recent_registration"
    };
  }

  if (lifecycleStatus === "active") {
    return {
      code: facts.last_purchase_at ? "cross_sell" : "engagement_nurture",
      priority: "normal",
      reason: facts.last_purchase_at ? "recent_purchase" : "recent_activity"
    };
  }

  if (lifecycleStatus === "sleeping") {
    return {
      code: "reactivation_offer",
      priority: "medium",
      reason: "activity_older_than_90_days"
    };
  }

  return {
    code: "winback_offer",
    priority: "high",
    reason: "activity_older_than_180_days"
  };
}

function collectSourceEvents(data) {
  return Object.entries(data || {})
    .filter(([key, value]) => key.endsWith("_events") && key !== "lifecycle_events" && Array.isArray(value))
    .flatMap(([, value]) => value);
}

function transactionActivity(transaction, type) {
  return {
    type,
    channel: transaction.channel || null,
    occurred_at: transaction.occurred_at,
    source_ref: transaction.id
  };
}

function eventActivity(event, type, occurredAt) {
  return {
    type,
    channel: event.payload?.channel || event.metadata?.source_system || null,
    occurred_at: occurredAt,
    source_ref: event.aggregate_id
  };
}

function normalizeActivityType(type) {
  const normalized = String(type || "").toLowerCase();
  if (normalized.startsWith("cart")) {
    return "cart";
  }
  if (normalized === "registered") {
    return "registration";
  }
  return normalized;
}

function daysSince(value, asOfTime) {
  const time = Date.parse(value || "");
  if (!Number.isFinite(time) || time > asOfTime) {
    return null;
  }
  return Math.max(0, Math.floor((asOfTime - time) / dayMs));
}

function isPastOrPresent(value, asOfTime) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) && time <= asOfTime;
}

function normalizePastIso(value, asOfTime) {
  return isPastOrPresent(value, asOfTime) ? value : null;
}

function maxIso(left, right) {
  if (!left) {
    return right || null;
  }
  if (!right) {
    return left;
  }
  return Date.parse(right) > Date.parse(left) ? right : left;
}

function minIso(left, right, asOfTime) {
  if (!isPastOrPresent(right, asOfTime)) {
    return left || null;
  }
  if (!left) {
    return right;
  }
  return Date.parse(right) < Date.parse(left) ? right : left;
}

function noRetentionRisk(overrides = {}) {
  return {
    at_risk: false,
    risk_level: "none",
    loyalty_account_id: overrides.loyalty_account_id || null,
    current_tier_code: null,
    current_discount_percent: null,
    projected_tier_code: null,
    projected_discount_percent: null,
    retention_gap_amount: overrides.retention_gap_amount || "0.00",
    currency: overrides.currency || null,
    days_until_recalculation: overrides.days_until_recalculation ?? null
  };
}

function normalizeMoneyString(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}
