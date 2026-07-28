# Delivery Cascade

`src/modules/marketing/delivery` implements message delivery orchestration for Marketing. It owns delivery request queue state and `MessageDelivery` runtime records, but does not call real Push, WABA, SMS, or Email providers. Real adapters stay in the provider/integrations task.

## Runtime Model

Delivery uses the canonical cascade:

```text
push -> waba -> sms -> email
```

Each enqueue creates one `delivery_requests` record and one `message_deliveries` row for the first eligible channel. Provider failure, expired receipt, or final retry failure moves the request to the next channel. Delivered/read receipts complete the request.

Owned scaffold arrays:

- `delivery_requests` for idempotent queue state;
- `message_deliveries` for canonical `MessageDelivery` records;
- `delivery_attempts` for retry history;
- `delivery_events` for `message.delivery.requested` and `message.delivery.status_changed` envelopes.

## Eligibility

Before a channel is queued, delivery checks:

- trusted tenant context;
- active customer;
- active channel consent when `data.consents` is available;
- communication locale from request, then customer preference, then `ru`;
- template render result for `tenant_id + template_code + channel`.

The current scaffold seed does not include a consent read model. When `data.consents` is absent, delivery allows the channel and records `consent_read_model_unavailable` in metadata; when `data.consents` exists, a granted active channel consent is required.

## Retry And Idempotency

`tenant_id + idempotency_key` deduplicates enqueue calls. Replays return the existing request and current delivery without creating new rows.

Queued deliveries are processed by `processDueDeliveries`. Retryable adapter failures keep the delivery queued until `next_attempt_at`; non-retryable failures or reaching `max_attempts` mark the channel `failed` and continue the cascade.

## Status Machine

`MessageDelivery.status` follows:

```text
requested -> queued -> sent -> delivered -> read
queued/sent -> failed|expired|cancelled
```

Invalid transitions are rejected by the status state machine. Provider callbacks are accepted through the service/API and emit `message.delivery.status_changed` events.

## API

```http
POST /api/v1/messages/send
POST /api/v1/messages/provider-receipts/{provider}
POST /api/v1/marketing/delivery/process
GET  /api/v1/marketing/delivery/requests/{request_id}
```

`/api/v1/messages/send` enqueues a delivery request. `/api/v1/marketing/delivery/process` runs the local deterministic adapters for scaffold tests and local development only.

