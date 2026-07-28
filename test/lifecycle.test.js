import assert from "node:assert/strict";
import test from "node:test";
import { createLifecycleService } from "../src/modules/marketing/lifecycle/index.js";
import { createTransactionLedger } from "../src/modules/transactions/ledger/repository.js";
import { createApp } from "../src/platform/app.js";
import { createSeedData } from "../src/platform/seed-data.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const asOf = "2026-07-27T00:00:00+05:00";

test("lifecycle evaluator transitions customers by inactivity windows", () => {
  const data = createLifecycleData();
  const lifecycle = createLifecycleService(data);

  const states = Object.fromEntries(
    data.customers.map((customer) => [
      customer.id,
      lifecycle.getCustomerLifecycle({ tenantId, customerId: customer.id, asOf }).lifecycle_status
    ])
  );

  assert.equal(states["11111111-1111-4111-8111-111111111101"], "new");
  assert.equal(states["11111111-1111-4111-8111-111111111102"], "active");
  assert.equal(states["11111111-1111-4111-8111-111111111103"], "sleeping");
  assert.equal(states["11111111-1111-4111-8111-111111111104"], "gone");

  const sleeping = lifecycle.getCustomerLifecycle({
    tenantId,
    customerId: "11111111-1111-4111-8111-111111111103",
    asOf
  });
  assert.equal(sleeping.activity.last_type, "cart");
  assert.equal(sleeping.recommended_action.code, "reactivation_offer");
});

test("purchase reactivates a gone customer using transaction ledger events", () => {
  const customerId = "11111111-1111-4111-8111-111111111201";
  const data = createSeedData();
  data.customers = [
    customerFixture({
      id: customerId,
      created_at: "2025-01-01T00:00:00+05:00",
      last_activity: activity("purchase", "pos", "2025-12-01T00:00:00+05:00", "old-purchase")
    })
  ];
  data.transactions = [
    purchaseFixture({
      id: "33333333-3333-4333-8333-333333333201",
      customer_id: customerId,
      occurred_at: "2025-12-01T00:00:00+05:00",
      business_date: "2025-12-01"
    })
  ];
  data.transaction_events = [];
  data.lifecycle_events = [];

  const lifecycle = createLifecycleService(data);
  const beforePurchase = lifecycle.auditCustomerLifecycle({ tenantId, customerId, asOf });
  assert.equal(beforePurchase.lifecycle.lifecycle_status, "gone");

  const ledger = createTransactionLedger(data);
  const ingest = ledger.ingestTransaction(transactionPayload({
    customer_id: customerId,
    external_transaction_id: "REACTIVATE-001",
    occurred_at: "2026-07-27T09:00:00+05:00",
    business_date: "2026-07-27"
  }));
  assert.equal(ingest.created, true);
  assert.deepEqual(ingest.events.map((event) => event.event_type), ["transaction.purchase.created"]);

  const afterPurchase = lifecycle.auditCustomerLifecycle({
    tenantId,
    customerId,
    asOf: "2026-07-27T12:00:00+05:00"
  });

  assert.equal(afterPurchase.lifecycle.lifecycle_status, "active");
  assert.equal(afterPurchase.lifecycle.recommended_action.code, "cross_sell");
  assert.deepEqual(
    data.lifecycle_events
      .filter((event) => event.event_type === "marketing.lifecycle.status_changed")
      .map((event) => event.payload.to_status),
    ["gone", "active"]
  );
});

test("lifecycle audit does not publish duplicate status change events", () => {
  const customerId = "11111111-1111-4111-8111-111111111301";
  const data = createSeedData();
  data.customers = [
    customerFixture({
      id: customerId,
      created_at: "2025-01-01T00:00:00+05:00",
      last_activity: activity("purchase", "pos", "2026-03-01T00:00:00+05:00", "sleeping-purchase")
    })
  ];
  data.transactions = [
    purchaseFixture({
      id: "33333333-3333-4333-8333-333333333301",
      customer_id: customerId,
      occurred_at: "2026-03-01T00:00:00+05:00",
      business_date: "2026-03-01"
    })
  ];
  data.lifecycle_events = [];

  const lifecycle = createLifecycleService(data);
  const first = lifecycle.auditCustomerLifecycle({ tenantId, customerId, asOf });
  const second = lifecycle.auditCustomerLifecycle({ tenantId, customerId, asOf });

  assert.equal(first.events.length, 1);
  assert.equal(second.events.length, 0);
  assert.equal(data.lifecycle_events.length, 1);
  assert.equal(data.lifecycle_events[0].payload.to_status, "sleeping");
});

test("retention risk emits one marketing workflow event", () => {
  const customerId = "11111111-1111-4111-8111-111111111401";
  const data = createSeedData();
  data.customers = [
    customerFixture({
      id: customerId,
      created_at: "2025-01-01T00:00:00+05:00",
      last_activity: activity("purchase", "pos", "2026-07-20T00:00:00+05:00", "recent-purchase")
    })
  ];
  data.transactions = [
    purchaseFixture({
      id: "33333333-3333-4333-8333-333333333401",
      customer_id: customerId,
      occurred_at: "2026-07-20T00:00:00+05:00",
      business_date: "2026-07-20"
    })
  ];
  data.loyalty_accounts = [
    {
      id: "44444444-4444-4444-8444-444444444401",
      tenant_id: tenantId,
      customer_id: customerId,
      tier_code: "gold",
      tier_name: "Gold",
      discount_percent: "15.00",
      current_discount_percent: "15.00",
      tier_valid_until: "2026-08-10T00:00:00+05:00",
      annual_eligible_spend: {
        amount: "300000.00",
        currency: "KZT",
        window_start: "2025-08-11",
        window_end: "2026-08-10"
      },
      retention_gap_amount: {
        amount: "50000.00",
        currency: "KZT"
      },
      status: "active"
    }
  ];
  data.lifecycle_events = [];

  const lifecycle = createLifecycleService(data);
  const current = lifecycle.getCustomerLifecycle({ tenantId, customerId, asOf });
  assert.equal(current.retention_risk.at_risk, true);
  assert.equal(current.retention_risk.risk_level, "medium");
  assert.equal(current.recommended_action.code, "retain_tier_incentive");

  lifecycle.auditCustomerLifecycle({ tenantId, customerId, asOf });
  lifecycle.auditCustomerLifecycle({ tenantId, customerId, asOf });

  const riskEvents = data.lifecycle_events.filter(
    (event) => event.event_type === "marketing.lifecycle.retention_risk"
  );
  assert.equal(riskEvents.length, 1);
  assert.equal(riskEvents[0].payload.customer_id, customerId);
  assert.equal(riskEvents[0].payload.retention_gap_amount, "50000.00");
});

test("lifecycle API returns state and next recommended action", async () => {
  const data = createLifecycleData();
  const app = createApp({ data });
  const response = await app.handle(
    "GET",
    `/api/v1/marketing/lifecycle/11111111-1111-4111-8111-111111111102?as_of=${encodeURIComponent(asOf)}`,
    { tenantId }
  );
  const body = JSON.parse(response.body);

  assert.equal(response.status, 200);
  assert.equal(body.lifecycle_status, "active");
  assert.equal(body.recommended_action.code, "service_recovery");
  assert.equal(body.returns.days_since_last_return, 26);
});

function createLifecycleData() {
  const data = createSeedData();
  data.customers = [
    customerFixture({
      id: "11111111-1111-4111-8111-111111111101",
      created_at: "2026-07-20T00:00:00+05:00",
      last_activity: activity("registration", "web", "2026-07-20T00:00:00+05:00", "registration")
    }),
    customerFixture({
      id: "11111111-1111-4111-8111-111111111102",
      created_at: "2025-01-01T00:00:00+05:00",
      last_activity: activity("return", "pos", "2026-07-01T00:00:00+05:00", "recent-return")
    }),
    customerFixture({
      id: "11111111-1111-4111-8111-111111111103",
      created_at: "2025-01-01T00:00:00+05:00",
      last_activity: activity("purchase", "pos", "2025-12-01T00:00:00+05:00", "old-purchase")
    }),
    customerFixture({
      id: "11111111-1111-4111-8111-111111111104",
      created_at: "2025-01-01T00:00:00+05:00",
      last_activity: activity("registration", "web", "2025-01-01T00:00:00+05:00", "registration")
    })
  ];
  data.transactions = [
    returnFixture({
      id: "33333333-3333-4333-8333-333333333102",
      customer_id: "11111111-1111-4111-8111-111111111102",
      occurred_at: "2026-07-01T00:00:00+05:00",
      business_date: "2026-07-01"
    }),
    purchaseFixture({
      id: "33333333-3333-4333-8333-333333333103",
      customer_id: "11111111-1111-4111-8111-111111111103",
      occurred_at: "2025-12-01T00:00:00+05:00",
      business_date: "2025-12-01"
    })
  ];
  data.customer_events = [
    {
      event_type: "customer.registered",
      tenant_id: tenantId,
      aggregate_id: "11111111-1111-4111-8111-111111111101",
      occurred_at: "2026-07-20T00:00:00+05:00",
      payload: {
        customer_id: "11111111-1111-4111-8111-111111111101",
        registration_channel: "web"
      }
    }
  ];
  data.cart_events = [
    {
      event_type: "cart.updated",
      tenant_id: tenantId,
      aggregate_id: "cart-111111111103",
      occurred_at: "2026-03-01T00:00:00+05:00",
      payload: {
        cart_id: "cart-111111111103",
        customer_id: "11111111-1111-4111-8111-111111111103",
        channel: "mobile",
        last_activity_at: "2026-03-01T00:00:00+05:00"
      }
    }
  ];
  data.lifecycle_events = [];
  return data;
}

function customerFixture(overrides) {
  return {
    id: overrides.id,
    tenant_id: tenantId,
    status: "active",
    preferred_locale: "ru",
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
    last_activity: overrides.last_activity,
    created_at: overrides.created_at,
    updated_at: overrides.last_activity?.occurred_at || overrides.created_at,
    version: 1
  };
}

function purchaseFixture(overrides) {
  const transaction = structuredClone(createSeedData().transactions[0]);
  transaction.id = overrides.id;
  transaction.type = "purchase";
  transaction.customer_id = overrides.customer_id;
  transaction.occurred_at = overrides.occurred_at;
  transaction.business_date = overrides.business_date;
  transaction.external_transaction_id = overrides.id;
  return transaction;
}

function returnFixture(overrides) {
  const transaction = purchaseFixture(overrides);
  transaction.type = "return";
  transaction.original_transaction_id = "33333333-3333-4333-8333-333333333199";
  return transaction;
}

function transactionPayload(overrides = {}) {
  return {
    tenant_id: tenantId,
    type: "purchase",
    status: "completed",
    customer_id: overrides.customer_id,
    omnichannel_identity: { type: "wallet_barcode", value: "980124000001" },
    store_id: "55555555-5555-4555-8555-555555555555",
    channel: "pos",
    source_system: "pos-lifecycle-test",
    external_transaction_id: overrides.external_transaction_id,
    fiscal_receipt_id: `FISCAL-${overrides.external_transaction_id}`,
    original_transaction_id: null,
    business_date: overrides.business_date,
    occurred_at: overrides.occurred_at,
    currency: "KZT",
    totals: {
      gross_amount: "100.00",
      discount_amount: "0.00",
      loyalty_discount_amount: "0.00",
      promo_discount_amount: "0.00",
      tax_amount: "0.00",
      net_amount: "100.00"
    },
    payment_methods: [{ type: "cash", amount: "100.00", provider_ref: null }],
    loyalty: { tier_id: null, discount_percent: null, evaluation_id: null },
    lines: [
      {
        line_number: 1,
        product_id: null,
        product_variant_id: null,
        sku: "SKU-1",
        barcode: null,
        name: "Test SKU",
        quantity: "1",
        unit_price: { amount: "100.00", currency: "KZT" },
        gross_amount: "100.00",
        discount_amount: "0.00",
        net_amount: "100.00",
        loyalty_eligible_amount: "100.00",
        tax_amount: "0.00",
        applied_discounts: [],
        attributes: { sport_tags: ["running"] }
      }
    ]
  };
}

function activity(type, channel, occurredAt, sourceRef) {
  return {
    type,
    channel,
    occurred_at: occurredAt,
    source_ref: sourceRef
  };
}
