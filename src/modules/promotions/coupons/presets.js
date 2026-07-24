export const promotionTypePresets = {
  birthday: {
    code_prefix: "BDAY",
    discount_percent: "15.00",
    valid_days: 14,
    single_use: true,
    stackable_with_loyalty: false,
    stackable_with_sale: false,
    requires_early_access: false
  },
  cross_sell: {
    code_prefix: "XSELL",
    discount_percent: "10.00",
    valid_days: 7,
    single_use: true,
    stackable_with_loyalty: false,
    stackable_with_sale: false,
    requires_early_access: false
  },
  weekly_extra: {
    code_prefix: "WEEKLY",
    discount_percent: "5.00",
    valid_days: 7,
    single_use: true,
    stackable_with_loyalty: true,
    stackable_with_sale: true,
    requires_early_access: false
  }
};

export function getPromotionPreset(type) {
  return promotionTypePresets[type] || null;
}

export function listPromotionTypes() {
  return Object.keys(promotionTypePresets);
}
