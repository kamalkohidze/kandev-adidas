# Transactions

`src/modules/transactions` implements the canonical `Transaction` ingest path for POS receipts and returns.

## Ledger

The in-memory ledger is created with `createTransactionLedger(seedData)` and stores canonical transactions in `seedData.transactions`. Ingest is idempotent by this natural key:

```text
tenant_id + source_system + external_transaction_id
```

A repeated ingest with the same key returns the original transaction and its already published transaction events. It does not overwrite amounts, lines, customer references, or events.

Supported `TransactionType` values are the canonical values from `docs/data-contracts.md`:

- `purchase`: increases rolling annual spend by eligible net amount.
- `return`: decreases rolling annual spend by eligible net amount.
- `exchange`: increases rolling annual spend by eligible net amount for the accepted exchange transaction.
- `cancellation`: decreases rolling annual spend by eligible net amount.
- `adjustment`: applies the signed eligible amount from the payload.

Rolling annual spend uses the last 365 days relative to the calculation timestamp, filtered by `customer_id`, `tenant_id`, and currency. It sums `TransactionLine.loyalty_eligible_amount`; when a line omits it, the line `net_amount` is used. Loyalty tier rules are not calculated here.

Transactions may have `customer_id = null` when `omnichannel_identity.type` and `omnichannel_identity.value` are present. The module does not create or mutate `Customer` or `CustomerIdentity` records for those unknown customers.

## API

`POST /api/v1/pos/transactions` accepts the canonical `Transaction` payload. It requires `Idempotency-Key` and returns:

```json
{
  "transaction_id": "uuid",
  "customer_id": "uuid-or-null",
  "loyalty_recalculation_status": "queued",
  "annual_spend": {
    "amount": "120000.00",
    "currency": "KZT",
    "rolling_window_days": 365
  },
  "idempotent": false,
  "events": ["transaction.purchase.created"]
}
```

`GET /api/v1/customers/:customer_id/transactions` returns canonical Customer 360 purchase-history items built from `Transaction` and `TransactionLine`.

## Events

The event factory publishes event envelopes compatible with `docs/events.md` for:

- `transaction.purchase.created`
- `transaction.return.created`

`purchase`, `return`, `exchange`, `cancellation`, and `adjustment` are all persisted canonically, but only purchase and return currently have canonical event names in `docs/events.md`.

Known contract ambiguity: `docs/events.md` has `reason_code` in `transaction.return.created`, while canonical `Transaction` in `docs/data-contracts.md` has no `reason_code` field. The current implementation emits `reason_code: null` until an integration contract maps a return reason into a canonical field.
