# High-load NFR

## Назначение

Документ фиксирует нефункциональные требования к high-load эксплуатации UCO CRM для розничной сети с миллионами транзакций в день, пиковыми периодами Black Friday и праздничных продаж, массовыми рассылками и регулярными перерасчетами loyalty/segments.

Этот документ расширяет, но не заменяет:

- `docs/architecture.md` - модульные границы и event-driven core;
- `docs/events.md` - canonical event envelope, idempotency и ordering;
- `docs/api-contracts.md` - API latency и идемпотентность write-операций;
- `docs/data-contracts.md` - canonical доменные структуры.

Новые доменные модели в рамках NFR не вводятся. Все требования ниже применяются к существующим API, events, outbox/inbox, интеграциям и фоновым обработчикам.

## Приоритеты нагрузки

Система должна явно разделять интерактивный retail path и тяжелые асинхронные вычисления.

| Priority | Контур | Примеры | Правило деградации |
| --- | --- | --- | --- |
| P0 | POS checkout | customer lookup, discount evaluate, transaction accept | Не блокируется маркетингом, импортами и аналитикой |
| P1 | Online checkout | cart discount preview, ecommerce transaction accept | Может отключать необязательные рекомендации |
| P2 | Integration ingest | 1C/POS receipt imports, provider receipts, webhooks | При перегрузке принимает пачки в очередь |
| P3 | Marketing delivery | campaign dispatch, cascades, retries | Throttling по tenant/channel/provider |
| P4 | Analytics/rebuild | segments, RFM, recommendations, warehouse export | Откладывается при давлении на P0-P2 |

Запрещено выполнять массовые перерасчеты loyalty, сегментацию, импорт каталога, bulk campaign dispatch и BI export синхронно внутри request path POS/e-commerce/admin API.

## Целевые SLO

| Компонент | SLO |
| --- | --- |
| POS customer lookup | p95 <= 150 ms, p99 <= 300 ms внутри локального контура клиента |
| POS discount evaluate | p95 <= 150 ms, p99 <= 350 ms при warm cache и доступном каталоге |
| POS transaction accept | p95 <= 300 ms до durable записи/очереди, loyalty recalculation возвращается как `queued` |
| E-commerce cart loyalty preview | p95 <= 250 ms, p99 <= 600 ms |
| API write idempotency lookup | p95 <= 50 ms для горячего ключа tenant/system |
| Event publication from outbox | p95 <= 5 seconds, p99 <= 30 seconds при нормальной нагрузке |
| Receipt import acceptance | p95 <= 2 seconds для batch API без ожидания доменных перерасчетов |
| Message delivery request queueing | p95 <= 1 second до durable queue |
| Provider receipt processing | p95 <= 10 seconds до обновления delivery status event |
| Queue backlog recovery | Обработка накопленного P3 backlog за <= 4 часа после пика без влияния на P0 |

SLO считаются отдельно по `tenant_id`, каналу, store/branch, external system и provider. Для on-premise развертываний пороги должны быть подтверждены нагрузочным тестом на инфраструктуре клиента.

## Пиковые периоды

Для Black Friday, сезонных распродаж и праздников вводится peak readiness режим.

Минимальные требования:

- capacity plan минимум за 14 дней до пика;
- нагрузочный тест с профилем POS + ecommerce + provider receipts + campaign dispatch;
- отдельные resource pools для POS lookup/discount evaluate, API ingest, event consumers, marketing delivery и analytics;
- предварительный прогрев cache для loyalty tiers, wallet barcode lookup, active discount rules, product discount flags и branch availability;
- freeze на небезопасные schema migrations, массовые reindex и полные recalculation jobs в окне пика;
- заранее настроенные provider rate limits для WABA/SMS/Email/Push;
- проверенный DLQ replay runbook и дежурство инженера эксплуатации.

В peak режиме система должна предпочитать eventual consistency для P2-P4 задач, если это сохраняет P0/P1 checkout flow. Например, транзакция принимается идемпотентно и публикуется в очередь, а loyalty tier пересчитывается асинхронно.

## Очереди и обработчики

Рекомендуемые категории очередей являются эксплуатационными, а не новыми доменными контрактами:

| Queue category | Источники | Основные consumers | Partition key |
| --- | --- | --- | --- |
| `api-write-outbox` | Domain services | Event publisher | `tenant_id + aggregate_id` |
| `receipt-ingest` | POS, 1C/ERP imports | Transaction normalizer | `tenant_id + source_system + external_transaction_id` |
| `catalog-import` | 1C/ERP catalog feeds | Catalog importer, search indexer | `tenant_id + sku/variant_sku` |
| `loyalty-recalculation` | transaction events, daily audit | Loyalty workers | `tenant_id + customer_id` |
| `segment-build` | schedule, campaign launch | Marketing/analytics workers | `tenant_id + segment_id` |
| `message-delivery` | Marketing journeys | Channel dispatchers | `tenant_id + channel + provider` |
| `provider-receipts` | WABA/SMS/Email/Push webhooks | Delivery status consumers | `tenant_id + provider_message_id` |
| `webhook-delivery` | Event subscriptions | Integration webhooks | `tenant_id + subscription_id` |
| `analytics-export` | Event stream, snapshots | Warehouse/BI loaders | `tenant_id + date_bucket` |

Все очереди используют at-least-once delivery. Consumers обязаны быть идемпотентными по `event_id` или `idempotency_key` из `docs/events.md`, а для интеграционных чеков - по `source_system + external_transaction_id + tenant_id` из `docs/data-contracts.md`.

## Retry и backoff

Retry применяется только к ошибкам, которые потенциально могут завершиться успешно при повторе. Ошибки валидации, schema mismatch и нарушение consent/policy не ретраятся как transient failures.

| Класс ошибки | Примеры | Поведение |
| --- | --- | --- |
| Transient infrastructure | timeout DB/cache, broker rebalance, network reset | Exponential backoff с jitter, затем DLQ |
| External rate limit | provider 429, WABA/SMS quota | Backoff до окна quota, circuit breaker по provider |
| External unavailable | 5xx provider, 1C недоступен | Retry с увеличением интервала, alert при SLO breach |
| Business conflict | duplicate transaction, stale delivery status | Идемпотентный no-op или deterministic merge |
| Validation/schema | invalid payload, unknown required field | Reject в quarantine/DLQ без автоматического replay |
| Security/policy | no consent, forbidden export, invalid signature | Reject, audit log, без retry |

Базовая политика:

- быстрые внутренние операции: 3-5 попыток в течение 1-5 минут;
- provider/API интеграции: 6-10 попыток с backoff от 30 секунд до 6 часов;
- webhook delivery: retry с exponential backoff до 24 часов, затем DLQ;
- campaign delivery не должна бесконечно удерживать устаревшие сообщения; TTL задается кампанией/каналом;
- каждая попытка сохраняет `correlation_id`, attempt number, last error code и next retry time в техническом состоянии обработчика.

## Idempotency

Идемпотентность обязательна для всех write API, event consumers, imports, provider receipts и webhook receivers.

Правила:

- `Idempotency-Key` обязателен для write API согласно `docs/api-contracts.md`;
- результат первого успешного write должен быть возвращаемым при повторе того же key в рамках tenant/system;
- POS/ERP receipt ingest дедуплицируется по `source_system + external_transaction_id + tenant_id`;
- provider receipts дедуплицируются по `provider + provider_message_id + status + occurred_at`;
- event consumers фиксируют processed marker атомарно с durable результатом обработки через transactional inbox/outbox; для внешних side effects используется outbox/dispatch record и downstream idempotency key, а marker завершения ставится только после успешного идемпотентного результата;
- повтор `message.delivery.requested` не должен создавать дубль отправки в provider без сохраненного idempotency record;
- replay из DLQ обязан проходить через тот же idempotency path, что и обычная доставка.

Рекомендуемые сроки хранения idempotency records:

- транзакции, возвраты, fiscal receipts: не меньше срока финансового аудита клиента;
- provider receipts и message delivery: не меньше срока хранения delivery logs;
- generic API writes: минимум 30 дней, если доменный контракт не требует больше;
- webhook delivery attempts: минимум 90 дней или срок SLA интеграции.

## Dead-letter и quarantine

DLQ не является архивом для забытых сообщений. Это рабочая очередь инцидентов с владельцем, SLA разбора и безопасным replay.

Для каждой DLQ нужны:

- owner team/component;
- source queue/topic;
- failure class и last error;
- first failed at / last failed at / attempts;
- `tenant_id`, `correlation_id`, `event_id` или `idempotency_key`;
- replay eligibility: automatic, manual, blocked by schema, blocked by policy;
- runbook link.

Quarantine используется для payloads с PII, invalid signature, unknown schema или подозрением на дубли/мошенничество. Доступ к quarantine должен проходить через Security policies и audit log.

## Backpressure и rate limiting

При перегрузке система снижает нагрузку в следующем порядке:

1. Откладывает analytics export, full segment rebuild и recommendation rebuild.
2. Throttling campaign dispatch по tenant/channel/provider.
3. Увеличивает batch interval для catalog import и receipt backfill.
4. Переводит ecommerce recommendations в cached/fallback режим.
5. Ограничивает admin bulk operations.
6. Сохраняет POS lookup/discount evaluate и transaction accept как приоритетный путь.

Rate limiting должен быть tenant-aware и provider-aware. Массовая кампания одного tenant не должна исчерпывать общие workers для POS или provider receipts другого tenant.

## Кэширование POS lookup

POS lookup и discount evaluate должны использовать отдельный низколатентный read path:

- cache key включает `tenant_id`, identity type/value hash или `customer_id`, store/branch context и активную версию discount rules;
- cache value не содержит незамаскированные PII;
- TTL для loyalty tier и wallet lookup задается так, чтобы выдерживать пиковые продажи, но invalidation по `loyalty.tier.changed`, `customer.updated`, `customer.identity.linked`, `catalog.price.changed` и `catalog.inventory.changed` происходила через events;
- при cache miss POS path не запускает полный пересчет loyalty; он читает последний подтвержденный state и ставит recalculation в очередь при необходимости;
- при недоступности recommendation/analytics POS response не ухудшается.

## Capacity и тестирование

Перед production запуском и перед peak окнами должны выполняться:

- load test POS lookup/discount evaluate с горячими и холодными identities;
- soak test receipt ingest на объеме не меньше ожидаемого дневного пика;
- stress test message delivery с provider quotas и simulated receipts;
- DLQ replay drill с проверкой идемпотентности;
- chaos test недоступности provider, broker partition, DB replica lag, cache flush;
- проверка восстановления backlog после 2-4 часов provider outage.

Критерий приемки high-load готовности: P0/P1 SLO сохраняются при одновременном росте P2-P4 нагрузки, а backlog в очередях восстанавливается без ручного исправления доменных данных.
