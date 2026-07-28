# Cross-Sell Marketing

`src/modules/marketing/cross-sell` generates campaign and journey candidates for cross-sell scenarios. It does not send messages, enqueue delivery jobs, or own communication provider orchestration.

## Boundaries

The module reads canonical data and public service contracts only:

- `Customer` and active `CustomerIdentity` for customer eligibility;
- optional `Consent` read model from `data.consents` when it is available;
- `Transaction` and `TransactionLine` for completed purchase triggers;
- `Product` and `ProductVariant` for product type and sport facts;
- `promotions.issueCoupon` for personalized `cross_sell` coupons;
- `recommendations.createRecommendationEngine` and `buildProductBlocks` for recommendation payloads.

It writes candidates to `data.cross_sell_candidates`. This is a marketing bounded-context read/write model and does not change Catalog, Transactions, or Customer schemas.

## Scenarios

- `shoe-care-after-purchase`: after a completed shoe purchase, for purchases up to 7 days old. Creates a `shoe-care` journey candidate with a `cross_sell` coupon and care/accessory recommendations.
- `running-accessories-after-14-days`: after 14 days from a completed running purchase. Creates a `running-accessories` journey candidate with a `cross_sell` coupon and running accessory recommendations.
- `shoe-replacement-after-12-months`: after 365 days from a completed shoe purchase. Creates a `shoe-replacement` journey candidate with a `cross_sell` coupon and replacement shoe recommendations.

Running accessory recommendations use `Customer.size_profile` when a recommended accessory has a specific variant size. One-size accessories are allowed without a size match. Replacement shoe recommendations stay in the source product `collection` when that field is available; if the source product has no collection, sport affinity is used as the fallback.

Every candidate is idempotent by `tenant_id + customer_id + scenario_code + source_transaction_id`, so repeated generation does not create duplicates or duplicate coupons.

## Eligibility And Consent

A customer is eligible only when:

- the customer belongs to the tenant and `status = active`;
- the customer has at least one active identity in `data.identities`;
- if `data.consents` exists, at least one of `push`, `email`, `sms`, or `waba` has a granted, unexpired consent.

When `data.consents` is not present, the candidate records `eligibility.consent.checked = false` and does not pick a delivery channel. Delivery orchestration must perform its own channel-level checks before sending.

## API

All endpoints require trusted tenant context from the platform.

```http
GET /api/v1/marketing/cross-sell/scenarios
GET /api/v1/marketing/cross-sell/candidates?customer_id=uuid&scenario_code=shoe-care-after-purchase
POST /api/v1/marketing/cross-sell/candidates
```

Generation request:

```json
{
  "as_of": "2026-07-28T00:00:00.000Z",
  "branch_id": "uuid-or-null",
  "locale": "ru",
  "scenario_codes": ["shoe-care-after-purchase"],
  "limit": 25
}
```

Generation returns created candidates, duplicate count, skipped eligibility records, coupon references, recommendation set data, and message blocks. It does not publish delivery events.
