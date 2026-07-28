# Marketing Lifecycle

`src/modules/marketing/lifecycle` evaluates customer lifecycle state for marketing workflows without owning or mutating canonical Customer or Transaction schemas.

## Boundaries

Lifecycle reads existing projections and event streams:

- `Customer`: `id`, `tenant_id`, `status`, `created_at`, `preferred_locale`, `last_activity`;
- `Transaction`: completed `purchase`, `exchange`, and `return` records;
- event arrays ending in `_events`: `customer.registered`, `transaction.purchase.created`, `transaction.return.created`, `cart.updated`, and `cart.abandoned`;
- `LoyaltyAccount` snapshot for retention risk only.

The module writes only marketing workflow events to `lifecycle_events`. It does not send push, WABA, SMS, email, coupons, or message deliveries.

## States

The evaluator returns one of:

- `new`: registered within 30 days and no purchase, return, or cart activity is known;
- `active`: latest lifecycle activity is within 90 days;
- `sleeping`: latest lifecycle activity is older than 90 days and not older than 180 days;
- `gone`: latest lifecycle activity is older than 180 days or missing.

Lifecycle activity is normalized from registration, purchase/exchange, return, cart activity, and supported `Customer.last_activity` fallback values. Future-dated activity is ignored relative to `as_of`.

## Recommended Action

`getCustomerLifecycle` returns a `recommended_action` read model for marketing orchestration:

- `welcome_journey` for new customers;
- `cross_sell` for active customers with recent purchase;
- `engagement_nurture` for active customers with non-purchase activity;
- `cart_recovery` for recent cart activity;
- `service_recovery` for recent returns;
- `reactivation_offer` for sleeping customers;
- `winback_offer` for gone customers;
- `retain_tier_incentive` when retention risk is present.

These are recommendations only. Message sending and template selection belong to later marketing workflow tasks.

## Retention Risk

Retention risk is derived from the current `LoyaltyAccount` snapshot:

- account status is `active`;
- `retention_gap_amount.amount > 0`;
- `tier_valid_until` is within the retention risk window, default 30 days from `as_of`.

The lifecycle module does not calculate loyalty tiers or retention gaps. It consumes the loyalty snapshot and emits a marketing event when the customer is currently at risk.

## API

```http
GET /api/v1/marketing/lifecycle/{customer_id}?as_of=2026-07-27T00:00:00Z
POST /api/v1/marketing/lifecycle/audit
```

Both endpoints require trusted tenant context from the platform. `GET` returns the current lifecycle read model and next recommended action. `POST` audits one customer when `body.customer_id` is supplied, otherwise it audits the tenant customer list.

## Events

Lifecycle publishes Event Model-compatible envelopes to `lifecycle_events`:

- `marketing.lifecycle.status_changed`;
- `marketing.lifecycle.retention_risk`.

Events use `aggregate_type = customer`, `partition_key = customer_id`, and `metadata.pii = false`. Publishing is idempotent by deterministic `idempotency_key`; repeated audits for the same state transition or same daily retention risk do not create duplicates.
