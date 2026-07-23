# API Contracts

## Общие правила API

Базовый URL:

```text
/api/v1
```

Обязательные headers:

```http
X-Correlation-Id: <uuid-or-trace-id>
Idempotency-Key: <required-for-write-operations>
Accept-Language: kk|ru|en
Authorization: Bearer <token>
```

Если внешний канал передает бизнес-код языка `KZ`, API normalizer сохраняет его как canonical locale `kk`.

Для server-to-server интеграций допускаются mTLS и API key, но авторизация все равно должна мапиться на `tenant_id`, `system_id`, роли и разрешения.

Стандарт ошибки:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Human readable localized message",
    "details": [
      {
        "field": "customer.phone",
        "reason": "invalid_e164"
      }
    ],
    "correlation_id": "01J..."
  }
}
```

Стандарт пагинации:

```json
{
  "data": [],
  "page": {
    "limit": 50,
    "next_cursor": "opaque-cursor",
    "has_more": true
  }
}
```

## POS API

Назначение: быстрая идентификация клиента на кассе, расчет скидки, регистрация покупки/возврата и получение wallet barcode.

### Lookup клиента

```http
POST /api/v1/pos/customers/lookup
```

Request:

```json
{
  "store_id": "uuid",
  "cash_register_id": "KASSA-12",
  "identity": {
    "type": "phone",
    "value": "+77017578320"
  }
}
```

Response:

```json
{
  "customer": {
    "id": "uuid",
    "display_name": "Алибек С.",
    "preferred_locale": "kk",
    "phone_masked": "+7701***8320"
  },
  "loyalty": {
    "tier_code": "silver",
    "discount_percent": "10.00",
    "annual_spend_amount": "450000.00",
    "currency": "KZT"
  },
  "wallet": {
    "card_number": "980124",
    "barcode": "980124000001"
  }
}
```

### Предварительный расчет скидки

```http
POST /api/v1/pos/discounts/evaluate
```

Request:

```json
{
  "store_id": "uuid",
  "customer_id": "uuid",
  "cart": {
    "currency": "KZT",
    "items": [
      {
        "sku": "RUN-SHOE-001-UK10",
        "barcode": "4870000000012",
        "quantity": "1",
        "unit_price": "79990.00"
      }
    ]
  }
}
```

Response:

```json
{
  "evaluation_id": "uuid",
  "discount_percent": "10.00",
  "discount_amount": "7999.00",
  "net_amount": "71991.00",
  "lines": [
    {
      "sku": "RUN-SHOE-001-UK10",
      "loyalty_discount_allowed": true,
      "discount_amount": "7999.00"
    }
  ],
  "warnings": []
}
```

### Регистрация покупки или возврата

```http
POST /api/v1/pos/transactions
```

Request использует `Transaction` из `docs/data-contracts.md`.

Response:

```json
{
  "transaction_id": "uuid",
  "customer_id": "uuid",
  "loyalty_recalculation_status": "queued",
  "events": [
    "transaction.purchase.created"
  ]
}
```

Для `Transaction.type = return` ответ возвращает canonical event `transaction.return.created`:

```json
{
  "transaction_id": "uuid",
  "customer_id": "uuid",
  "loyalty_recalculation_status": "queued",
  "events": [
    "transaction.return.created"
  ]
}
```

Нефункциональные требования:

- lookup и discount evaluate p95 <= 150 ms в локальном контуре;
- все write-запросы идемпотентны по `source_system + external_transaction_id` и `Idempotency-Key`;
- POS не получает не замаскированные PII без отдельного разрешения.

## E-commerce API

Назначение: авторизация скидки в корзине, события корзины, онлайн-заказ, история покупок.

### Синхронизация корзины

```http
PUT /api/v1/ecommerce/carts/{cart_id}
```

Request:

```json
{
  "customer_id": "uuid",
  "anonymous_id": "web-session-123",
  "channel": "web",
  "currency": "KZT",
  "items": [
    {
      "product_variant_id": "uuid",
      "sku": "RUN-SHOE-001-UK10",
      "quantity": "1",
      "unit_price": "79990.00"
    }
  ],
  "last_activity_at": "2026-07-23T10:00:00+05:00"
}
```

Response:

```json
{
  "cart_id": "uuid",
  "status": "active",
  "loyalty_preview": {
    "discount_percent": "10.00",
    "discount_amount": "7999.00",
    "net_amount": "71991.00"
  }
}
```

### Брошенная корзина

```http
POST /api/v1/ecommerce/carts/{cart_id}/abandoned
```

Response:

```json
{
  "event_id": "uuid",
  "event_type": "cart.abandoned",
  "marketing_trigger_status": "accepted"
}
```

### Онлайн-транзакция

```http
POST /api/v1/ecommerce/transactions
```

Request использует `Transaction`.

## Mobile App / Personal Cabinet API

Назначение: профиль клиента, wallet-карта, история покупок, текущая скидка, preferred locale, consent, geofence consent.

### Получить профиль

```http
GET /api/v1/me/profile
```

Response:

```json
{
  "customer": {
    "id": "uuid",
    "first_name": "Алибек",
    "preferred_locale": "kk",
    "favorite_sports": ["football", "running"],
    "size_profile": {
      "shoe": {"uk": "10"},
      "apparel": {"top": "M"}
    }
  },
  "loyalty": {
    "tier_code": "silver",
    "discount_percent": "10.00",
    "tier_valid_until": "2027-07-23"
  },
  "wallet": {
    "card_number": "980124",
    "barcode": "980124000001"
  }
}
```

### Обновить consent

```http
PUT /api/v1/me/consents
```

Request:

```json
{
  "consents": [
    {
      "channel": "push",
      "purpose": "marketing",
      "granted": true
    },
    {
      "channel": "profiling",
      "purpose": "recommendations",
      "granted": true
    }
  ]
}
```

### Зарегистрировать geofence visit

```http
POST /api/v1/mobile/geofence-events
```

Request:

```json
{
  "customer_id": "uuid",
  "device_id": "device-token-ref",
  "zone_id": "uuid",
  "event": "entered",
  "occurred_at": "2026-07-23T18:20:00+05:00"
}
```

Response:

```json
{
  "event_id": "uuid",
  "event_type": "wallet.geofence.entered",
  "marketing_trigger_status": "accepted"
}
```

## 1C / ERP API

Назначение: двусторонняя синхронизация каталога, цен, остатков, контрагентов, чеков, возвратов и справочников магазинов.

### Upsert товара

```http
PUT /api/v1/erp/products/{external_product_id}
```

Request:

```json
{
  "source_system": "1c-ut-kz",
  "sku": "RUN-SHOE-001",
  "name": {
    "ru": "Беговые кроссовки",
    "kk": "Жүгіруге арналған кроссовка",
    "en": "Running shoes"
  },
  "brand": "adidas",
  "category_external_id": "CAT-RUN",
  "sport_tags": ["running"],
  "attributes": {
    "season": "SS26"
  }
}
```

### Upsert цены и остатка

```http
PUT /api/v1/erp/product-variants/{external_variant_id}/availability
```

Request:

```json
{
  "source_system": "1c-ut-kz",
  "variant_sku": "RUN-SHOE-001-UK10",
  "barcode": "4870000000012",
  "size": {"system": "UK", "value": "10"},
  "price": {"amount": "79990.00", "currency": "KZT"},
  "inventory": [
    {
      "branch_external_id": "MEGA-ALMATY",
      "available": 12,
      "reserved": 2
    }
  ]
}
```

### Импорт чеков пачкой

```http
POST /api/v1/erp/transactions/import
```

Request:

```json
{
  "source_system": "1c-retail-kz",
  "transactions": [
    {
      "external_transaction_id": "1C-CHECK-10001",
      "type": "purchase",
      "occurred_at": "2026-07-23T15:10:00+05:00"
    }
  ]
}
```

Response:

```json
{
  "accepted": 1,
  "duplicates": 0,
  "rejected": 0,
  "sync_job_id": "uuid"
}
```

## Push / WABA / SMS / Email API

Назначение: единый контракт для отправки и получения delivery receipts. Конкретные BSP/SMS/email/push провайдеры скрыты внутри Integrations.

### Запросить отправку

```http
POST /api/v1/messages/send
```

Request:

```json
{
  "customer_id": "uuid",
  "template_code": "birthday_offer",
  "channel": "waba",
  "locale": "kk",
  "variables": {
    "first_name": "Алибек",
    "discount_percent": "15",
    "expires_in_days": "14"
  },
  "campaign_id": "uuid",
  "cascade_step": 2
}
```

Response:

```json
{
  "delivery_id": "uuid",
  "status": "queued",
  "provider": "waba-bsp",
  "correlation_id": "01J..."
}
```

### Delivery receipt webhook

```http
POST /api/v1/messages/provider-receipts/{provider}
```

Request:

```json
{
  "provider_message_id": "wamid.123",
  "status": "delivered",
  "occurred_at": "2026-07-23T15:12:00+05:00",
  "metadata": {}
}
```

Response:

```json
{
  "delivery_id": "uuid",
  "event_type": "message.delivered",
  "accepted": true
}
```

## Admin API

Назначение: администрирование клиентов, сегментов, кампаний, шаблонов, loyalty tiers, интеграций, RBAC и аудита.

### Поиск клиентов

```http
GET /api/v1/admin/customers?query=%2B7701&limit=20
```

Response возвращает маскированные PII, если роль не имеет `customer.pii.read`.

```json
{
  "data": [
    {
      "id": "uuid",
      "display_name": "Алибек С.",
      "phone_masked": "+7701***8320",
      "preferred_locale": "kk",
      "loyalty_tier": "silver",
      "annual_spend_amount": "450000.00"
    }
  ]
}
```

### Создать шаблон

```http
POST /api/v1/admin/message-templates
```

Request использует `MessageTemplate`.

### Запустить кампанию

```http
POST /api/v1/admin/campaigns/{campaign_id}/start
```

Response:

```json
{
  "campaign_id": "uuid",
  "status": "scheduled",
  "estimated_audience": 125000,
  "requires_approval": false
}
```

### Экспорт аудитории

```http
POST /api/v1/admin/segments/{segment_id}/export
```

Требует permission `customer.export` и пишет `AuditLog`.

## Webhook API

Назначение: доставка CRM-событий во внешние системы.

### Регистрация подписки

```http
POST /api/v1/admin/webhook-subscriptions
```

Request:

```json
{
  "target_url": "https://client.example.kz/uco/webhooks",
  "event_types": [
    "customer.registered",
    "loyalty.tier.changed",
    "transaction.purchase.created"
  ],
  "secret_ref": "secret-id",
  "active": true
}
```

Webhook envelope:

```json
{
  "event_id": "uuid",
  "event_type": "transaction.purchase.created",
  "occurred_at": "2026-07-23T15:10:00+05:00",
  "tenant_id": "uuid",
  "correlation_id": "01J...",
  "payload": {}
}
```

Delivery rules:

- HMAC signature in header;
- retry with exponential backoff;
- DLQ after configured attempts;
- receiver idempotency by `event_id`.
