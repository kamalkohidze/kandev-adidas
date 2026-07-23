import assert from "node:assert/strict";
import test from "node:test";
import { evaluateLoyaltyDiscount } from "../src/modules/loyalty/discount-rules/evaluator.js";
import { recalculateCustomerLoyalty, runDailyLoyaltyAudit } from "../src/modules/loyalty/jobs/recalculation.js";
import { evaluateTier } from "../src/modules/loyalty/tiers/evaluator.js";
import { createTransactionLedger } from "../src/modules/transactions/ledger/repository.js";
import { createApp } from "../src/platform/app.js";
import { createSeedData } from "../src/platform/seed-data.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const customerId = "11111111-1111-4111-8111-111111111111";

test("loyalty tier thresholds come from configurable rules", () => {
  const rules = createSeedData().loyalty_tier_rules;

  assert.equal(evaluateTier({ annualSpend: { amount: "0.00", currency: "KZT" }, rules }).discount_percent, "0.00");
  assert.equal(evaluateTier({ annualSpend: { amount: "50000.00", currency: "KZT" }, rules }).discount_percent, "5.00");
  assert.equal(evaluateTier({ annualSpend: { amount: "149999.99", currency: "KZT" }, rules }).tier_code, "bronze");
  assert.equal(evaluateTier({ annualSpend: { amount: "150000.00", currency: "KZT" }, rules }).discount_percent, "10.00");
  assert.equal(evaluateTier({ annualSpend: { amount: "350000.00", currency: "KZT" }, rules }).discount_percent, "15.00");
});

test("daily loyalty audit recalculates tier after spend change and return", () => {
  const data = createLoyaltyData();
  const ledger = createTransactionLedger(data);

  ledger.ingestTransaction(transactionPayload({ net_amount: "160000.00", external_transaction_id: "LOY-PURCHASE-001" }));
  const firstAudit = runDailyLoyaltyAudit(data, {
    asOf: "2026-07-21T12:00:00+05:00",
    tenantId,
    transactionLedger: ledger
  });

  assert.equal(firstAudit.recalculated[0].tier_code, "silver");
  assert.equal(firstAudit.recalculated[0].discount_percent, "10.00");
  assert.deepEqual(firstAudit.events.map((event) => event.event_type), ["loyalty.tier.changed"]);

  ledger.ingestTransaction(
    transactionPayload({
      type: "return",
      net_amount: "20000.00",
      external_transaction_id: "LOY-RETURN-001",
      occurred_at: "2026-07-22T12:00:00+05:00",
      business_date: "2026-07-22"
    })
  );
  const secondAudit = runDailyLoyaltyAudit(data, {
    asOf: "2026-07-23T12:00:00+05:00",
    tenantId,
    transactionLedger: ledger
  });

  assert.equal(secondAudit.recalculated[0].annual_eligible_spend.amount, "140000.00");
  assert.equal(secondAudit.recalculated[0].tier_code, "bronze");
  assert.equal(secondAudit.recalculated[0].discount_percent, "5.00");
  assert.equal(secondAudit.events[0].event_type, "loyalty.tier.changed");
  assert.equal(data.loyalty_accounts[0].current_discount_percent, "5.00");
});

test("customer loyalty recalculation only mutates requested customer", () => {
  const data = createLoyaltyData();
  const secondCustomerId = "22222222-2222-4222-8222-222222222222";
  data.customers.push({
    ...data.customers[0],
    id: secondCustomerId,
    annual_spend: {
      amount: "0.00",
      currency: "KZT",
      rolling_window_days: 365
    }
  });

  const result = recalculateCustomerLoyalty(data, {
    customerId,
    tenantId,
    asOf: "2026-07-23T12:00:00+05:00"
  });

  assert.equal(result.customer_id, customerId);
  assert.equal(data.loyalty_accounts.length, 1);
  assert.equal(data.loyalty_accounts[0].customer_id, customerId);
  assert.equal(data.loyalty_accounts.some((account) => account.customer_id === secondCustomerId), false);
});

test("discount rules skip products with loyalty_discount_allowed=false", () => {
  const data = createLoyaltyDataWithGoldAccount();
  const result = evaluateLoyaltyDiscount(data, {
    customer_id: customerId,
    cart: {
      currency: "KZT",
      items: [
        { sku: "RUN-SHOE-001-UK10", barcode: "4870000000012", quantity: "1", unit_price: "1000.00" },
        { sku: "SALE-JACKET-001-M", barcode: "4870000000013", quantity: "1", unit_price: "1000.00" }
      ]
    }
  });

  assert.equal(result.discount_percent, "15.00");
  assert.equal(result.lines[0].discount_amount, "150.00");
  assert.equal(result.lines[1].loyalty_discount_allowed, false);
  assert.equal(result.lines[1].discount_amount, "0.00");
  assert.equal(result.discount_amount, "150.00");
  assert.equal(result.warnings[0].code, "loyalty_discount_not_allowed_for_product");
  assert.equal(result.events[0].event_type, "loyalty.discount.evaluated");
});

test("discount policy lookup is isolated by tenant", () => {
  const data = createLoyaltyDataWithGoldAccount();
  data.products.unshift({
    ...data.products[1],
    id: "other-tenant-product",
    tenant_id: "99999999-9999-4999-8999-999999999999",
    sku: "RUN-SHOE-001"
  });
  data.product_variants.unshift({
    ...data.product_variants[1],
    id: "other-tenant-variant",
    tenant_id: "99999999-9999-4999-8999-999999999999",
    product_id: "other-tenant-product",
    variant_sku: "RUN-SHOE-001-UK10",
    barcode: "4870000000012"
  });

  const result = evaluateLoyaltyDiscount(data, {
    customer_id: customerId,
    cart: {
      currency: "KZT",
      items: [{ sku: "RUN-SHOE-001-UK10", barcode: "4870000000012", quantity: "1", unit_price: "1000.00" }]
    }
  });

  assert.equal(result.lines[0].product_id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1");
  assert.equal(result.lines[0].product_variant_id, "88888888-8888-4888-8888-888888888888");
  assert.equal(result.lines[0].loyalty_discount_allowed, true);
  assert.equal(result.lines[0].discount_amount, "150.00");
});

test("trusted tenant context wins over request tenant_id in discount evaluation", () => {
  const data = createLoyaltyDataWithGoldAccount();
  const result = evaluateLoyaltyDiscount(
    data,
    {
      tenant_id: "99999999-9999-4999-8999-999999999999",
      customer_id: customerId,
      cart: {
        currency: "KZT",
        items: [{ sku: "RUN-SHOE-001-UK10", barcode: "4870000000012", quantity: "1", unit_price: "1000.00" }]
      }
    },
    { tenantId }
  );

  assert.equal(result.discount_percent, "15.00");
  assert.equal(result.lines[0].product_id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1");
  assert.equal(result.lines[0].discount_amount, "150.00");
});

test("POS discount evaluate API returns contract-compatible response", async () => {
  const app = createApp();
  const response = await app.handle("POST", "/api/v1/pos/discounts/evaluate", {
    headers: {
      "X-Correlation-Id": "corr-loyalty-pos-1",
      "Accept-Language": "ru"
    },
    body: {
      store_id: "55555555-5555-4555-8555-555555555555",
      customer_id: customerId,
      cart: {
        currency: "KZT",
        items: [
          {
            sku: "RUN-SHOE-001-UK10",
            barcode: "4870000000012",
            quantity: "1",
            unit_price: "79990.00"
          }
        ]
      }
    }
  });
  const body = JSON.parse(response.body);

  assert.equal(response.status, 200);
  assert.equal(body.discount_percent, "10.00");
  assert.equal(body.discount_amount, "7999.00");
  assert.equal(body.net_amount, "71991.00");
  assert.equal(body.lines[0].loyalty_discount_allowed, true);
  assert.equal(body.lines[0].discount_amount, "7999.00");
  assert.deepEqual(body.events, ["loyalty.discount.evaluated"]);
});

test("loyalty discount is not stacked with global sale", () => {
  const data = createLoyaltyDataWithGoldAccount();
  const result = evaluateLoyaltyDiscount(data, {
    customer_id: customerId,
    cart: {
      currency: "KZT",
      items: [
        {
          sku: "RUN-SHOE-001-UK10",
          barcode: "4870000000012",
          quantity: "1",
          unit_price: "1000.00",
          applied_discounts: [{ type: "global_sale", code: "SALE-20", amount: "200.00", stackable: false }]
        }
      ]
    }
  });

  assert.equal(result.lines[0].blocked_by_global_sale, true);
  assert.equal(result.lines[0].discount_amount, "0.00");
  assert.equal(result.discount_amount, "0.00");
  assert.equal(result.net_amount, "1000.00");
  assert.equal(result.warnings[0].code, "loyalty_not_stackable_with_global_sale");
});

function createLoyaltyData() {
  const data = createSeedData();
  data.customers = [
    {
      id: customerId,
      tenant_id: tenantId,
      status: "active",
      first_name: "Alibek",
      last_name: "Seidakhmetov",
      preferred_locale: "kk",
      favorite_sports: [],
      size_profile: {
        shoe: { uk: null, us: null, eu: null, source: null },
        apparel: { top: null, bottom: null, source: null }
      },
      annual_spend: {
        amount: "0.00",
        currency: "KZT",
        rolling_window_days: 365
      },
      last_activity: {
        type: null,
        channel: null,
        occurred_at: null,
        source_ref: null
      },
      created_at: "2026-01-01T00:00:00+05:00",
      updated_at: "2026-01-01T00:00:00+05:00",
      version: 1
    }
  ];
  data.loyalty_accounts = [];
  data.transactions = [];
  data.transaction_events = [];
  data.loyalty_events = [];

  return data;
}

function createLoyaltyDataWithGoldAccount() {
  const data = createLoyaltyData();
  data.loyalty_accounts = [
    {
      id: "44444444-4444-4444-8444-444444444444",
      tenant_id: tenantId,
      customer_id: customerId,
      current_tier_id: "66666666-6666-4666-8666-666666666663",
      current_discount_percent: "15.00",
      annual_eligible_spend: {
        amount: "350000.00",
        currency: "KZT",
        window_start: "2025-07-23",
        window_end: "2026-07-23"
      },
      retention_gap_amount: { amount: "0.00", currency: "KZT" },
      status: "active",
      created_at: "2026-07-23T00:00:00+05:00",
      updated_at: "2026-07-23T00:00:00+05:00",
      version: 1
    }
  ];

  return data;
}

function transactionPayload(overrides = {}) {
  const type = overrides.type || "purchase";
  const amount = overrides.net_amount || "100.00";

  return {
    tenant_id: tenantId,
    type,
    status: "completed",
    customer_id: customerId,
    omnichannel_identity: { type: "wallet_barcode", value: "980124000001" },
    store_id: "55555555-5555-4555-8555-555555555555",
    channel: "pos",
    source_system: "loyalty-test-pos",
    external_transaction_id: overrides.external_transaction_id || `LOY-${type}-001`,
    fiscal_receipt_id: null,
    original_transaction_id: overrides.original_transaction_id || null,
    business_date: overrides.business_date || "2026-07-20",
    occurred_at: overrides.occurred_at || "2026-07-20T12:00:00+05:00",
    currency: "KZT",
    totals: {
      gross_amount: amount,
      discount_amount: "0.00",
      loyalty_discount_amount: "0.00",
      promo_discount_amount: "0.00",
      tax_amount: "0.00",
      net_amount: amount
    },
    payment_methods: [{ type: "card", amount, provider_ref: null }],
    loyalty: { tier_id: null, discount_percent: null, evaluation_id: null },
    lines: [
      {
        line_number: 1,
        product_id: null,
        product_variant_id: null,
        sku: "RUN-SHOE-001-UK10",
        barcode: "4870000000012",
        name: "Football boots",
        quantity: "1",
        unit_price: { amount, currency: "KZT" },
        gross_amount: amount,
        discount_amount: "0.00",
        net_amount: amount,
        loyalty_eligible_amount: amount,
        tax_amount: "0.00",
        applied_discounts: [],
        attributes: { sport_tags: ["football"] }
      }
    ]
  };
}
