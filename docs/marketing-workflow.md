# Marketing Workflow

`src/modules/marketing/workflow` implements the executable marketing journey engine. It consumes canonical Event Model envelopes, starts idempotent journey instances, evaluates steps, delays and conditions, and writes workflow-owned state only.

## Boundaries

The module owns these bounded-context arrays when present on platform data:

- `workflow_definitions` for executable journey definitions;
- `journey_instances` for runtime instance state;
- `workflow_event_receipts` for per-definition canonical event idempotency;
- `workflow_events` for workflow-produced Event Model envelopes.

It does not create or mutate `Customer`, `Transaction`, `Product`, `ProductVariant`, or `MessageTemplate` schemas. Physical Push/WABA/SMS/Email delivery is outside this task. A `request_delivery` action records a `message.delivery.requested` event for later delivery orchestration, but does not contact providers, enqueue provider jobs, or create provider message ids.

## Workflow Definition

A definition is tenant-scoped and executable when `status = active`:

```json
{
  "code": "welcome-on-registration",
  "status": "active",
  "trigger": { "event_types": ["customer.registered"] },
  "entry_step": "send_welcome",
  "steps": [
    {
      "code": "send_welcome",
      "type": "action",
      "action": { "type": "request_delivery", "template_code": "welcome_ru", "channel": "push" },
      "next_step": "done"
    },
    { "code": "done", "type": "end" }
  ]
}
```

Supported step types:

- `condition`: evaluates a condition and routes through `next_steps.true` or `next_steps.false`.
- `delay`: moves the instance to `waiting` until `available_at`, then continues on `advance`.
- `action`: executes `request_delivery`, `generate_cross_sell_candidates`, or `noop`.
- `end`: completes the journey instance.

## Conditions

Conditions are deterministic and can be composed with `all`, `any`, and `not`. Atomic condition types are:

- `event_type_is`;
- `event_payload_equals`;
- `event_payload_exists`;
- `customer_in_segment` through `createSegmentService`;
- `lifecycle_status_is` through `createLifecycleService`;
- `recommended_action_is` through `createLifecycleService`;
- `has_cross_sell_candidate` through `createCrossSellService`.

## State Machine

Journey statuses: `running`, `waiting`, `completed`, `cancelled`, `failed`.

Step statuses: `pending`, `running`, `waiting`, `completed`, `skipped`, `failed`.

Terminal statuses do not transition further. Invalid transitions throw and fail the journey, making state errors visible in tests and API responses.

## Idempotency

Incoming event handling is idempotent by:

```text
tenant_id + workflow_definition_id + event.idempotency_key/event_id + event_type
```

The first matching active definition starts one journey instance and stores a receipt. Replaying the same canonical event returns `duplicate_count` and does not create another instance or delivery request.

## API

All endpoints require trusted tenant context from the platform.

```http
GET  /api/v1/marketing/workflows
POST /api/v1/marketing/workflows
GET  /api/v1/marketing/workflows/{workflow_code}
POST /api/v1/marketing/workflows/events
POST /api/v1/marketing/workflows/dry-run
GET  /api/v1/marketing/workflows/instances/{instance_id}
POST /api/v1/marketing/workflows/instances/{instance_id}/advance
```

`dry-run` executes against a cloned data snapshot and returns simulated instances and emitted events without mutating source data.
