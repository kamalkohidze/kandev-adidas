import assert from "node:assert/strict";
import test from "node:test";
import { createTransactionLedger } from "../src/modules/transactions/ledger/repository.js";
import { createApp } from "../src/platform/app.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const customerId = "11111111-1111-4111-8111-111111111111";

function createLedgerData() {
  return {
    customers: [
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
    ],
    identities: [],
    loyalty_accounts: [],
    wallet_cards: [],
    transactions: [],
    transaction_events: []
  };
}

function transactionPayload(overrides = {}) {
  const type = overrides.type || "purchase";
  const external = overrides.external_transaction_id || `EXT-${type}-001`;

  return {
    tenant_id: tenantId,
    type,
    status: "completed",
    customer_id: Object.hasOwn(overrides, "customer_id") ? overrides.customer_id : customerId,
    omnichannel_identity: overrides.omnichannel_identity || { type: "wallet_barcode", value: "980124000001" },
    store_id: "55555555-5555-4555-8555-555555555555",
    channel: "pos",
    source_system: "pos-test",
    external_transaction_id: external,
    fiscal_receipt_id: `FISCAL-${external}`,
    original_transaction_id: overrides.original_transaction_id || null,
    business_date: overrides.business_date || "2026-07-20",
    occurred_at: overrides.occurred_at || "2026-07-20T12:00:00+05:00",
    currency: "KZT",
    totals: {
      gross_amount: overrides.gross_amount || overrides.net_amount || "100.00",
      discount_amount: "0.00",
      loyalty_discount_amount: "0.00",
      promo_discount_amount: "0.00",
      tax_amount: "0.00",
      net_amount: overrides.net_amount || "100.00"
    },
    payment_methods: [{ type: "cash", amount: overrides.net_amount || "100.00", provider_ref: null }],
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
        unit_price: { amount: overrides.net_amount || "100.00", currency: "KZT" },
        gross_amount: overrides.gross_amount || overrides.net_amount || "100.00",
        discount_amount: "0.00",
        net_amount: overrides.net_amount || "100.00",
        loyalty_eligible_amount: overrides.loyalty_eligible_amount || overrides.net_amount || "100.00",
        tax_amount: "0.00",
        applied_discounts: [],
        attributes: { sport_tags: ["running"] }
      }
    ]
  };
}

test("transactions ledger ingests idempotently by tenant, source system and external transaction id", () => {
  const data = createLedgerData();
  const ledger = createTransactionLedger(data);
  const first = ledger.ingestTransaction(transactionPayload(), { idempotencyKey: "idem-1" });
  const second = ledger.ingestTransaction(
    transactionPayload({ net_amount: "999.00", loyalty_eligible_amount: "999.00" }),
    { idempotencyKey: "idem-2" }
  );

  assert.equal(first.ok, true);
  assert.equal(first.created, true);
  assert.equal(second.ok, true);
  assert.equal(second.created, false);
  assert.equal(second.transaction.id, first.transaction.id);
  assert.equal(data.transactions.length, 1);
  assert.equal(data.transaction_events.length, 1);
  assert.equal(second.transaction.totals.net_amount, "100.00");
});

test("return transactions reduce rolling annual spend by eligible net amount", () => {
  const data = createLedgerData();
  const ledger = createTransactionLedger(data);
  const purchase = ledger.ingestTransaction(transactionPayload({ net_amount: "100.00", loyalty_eligible_amount: "90.00" }));
  ledger.ingestTransaction(
    transactionPayload({
      type: "return",
      external_transaction_id: "EXT-return-001",
      original_transaction_id: purchase.transaction.id,
      occurred_at: "2026-07-21T12:00:00+05:00",
      business_date: "2026-07-21",
      net_amount: "40.00",
      loyalty_eligible_amount: "40.00"
    })
  );

  const annualSpend = ledger.calculateRollingAnnualSpend({
    customerId,
    tenantId,
    currency: "KZT",
    asOf: "2026-07-21T12:00:00+05:00"
  });

  assert.deepEqual(annualSpend, {
    amount: "50.00",
    currency: "KZT",
    rolling_window_days: 365
  });
  assert.equal(data.customers[0].annual_spend.amount, "50.00");
});

test("unknown customer transaction is accepted when omnichannel_identity is present", () => {
  const data = createLedgerData();
  const ledger = createTransactionLedger(data);
  const result = ledger.ingestTransaction(
    transactionPayload({
      customer_id: null,
      omnichannel_identity: { type: "email", value: "guest@example.com" },
      external_transaction_id: "EXT-guest-001"
    })
  );

  assert.equal(result.ok, true);
  assert.equal(result.transaction.customer_id, null);
  assert.deepEqual(result.transaction.omnichannel_identity, { type: "email", value: "guest@example.com" });
  assert.equal(result.annual_spend, null);
  assert.equal(result.events[0].event_type, "transaction.purchase.created");
  assert.equal(result.events[0].payload.customer_id, null);
});

test("POS transaction API returns canonical transaction event names", async () => {
  const app = createApp();
  const purchaseResponse = await app.handle("POST", "/api/v1/pos/transactions", {
    headers: {
      "Idempotency-Key": "api-purchase-1",
      "X-Correlation-Id": "corr-api-purchase-1",
      "Accept-Language": "KZ"
    },
    body: transactionPayload({ external_transaction_id: "API-purchase-001", net_amount: "120.00" })
  });
  const purchaseBody = JSON.parse(purchaseResponse.body);

  assert.equal(purchaseResponse.status, 201);
  assert.deepEqual(purchaseBody.events, ["transaction.purchase.created"]);

  const returnResponse = await app.handle("POST", "/api/v1/pos/transactions", {
    headers: {
      "Idempotency-Key": "api-return-1",
      "X-Correlation-Id": "corr-api-return-1",
      "Accept-Language": "ru"
    },
    body: transactionPayload({
      type: "return",
      external_transaction_id: "API-return-001",
      original_transaction_id: purchaseBody.transaction_id,
      occurred_at: "2026-07-22T12:00:00+05:00",
      business_date: "2026-07-22",
      net_amount: "20.00"
    })
  });
  const returnBody = JSON.parse(returnResponse.body);

  assert.equal(returnResponse.status, 201);
  assert.deepEqual(returnBody.events, ["transaction.return.created"]);

  const duplicateResponse = await app.handle("POST", "/api/v1/pos/transactions", {
    headers: {
      "Idempotency-Key": "api-purchase-duplicate",
      "X-Correlation-Id": "corr-api-purchase-duplicate"
    },
    body: transactionPayload({ external_transaction_id: "API-purchase-001", net_amount: "999.00" })
  });
  const duplicateBody = JSON.parse(duplicateResponse.body);

  assert.equal(duplicateResponse.status, 200);
  assert.equal(duplicateBody.idempotent, true);
  assert.equal(duplicateBody.transaction_id, purchaseBody.transaction_id);
  assert.deepEqual(duplicateBody.events, ["transaction.purchase.created"]);
});

test("POS transaction API returns validation errors for invalid canonicalized quantity and amounts", async () => {
  const app = createApp();
  const invalidQuantity = transactionPayload({ external_transaction_id: "API-invalid-quantity-001" });
  invalidQuantity.lines[0].quantity = "bad";

  const quantityResponse = await app.handle("POST", "/api/v1/pos/transactions", {
    headers: {
      "Idempotency-Key": "api-invalid-quantity-1"
    },
    body: invalidQuantity
  });
  const quantityBody = JSON.parse(quantityResponse.body);

  assert.equal(quantityResponse.status, 400);
  assert.equal(quantityBody.error.code, "validation_error");
  assert.deepEqual(quantityBody.error.details[0], {
    field: "lines.0.quantity",
    reason: "quantity_decimal_string_required"
  });

  const invalidPayment = transactionPayload({ external_transaction_id: "API-invalid-payment-001" });
  invalidPayment.payment_methods[0].amount = "bad";

  const paymentResponse = await app.handle("POST", "/api/v1/pos/transactions", {
    headers: {
      "Idempotency-Key": "api-invalid-payment-1"
    },
    body: invalidPayment
  });
  const paymentBody = JSON.parse(paymentResponse.body);

  assert.equal(paymentResponse.status, 400);
  assert.equal(paymentBody.error.code, "validation_error");
  assert.deepEqual(paymentBody.error.details[0], {
    field: "payment_methods.0.amount",
    reason: "money_decimal_string_required"
  });
});
