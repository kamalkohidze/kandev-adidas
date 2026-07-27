export const seedData = {
  customers: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      tenant_id: "00000000-0000-4000-8000-000000000001",
      status: "active",
      first_name: "Alibek",
      last_name: "Seidakhmetov",
      preferred_locale: "kk",
      favorite_sports: ["football", "running"],
      size_profile: {
        shoe: { uk: "10", us: null, eu: "44", source: "profile" },
        apparel: { top: "M", bottom: null, source: "profile" }
      },
      annual_spend: {
        amount: "450000.00",
        currency: "KZT",
        rolling_window_days: 365
      },
      last_activity: {
        type: "purchase",
        channel: "pos",
        occurred_at: "2026-07-15T18:20:00+05:00",
        source_ref: "33333333-3333-4333-8333-333333333333"
      },
      created_at: "2026-01-10T10:00:00+05:00",
      updated_at: "2026-07-23T10:00:00+05:00",
      version: 1
    }
  ],
  identities: [
    {
      id: "22222222-2222-4222-8222-222222222221",
      tenant_id: "00000000-0000-4000-8000-000000000001",
      customer_id: "11111111-1111-4111-8111-111111111111",
      type: "phone",
      normalized_value: "+77017578320",
      source_system: "mobile-app",
      is_primary: true,
      is_verified: true,
      is_active: true,
      first_seen_at: "2026-01-10T10:00:00+05:00",
      last_seen_at: "2026-07-23T10:00:00+05:00"
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      tenant_id: "00000000-0000-4000-8000-000000000001",
      customer_id: "11111111-1111-4111-8111-111111111111",
      type: "wallet_barcode",
      normalized_value: "980124000001",
      source_system: "wallet",
      is_primary: true,
      is_verified: true,
      is_active: true,
      first_seen_at: "2026-01-10T10:00:00+05:00",
      last_seen_at: "2026-07-23T10:00:00+05:00"
    }
  ],
  loyalty_accounts: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      tenant_id: "00000000-0000-4000-8000-000000000001",
      customer_id: "11111111-1111-4111-8111-111111111111",
      current_tier_id: "66666666-6666-4666-8666-666666666662",
      current_discount_percent: "10.00",
      tier_code: "silver",
      tier_name: "Silver",
      discount_percent: "10.00",
      tier_valid_until: "2027-07-23",
      annual_eligible_spend: {
        amount: "450000.00",
        currency: "KZT",
        window_start: "2025-07-24",
        window_end: "2026-07-23"
      },
      retention_gap_amount: {
        amount: "0.00",
        currency: "KZT"
      },
      status: "active",
      created_at: "2026-01-10T10:00:00+05:00",
      updated_at: "2026-07-23T10:00:00+05:00",
      version: 1
    }
  ],
  loyalty_tier_rules: [
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
  ],
  products: [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      tenant_id: "00000000-0000-4000-8000-000000000001",
      status: "active",
      sku: "RUN-SHOE-001",
      name: { kk: null, ru: "Футбольные бутсы", en: "Football boots" },
      description: { kk: null, ru: null, en: null },
      brand: "adidas",
      category_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
      category_path: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1"],
      sport_tags: ["football"],
      product_type: "shoes",
      collection: null,
      season: null,
      attributes: {},
      discount_policy: {
        loyalty_discount_allowed: true,
        global_sale_excluded: false,
        personal_promo_allowed: true
      },
      external_refs: [],
      created_at: "2026-01-01T00:00:00+05:00",
      updated_at: "2026-01-01T00:00:00+05:00",
      version: 1
    },
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      tenant_id: "00000000-0000-4000-8000-000000000001",
      status: "active",
      sku: "SALE-JACKET-001",
      name: { kk: null, ru: "Sale jacket", en: "Sale jacket" },
      description: { kk: null, ru: null, en: null },
      brand: "adidas",
      category_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
      category_path: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2"],
      sport_tags: ["training"],
      product_type: "apparel",
      collection: null,
      season: null,
      attributes: {},
      discount_policy: {
        loyalty_discount_allowed: false,
        global_sale_excluded: false,
        personal_promo_allowed: false
      },
      external_refs: [],
      created_at: "2026-01-01T00:00:00+05:00",
      updated_at: "2026-01-01T00:00:00+05:00",
      version: 1
    }
  ],
  product_variants: [
    {
      id: "88888888-8888-4888-8888-888888888888",
      tenant_id: "00000000-0000-4000-8000-000000000001",
      product_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      variant_sku: "RUN-SHOE-001-UK10",
      barcode: "4870000000012",
      color: { code: "black", name: { kk: null, ru: "Черный", en: "Black" } },
      size: { system: "UK", value: "10" },
      price: { amount: "79990.00", currency: "KZT" },
      branch_prices: [
        {
          branch_id: "55555555-5555-4555-8555-555555555555",
          amount: "74990.00",
          currency: "KZT",
          valid_from: "2026-01-01T00:00:00+05:00",
          valid_to: null
        }
      ],
      inventory: {
        total_available: 12,
        by_branch: [
          {
            branch_id: "55555555-5555-4555-8555-555555555555",
            available: 8,
            reserved: 2
          },
          {
            branch_id: "55555555-5555-4555-8555-555555555556",
            available: 4,
            reserved: 0
          }
        ]
      },
      status: "active",
      external_refs: [],
      created_at: "2026-01-01T00:00:00+05:00",
      updated_at: "2026-01-01T00:00:00+05:00",
      version: 1
    },
    {
      id: "88888888-8888-4888-8888-888888888889",
      tenant_id: "00000000-0000-4000-8000-000000000001",
      product_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      variant_sku: "SALE-JACKET-001-M",
      barcode: "4870000000013",
      color: { code: "blue", name: { kk: null, ru: "Синий", en: "Blue" } },
      size: { system: "INT", value: "M" },
      price: { amount: "59990.00", currency: "KZT" },
      branch_prices: [],
      inventory: {
        total_available: 6,
        by_branch: [
          {
            branch_id: "55555555-5555-4555-8555-555555555555",
            available: 6,
            reserved: 1
          }
        ]
      },
      status: "active",
      external_refs: [],
      created_at: "2026-01-01T00:00:00+05:00",
      updated_at: "2026-01-01T00:00:00+05:00",
      version: 1
    }
  ],
  wallet_cards: [
    {
      customer_id: "11111111-1111-4111-8111-111111111111",
      card_number_masked: "980***",
      barcode_masked: "980124******"
    }
  ],
  transactions: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      tenant_id: "00000000-0000-4000-8000-000000000001",
      type: "purchase",
      status: "completed",
      customer_id: "11111111-1111-4111-8111-111111111111",
      omnichannel_identity: {
        type: "wallet_barcode",
        value: "980124000001"
      },
      store_id: "55555555-5555-4555-8555-555555555555",
      channel: "pos",
      source_system: "seed-pos",
      external_transaction_id: "SEED-RECEIPT-0001",
      fiscal_receipt_id: "FISCAL-SEED-0001",
      original_transaction_id: null,
      business_date: "2026-07-15",
      occurred_at: "2026-07-15T18:20:00+05:00",
      currency: "KZT",
      totals: {
        gross_amount: "79990.00",
        discount_amount: "7999.00",
        loyalty_discount_amount: "7999.00",
        promo_discount_amount: "0.00",
        tax_amount: "0.00",
        net_amount: "71991.00"
      },
      payment_methods: [
        {
          type: "card",
          amount: "71991.00",
          provider_ref: null
        }
      ],
      loyalty: {
        tier_id: "66666666-6666-4666-8666-666666666666",
        discount_percent: "10.00",
        evaluation_id: "77777777-7777-4777-8777-777777777777"
      },
      lines: [
        {
          id: "99999999-9999-4999-8999-999999999991",
          line_number: 1,
          product_id: null,
          product_variant_id: "88888888-8888-4888-8888-888888888888",
          sku: "RUN-SHOE-001-UK10",
          barcode: "4870000000012",
          name: "Football boots",
          quantity: "1",
          unit_price: {
            amount: "79990.00",
            currency: "KZT"
          },
          gross_amount: "79990.00",
          discount_amount: "7999.00",
          net_amount: "71991.00",
          loyalty_eligible_amount: "71991.00",
          tax_amount: "0.00",
          applied_discounts: [
            {
              type: "loyalty",
              code: null,
              amount: "7999.00",
              stackable: false
            }
          ],
          attributes: {
            sport_tags: ["football"]
          }
        }
      ],
      created_at: "2026-07-15T18:20:00+05:00",
      updated_at: "2026-07-15T18:20:00+05:00",
      version: 1
    }
  ],
  transaction_events: [],
  catalog_events: [],
  loyalty_events: [],
  promotion_coupons: [],
  promotion_events: []
};

export function createSeedData() {
  return structuredClone(seedData);
}
