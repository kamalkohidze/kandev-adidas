import assert from "node:assert/strict";
import test from "node:test";
import { createMessageTemplateService } from "../src/modules/marketing/content/index.js";
import { createApp } from "../src/platform/app.js";
import { createSeedData } from "../src/platform/seed-data.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const customerId = "11111111-1111-4111-8111-111111111111";
const branchId = "55555555-5555-4555-8555-555555555555";

test("content renderer falls back through i18n locale chain", () => {
  const data = createSeedData();
  data.message_templates = [
    customTemplate({
      code: "fallback_only",
      locale_variants: {
        kk: { subject: null, body: "KK {{discount}}", media_refs: [] },
        ru: { subject: null, body: "RU {{discount}}", media_refs: [] }
      },
      variables: [{ name: "discount", type: "decimal", required: true, pii: false, example: "10.00" }]
    })
  ];
  const service = createMessageTemplateService(data);
  const result = service.renderTemplate({
    tenantId,
    templateCode: "fallback_only",
    locale: "en",
    variables: { discount: "10.00" }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.requested_locale, "en");
  assert.equal(result.data.locale, "ru");
  assert.equal(result.data.fallback_used, true);
  assert.equal(result.data.body, "RU 10.00");
});

test("content renderer resolves name, size and discount without raw PII by default", () => {
  const service = createMessageTemplateService(createSeedData());
  const result = service.renderTemplate({
    tenantId,
    templateCode: "profile_offer",
    locale: "en",
    customerId,
    variables: { name: "Alibek" }
  });

  assert.equal(result.ok, true);
  assert.match(result.data.body, /customer/);
  assert.match(result.data.body, /UK 10/);
  assert.match(result.data.body, /10.00%/);
  assert.equal(result.data.body.includes("Alibek"), false);
  assert.equal(result.data.safe_mode, true);
});

test("content renderer can include localized recommendation product blocks", () => {
  const service = createMessageTemplateService(createSeedData());
  const result = service.renderTemplate({
    tenantId,
    templateCode: "recommendations_personalized",
    locale: "kk",
    customerId,
    recommendation: { branch_id: branchId, limit: 1 }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.blocks.length, 1);
  assert.equal(result.data.blocks[0].type, "product_recommendation");
  assert.equal(result.data.blocks[0].title, "Футбольные бутсы");
  assert.match(result.data.body, /1\. Футбольные бутсы/);
});

test("content renderer keeps missing dynamic tags visible and reports them", () => {
  const data = createSeedData();
  data.message_templates = [
    customTemplate({
      code: "missing_tag_template",
      locale_variants: {
        kk: { subject: null, body: "Tag {{unknown_tag}}", media_refs: [] },
        ru: { subject: null, body: "Tag {{unknown_tag}}", media_refs: [] }
      },
      variables: [{ name: "unknown_tag", type: "string", required: true, pii: false, example: "value" }]
    })
  ];
  const service = createMessageTemplateService(data);
  const result = service.renderTemplate({ tenantId, templateCode: "missing_tag_template", locale: "ru" });

  assert.equal(result.ok, true);
  assert.equal(result.data.body, "Tag {{unknown_tag}}");
  assert.deepEqual(result.data.missing_tags, ["unknown_tag"]);
});

test("content preview API renders safe localized template response", async () => {
  const app = createApp();
  const response = await app.handle(
    "POST",
    "/api/v1/marketing/content/templates/recommendations_personalized/preview",
    {
      tenantId,
      body: {
        locale: "en",
        customer_id: customerId,
        variables: { name: "Alibek" },
        recommendation: { branch_id: branchId, limit: 1 }
      }
    }
  );
  const body = JSON.parse(response.body);

  assert.equal(response.status, 200);
  assert.equal(body.data.preview, true);
  assert.equal(body.data.locale, "en");
  assert.equal(body.data.safe_mode, true);
  assert.equal(body.data.body.includes("Alibek"), false);
  assert.equal(body.data.blocks.length, 1);
  assert.equal(body.data.blocks[0].cta.label, "View");
});

function customTemplate(overrides) {
  return {
    id: `test-${overrides.code}`,
    tenant_id: tenantId,
    status: "active",
    code: overrides.code,
    name: overrides.code,
    channel: "push",
    category: "test",
    locale_variants: overrides.locale_variants,
    variables: overrides.variables,
    provider_metadata: {
      waba_template_name: null,
      email_layout_id: null,
      push_category: null
    },
    approval: {
      required: false,
      status: "approved",
      approved_by: null,
      approved_at: "2026-07-28T00:00:00.000Z"
    },
    created_at: "2026-07-28T00:00:00.000Z",
    updated_at: "2026-07-28T00:00:00.000Z",
    version: 1
  };
}
