# Event Model

## Назначение

Событийная модель фиксирует бизнес-факты UCO CRM и отделяет источники данных от обработчиков Loyalty, Marketing, Wallet, Recommendations, Integrations и Analytics.

События immutable: исправления оформляются новым событием, а не изменением старого payload.

## Event Envelope

```yaml
Event:
  event_id: uuid
  event_type: string
  event_version: integer
  tenant_id: uuid
  aggregate_type: string
  aggregate_id: uuid|string
  occurred_at: datetime
  published_at: datetime
  producer: string
  correlation_id: string
  causation_id: uuid|null
  idempotency_key: string
  partition_key: string
  payload: object
  metadata:
    source_system: string|null
    locale: kk|ru|en|null
    pii: boolean
```

Правила:

- `event_id` уникален глобально;
- `idempotency_key` обязателен для событий, пришедших из внешних систем;
- `correlation_id` объединяет request, journey, delivery cascade и downstream events;
- `partition_key` равен `customer_id` для клиентских событий и `transaction_id` для чеков;
- business locale aliases `KZ/RU/EN` нормализуются в `kk/ru/en` до публикации события;
- PII в payload допускается только при необходимости и маркируется `metadata.pii = true`.

## Event Types

### Регистрация клиента

```yaml
event_type: customer.registered
aggregate_type: customer
aggregate_id: customer_id
partition_key: customer_id
payload:
  customer_id: uuid
  registration_channel: pos|web|mobile|admin|import
  preferred_locale: kk|ru|en
  identities:
    - type: phone|email|wallet_card|app_user|web_account
      value_masked: string
      verified: boolean
  consent_summary:
    push: boolean
    waba: boolean
    sms: boolean
    email: boolean
```

Основные потребители:

- Customer 360 для audit/read models;
- Loyalty для создания account;
- Wallet для выпуска карты;
- Marketing для welcome journey;
- Analytics для acquisition metrics.

### Покупка

```yaml
event_type: transaction.purchase.created
aggregate_type: transaction
aggregate_id: transaction_id
partition_key: transaction_id
payload:
  transaction_id: uuid
  customer_id: uuid|null
  store_id: uuid|null
  channel: pos|web|mobile|erp_import
  occurred_at: datetime
  currency: string
  net_amount: decimal_string
  loyalty_eligible_amount: decimal_string
  source_system: string
  external_transaction_id: string
  lines:
    - product_id: uuid|null
      product_variant_id: uuid|null
      sku: string
      quantity: decimal_string
      net_amount: decimal_string
      sport_tags:
        - string
```

Основные потребители:

- Loyalty пересчитывает rolling annual spend и tier;
- Customer 360 обновляет историю активности;
- Marketing запускает cross-sell сценарии;
- Recommendations обновляет features;
- Analytics считает выручку, retention и product affinity.

### Возврат

```yaml
event_type: transaction.return.created
aggregate_type: transaction
aggregate_id: transaction_id
partition_key: transaction_id
payload:
  transaction_id: uuid
  original_transaction_id: uuid|null
  customer_id: uuid|null
  store_id: uuid|null
  channel: pos|web|mobile|erp_import
  occurred_at: datetime
  currency: string
  net_amount: decimal_string
  loyalty_eligible_amount: decimal_string
  source_system: string
  external_transaction_id: string
  reason_code: string|null
  lines:
    - product_id: uuid|null
      product_variant_id: uuid|null
      sku: string
      quantity: decimal_string
      net_amount: decimal_string
```

Основные потребители:

- Loyalty уменьшает eligible spend;
- Customer 360 обновляет историю;
- Marketing отменяет зависимые сценарии, если правило кампании это требует;
- Analytics корректирует показатели.

### Корзина обновлена

```yaml
event_type: cart.updated
aggregate_type: cart
aggregate_id: cart_id
partition_key: customer_id_or_anonymous_id
payload:
  cart_id: uuid
  customer_id: uuid|null
  anonymous_id: string|null
  channel: web|mobile
  currency: string
  gross_amount: decimal_string
  net_amount: decimal_string
  item_count: integer
  last_activity_at: datetime
  items:
    - product_variant_id: uuid|null
      sku: string
      quantity: decimal_string
      unit_price: decimal_string
```

### Брошенная корзина

```yaml
event_type: cart.abandoned
aggregate_type: cart
aggregate_id: cart_id
partition_key: customer_id_or_anonymous_id
payload:
  cart_id: uuid
  customer_id: uuid|null
  anonymous_id: string|null
  channel: web|mobile
  abandoned_at: datetime
  last_activity_at: datetime
  recovery_url: string|null
  items:
    - product_variant_id: uuid|null
      sku: string
      name: string
      image_url: string|null
```

Основные потребители:

- Marketing запускает cascade: Push через 1 час, WABA через 24 часа, SMS fallback;
- Recommendations может подставить альтернативы в нужном размере;
- Analytics считает cart recovery.

### День рождения

```yaml
event_type: customer.birthday.due
aggregate_type: customer
aggregate_id: customer_id
partition_key: customer_id
payload:
  customer_id: uuid
  birth_date: date
  due_date: date
  days_before: integer
  preferred_locale: kk|ru|en
  eligible_channels:
    - push|waba|sms|email
```

Правило генерации: daily scheduler публикует событие за 7 дней до `birth_date` в локальной timezone tenant/store, если consent позволяет хотя бы один канал.

### Tier retention

```yaml
event_type: loyalty.tier.retention_risk
aggregate_type: loyalty_account
aggregate_id: loyalty_account_id
partition_key: customer_id
payload:
  customer_id: uuid
  loyalty_account_id: uuid
  current_tier_code: string
  current_discount_percent: decimal_string
  projected_tier_code: string
  projected_discount_percent: decimal_string
  retention_gap_amount: decimal_string
  currency: string
  days_until_recalculation: integer
  preferred_locale: kk|ru|en
```

Правило генерации: daily loyalty audit публикует событие за 30 дней до риска снижения tier, если gap > 0 и клиент доступен для коммуникации.

### Geofence

```yaml
event_type: wallet.geofence.entered
aggregate_type: geofence_visit
aggregate_id: geofence_visit_id
partition_key: customer_id
payload:
  customer_id: uuid
  wallet_card_id: uuid|null
  device_identity_id: uuid
  zone_id: uuid
  store_id: uuid
  entered_at: datetime
  distance_meters: integer|null
  preferred_locale: kk|ru|en
```

```yaml
event_type: wallet.geofence.exited
aggregate_type: geofence_visit
aggregate_id: geofence_visit_id
partition_key: customer_id
payload:
  customer_id: uuid
  zone_id: uuid
  store_id: uuid
  exited_at: datetime
```

Основные потребители:

- Marketing отправляет персональный push при наличии geolocation и push consent;
- Analytics считает store proximity traffic;
- Security audit контролирует использование device/geolocation данных.

### Доставка сообщений

```yaml
event_type: message.delivery.requested
aggregate_type: message_delivery
aggregate_id: delivery_id
partition_key: customer_id
payload:
  delivery_id: uuid
  customer_id: uuid
  campaign_id: uuid|null
  journey_id: uuid|null
  template_id: uuid
  template_code: string
  channel: push|waba|sms|email
  locale: kk|ru|en
  cascade_step: integer
  provider: string|null
```

```yaml
event_type: message.delivery.status_changed
aggregate_type: message_delivery
aggregate_id: delivery_id
partition_key: customer_id
payload:
  delivery_id: uuid
  customer_id: uuid
  channel: push|waba|sms|email
  previous_status: requested|queued|sent|delivered|read|failed|expired|cancelled
  status: requested|queued|sent|delivered|read|failed|expired|cancelled
  provider: string|null
  provider_message_id: string|null
  occurred_at: datetime
  failure_code: string|null
```

Дополнительные alias events для удобства подписчиков:

- `message.sent`
- `message.delivered`
- `message.read`
- `message.failed`

## Сценарии и event flow

### Welcome

```text
customer.registered
  -> marketing.journey.started
  -> message.delivery.requested(push|waba)
  -> message.delivery.status_changed
  -> delayed email after 3 days
```

### Покупка и cross-sell

```text
transaction.purchase.created
  -> loyalty tier recalculation
  -> recommendation.generated
  -> marketing.journey.started(cross_sell)
  -> message.delivery.requested
```

### Возврат

```text
transaction.return.created
  -> loyalty annual spend recalculation
  -> loyalty.tier.changed, if tier changed
  -> analytics adjustment
```

### Брошенная корзина

```text
cart.updated
  -> inactivity timer
  -> cart.abandoned
  -> message.delivery.requested(push after 1h)
  -> fallback WABA after 24h if unread/unavailable
  -> fallback SMS if WABA failed and consent allows
```

### День рождения

```text
daily scheduler
  -> customer.birthday.due
  -> marketing.journey.started(birthday)
  -> message.delivery.requested by cascade rules
```

### Tier retention

```text
daily loyalty audit
  -> loyalty.tier.retention_risk
  -> marketing.journey.started(tier_retention)
  -> message.delivery.requested(waba/push/sms)
```

### Geofence

```text
mobile app geofence detection
  -> wallet.geofence.entered
  -> consent and frequency cap check
  -> message.delivery.requested(push)
```

## Доставка, retry и идемпотентность

- Producers записывают событие через transactional outbox в той же транзакции, где меняется доменное состояние.
- Consumers обязаны хранить processed `event_id` или `idempotency_key`.
- Повторная доставка не должна создавать дубль транзакции, клиента, delivery или tier change.
- DLQ используется после исчерпания retry attempts.
- Для POS/ERP ingest дедупликация основана на `source_system + external_transaction_id + tenant_id`.
- Для provider receipts дедупликация основана на `provider + provider_message_id + status + occurred_at`.

## Ordering

Гарантируемый порядок требуется внутри одного aggregate:

- customer lifecycle events по `customer_id`;
- transaction line/import events по `transaction_id`;
- message delivery status по `delivery_id`;
- loyalty recalculation по `loyalty_account_id`.

Глобальный порядок между разными клиентами и каналами не гарантируется.

## Версионирование событий

- `event_version` увеличивается при несовместимом изменении payload;
- новые optional поля допускаются без изменения major event type;
- consumers должны игнорировать неизвестные поля;
- удаление или переименование поля требует нового `event_version` и migration window.
