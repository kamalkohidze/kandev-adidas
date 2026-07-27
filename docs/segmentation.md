# Segmentation

`src/modules/marketing/segments` implements marketing audience segmentation as a read model over the canonical contracts from `docs/data-contracts.md`.

## Boundaries

The module owns `Segment` definitions and criteria evaluation. It does not create a second `Customer`, `Transaction`, `Product`, or `ProductVariant` schema. Audience facts are projected at request time from:

- `Customer` fields: status, created time, preferred locale, favorite sports, size profile, annual spend, last activity;
- `Transaction` and `TransactionLine`: completed purchases and exchanges;
- `Product` and `ProductVariant`: category path, sport tags, product type, and variant size.

Preview responses return safe audience projections only. Raw phone, email, wallet barcode, device id, messenger contact, identity normalized values, payment provider refs, and transaction omnichannel identity values are not exported.

## Built-In Segments

- `new`: active customers created in the last 30 days.
- `active`: active customers with a completed purchase or exchange in the last 90 days.
- `sleeping-90-days`: active customers whose last completed purchase or exchange is older than 90 days and not older than 180 days.
- `gone-180-days`: active customers whose last completed purchase or exchange is older than 180 days or missing.
- `buyers-by-category`: active customers who bought products in `category_id` or its category path during the buyer purchase window.
- `buyers-by-sport`: active customers who bought products tagged with `sport_tag` during the buyer purchase window.
- `buyers-by-size`: active customers who bought `size_system + size_value` during the buyer purchase window or declared that size in their profile.

Purchase lifecycle windows use `as_of` when supplied; otherwise the API uses the current server timestamp. Profile updates and other non-purchase activity do not reset the `active`, `sleeping-90-days`, or `gone-180-days` purchase inactivity windows.
Buyer segments default to a 183-day purchase lookback, matching the six-month purchase filter from `SPEC.md`. The lookback is evaluated from `as_of`. Lifecycle purchase recency is tracked separately and is not truncated by this buyer window.

## API

All audience preview and count requests require trusted tenant context from the platform.

```http
GET /api/v1/marketing/segments
GET /api/v1/marketing/segments/{segment_code}/explain
GET /api/v1/marketing/segments/{segment_code}/count
GET /api/v1/marketing/segments/{segment_code}/preview
```

Supported query parameters:

- `as_of`: ISO 8601 timestamp for purchase lifecycle and buyer-window evaluation.
- `limit`: preview page size, capped at 100.
- `category_id` or `category_ids`: required by `buyers-by-category`.
- `sport_tag`, `sport_tags`, or `sport`: required by `buyers-by-sport`.
- `size_system` and `size_value`: required by `buyers-by-size`.
- `purchase_within_days`: optional positive integer override for buyer segments; defaults to `183`.

`preview` returns `count`, a limited `data` array, `matched_criteria` explanations, criteria metadata, filters, and pagination. `count` returns only the segment count and generated timestamp. `explain` describes the criteria and PII policy without evaluating audience membership.
