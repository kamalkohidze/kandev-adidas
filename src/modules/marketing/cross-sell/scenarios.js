export const crossSellScenarios = [
  {
    code: "shoe-care-after-purchase",
    journey_code: "shoe-care",
    campaign_code: "shoe-care-coupon",
    min_days_since_purchase: 0,
    max_days_since_purchase: 7,
    coupon: true,
    recommendation_limit: 6,
    trigger_product: "shoes",
    recommendation: "shoe-care"
  },
  {
    code: "running-accessories-after-14-days",
    journey_code: "running-accessories",
    campaign_code: "running-accessories",
    min_days_since_purchase: 14,
    max_days_since_purchase: null,
    coupon: true,
    recommendation_limit: 6,
    trigger_sport: "running",
    recommendation: "running-accessories"
  },
  {
    code: "shoe-replacement-after-12-months",
    journey_code: "shoe-replacement",
    campaign_code: "shoe-replacement",
    min_days_since_purchase: 365,
    max_days_since_purchase: null,
    coupon: true,
    recommendation_limit: 6,
    trigger_product: "shoes",
    recommendation: "replacement-shoes"
  }
];

export function listCrossSellScenarios() {
  return crossSellScenarios.map((scenario) => ({ ...scenario }));
}

export function findCrossSellScenario(code) {
  return crossSellScenarios.find((scenario) => scenario.code === code) || null;
}
