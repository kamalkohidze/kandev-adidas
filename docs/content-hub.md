# Content Hub

`src/modules/marketing/content` implements runtime `MessageTemplate` rendering for Marketing content previews. It uses the canonical contract from `docs/data-contracts.md` and does not change delivery provider contracts or send messages physically.

## Runtime Model

- `createMessageTemplateRepository(data)` reads tenant templates from `data.message_templates` when present and falls back to built-in seed templates for the scaffold tenant.
- `createMessageTemplateService(data)` resolves templates by `tenant_id + code + channel`, renders locale variants, and can attach recommendation product blocks.
- Locale fallback reuses the i18n fallback chain: requested locale, then `ru`.
- Dynamic tags support `{{name}}`, `{{size}}`, `{{discount}}`, ordinary variables, and `{{product_blocks}}`/`{{recommendations}}`.
- Tags that cannot be resolved stay visible in the output and are reported in `missing_tags`.

## PII Safety

Raw PII is not substituted by default. Template variables marked `pii: true` and known PII tags such as `name`, `first_name`, `phone`, `email`, and `customer_id` render as a generic localized label unless `allow_raw_pii: true` is explicitly passed by a trusted caller.

## API

```http
GET /api/v1/marketing/content/templates
POST /api/v1/marketing/content/templates/{template_code}/preview
POST /api/v1/marketing/content/templates/{template_code}/render
```

Preview/render request:

```json
{
  "channel": "push",
  "locale": "kk",
  "customer_id": "11111111-1111-4111-8111-111111111111",
  "variables": {
    "discount": "10.00"
  },
  "recommendation": {
    "branch_id": "55555555-5555-4555-8555-555555555555",
    "limit": 4
  }
}
```

The response includes rendered `subject`, `body`, `blocks`, selected `locale`, `fallback_used`, `missing_tags`, and `safe_mode`.
