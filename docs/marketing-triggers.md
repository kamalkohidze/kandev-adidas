# Marketing Trigger Presets

`src/modules/marketing/triggers` registers executable workflow presets on top of the Marketing Workflow engine.

## Presets

- `welcome`: consumes `customer.registered`, checks `customer_id` and marketing contactability, requests `welcome_discount` through WABA, waits 3 days, then requests `welcome_brand_story` through Email.
- `birthday`: consumes `customer.birthday.due`, requires `days_before` inside `0..7`, then requests `birthday_offer`.
- `abandoned-cart`: consumes `cart.abandoned`, waits one hour, requests `abandoned_cart_push`, waits 23 more hours so the follow-up lands 24 hours after abandonment, then requests `abandoned_cart_waba`.
- `tier-retention`: consumes `loyalty.tier.retention_risk`, requires `retention_gap_amount > 0` and `days_until_recalculation <= 30`, then requests `tier_retention`.

Each preset installs a normal `WorkflowDefinition` with `status = active`. Disabling archives that workflow definition, so canonical event handling no longer starts new journeys for the preset.

## Payload Builders

Preset actions use `payload_builder.type = marketing_trigger`. The workflow engine keeps provider delivery outside scope and only appends `message.delivery.requested`.

The builder resolves:

- `locale` from `Customer.preferred_locale`, then event `payload.preferred_locale`, then event metadata/default i18n fallback;
- `channel` from active `data.consents` when available, otherwise event `eligible_channels` or `consent_summary`;
- template variables from event payload plus read-only `customers` and `loyalty_accounts`.

No Customer, Loyalty or Promotion schema is changed. Birthday payloads include the existing promotion preset values (`promotion_type = birthday`, `discount_percent = 15.00`, `expires_in_days = 14`) for downstream coupon issuance, but the trigger does not issue coupons itself.

## API

```http
GET  /api/v1/marketing/triggers/presets
POST /api/v1/marketing/triggers/presets/{preset_code}/enable
POST /api/v1/marketing/triggers/presets/{preset_code}/disable
```

All endpoints require trusted tenant context from the platform.
