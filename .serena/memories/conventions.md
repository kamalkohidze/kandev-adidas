# Conventions

- Keep bounded-context ownership strict. Modules read canonical objects and write only their own arrays/events unless docs say otherwise.
- API route modules expose `register*Routes(route, data = createSeedData())`; handlers use `createJsonResponse`, `createValidationResponse`, `createNotFoundResponse`.
- Tenant context comes from `request.tenantId`; do not trust tenant ids from request body for scoped APIs.
- Services return `{ ok: false, validationDetails }` for validation errors and `null` for not found where existing routes expect 404.
- Event envelopes follow `docs/events.md`: `event_id`, `event_type`, `tenant_id`, `correlation_id`, `idempotency_key`, `partition_key`, `payload`, `metadata`.
- Tests use `node:assert/strict`, `node:test`, `createSeedData()`, and direct service/API calls through `createApp({ data })`.