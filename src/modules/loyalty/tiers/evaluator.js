import { compareMoney, normalizeMoney } from "../../transactions/ledger/money.js";
import { getTierRules } from "./config.js";

export function evaluateTier({ annualSpend, currency = "KZT", rules = getTierRules() }) {
  const spendAmount = normalizeMoney(annualSpend?.amount ?? annualSpend ?? "0.00");
  const spendCurrency = annualSpend?.currency || currency;
  const candidates = rules
    .filter((rule) => (rule.currency || spendCurrency) === spendCurrency)
    .map(normalizeRule)
    .sort(compareRulesDesc);

  const matched = candidates.find((rule) => compareMoney(spendAmount, rule.threshold_amount) >= 0) || candidates.at(-1);
  if (!matched) {
    throw new Error(`No loyalty tier rules configured for ${spendCurrency}`);
  }

  return {
    ...matched,
    annual_spend_amount: spendAmount,
    currency: spendCurrency
  };
}

export function findTierRuleById(data, tierId) {
  return getTierRules(data).map(normalizeRule).find((rule) => rule.tier_id === tierId) || null;
}

function normalizeRule(rule) {
  return {
    id: rule.id,
    tier_id: rule.tier_id,
    tier_code: rule.tier_code,
    tier_name: rule.tier_name || rule.tier_code,
    currency: rule.currency || "KZT",
    threshold_amount: normalizeMoney(rule.threshold_amount ?? "0.00"),
    discount_percent: normalizeMoney(rule.discount_percent ?? "0.00"),
    priority: Number.isFinite(rule.priority) ? rule.priority : 0
  };
}

function compareRulesDesc(left, right) {
  const thresholdCompare = compareMoney(right.threshold_amount, left.threshold_amount);
  if (thresholdCompare !== 0) {
    return thresholdCompare;
  }

  return right.priority - left.priority;
}
