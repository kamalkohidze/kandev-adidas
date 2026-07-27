# Recommendations

Модуль `src/modules/recommendations` использует canonical `Customer`,
`Product`, `ProductVariant` и `Transaction` без изменения их схем. Он строит
детерминированные рекомендации по размерному профилю клиента, любимым видам
спорта, истории покупок и доступным остаткам каталога.

## Engine

- Берет active customer внутри tenant.
- Берет только active products и active variants из catalog services.
- Отбрасывает variant без доступного остатка. При `branch_id` проверяется
  branch-level остаток, иначе `total_available`.
- Для `product_type = shoes` требует совпадение размера `UK`, `US` или `EU` из
  `Customer.size_profile.shoe`, если такой размер задан.
- Для `product_type = apparel` требует совпадение `Customer.size_profile.apparel`
  с `INT` размером варианта, если такой размер задан.
- Сортирует стабильно: score по favorite sports, purchase affinity, доступному
  размеру и остатку, затем `sku` и `variant_sku`.
- Reasons не содержат phone, email, barcode, имени клиента или других PII.

## API

Customer recommendations:

```http
GET /api/v1/customers/{customer_id}/recommendations?branch_id=uuid&locale=ru&limit=10
```

Segment recommendations:

```http
GET /api/v1/recommendations/segments/{segment_code}?branch_id=uuid&locale=ru&limit=10
```

Оба endpoint требуют trusted `tenantId` от платформы, как catalog read API.
Поддерживаются segment codes:

- `active-customers`
- `sport:{favorite_sport}`, например `sport:running`
- `high-value`

Если добавить `include=message_blocks`, ответ включает `message_blocks` с
локализованными названиями товаров и короткими reason subtitles для рассылок.
