import { randomUUID } from "node:crypto";
import { normalizeMoney } from "../../transactions/ledger/money.js";
import { evaluateTier, findTierRuleById } from "./evaluator.js";

export function findLoyaltyAccount(data, { customerId, tenantId = null }) {
  return (data.loyalty_accounts || []).find(
    (account) => account.customer_id === customerId && (!tenantId || account.tenant_id === tenantId)
  ) || null;
}

export function getAccountTierSnapshot(data, account) {
  if (!account) {
    return {
      tier_id: null,
      tier_code: "base",
      tier_name: "Base",
      discount_percent: "0.00"
    };
  }

  const rule = findTierRuleById(data, account.current_tier_id);

  return {
    tier_id: account.current_tier_id ?? account.tier_id ?? null,
    tier_code: rule?.tier_code || account.current_tier_code || account.tier_code || "base",
    tier_name: rule?.tier_name || account.current_tier_name || account.tier_name || account.tier_code || "Base",
    discount_percent: normalizeMoney(account.current_discount_percent ?? account.discount_percent ?? "0.00")
  };
}

export function upsertLoyaltyAccount({
  data,
  customer,
  annualSpend,
  windowStart,
  windowEnd,
  asOf = new Date().toISOString()
}) {
  const accounts = ensureArray(data, "loyalty_accounts");
  const previous = findLoyaltyAccount(data, { customerId: customer.id, tenantId: customer.tenant_id });
  const previousSnapshot = getAccountTierSnapshot(data, previous);
  const tier = evaluateTier({
    annualSpend,
    currency: annualSpend?.currency || customer.annual_spend?.currency || "KZT",
    rules: data.loyalty_tier_rules
  });

  const base = previous || {
    id: randomUUID(),
    tenant_id: customer.tenant_id,
    customer_id: customer.id,
    status: "active",
    created_at: asOf,
    version: 0
  };

  base.current_tier_id = tier.tier_id;
  base.current_discount_percent = tier.discount_percent;
  base.annual_eligible_spend = {
    amount: normalizeMoney(annualSpend?.amount ?? "0.00"),
    currency: annualSpend?.currency || tier.currency,
    window_start: windowStart,
    window_end: windowEnd
  };
  base.tier_valid_until = base.tier_valid_until ?? null;
  base.retention_gap_amount = {
    amount: "0.00",
    currency: annualSpend?.currency || tier.currency
  };
  base.status = base.status || "active";
  base.updated_at = asOf;
  base.version = (base.version || 0) + 1;

  // Read-model aliases keep existing Customer 360 consumers stable while the
  // canonical LoyaltyAccount fields above remain the write shape.
  base.current_tier_code = tier.tier_code;
  base.current_tier_name = tier.tier_name;
  base.tier_code = tier.tier_code;
  base.tier_name = tier.tier_name;
  base.discount_percent = tier.discount_percent;

  if (!previous) {
    accounts.push(base);
  }

  return {
    account: base,
    previous_tier: previousSnapshot,
    current_tier: getAccountTierSnapshot(data, base),
    tier_changed:
      previousSnapshot.tier_id !== base.current_tier_id ||
      previousSnapshot.discount_percent !== base.current_discount_percent
  };
}

function ensureArray(target, field) {
  if (!Array.isArray(target[field])) {
    target[field] = [];
  }

  return target[field];
}
