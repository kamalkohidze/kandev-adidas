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
      loyalty_account_id: "44444444-4444-4444-8444-444444444444",
      customer_id: "11111111-1111-4111-8111-111111111111",
      tier_code: "silver",
      tier_name: "Silver",
      discount_percent: "10.00",
      tier_valid_until: "2027-07-23",
      annual_eligible_spend: {
        amount: "450000.00",
        currency: "KZT",
        window_start: "2025-07-24",
        window_end: "2026-07-23"
      }
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
      customer_id: "11111111-1111-4111-8111-111111111111",
      type: "purchase",
      status: "completed",
      channel: "pos",
      store_id: "55555555-5555-4555-8555-555555555555",
      business_date: "2026-07-15",
      occurred_at: "2026-07-15T18:20:00+05:00",
      currency: "KZT",
      totals: {
        gross_amount: "79990.00",
        discount_amount: "7999.00",
        loyalty_discount_amount: "7999.00",
        net_amount: "71991.00"
      },
      loyalty: {
        tier_id: "66666666-6666-4666-8666-666666666666",
        discount_percent: "10.00",
        evaluation_id: "77777777-7777-4777-8777-777777777777"
      },
      lines: [
        {
          sku: "RUN-SHOE-001-UK10",
          name: "Football boots",
          quantity: "1",
          net_amount: "71991.00",
          product_variant_id: "88888888-8888-4888-8888-888888888888"
        }
      ]
    }
  ]
};
