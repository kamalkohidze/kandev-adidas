# Loyalty

`src/modules/loyalty` implements tier calculation, POS discount evaluation, and an in-process daily recalculation job.

## Tiers

Tier rules are read from `seedData.loyalty_tier_rules`; if no rules are supplied, the module falls back to `defaultTierRules`.

Default KZT matrix:

- `bronze`: annual eligible spend from `50000.00`, discount `5.00`;
- `silver`: annual eligible spend from `150000.00`, discount `10.00`;
- `gold`: annual eligible spend from `350000.00`, discount `15.00`.

The evaluator does not hardcode thresholds. It selects the highest configured threshold matching rolling annual spend.

## Recalculation

`runDailyLoyaltyAudit(data, options)` recalculates `LoyaltyAccount.annual_eligible_spend` from the existing transaction ledger read model. It uses the same 365-day rolling window as `src/modules/transactions` and does not rewrite transactions.

When a recalculation changes tier or discount, the module appends a canonical `loyalty.tier.changed` envelope to `seedData.loyalty_events` and returns it to the caller.

## POS Discount Evaluate

`POST /api/v1/pos/discounts/evaluate` evaluates the current loyalty snapshot for POS carts.

Rules:

- loyalty discount is not stacked with line-level or cart-level `global_sale`/`sale` discounts;
- loyalty discount is not applied when canonical `Product.discount_policy.loyalty_discount_allowed` is `false`;
- product lookup uses canonical `ProductVariant` by `product_variant_id`, `sku`, or `barcode`, then resolves the canonical `Product`.

Every evaluation appends and returns a canonical `loyalty.discount.evaluated` event name.
