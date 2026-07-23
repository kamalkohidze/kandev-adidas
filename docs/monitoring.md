# Monitoring

## Назначение

Документ описывает наблюдаемость UCO CRM для API, POS discount lookup, очередей, интеграций, фоновых jobs и доставки сообщений. Метрики и логи должны использовать существующие `tenant_id`, `correlation_id`, `event_id`, `idempotency_key`, `event_type`, provider и channel из архитектурных контрактов.

Документ не вводит новые доменные сущности. Все monitoring labels должны быть техническими и не должны содержать PII.

## Общие правила observability

Каждый request, event publish, event consume, job run, provider call и webhook attempt должен иметь:

- `correlation_id`;
- `tenant_id`;
- component/service name;
- operation name;
- result: success, retry, failed, rejected, duplicate, throttled;
- latency/duration;
- error code/class без PII;
- idempotency outcome: new, duplicate, replayed, conflict, missing;
- для очередей: topic/queue, partition/shard, lag, attempt number.

PII в логах запрещены. Телефон, email, wallet barcode, provider recipient address и fiscal payload логируются только в маскированном виде или через hash/ref.

## Дашборды

Минимальный набор production dashboards:

| Dashboard | Что показывает |
| --- | --- |
| Executive SLO | availability, p95/p99 API latency, POS success rate, event lag, incident banners |
| POS checkout | lookup/evaluate latency, cache hit ratio, error rate, store-level heatmap |
| API gateway | RPS, 4xx/5xx, auth failures, rate limits, idempotency duplicates |
| Event bus/outbox | outbox age, publish lag, consumer lag, retry rate, DLQ size |
| Integrations | POS/1C/ERP/fiscal/provider health, throughput, rejects, duplicate rates |
| Message delivery | queued/sent/delivered/read/failed, provider latency, cascade fallback rates |
| Background jobs | active/running/failed jobs, duration, checkpoints, backlog recovery ETA |
| Data quality | rejected imports, schema errors, transaction-loyalty reconciliation, stale read models |
| Capacity | CPU/memory/DB connections/cache/broker partitions/worker saturation |

## API метрики

Для всех API из `docs/api-contracts.md`:

- request rate by route/method/tenant/channel;
- p50/p95/p99 latency by route/method/tenant/channel;
- 2xx/4xx/5xx count and rate;
- auth/mTLS/API key failures;
- rate limit allowed/blocked;
- idempotency key missing/duplicate/conflict;
- payload validation errors by code;
- downstream timeout count;
- response size and request body reject count.

Алерты:

- POS lookup или discount evaluate p95 выше SLO 15 минут;
- 5xx rate > 1% для P0/P1 routes 5 минут;
- idempotency missing на write route > 0 после deployment;
- рост 409/idempotency conflict выше baseline;
- auth failure spike по integration credential.

## POS discount lookup

Ключевые метрики:

- `pos_lookup_requests_total` by tenant/store/identity_type/result;
- `pos_discount_evaluate_requests_total` by tenant/store/result;
- lookup/evaluate p95/p99 latency;
- cache hit/miss/stale ratio;
- discount rule version used;
- customer identity not found rate;
- loyalty state stale age;
- fallback response count;
- DB/cache timeout count;
- store/cash_register error heatmap.

Алерты:

- p95 > 150 ms 15 минут для tenant/store group;
- cache hit ratio падает ниже agreed baseline во время пика;
- identity not found spike после POS/ERP release;
- discount evaluate timeout/error > 0.5% 10 минут;
- stale loyalty state age превышает business threshold.

## Очереди и outbox

Метрики:

- outbox unpublished count and max age;
- event publish latency by event_type/producer;
- broker produce/consume error rate;
- consumer lag by queue/topic/consumer group/partition;
- retry attempts by queue/failure_class;
- DLQ size and growth rate;
- oldest DLQ message age;
- replay throughput and replay failures;
- duplicate consume count;
- poison message detection count.

Алерты:

- outbox max age > 30 seconds для P0/P1 events;
- consumer lag растет быстрее processing rate 15 минут;
- DLQ growth > 0 для receipt ingest, loyalty recalculation или provider receipts;
- oldest DLQ message age превышает SLA разбора;
- retry storm: attempts/minute выше лимита и success rate не растет;
- partition skew: одна partition держит disproportionate lag.

## Интеграции

Для POS, 1C/ERP, fiscal KKM, WABA, SMS, Email, Push и webhooks:

- calls total by external_system/provider/operation/result;
- p95/p99 external call latency;
- timeout/5xx/4xx/rate-limit counts;
- circuit breaker state;
- quota remaining/usage, если provider отдает данные;
- import accepted/duplicate/rejected rows;
- schema validation errors by external_system;
- signature verification failures;
- last successful sync time;
- reconciliation gap: expected vs accepted records/messages.

Алерты:

- нет успешной sync за допустимое окно;
- provider 429/5xx превышает threshold;
- signature failures spike;
- rejected import rows > baseline;
- duplicates spike после смены внешней системы;
- circuit breaker open для production provider.

## Доставка сообщений

Метрики:

- delivery requested/queued/sent/delivered/read/failed/expired/cancelled by channel/provider/tenant/campaign;
- provider send latency;
- provider receipt latency: provider occurred_at to processed_at;
- cascade fallback rate by step/channel;
- consent rejection count;
- template validation failure count;
- frequency cap rejection count;
- delivery idempotency duplicate/replay count;
- campaign dispatch rate vs configured throttle;
- delivery backlog age and ETA.

Алерты:

- failed delivery rate выше baseline по provider/channel;
- receipt latency p95 превышает SLA;
- dispatch backlog ETA превышает campaign window;
- cascade fallback rate резко вырос;
- consent/template validation errors появились после campaign approval;
- provider_message_id duplicates превышают норму.

## Фоновые jobs

Метрики:

- job started/completed/failed/cancelled count by job type/tenant;
- job duration p50/p95/p99;
- active workers and queue depth;
- checkpoint age and processed item count;
- chunks succeeded/failed/retried;
- rebuild diff size;
- skipped items by reason;
- manual replay count;
- paused/throttled job count.

Алерты:

- daily loyalty audit не завершился до business deadline;
- segment refresh не завершился до campaign launch;
- receipt backfill влияет на current ingest lag;
- catalog import validation errors spike;
- job checkpoint не продвигается при active workers;
- full rebuild запущен в peak freeze window.

## Логи

Structured logs обязательны для:

- API request start/end только с техническими identifiers;
- idempotency decision;
- event publish/consume attempts;
- external provider request result без payload PII;
- retry scheduling;
- DLQ publish/replay;
- job checkpoint;
- security/policy rejection;
- manual operational action.

Минимальные поля: timestamp, level, service, environment, tenant_id, correlation_id, operation, result, duration_ms, error_code, error_class.

Запрещено логировать raw message body, raw phone/email, full wallet barcode, payment details, fiscal receipt body и provider secrets.

## Tracing

Distributed tracing должен связывать:

- inbound API request;
- domain write;
- outbox write;
- event publish;
- consumer processing;
- downstream API/provider call;
- generated follow-up event;
- webhook delivery.

Trace sampling:

- P0/P1 errors и slow requests - 100%;
- DLQ/retry/replay - 100%;
- normal high-volume events - adaptive sampling;
- peak incident window - временное повышение sampling с контролем storage cost.

## Data quality и reconciliation

Наблюдаемые проверки:

- accepted POS/ERP transactions vs published transaction events;
- transaction events vs loyalty recalculation processed markers;
- loyalty aggregate spend vs transaction eligible net amount snapshot;
- message.delivery.requested vs provider send attempts;
- provider receipts vs delivery statuses;
- catalog variants/prices/inventory vs search index freshness;
- webhook subscriptions vs delivery attempts.

Алерты должны указывать tenant, affected period, affected count и recovery runbook.

## Alert hygiene

Правила алертов:

- каждый paging alert имеет owner, severity, runbook и business impact;
- P0/P1 alerts page immediately;
- P3/P4 alerts могут быть ticket-only, если не влияют на checkout или campaign SLA;
- alert должен срабатывать на burn rate/SLO breach, а не только на единичный spike;
- suppressions допускаются только с expiry и change/incident reference;
- после инцидента thresholds пересматриваются по фактическому impact.
