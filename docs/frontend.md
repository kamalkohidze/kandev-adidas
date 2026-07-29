# Frontend Screen Index

The native ESM frontend in `public/**` covers:

- Overview: `/api/v1/health`, `/api/v1/modules`
- Customer 360: `/api/v1/me/profile`
- Catalog/Inventory: `/api/v1/catalog/products`, `/api/v1/catalog/variants/*`, `/api/v1/catalog/inventory`
- Recommendations: `/api/v1/customers/*/recommendations`, `/api/v1/recommendations/segments/*`
- POS/Loyalty: `/api/v1/pos/discounts/evaluate`, `/api/v1/pos/transactions`
- Promotions: `/api/v1/promotions/coupons*`
- Segments/Lifecycle/Cross-sell: `/api/v1/marketing/segments*`, `/api/v1/marketing/lifecycle*`, `/api/v1/marketing/cross-sell*`
- Campaigns/Automation/Content: `/api/v1/marketing/workflows*`, `/api/v1/marketing/triggers*`, `/api/v1/marketing/content/templates*`
- Delivery/Messages: `/api/v1/marketing/delivery/enqueue`, `/api/v1/messages/send`, `/api/v1/marketing/delivery/process`, `/api/v1/marketing/delivery/requests/*`, `/api/v1/messages/provider-receipts/*`

Delivery request lookup currently exposes the normalized request record from the backend. The UI renders deliveries, attempts, and event arrays when present in the response, but does not invent those fields when the endpoint returns only the request.
