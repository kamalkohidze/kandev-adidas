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

### Получить профиль 360

```http
GET /api/v1/me/profile?include=identities,purchase_history,loyalty_snapshot,wallet
```

Response использует `Customer360Profile` из `docs/data-contracts.md`. По умолчанию возвращаются профиль, текущая скидка/tier и wallet; история покупок и identity graph подключаются через `include`.

```json
{
  "customer": {
    "id": "uuid",
    "status": "active",
    "first_name": "Алибек",
    "last_name": "Сейдахметов",
    "preferred_locale": "kk",
    "favorite_sports": ["football", "running"],
    "size_profile": {
      "shoe": {"uk": "10", "us": null, "eu": "44", "source": "profile"},
      "apparel": {"top": "M", "bottom": null, "source": "profile"}
    },
    "annual_spend": {"amount": "450000.00", "currency": "KZT", "rolling_window_days": 365},
    "last_activity": {
      "type": "purchase",
      "channel": "pos",
      "occurred_at": "2026-07-15T18:20:00+05:00",
      "source_ref": "uuid"
    }
  },
  "loyalty_snapshot": {
    "loyalty_account_id": "uuid",
    "tier_code": "silver",
    "tier_name": "Silver",
    "discount_percent": "10.00",
    "tier_valid_until": "2027-07-23",
    "annual_eligible_spend": {
      "amount": "450000.00",
      "currency": "KZT",
      "window_start": "2025-07-24",
      "window_end": "2026-07-23"
    }
  },
  "wallet": {
    "card_number_masked": "980***",
    "barcode_masked": "980124******"
  },
  "identities": [
    {
      "id": "uuid",
      "type": "phone",
      "value_masked": "+7701***8320",
      "source_system": "mobile-app",
      "is_primary": true,
      "is_verified": true,
      "is_active": true,
      "first_seen_at": "2026-01-10T10:00:00+05:00",
      "last_seen_at": "2026-07-23T10:00:00+05:00"
    }
  ],
  "purchase_history": [
    {
      "transaction_id": "uuid",
      "type": "purchase",
      "status": "completed",
      "channel": "pos",
      "store_id": "uuid",
      "business_date": "2026-07-15",
      "occurred_at": "2026-07-15T18:20:00+05:00",
      "currency": "KZT",
      "totals": {
        "gross_amount": "79990.00",
        "discount_amount": "7999.00",
        "loyalty_discount_amount": "7999.00",
        "net_amount": "71991.00"
      },
      "loyalty": {
        "tier_id": "uuid",
        "discount_percent": "10.00",
        "evaluation_id": "uuid"
      },
      "lines": [
        {"sku": "RUN-SHOE-001-UK10", "name": "Бутсы", "quantity": "1", "net_amount": "71991.00", "product_variant_id": "uuid"}
      ]
    }
  ],
  "generated_at": "2026-07-23T10:00:00+05:00"
}
```

Правила безопасности:

- ответ не содержит raw phone, email, barcode, device id и messenger contact без permission `customer.pii.read`;
- `loyalty_snapshot` передает текущую скидку из Loyalty read model, но этот API не рассчитывает discount;
- `purchase_history` доступна владельцу профиля или доверенному headless-клиенту со scope `customer.history.read`;
- `Accept-Language` управляет локализуемыми названиями, но `preferred_locale` остается сохраненным языком коммуникации клиента.

### Обновить retail-профиль

```http
PATCH /api/v1/me/profile
```

Request:

```json
{
  "preferred_locale": "kk",
  "favorite_sports": ["football", "running"],
  "size_profile": {
    "shoe": {"uk": "10", "eu": "44", "source": "self_reported"},
    "apparel": {"top": "M", "source": "self_reported"}
  }
}
```

Response:

```json
{
  "customer_id": "uuid",
  "version": 12,
  "event_type": "customer.updated"
}
```

### Получить историю покупок

```http
GET /api/v1/me/purchases?limit=20&cursor=opaque-cursor
```

Response:

```json
{
  "data": [
    {
      "transaction_id": "uuid",
      "type": "purchase",
      "status": "completed",
      "channel": "pos",
      "store_id": "uuid",
      "business_date": "2026-07-15",
      "occurred_at": "2026-07-15T18:20:00+05:00",
      "currency": "KZT",
      "totals": {
        "gross_amount": "79990.00",
        "discount_amount": "7999.00",
        "loyalty_discount_amount": "7999.00",
        "net_amount": "71991.00"
      },
      "loyalty": {
        "tier_id": "uuid",
        "discount_percent": "10.00",
        "evaluation_id": "uuid"
      },
      "lines": [
        {"sku": "RUN-SHOE-001-UK10", "name": "Бутсы", "quantity": "1", "net_amount": "71991.00", "product_variant_id": "uuid"}
      ]
    }
  ],
  "page": {"limit": 20, "next_cursor": "opaque-cursor", "has_more": true}
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


## Customer 360 Headless API

Назначение: server-to-server передача профиля, текущей скидки/tier, истории покупок и omnichannel identities в существующий личный кабинет, сайт и мобильное приложение. Эти методы принадлежат customer/api и возвращают Customer 360 read models поверх canonical контрактов.

### Получить профиль 360 по customer id

```http
GET /api/v1/customers/{customer_id}/profile360?include=identities,purchase_history,loyalty_snapshot,wallet
```

Response использует `Customer360Profile`. Для history применяется та же пагинация, что в общем стандарте; если `purchase_history` не запрошена, блок не возвращается.

Обязательные scopes:

- `customer.profile.read` для базового профиля;
- `customer.history.read` для истории покупок;
- `customer.identity.read` для omnichannel graph;
- `customer.pii.read` только для немаскированных PII, по умолчанию PII маскируются.

### Разрешить omnichannel identity

```http
POST /api/v1/customer-identities/resolve
```

Request:

```json
{
  "identity": {
    "type": "wallet_barcode",
    "value": "980124000001"
  },
  "source_system": "pos-kassa",
  "channel": "pos"
}
```

Response:

```json
{
  "customer_id": "uuid",
  "match_status": "matched",
  "matched_identity_id": "uuid",
  "requires_merge_review": false,
  "linked_channels": {
    "pos": true,
    "web": true,
    "mobile_app": true,
    "wallet": true,
    "phone": true
  }
}
```

`match_status` values: `matched`, `not_found`, `conflict`, `merged_customer`. При `conflict` API не выполняет автослияние и возвращает `requires_merge_review = true`.

### Привязать identity к клиенту

```http
POST /api/v1/customers/{customer_id}/identities
```

Request:

```json
{
  "type": "app_user",
  "value": "app-user-123",
  "source_system": "mobile-app",
  "is_primary": false,
  "verification": {
    "verified": true,
    "method": "oauth_subject"
  }
}
```

Response:

```json
{
  "identity_id": "uuid",
  "customer_id": "uuid",
  "event_type": "customer.identity.linked",
  "merge_review_required": false
}
```

Правила:

- write-запрос идемпотентен по `Idempotency-Key + type + normalized_value + tenant_id`;
- телефон нормализуется в E.164, email в lowercase normalized form, wallet barcode/card number без пробелов и визуальных разделителей;
- если активная identity уже связана с другим active customer, создается conflict/audit case, а не новый дубль;
- phone и wallet linking требуют verified evidence или admin permission `customer.identity.link_unverified`.

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
