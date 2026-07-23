# Data Contracts

## Общие правила данных

Все доменные сущности используют стабильные UUID и несут минимальный набор технических полей:

```yaml
id: uuid
tenant_id: uuid
created_at: datetime
updated_at: datetime
version: integer
status: string
```

Правила:

- `id` никогда не заменяется внешним идентификатором;
- внешние id хранятся в `external_refs`;
- даты передаются в ISO 8601 с timezone;
- суммы денег передаются в minor units или decimal string с валютой `KZT`, `RUB`, `USD`, `EUR` и др.;
- локали используют BCP 47 compatible codes: `kk`, `ru`, `en`;
- телефоны хранятся в E.164;
- PII поля маркируются политиками Security и могут маскироваться на API-слое.

## Enumerations

### Locale

```yaml
Locale:
  - kk
  - ru
  - en
```

Alias rule: бизнес-обозначение `KZ` нормализуется в `kk`; `RU` в `ru`; `EN` в `en`.

### CustomerStatus

```yaml
CustomerStatus:
  - active
  - blocked
  - merged
  - deleted
```

### IdentityType

```yaml
IdentityType:
  - phone
  - email
  - wallet_card
  - wallet_barcode
  - app_user
  - web_account
  - pos_customer
  - erp_counterparty
  - messenger_contact
  - device
```

### ConsentChannel

```yaml
ConsentChannel:
  - push
  - waba
  - sms
  - email
  - phone_call
  - profiling
```

### TransactionType

```yaml
TransactionType:
  - purchase
  - return
  - exchange
  - cancellation
  - adjustment
```

### MessageChannel

```yaml
MessageChannel:
  - push
  - waba
  - sms
  - email
```

### DeliveryStatus

```yaml
DeliveryStatus:
  - requested
  - queued
  - sent
  - delivered
  - read
  - failed
  - expired
  - cancelled
```

## Customer

Единая карточка покупателя для Customer 360, Loyalty, Marketing, Wallet и Analytics.

```yaml
Customer:
  id: uuid
  tenant_id: uuid
  status: CustomerStatus
  primary_phone_e164: string|null
  primary_email_normalized: string|null
  first_name: string|null
  last_name: string|null
  middle_name: string|null
  birth_date: date|null
  gender: string|null
  preferred_locale: Locale
  country_code: string
  city: string|null
  favorite_sports:
    - string
  size_profile:
    shoe:
      uk: string|null
      us: string|null
      eu: string|null
      source: string|null
    apparel:
      top: string|null
      bottom: string|null
      source: string|null
  lifecycle_status: string
  annual_spend:
    amount: decimal_string
    currency: string
    rolling_window_days: integer
  loyalty_account_id: uuid|null
  external_refs:
    - system: string
      type: IdentityType
      value: string
      verified: boolean
      linked_at: datetime
  created_at: datetime
  updated_at: datetime
  version: integer
```

Инварианты:

- `preferred_locale` обязателен и по умолчанию равен `ru`, если клиент не выбрал язык;
- минимум одна активная identity требуется для использования клиента в маркетинговых сценариях;
- `birth_date` может использоваться для триггера дня рождения только при наличии consent на соответствующий канал;
- `primary_phone_e164` и `primary_email_normalized` не являются глобальными primary key.

## CustomerIdentity

```yaml
CustomerIdentity:
  id: uuid
  tenant_id: uuid
  customer_id: uuid
  type: IdentityType
  value: string
  normalized_value: string
  source_system: string
  is_primary: boolean
  is_verified: boolean
  is_active: boolean
  verified_at: datetime|null
  first_seen_at: datetime
  last_seen_at: datetime
  metadata: object
  created_at: datetime
  updated_at: datetime
  version: integer
```

Инварианты:

- активная пара `type + normalized_value + tenant_id` уникальна;
- при merge старые identity переводятся на survivor `customer_id`;
- device identity без consent не используется для маркетинговых отправок.

## Consent

```yaml
Consent:
  id: uuid
  tenant_id: uuid
  customer_id: uuid
  channel: ConsentChannel
  purpose: string
  granted: boolean
  source_system: string
  evidence_ref: string|null
  granted_at: datetime|null
  revoked_at: datetime|null
  expires_at: datetime|null
  created_at: datetime
  updated_at: datetime
  version: integer
```

## Product

Canonical товар для Catalog, Loyalty exceptions, Recommendations и Marketing content.

```yaml
Product:
  id: uuid
  tenant_id: uuid
  status: string
  sku: string
  name:
    kk: string|null
    ru: string
    en: string|null
  description:
    kk: string|null
    ru: string|null
    en: string|null
  brand: string
  category_id: uuid
  category_path:
    - uuid
  sport_tags:
    - string
  product_type: string
  collection: string|null
  season: string|null
  attributes: object
  discount_policy:
    loyalty_discount_allowed: boolean
    global_sale_excluded: boolean
    personal_promo_allowed: boolean
  external_refs:
    - system: string
      value: string
  created_at: datetime
  updated_at: datetime
  version: integer
```

Инварианты:

- `sku` уникален внутри tenant;
- локализованное `name.ru` обязательно как базовый fallback;
- loyalty rules не должны храниться внутри Product, только flags для evaluation.

## ProductVariant

```yaml
ProductVariant:
  id: uuid
  tenant_id: uuid
  product_id: uuid
  variant_sku: string
  barcode: string|null
  color:
    code: string|null
    name:
      kk: string|null
      ru: string|null
      en: string|null
  size:
    system: string
    value: string
  price:
    amount: decimal_string
    currency: string
  branch_prices:
    - branch_id: uuid
      amount: decimal_string
      currency: string
      valid_from: datetime
      valid_to: datetime|null
  inventory:
    total_available: integer
    by_branch:
      - branch_id: uuid
        available: integer
        reserved: integer
  status: string
  external_refs:
    - system: string
      value: string
  created_at: datetime
  updated_at: datetime
  version: integer
```

## Transaction

Canonical чек, покупка, возврат или корректировка. Используется Loyalty, Customer 360, Marketing triggers и Analytics.

```yaml
Transaction:
  id: uuid
  tenant_id: uuid
  type: TransactionType
  status: string
  customer_id: uuid|null
  omnichannel_identity:
    type: IdentityType|null
    value: string|null
  store_id: uuid|null
  channel: string
  source_system: string
  external_transaction_id: string
  fiscal_receipt_id: string|null
  original_transaction_id: uuid|null
  business_date: date
  occurred_at: datetime
  currency: string
  totals:
    gross_amount: decimal_string
    discount_amount: decimal_string
    loyalty_discount_amount: decimal_string
    promo_discount_amount: decimal_string
    tax_amount: decimal_string
    net_amount: decimal_string
  payment_methods:
    - type: string
      amount: decimal_string
      provider_ref: string|null
  loyalty:
    tier_id: uuid|null
    discount_percent: decimal_string|null
    evaluation_id: uuid|null
  lines:
    - TransactionLine
  created_at: datetime
  updated_at: datetime
  version: integer
```

Инварианты:

- `source_system + external_transaction_id + tenant_id` уникальны для идемпотентного ingest;
- возврат ссылается на `original_transaction_id`, если исходная покупка известна;
- `customer_id` может быть null при неидентифицированном чеке, но identity lookup должен сохраняться в `omnichannel_identity`;
- loyalty annual spend пересчитывается только по eligible net amount.

## TransactionLine

```yaml
TransactionLine:
  id: uuid
  line_number: integer
  product_id: uuid|null
  product_variant_id: uuid|null
  sku: string
  barcode: string|null
  name: string
  quantity: decimal_string
  unit_price:
    amount: decimal_string
    currency: string
  gross_amount: decimal_string
  discount_amount: decimal_string
  net_amount: decimal_string
  loyalty_eligible_amount: decimal_string
  tax_amount: decimal_string
  applied_discounts:
    - type: string
      code: string|null
      amount: decimal_string
      stackable: boolean
  attributes: object
```

## Cart

Корзина не заменяет Transaction. Она используется для e-commerce/mobile событий, брошенной корзины и предварительного loyalty evaluation.

```yaml
Cart:
  id: uuid
  tenant_id: uuid
  customer_id: uuid|null
  anonymous_id: string|null
  channel: string
  status: string
  currency: string
  items:
    - product_variant_id: uuid
      sku: string
      quantity: decimal_string
      unit_price: decimal_string
      added_at: datetime
  totals:
    gross_amount: decimal_string
    discount_amount: decimal_string
    net_amount: decimal_string
  last_activity_at: datetime
  expires_at: datetime|null
  created_at: datetime
  updated_at: datetime
  version: integer
```

## LoyaltyAccount

```yaml
LoyaltyAccount:
  id: uuid
  tenant_id: uuid
  customer_id: uuid
  current_tier_id: uuid
  current_discount_percent: decimal_string
  annual_eligible_spend:
    amount: decimal_string
    currency: string
    window_start: date
    window_end: date
  tier_valid_until: date|null
  retention_gap_amount:
    amount: decimal_string
    currency: string
  status: string
  created_at: datetime
  updated_at: datetime
  version: integer
```

## MessageTemplate

Единый шаблон для Marketing и каналов Push/WABA/SMS/Email.

```yaml
MessageTemplate:
  id: uuid
  tenant_id: uuid
  status: string
  code: string
  name: string
  channel: MessageChannel
  category: string
  locale_variants:
    kk:
      subject: string|null
      body: string
      media_refs:
        - string
    ru:
      subject: string|null
      body: string
      media_refs:
        - string
    en:
      subject: string|null
      body: string
      media_refs:
        - string
  variables:
    - name: string
      type: string
      required: boolean
      pii: boolean
      example: string
  provider_metadata:
    waba_template_name: string|null
    email_layout_id: string|null
    push_category: string|null
  approval:
    required: boolean
    status: string
    approved_by: uuid|null
    approved_at: datetime|null
  created_at: datetime
  updated_at: datetime
  version: integer
```

Инварианты:

- `code + channel + tenant_id` уникален;
- `kk` и `ru` variants обязательны для клиентских коммуникаций в РК;
- переменные валидируются до запуска кампании;
- WABA templates должны хранить provider approval metadata, но не зависеть от конкретного BSP.

## MessageDelivery

```yaml
MessageDelivery:
  id: uuid
  tenant_id: uuid
  customer_id: uuid
  campaign_id: uuid|null
  journey_id: uuid|null
  template_id: uuid
  channel: MessageChannel
  locale: Locale
  cascade_step: integer
  recipient_identity_id: uuid|null
  recipient_address_masked: string
  provider: string|null
  provider_message_id: string|null
  status: DeliveryStatus
  requested_at: datetime
  queued_at: datetime|null
  sent_at: datetime|null
  delivered_at: datetime|null
  read_at: datetime|null
  failed_at: datetime|null
  failure_code: string|null
  failure_message: string|null
  correlation_id: string
  idempotency_key: string
  metadata: object
  created_at: datetime
  updated_at: datetime
  version: integer
```

## ExternalSystemMapping

```yaml
ExternalSystemMapping:
  id: uuid
  tenant_id: uuid
  domain_type: string
  domain_id: uuid
  external_system: string
  external_type: string
  external_id: string
  active: boolean
  first_seen_at: datetime
  last_seen_at: datetime
  metadata: object
  created_at: datetime
  updated_at: datetime
  version: integer
```

## AuditLog

```yaml
AuditLog:
  id: uuid
  tenant_id: uuid
  actor_type: string
  actor_id: uuid|string
  action: string
  resource_type: string
  resource_id: uuid|string
  pii_accessed: boolean
  before_hash: string|null
  after_hash: string|null
  ip_address: string|null
  user_agent: string|null
  correlation_id: string
  occurred_at: datetime
  metadata: object
```

## Расширение контрактов

Новые модули должны расширять эти структуры одним из способов:

- добавлять optional поля в `attributes`/`metadata`;
- добавлять reference-таблицы с `domain_id`;
- добавлять новые event types;
- добавлять новые API resources.

Запрещено создавать отдельные `Customer`, `Product`, `Transaction` или `MessageTemplate` модели внутри модулей без явного alias на эти canonical contracts.
