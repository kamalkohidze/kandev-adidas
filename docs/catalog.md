# Catalog

Модуль `src/modules/catalog` использует канонические контракты `Product` и
`ProductVariant` из `docs/data-contracts.md`. Цена, branch prices и остатки не
являются отдельными моделями: сервисы `prices` и `inventory` читают и изменяют
поля `price`, `branch_prices` и `inventory` внутри `ProductVariant`.

## Поведение

- `Product.sku`, `ProductVariant.variant_sku` и непустой barcode уникальны в
  пределах tenant.
- `Product.name.ru` обязателен. Для `kk`, `ru`, `en` порядок fallback:
  запрошенная локаль, затем `ru`, `en`, `kk`.
- `Product.attributes` принимает произвольный JSON-совместимый объект.
- Размерная система хранится в каноническом `size.system`; реализованы и
  протестированы `UK`, `US`, `EU`, при этом контракт остается расширяемым.
- Branch price выбирается по `branch_id` и интервалу `valid_from`/`valid_to`.
  Если активной branch price нет, возвращается базовая `price`.
- Остатки фильтруются по variant/product, размеру и branch. `available` и
  `reserved` являются неотрицательными целыми числами.
- Изменения публикуются в локальный outbox `catalog_events` с canonical names:
  `catalog.product.upserted`, `catalog.price.changed`,
  `catalog.inventory.changed`.

`docs/events.md` фиксирует имена catalog events, но не задает их payload.
Реализация передает только стабильные canonical ID, SKU, version и снимок
изменившейся цены или остатка; это явно отмечено в фабрике событий.

## Read API

В `docs/api-contracts.md` отсутствуют read paths каталога (там описаны только ERP
write contracts, относящиеся к задаче интеграций). Модуль использует единый
headless namespace:

- `GET /api/v1/catalog/products`
- `GET /api/v1/catalog/products/{product_id}`
- `GET /api/v1/catalog/products/{product_id}/variants`
- `GET /api/v1/catalog/variants`
- `GET /api/v1/catalog/variants/{variant_id}`
- `GET /api/v1/catalog/variants/{variant_id}/price`
- `GET /api/v1/catalog/variants/{variant_id}/inventory`
- `GET /api/v1/catalog/prices`
- `GET /api/v1/catalog/inventory`

Основные query-параметры: `tenant_id`, `query`/`q`, `locale`, `branch_id`,
`product_id`, `size_system`, `size_value`, `status`, `in_stock`, `at`, `limit`.
`Accept-Language` поддерживает canonical aliases, включая `KZ -> kk`.

ERP/1C import и write endpoints намеренно не реализованы в этом модуле.
