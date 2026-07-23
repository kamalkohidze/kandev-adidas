# Customer 360

## Назначение

Customer 360 хранит и отдает единую retail-карточку покупателя для POS, сайта, мобильного приложения, Wallet-карты, личного кабинета и админки. Модуль не создает собственную модель клиента: source of truth остаются canonical `Customer`, `CustomerIdentity`, `Consent` и `Transaction` из `docs/data-contracts.md`.

Customer 360 отвечает за профиль, omnichannel identity, историю активности и безопасные read models для headless-каналов. Loyalty остается владельцем расчета tier, discount и retention gap; Customer 360 только читает snapshot текущего состояния скидки.

## Bounded contexts

### customer/profile

Владеет расширением canonical `Customer`:

- язык коммуникации `preferred_locale` с нормализацией `KZ -> kk`, `RU -> ru`, `EN -> en`;
- размеры обуви и одежды в `size_profile`;
- предпочитаемые виды спорта `favorite_sports`: `running`, `training`, `football`;
- годовой объем трат `annual_spend` как rolling projection по canonical транзакциям;
- последняя активность `last_activity` по событиям покупок, возвратов, корзины, обновлений профиля, consent и identity linking.

Не владеет каталогом размеров, товарными остатками, рекомендациями или правилами скидок.

### customer/identity

Владеет `CustomerIdentity` и read projection `OmnichannelIdentityGraph`:

- `phone` для E.164 телефона;
- `email` для нормализованного email;
- `wallet_card` и `wallet_barcode` для Wallet-карты и POS lookup;
- `app_user` для мобильного приложения;
- `web_account` для сайта и личного кабинета;
- `pos_customer` для офлайн POS;
- `erp_counterparty` для 1C/ERP;
- `messenger_contact` и `device`, если consent позволяет использование канала.

Canonical Omnichannel ID не является новым отдельным ключом. Это `Customer.id` плюс набор активных verified `CustomerIdentity` внутри tenant.

### customer/api

Отвечает за Headless API:

- `/api/v1/me/profile` для клиентского приложения и личного кабинета;
- `/api/v1/me/purchases` для истории покупок;
- `/api/v1/customers/{customer_id}/profile360` для доверенных server-to-server интеграций;
- `/api/v1/customer-identities/resolve` для POS, сайта, приложения, Wallet и телефона;
- `/api/v1/customers/{customer_id}/identities` для привязки нового канального идентификатора.

API возвращает `Customer360Profile`, `CustomerIdentityPublic` и `CustomerPurchaseHistoryItem`. Эти структуры являются read models и не заменяют canonical доменные сущности.

## Данные профиля 360

Профиль 360 включает:

- историю покупок из `Transaction` и `TransactionLine` с учетом покупок, возвратов, обменов и отмен;
- размеры обуви `uk`, `us`, `eu` и размеры одежды `top`, `bottom`;
- предпочитаемые виды спорта `running`, `training`, `football`;
- годовой объем трат за rolling window 365 дней;
- текущую скидку и tier из `LoyaltyAccount` snapshot;
- последнюю активность с типом, каналом, временем и ссылкой на исходную сущность;
- язык коммуникации `preferred_locale`.

## Identity resolution

Поток поиска клиента:

1. Канал передает `identity.type`, `identity.value`, `source_system`, `channel` и `X-Correlation-Id`.
2. API нормализует значение: телефон в E.164, email в lowercase normalized form, wallet/card barcode без пробелов и визуальных разделителей.
3. Customer Identity ищет активную пару `tenant_id + type + normalized_value`.
4. Если найден один active customer, API возвращает `customer_id` и linked channels.
5. Если найден merged customer, API возвращает survivor `customer_id` и `match_status = merged_customer`.
6. Если найдено несколько кандидатов или phone/wallet конфликтуют, API возвращает `match_status = conflict` и создает merge review case.
7. Если совпадений нет, канал может создать клиента через registration flow или передать transaction с `omnichannel_identity` без `customer_id`.

## Merge и защита от дублей

Риски дублей решаются правилами identity:

- активная пара `type + normalized_value + tenant_id` уникальна;
- phone и wallet считаются сильными идентификаторами только после verification evidence;
- Wallet barcode/card number не может быть активен у двух клиентов;
- при merge все активные identity переводятся на survivor `customer_id`, старый Customer получает `status = merged`;
- audit trail сохраняет source identities, причину merge, actor и correlation id;
- silent overwrite запрещен для телефона, Wallet и app/web account.

## PII и безопасность API

Customer 360 API следует политикам Security:

- raw phone, email, barcode, device id и messenger contact не возвращаются без permission `customer.pii.read`;
- по умолчанию используются `CustomerIdentityPublic.value_masked`, `card_number_masked` и `barcode_masked`;
- история покупок требует `customer.history.read` или владение профилем через authenticated user binding;
- scope `customer.profile.read` не дает права экспортировать аудиторию;
- все PII-доступы пишутся в `AuditLog` с `pii_accessed = true`;
- server-to-server клиенты мапятся на tenant, system id, роли и rate limits;
- webhook payloads не содержат raw PII, если подписчик не имеет отдельного разрешения и договора обработки данных.

## События и обновление read models

Customer 360 обновляет профильные проекции по canonical events:

- `customer.registered` создает базовую карточку и identity graph;
- `customer.updated` обновляет размеры, виды спорта, язык и last activity;
- `customer.identity.linked` обновляет omnichannel graph;
- `customer.consent.updated` влияет на доступность каналов, но не удаляет историю;
- `transaction.purchase.created` и `transaction.return.created` обновляют историю покупок, annual spend projection и last activity;
- `cart.updated` может обновить last activity для web/mobile канала, не создавая покупку.

Обработчики должны быть идемпотентны по `event_id` и ordering внутри `partition_key = customer_id`.

## Интеграция каналов

POS:

- ищет клиента по телефону, Wallet barcode/card number или `pos_customer`;
- получает masked профиль, текущий discount/tier snapshot и wallet barcode;
- не получает raw PII без отдельного permission.

Сайт и личный кабинет:

- связывают `web_account` с canonical `customer_id`;
- читают `/me/profile` и `/me/purchases`;
- передают обновления размеров, спорта и языка через `PATCH /me/profile`.

Мобильное приложение:

- связывает `app_user` и `device` при наличии consent;
- показывает Wallet-карту и текущий tier из profile360;
- использует `preferred_locale` для коммуникаций и UI fallback.

Wallet:

- хранит card/barcode как `CustomerIdentity` и отдельные Wallet domain objects;
- barcode используется для POS lookup;
- отображаемая скидка берется из Loyalty snapshot, а не рассчитывается Wallet или Customer 360.

Телефон:

- нормализуется в E.164;
- используется для POS lookup, SMS/WABA routing и merge candidate detection;
- требует verification evidence для сильной привязки к профилю.

## Разделение с Loyalty

Customer 360 может хранить `loyalty_account_id` и отдавать `loyalty_snapshot`, но не владеет:

- tier rules;
- discount evaluation;
- retention gap;
- исключениями товаров из скидки;
- daily loyalty audit.

Если profile API должен показать текущую скидку, он читает готовый `LoyaltyAccount.current_discount_percent` и `current_tier_id` через internal read model или service call. Любая смена tier публикуется Loyalty событием, а не прямой записью из Customer 360.
