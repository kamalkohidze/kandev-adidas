export const defaultTierRules = [
  {
    id: "loyalty-tier-rule-base-kzt",
    tier_id: "66666666-6666-4666-8666-666666666660",
    tier_code: "base",
    tier_name: "Base",
    currency: "KZT",
    threshold_amount: "0.00",
    discount_percent: "0.00",
    priority: 0
  },
  {
    id: "loyalty-tier-rule-bronze-kzt",
    tier_id: "66666666-6666-4666-8666-666666666661",
    tier_code: "bronze",
    tier_name: "Bronze",
    currency: "KZT",
    threshold_amount: "50000.00",
    discount_percent: "5.00",
    priority: 50
  },
  {
    id: "loyalty-tier-rule-silver-kzt",
    tier_id: "66666666-6666-4666-8666-666666666662",
    tier_code: "silver",
    tier_name: "Silver",
    currency: "KZT",
    threshold_amount: "150000.00",
    discount_percent: "10.00",
    priority: 150
  },
  {
    id: "loyalty-tier-rule-gold-kzt",
    tier_id: "66666666-6666-4666-8666-666666666663",
    tier_code: "gold",
    tier_name: "Gold",
    currency: "KZT",
    threshold_amount: "350000.00",
    discount_percent: "15.00",
    priority: 350
  }
];

export function getTierRules(data = {}) {
  return Array.isArray(data.loyalty_tier_rules) && data.loyalty_tier_rules.length > 0
    ? data.loyalty_tier_rules
    : defaultTierRules;
}
