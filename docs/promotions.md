# Promotions

`src/modules/promotions` implements personalized time-limited coupon issuing, validation, and redemption.

## Coupon Types

- `birthday`: one-time 15% coupon, valid for 14 days from `valid_from`/`issued_at`.
- `cross_sell`: one-time 10% coupon, valid for 7 days.
- `weekly_extra`: one-time 5% coupon, valid for 7 days and allowed to stack with the current loyalty discount and sale discounts.

All coupons are personalized by `customer_id`, stored in `seedData.promotion_coupons`, and publish lifecycle events to `seedData.promotion_events`.

## Compatibility

Validation uses existing public read models only:

- `customers` for personalization and active-customer checks;
- `loyalty_accounts` plus tier rules for early access eligibility;
- `products` and `product_variants` for catalog lookup and `Product.discount_policy.personal_promo_allowed`.

Personal promotions are not stackable with loyalty discounts by default. `birthday` and `cross_sell` are also not stackable with sale/global sale lines. `weekly_extra` is explicitly stackable with loyalty and sale discounts, but still respects product-level `personal_promo_allowed=false`.

Early access is eligible for active customers whose public loyalty read model shows `gold` or at least a `15.00` discount percent. An existing customer read-model `lifecycle_status` of `early_access`/`vip` is also accepted as an explicit business override.

## API

- `POST /api/v1/promotions/coupons`: creates a coupon. Requires `Idempotency-Key`.
- `POST /api/v1/promotions/coupons/validate`: checks customer ownership, dates, one-time status, early access, sale/loyalty compatibility, and catalog product flags.
- `POST /api/v1/promotions/coupons/redeem`: validates and then redeems a one-time coupon atomically in the in-memory repository. Requires `Idempotency-Key`.

Lifecycle events:

- `promotion.coupon.issued`
- `promotion.coupon.validated`
- `promotion.coupon.validation_failed`
- `promotion.coupon.expired`
- `promotion.coupon.redeemed`
