# Operations

## Назначение

Документ описывает эксплуатационные процессы UCO CRM: фоновые задания, перерасчеты, импорты, рассылки, DLQ/replay, инциденты и подготовку к пиковым периодам. Он не вводит новые доменные структуры и должен использовать canonical contracts из `docs/data-contracts.md`, `docs/events.md` и `docs/api-contracts.md`.

## Операционная модель

Каждый production tenant должен иметь:

- владельца сервиса и escalation contact;
- список критичных интеграций POS, 1C/ERP, WABA/SMS/Email/Push, fiscal KKM;
- SLO для POS lookup, checkout write path, очередей и delivery;
- расписание регулярных jobs и запретных окон;
- runbook для DLQ, backlog, provider outage, failed imports и rollback релиза;
- журнал operational changes: release, migration, campaign bulk launch, provider switch, manual replay.

P0/P1 операции обслуживаются отдельно от bulk jobs. Любая эксплуатационная задача должна быть отменяемой, идемпотентной при повторном запуске и наблюдаемой через `correlation_id`/job run id.

## Фоновые задания

Фоновые jobs запускаются через scheduler/worker pool, а не через синхронный API request. Технический job run id не является доменным идентификатором и используется только для эксплуатации.

| Job | Триггер | Основной вход | Выход | Ограничения |
| --- | --- | --- | --- | --- |
| Loyalty incremental recalculation | `transaction.purchase.created`, `transaction.return.created` | Transaction events | актуальный loyalty state, возможные loyalty events | partition по `customer_id`, идемпотентность по event |
| Daily loyalty audit | расписание tenant timezone | loyalty accounts, rolling window | `loyalty.tier.retention_risk`, tier changes | запускается вне POS пика |
| Segment refresh | расписание или campaign draft | snapshots/features | materialized audience | не читает напрямую hot POS path |
| Campaign dispatch | campaign start/schedule | audience snapshot, templates, consent | `message.delivery.requested` | throttling по channel/provider/tenant |
| Delivery cascade step | delayed event/timer | delivery status, cascade rules | следующий delivery request или stop | проверяет consent перед отправкой |
| Provider receipt import | webhook/polling | provider payloads | `message.delivery.status_changed` | dedupe по provider message id/status/time |
| Receipt import | POS/1C batch/API | `Transaction` contract | transaction events, rejected rows | dedupe по `source_system + external_transaction_id + tenant_id` |
| Catalog import | 1C/ERP feed | product/variant/price/inventory API payloads | catalog events, search indexing | chunking, validation before publish |
| Webhook delivery | event subscription | canonical event | signed webhook attempt | retry/backoff, DLQ after attempts |
| Analytics export | event stream/snapshots | events/read replicas | warehouse partitions | P4 priority, pauseable |

## Scheduling

Правила расписаний:

- timezone берется из tenant/store operational config;
- daily jobs должны иметь jitter, чтобы tenants не стартовали одновременно;
- full rebuild jobs требуют manual approval в production;
- jobs длиннее 15 минут должны поддерживать checkpointing;
- повторный запуск с теми же параметрами должен продолжаться с checkpoint или завершаться no-op для уже обработанных элементов;
- campaign dispatch и provider receipt processing не должны делить один worker pool без quotas;
- Black Friday/holiday freeze запрещает full segment rebuild, full loyalty rebuild и bulk catalog reindex без отдельного change approval.

## Loyalty перерасчеты

Loyalty recalculation выполняется двумя путями:

- incremental: по каждому событию покупки/возврата;
- audit/rebuild: регулярная сверка rolling annual spend, retention risk и исправление расхождений.

Операционные правила:

- POS transaction API возвращает `loyalty_recalculation_status = queued`, если перерасчет не завершен в checkout path;
- один customer/loyalty account обрабатывается последовательно по partition key;
- возвраты и корректировки должны проходить через тот же idempotency path, что и покупки;
- full rebuild сначала пишет shadow result/snapshot, затем применяет diff пакетами;
- при расхождении между Transaction source of truth и loyalty aggregate приоритет имеет canonical `Transaction`;
- ручная корректировка требует audit log и отдельного correlation id.

## Сегменты и рекомендации

Segment refresh и recommendation jobs работают с snapshots/features, а не с hot POS lookup path.

Правила:

- campaign launch использует закрепленный audience snapshot, чтобы аудитория не менялась во время dispatch;
- rebuild сегмента должен сохранять версию snapshot и параметры фильтра;
- большие сегменты обрабатываются chunked pages с checkpoint;
- failed chunk ретраится независимо;
- устаревшие snapshots помечаются expired по retention policy;
- при недоступности recommendation engine campaign может использовать заранее сохраненный fallback content, если это разрешено campaign approval.

## Рассылки и delivery

Campaign dispatch обязан быть управляемым по скорости.

Правила:

- перед постановкой `message.delivery.requested` проверяются consent, locale variant, template approval и frequency caps;
- одна delivery имеет стабильный `idempotency_key`;
- provider quotas задаются по channel/provider/tenant;
- cascade timers не запускают следующий канал, если текущий получил terminal success или пользователь отозвал consent;
- delivery receipts принимаются даже при временной недоступности marketing read model и догоняют состояние через очередь;
- expired delivery не ретраится в provider.

При provider outage:

1. Включить circuit breaker для provider/channel.
2. Снизить dispatch rate до 0 или технического минимума.
3. Продолжать принимать provider receipts, если webhook доступен.
4. Перевести campaign dispatch в paused/throttled.
5. После восстановления replay eligible backlog с учетом TTL и idempotency.

## Импорт чеков

Receipt import должен быть идемпотентным и раздельно учитывать accepted, duplicate и rejected rows.

Правила:

- batch API подтверждает durable acceptance, а не завершение всех downstream перерасчетов;
- invalid rows попадают в rejected/quarantine с причиной, не блокируя всю пачку, если это разрешено форматом импорта;
- duplicate rows возвращаются как duplicates и не создают повторные transaction events;
- ordering гарантируется только внутри одного `transaction_id`/external id, глобальный порядок пачек не требуется;
- backfill за прошлые периоды запускается в P2/P4 окне и не конкурирует с текущими POS чеками.

## Импорт каталога

Catalog import обрабатывает товары, варианты, цены и остатки пакетно.

Правила:

- сначала выполняется validation pass по обязательным полям canonical Product/ProductVariant API;
- price/inventory changes публикуются событиями после durable записи;
- search index и recommendation features обновляются асинхронно;
- частичный сбой chunk не откатывает успешно примененные chunks, replay проходит по idempotency key внешней записи;
- branch-level availability должна иметь отдельный лимит скорости, чтобы массовое изменение остатков не вытесняло POS lookup.

## DLQ runbook

Общий порядок разбора DLQ:

1. Определить source queue, tenant, failure class, first failed at, attempts, `correlation_id`.
2. Проверить, относится ли ошибка к transient, validation, schema, security/policy или duplicate conflict.
3. Для validation/schema ошибок зафиксировать причину и владельца исправления payload/mapper.
4. Для transient ошибок проверить состояние downstream сервиса и retry budget.
5. Перед replay убедиться, что consumer идемпотентен и ключ дедупликации сохранен.
6. Replay выполнять малыми batch с rate limit и мониторингом SLO P0/P1.
7. После replay закрыть инцидент с количеством replayed/skipped/failed.

Запрещено править payload в DLQ вручную без audit trail и ссылки на incident/change request, особенно если payload содержит PII или финансовые данные.

## Инциденты

Минимальные severity:

| Severity | Условие | Первичная реакция |
| --- | --- | --- |
| SEV1 | POS lookup/discount evaluate недоступен или p95 > SLO более 15 минут | war room, freeze P3/P4, restore P0 |
| SEV1 | Потеря durable writes для transactions/events | остановить ingest, сохранить evidence, восстановить из outbox/logs |
| SEV2 | Provider outage влияет на active campaign delivery | pause/throttle campaigns, notify business owner |
| SEV2 | DLQ растет по receipt ingest или delivery receipts | owner triage, replay/quarantine decision |
| SEV3 | Analytics/segment lag без влияния на checkout | backlog recovery plan |

Каждый инцидент должен фиксировать impact по tenant/channel/store, временной диапазон, affected events/messages/transactions, принятые mitigation и follow-up actions.

## Релизы и миграции

Production release должен проходить через:

- backward-compatible schema changes;
- dark launch/feature flag для новых workers;
- canary tenant/store/provider, если применимо;
- проверку outbox/inbox lag до и после релиза;
- rollback plan без удаления доменных данных;
- запрет на destructive migrations в peak freeze;
- проверку, что consumers игнорируют неизвестные optional event fields согласно `docs/events.md`.

## Backup и recovery

Требования:

- RPO/RTO задаются отдельно для operational DB, event broker/outbox, object storage и analytics warehouse;
- outbox/inbox state входит в backup scope, иначе replay может нарушить идемпотентность;
- восстановление проверяется регулярным restore drill;
- provider webhooks должны иметь возможность повторной доставки или polling reconciliation;
- после restore выполняется reconciliation: transactions vs loyalty aggregates, delivery requests vs provider receipts, catalog variants vs search index.

## Peak readiness checklist

- Capacity plan утвержден.
- Load/soak tests пройдены на профиле пиковой кампании.
- POS cache прогрет.
- Provider quotas подтверждены.
- Campaign launch rate limits заданы.
- Full rebuild/reindex jobs остановлены или перенесены.
- DLQ пустые или имеют owner/decision.
- On-call расписание и escalation contacts актуальны.
- Dashboards и alerts проверены.
