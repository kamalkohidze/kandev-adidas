import { createTransactionLedger } from "../../transactions/ledger/repository.js";
import { buildTierChangedEvent } from "../events/factory.js";
import { upsertLoyaltyAccount } from "../tiers/accounts.js";

const rollingWindowDays = 365;

export function runDailyLoyaltyAudit(data, options = {}) {
  const asOf = options.asOf || new Date().toISOString();
  const tenantId = options.tenantId || null;
  const currency = options.currency || "KZT";
  const ledger = options.transactionLedger || createTransactionLedger(data);
  const eventStore = ensureArray(data, "loyalty_events");
  const window = toRollingWindowDates(asOf);
  const results = [];
  const events = [];

  for (const customer of data.customers || []) {
    if (customer.status !== "active") {
      continue;
    }
    if (tenantId && customer.tenant_id !== tenantId) {
      continue;
    }

    const annualSpend = ledger.calculateRollingAnnualSpend({
      customerId: customer.id,
      tenantId: customer.tenant_id,
      currency,
      asOf
    }) || {
      amount: "0.00",
      currency,
      rolling_window_days: rollingWindowDays
    };

    const result = upsertLoyaltyAccount({
      data,
      customer,
      annualSpend,
      windowStart: window.window_start,
      windowEnd: window.window_end,
      asOf
    });

    results.push({
      customer_id: customer.id,
      loyalty_account_id: result.account.id,
      tier_code: result.current_tier.tier_code,
      discount_percent: result.current_tier.discount_percent,
      annual_eligible_spend: result.account.annual_eligible_spend,
      tier_changed: result.tier_changed
    });

    if (result.tier_changed) {
      const event = buildTierChangedEvent({
        account: result.account,
        previousTier: result.previous_tier,
        currentTier: result.current_tier,
        annualSpend: result.account.annual_eligible_spend,
        occurredAt: asOf,
        correlationId: options.correlationId,
        causationId: options.causationId || null,
        idempotencyKey: options.idempotencyKey || `${result.account.id}:${asOf}:tier-changed`,
        locale: options.locale || null,
        producer: options.producer || "loyalty.daily-audit"
      });
      eventStore.push(event);
      events.push(event);
    }
  }

  return {
    recalculated: results,
    events,
    as_of: asOf,
    rolling_window_days: rollingWindowDays
  };
}

export function recalculateCustomerLoyalty(data, { customerId, tenantId, currency = "KZT", asOf = new Date().toISOString() } = {}) {
  const customer = (data.customers || []).find(
    (candidate) => candidate.id === customerId && (!tenantId || candidate.tenant_id === tenantId)
  );

  if (!customer) {
    return null;
  }

  const ledger = createTransactionLedger(data);
  const eventStore = ensureArray(data, "loyalty_events");
  const window = toRollingWindowDates(asOf);
  const annualSpend = ledger.calculateRollingAnnualSpend({
    customerId: customer.id,
    tenantId: customer.tenant_id,
    currency,
    asOf
  }) || {
    amount: "0.00",
    currency,
    rolling_window_days: rollingWindowDays
  };
  const result = upsertLoyaltyAccount({
    data,
    customer,
    annualSpend,
    windowStart: window.window_start,
    windowEnd: window.window_end,
    asOf
  });

  if (result.tier_changed) {
    eventStore.push(buildTierChangedEvent({
      account: result.account,
      previousTier: result.previous_tier,
      currentTier: result.current_tier,
      annualSpend: result.account.annual_eligible_spend,
      occurredAt: asOf,
      correlationId: result.account.id,
      idempotencyKey: `${result.account.id}:${asOf}:tier-changed`,
      producer: "loyalty.customer-recalculation"
    }));
  }

  return {
    customer_id: customer.id,
    loyalty_account_id: result.account.id,
    tier_code: result.current_tier.tier_code,
    discount_percent: result.current_tier.discount_percent,
    annual_eligible_spend: result.account.annual_eligible_spend,
    tier_changed: result.tier_changed
  };
}

function toRollingWindowDates(asOf) {
  const windowEnd = new Date(asOf);
  const windowStart = new Date(windowEnd.getTime() - rollingWindowDays * 24 * 60 * 60 * 1000);

  return {
    window_start: windowStart.toISOString().slice(0, 10),
    window_end: windowEnd.toISOString().slice(0, 10)
  };
}

function ensureArray(target, field) {
  if (!Array.isArray(target[field])) {
    target[field] = [];
  }

  return target[field];
}
