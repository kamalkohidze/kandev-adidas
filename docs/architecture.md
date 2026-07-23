# Headless UCO CRM Architecture

## Цель платформы

UCO CRM строится как headless CRM-контур для розничной сети: платформа хранит и рассчитывает клиентские, loyalty, маркетинговые и аналитические данные, а витрины POS, e-commerce, мобильного приложения, личного кабинета и админки работают с ней через API и события.

Базовая архитектура должна быть единой для всех последующих модулей. Модульные задачи не должны создавать собственные версии клиента, товара, транзакции, шаблона сообщения, события или omnichannel ID. Расширения оформляются как дополнительные поля, reference-таблицы или отдельные bounded contexts с явными контрактами.

## Архитектурные принципы

- Headless first: все клиентские каналы используют API, а не прямой доступ к данным CRM.
- Omnichannel ID first: профиль покупателя связывает телефон, email, wallet-карту, web/app account, POS-карту и внешние ERP/POS идентификаторы.
- Event-driven core: регистрация, покупка, возврат, корзина, день рождения, tier retention, geofence и доставка сообщений публикуются как события.
- Single source of truth: клиентский профиль, каталог, транзакции и шаблоны сообщений имеют единую доменную модель в `docs/data-contracts.md`.
- Contract isolation: POS, e-commerce, mobile/app cabinet, ERP/1C, коммуникационные шлюзы и админка интегрируются через явные API-контракты из `docs/api-contracts.md`.
- Multilingual by design: `kk`, `ru`, `en` поддерживаются в профиле клиента, админке, API и шаблонах сообщений.
- Compliance by default: персональные данные хранятся в пределах РК или on-premise-контуре клиента, доступы журналируются, экспорт ограничивается политиками ИБ.
- High-load readiness: чтение профиля и скидки на кассе оптимизируется отдельно от аналитических и маркетинговых вычислений.

## Логическая схема

```text
Retail Channels
  POS / Fiscal KKM
  E-commerce
  Mobile App / Personal Cabinet
  Admin UI
        |
        v
API Gateway + Identity + Rate Limits
        |
        v
Domain Services
  Customer 360  Loyalty  Marketing  Catalog
  Recommendations  Wallet  Integrations
  Security  Analytics
        |
        v
Event Bus + Outbox
        |
        v
Operational Stores + Search + Analytics Warehouse
        |
        v
External Systems
  1C / ERP  WABA  Push  SMS  Email  BI
```

## Модульные границы

### Customer 360

Назначение: единая карточка покупателя, consent, язык коммуникаций, омниканальная идентификация, размерные и спортивные предпочтения, история активности.

Владеет:
- `Customer`
- `CustomerIdentity`
- `CustomerPreference`
- `Consent`
- customer merge/audit history

Не владеет:
- расчетом скидочного уровня;
- маркетинговыми сценариями;
- отправкой сообщений;
- товарным каталогом.

Публикует события:
- `customer.registered`
- `customer.updated`
- `customer.identity.linked`
- `customer.consent.updated`
- `customer.birthday.due`

### Loyalty

Назначение: накопительная дисконтная система, tiers, правила исключений, расчет скидки для POS/e-commerce, удержание уровня.

Владеет:
- `LoyaltyAccount`
- `LoyaltyTier`
- `TierRule`
- `DiscountEvaluation`

Использует:
- `Transaction` из транзакционного контура;
- `Customer` по ссылке `customer_id`;
- `Product` и category flags для исключений скидок.

Публикует события:
- `loyalty.tier.changed`
- `loyalty.tier.retention_risk`
- `loyalty.discount.evaluated`

### Marketing

Назначение: сегменты, кампании, триггерные сценарии, каскады коммуникаций, шаблоны сообщений и delivery orchestration.

Владеет:
- `Segment`
- `Campaign`
- `Journey`
- `MessageTemplate`
- `MessageDelivery`

Не владеет:
- каналами физической отправки WABA/SMS/Email/Push;
- пользовательскими consent как source of truth;
- расчетом loyalty tier.

Публикует события:
- `marketing.journey.started`
- `message.delivery.requested`
- `message.delivery.status_changed`

### Catalog

Назначение: товарный каталог, иерархия категорий, атрибуты, размеры, остатки, цены, branch-level availability.

Владеет:
- `Product`
- `ProductVariant`
- `Category`
- `Price`
- `InventoryBalance`

Публикует события:
- `catalog.product.upserted`
- `catalog.price.changed`
- `catalog.inventory.changed`

### Recommendations

Назначение: персональные рекомендации по истории покупок, размерам, видам спорта, остаткам, сегментам и lifecycle-сценариям.

Владеет:
- `RecommendationSet`
- `RecommendationItem`
- `RecommendationReason`

Использует:
- клиентские предпочтения;
- каталог и остатки;
- транзакции;
- маркетинговый контекст.

Публикует события:
- `recommendation.generated`
- `recommendation.selected`
- `recommendation.feedback.received`

### Wallet

Назначение: цифровые карты, barcode/QR, текущий tier, локализованное отображение карты, geofence triggers.

Владеет:
- `WalletCard`
- `WalletPass`
- `GeofenceZone`
- `GeofenceVisit`

Публикует события:
- `wallet.card.issued`
- `wallet.card.updated`
- `wallet.geofence.entered`
- `wallet.geofence.exited`

### Integrations

Назначение: адаптеры POS, e-commerce, 1C/ERP, фискальных ККМ, WABA, SMS, Email, Push, webhooks и файловых обменов.

Владеет:
- `IntegrationEndpoint`
- `ExternalSystemMapping`
- `WebhookSubscription`
- `SyncJob`
- connector audit state

Не владеет доменными объектами. Интеграции преобразуют внешние payloads в canonical API/events и обратно.

### Security

Назначение: RBAC/ABAC, audit log, masking, export control, API keys, admin sessions, secret management, ИБ РК.

Владеет:
- `User`
- `Role`
- `Permission`
- `AuditLog`
- `DataAccessPolicy`
- `ApiCredential`

Контролирует:
- доступ к PII;
- экспорт клиентской базы;
- просмотр номеров телефонов и email;
- действия администраторов и маркетологов.

### Analytics

Назначение: витрины отчетности, retention, RFM, campaign performance, loyalty economics, product affinity, BI export.

Владеет:
- analytical snapshots;
- aggregates;
- metrics definitions;
- data marts.

Не является source of truth для операционных данных.

## Доменная модель верхнего уровня

Основные доменные сущности описаны в `docs/data-contracts.md`:

- `Customer`
- `CustomerIdentity`
- `Product`
- `ProductVariant`
- `Transaction`
- `TransactionLine`
- `MessageTemplate`
- `MessageDelivery`

Сущности связаны стабильными UUID. Внешние идентификаторы POS, ERP, e-commerce, WABA, SMS, Email и push-провайдеров хранятся в mapping-структурах, а не становятся первичными ключами домена.

## Omnichannel ID

Omnichannel ID является агрегированным идентификатором клиента и должен покрывать:

- `customer_id` - внутренний CRM UUID;
- `phone_e164` - телефон в формате E.164;
- `email_normalized` - нормализованный email;
- `wallet_card_number` - номер карты лояльности;
- `wallet_barcode` - barcode/QR для POS;
- `app_user_id` - id мобильного приложения;
- `web_account_id` - id личного кабинета/e-commerce;
- `pos_customer_id` - id в POS;
- `erp_counterparty_id` - id в 1C/ERP;
- `messenger_contact_id` - id WABA/мессенджера;
- `device_id` - push/device id, если consent позволяет.

Правила:

- один `Customer` может иметь несколько `CustomerIdentity`;
- одна активная identity не может быть привязана к двум активным customer-профилям;
- merge клиентов должен сохранять audit trail и список source identities;
- для POS lookup допустимы телефон, wallet barcode, card number и external POS id;
- для маркетинга перед использованием канала проверяется consent и актуальность identity.

## Event-driven модель

События являются immutable facts. Обработчики не изменяют событие, а создают новые доменные состояния или последующие события.

Базовый формат, типы событий, гарантии доставки, idempotency и ordering описаны в `docs/events.md`.

Рекомендуемая техническая схема:

- transactional outbox в каждом write-сервисе;
- event bus для fan-out;
- retry с dead-letter queue;
- idempotency key для интеграций и обработчиков;
- correlation id для цепочек customer journey;
- partitioning по `customer_id` для клиентских событий и по `transaction_id` для чеков.

## API boundaries

API-контракты описаны в `docs/api-contracts.md` и делятся на:

- POS API;
- E-commerce API;
- Mobile App / Personal Cabinet API;
- 1C / ERP API;
- Push / WABA / SMS / Email API;
- Admin API;
- Webhook API.

Все API должны поддерживать:

- `X-Correlation-Id`;
- `Idempotency-Key` для write-операций;
- OAuth2/OIDC или mTLS/API key в зависимости от канала;
- structured error response;
- версионирование `/v1`;
- locale-aware поля, где возвращается пользовательский текст.

## Данные и хранилища

Операционный контур:

- relational store для клиентов, loyalty, транзакций, шаблонов, consent, security;
- document/json fields для расширяемых retail attributes товара и профиля;
- search index для клиентского поиска, сегментов и каталога;
- cache для POS discount lookup и wallet card display;
- object storage для вложений кампаний и статических assets шаблонов;
- analytics warehouse для отчетности и ML features.

High-load требования:

- POS discount lookup p95 <= 150 ms внутри контура клиента;
- ingest чеков и возвратов должен быть идемпотентным;
- массовые рассылки не должны блокировать Customer 360 и POS lookup;
- сегментация и рекомендации работают асинхронно через snapshots/features;
- read/write нагрузка marketing delivery отделяется от customer profile write path.

## Мультиязычность

Поддерживаемые языки:

- `kk` - казахский;
- `ru` - русский;
- `en` - английский.

В бизнес-документах допустимы обозначения `KZ/RU/EN`; в API, событиях и хранилищах canonical codes фиксируются как `kk/ru/en`.

Правила:

- `Customer.preferred_locale` определяет язык коммуникации по умолчанию;
- templates должны иметь локализованные варианты минимум для `kk` и `ru`, `en` может быть fallback в международных сценариях;
- API принимает `Accept-Language`, но персональные коммуникации используют сохраненный `preferred_locale`;
- admin UI хранит локализуемые label/message keys отдельно от бизнес-идентификаторов;
- отсутствие локали в шаблоне является ошибкой валидации кампании, если канал включен для аудитории этой локали.

## ИБ РК и персональные данные

Базовые требования:

- хранение персональных данных в Республике Казахстан или on-premise-периметре клиента;
- разграничение доступа по ролям и атрибутам;
- маскирование телефона/email в админке для ролей без PII-доступа;
- audit log для просмотра, изменения, экспорта, массовой рассылки и администрирования прав;
- consent management по каналам и целям обработки;
- запрет экспорта без явного разрешения `customer.export`;
- encryption at rest и TLS/mTLS in transit;
- data retention policies для delivery logs, OTP, device tokens и webhook payloads.

## Нефункциональные требования

- Availability: POS lookup и checkout flows должны иметь повышенный приоритет относительно campaign analytics.
- Scalability: прием чеков, событий корзины и delivery receipts масштабируется горизонтально.
- Resilience: интеграционные адаптеры используют retry/backoff и DLQ.
- Observability: каждый request/event содержит correlation id; метрики собираются по каналу, модулю, external system, tenant, store.
- Tenant isolation: для multi-tenant сценария все доменные записи несут `tenant_id`; для single-tenant on-premise допускается один tenant без изменения схемы.
- Auditability: каждое изменение PII, consent, loyalty tier и campaign approval пишется в audit log.

## Зависимости между модулями

```text
Customer 360 -> Security
Loyalty -> Customer 360, Catalog, Transactions
Marketing -> Customer 360, Loyalty, Catalog, Recommendations, Integrations, Security
Catalog -> Integrations
Recommendations -> Customer 360, Catalog, Transactions, Analytics
Wallet -> Customer 360, Loyalty, Marketing
Integrations -> All domain APIs through contracts only
Analytics -> Event stream and read replicas
Security -> Cross-cutting enforcement
```

Запрещенное направление зависимости: доменные модули не должны зависеть от конкретных провайдеров WABA/SMS/Email/Push или от форматов 1C/POS напрямую. Такие зависимости остаются внутри Integrations.
