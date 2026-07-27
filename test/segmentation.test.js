import assert from "node:assert/strict";
import test from "node:test";
import { createSegmentService } from "../src/modules/marketing/segments/index.js";
import { createApp } from "../src/platform/app.js";
import { createSeedData } from "../src/platform/seed-data.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const customerId = "11111111-1111-4111-8111-111111111111";
const asOf = "2026-07-27T00:00:00+05:00";
const footballCategoryId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";

test("segment evaluator applies purchase lifecycle windows", () => {
  const data = createLifecycleData();
  const segments = createSegmentService(data);

  const newPreview = segments.previewAudience({ tenantId, segmentCode: "new", asOf });
  const activePreview = segments.previewAudience({ tenantId, segmentCode: "active", asOf });
  const sleepingPreview = segments.previewAudience({ tenantId, segmentCode: "sleeping-90-days", asOf });
  const gonePreview = segments.previewAudience({ tenantId, segmentCode: "gone-180-days", asOf });

  assert.equal(newPreview.ok, true);
  assert.equal(activePreview.filters.purchase_within_days, null);
  assert.deepEqual(ids(newPreview), ["11111111-1111-4111-8111-111111111112", "11111111-1111-4111-8111-111111111111"]);
  assert.deepEqual(ids(activePreview), [customerId]);
  assert.deepEqual(ids(sleepingPreview), ["11111111-1111-4111-8111-111111111112", "11111111-1111-4111-8111-111111111113"]);
  assert.deepEqual(ids(gonePreview), ["11111111-1111-4111-8111-111111111114", "11111111-1111-4111-8111-111111111115"]);
});

test("buyer segments filter by canonical category, sport and size read models", () => {
  const segments = createSegmentService(createSeedData());

  const byCategory = segments.previewAudience({
    tenantId,
    segmentCode: "buyers-by-category",
    filters: { category_id: footballCategoryId },
    asOf
  });
  const bySport = segments.previewAudience({
    tenantId,
    segmentCode: "buyers-by-sport",
    filters: { sport_tag: "football" },
    asOf
  });
  const bySize = segments.previewAudience({
    tenantId,
    segmentCode: "buyers-by-size",
    filters: { size_system: "UK", size_value: "10" },
    asOf
  });
  const wrongSize = segments.previewAudience({
    tenantId,
    segmentCode: "buyers-by-size",
    filters: { size_system: "UK", size_value: "9" },
    asOf
  });

  assert.deepEqual(ids(byCategory), [customerId]);
  assert.deepEqual(ids(bySport), [customerId]);
  assert.deepEqual(ids(bySize), [customerId]);
  assert.deepEqual(ids(wrongSize), []);
  assert.equal(byCategory.data[0].purchases.category_ids.includes(footballCategoryId), true);
});

test("buyer segments use a default six month purchase window", () => {
  const recentCustomerId = "11111111-1111-4111-8111-111111111112";
  const data = createSeedData();
  data.customers = [
    customerFixture({
      id: customerId,
      created_at: "2025-01-01T00:00:00+05:00",
      last_activity: {
        type: "purchase",
        channel: "pos",
        occurred_at: "2025-12-01T00:00:00+05:00",
        source_ref: "old-window-purchase"
      }
    }),
    customerFixture({
      id: recentCustomerId,
      created_at: "2025-01-01T00:00:00+05:00",
      last_activity: {
        type: "purchase",
        channel: "pos",
        occurred_at: "2026-02-01T00:00:00+05:00",
        source_ref: "recent-window-purchase"
      }
    })
  ];
  data.transactions = [
    purchaseFixture({
      id: "33333333-3333-4333-8333-333333333390",
      customer_id: customerId,
      occurred_at: "2025-12-01T00:00:00+05:00",
      business_date: "2025-12-01"
    }),
    purchaseFixture({
      id: "33333333-3333-4333-8333-333333333391",
      customer_id: recentCustomerId,
      occurred_at: "2026-02-01T00:00:00+05:00",
      business_date: "2026-02-01"
    })
  ];

  const segments = createSegmentService(data);
  const byCategory = segments.previewAudience({
    tenantId,
    segmentCode: "buyers-by-category",
    filters: { category_id: footballCategoryId },
    asOf
  });
  const bySport = segments.previewAudience({
    tenantId,
    segmentCode: "buyers-by-sport",
    filters: { sport_tag: "football" },
    asOf
  });
  const bySize = segments.previewAudience({
    tenantId,
    segmentCode: "buyers-by-size",
    filters: { size_system: "UK", size_value: "10" },
    asOf
  });

  assert.deepEqual(ids(byCategory), [recentCustomerId]);
  assert.deepEqual(ids(bySport), [recentCustomerId]);
  assert.deepEqual(ids(bySize), [recentCustomerId]);
  assert.equal(byCategory.filters.purchase_within_days, 183);
});

test("buyer segment read models do not use catalog facts from another tenant", () => {
  const otherTenantId = "00000000-0000-4000-8000-000000000002";
  const otherCategoryId = "bbbbbbbb-bbbb-4bbb-8bbb-crossleak001";
  const data = createSeedData();
  data.products.push({
    ...structuredClone(data.products[0]),
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa99",
    tenant_id: otherTenantId,
    sku: "CROSS-TENANT-SKU",
    category_id: otherCategoryId,
    category_path: [otherCategoryId],
    sport_tags: ["cross-tenant-sport"],
    product_type: "shoes"
  });
  data.product_variants.push({
    ...structuredClone(data.product_variants[0]),
    id: "88888888-8888-4888-8888-888888888899",
    tenant_id: otherTenantId,
    product_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa99",
    variant_sku: "CROSS-TENANT-SKU",
    barcode: "4870000099999",
    size: { system: "UK", value: "13" }
  });
  data.transactions = [
    {
      ...structuredClone(data.transactions[0]),
      id: "33333333-3333-4333-8333-333333333399",
      tenant_id: tenantId,
      customer_id: customerId,
      external_transaction_id: "CROSS-TENANT-RECEIPT",
      lines: [
        {
          ...structuredClone(data.transactions[0].lines[0]),
          product_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa99",
          product_variant_id: "88888888-8888-4888-8888-888888888899",
          sku: "CROSS-TENANT-SKU",
          barcode: "4870000099999",
          attributes: {}
        }
      ]
    }
  ];

  const segments = createSegmentService(data);
  const byCategory = segments.previewAudience({
    tenantId,
    segmentCode: "buyers-by-category",
    filters: { category_id: otherCategoryId },
    asOf
  });
  const bySport = segments.previewAudience({
    tenantId,
    segmentCode: "buyers-by-sport",
    filters: { sport_tag: "cross-tenant-sport" },
    asOf
  });
  const bySize = segments.previewAudience({
    tenantId,
    segmentCode: "buyers-by-size",
    filters: { size_system: "UK", size_value: "13" },
    asOf
  });

  assert.deepEqual(ids(byCategory), []);
  assert.deepEqual(ids(bySport), []);
  assert.deepEqual(ids(bySize), []);
});

test("segment preview does not export raw PII", () => {
  const data = createSeedData();
  data.customers[0].primary_phone_e164 = "+77017578320";
  data.customers[0].primary_email_normalized = "alibek@example.com";
  const segments = createSegmentService(data);

  const preview = segments.previewAudience({ tenantId, segmentCode: "active", asOf });
  const serialized = JSON.stringify(preview);

  assert.equal(preview.ok, true);
  assert.equal(serialized.includes("+77017578320"), false);
  assert.equal(serialized.includes("alibek@example.com"), false);
  assert.equal(serialized.includes("980124000001"), false);
  assert.equal(serialized.includes("Alibek"), false);
  assert.equal(serialized.includes("Seidakhmetov"), false);
});

test("segmentation API previews, counts and explains criteria", async () => {
  const app = createApp({ data: createSeedData() });
  const previewResponse = await app.handle(
    "GET",
    `/api/v1/marketing/segments/buyers-by-category/preview?category_id=${footballCategoryId}&as_of=${encodeURIComponent(asOf)}`,
    { tenantId }
  );
  const countResponse = await app.handle(
    "GET",
    `/api/v1/marketing/segments/buyers-by-category/count?category_id=${footballCategoryId}&as_of=${encodeURIComponent(asOf)}`,
    { tenantId }
  );
  const explainResponse = await app.handle(
    "GET",
    `/api/v1/marketing/segments/buyers-by-category/explain?category_id=${footballCategoryId}`,
    { tenantId }
  );
  const missingTenantResponse = await app.handle(
    "GET",
    `/api/v1/marketing/segments/active/preview?as_of=${encodeURIComponent(asOf)}`
  );

  const preview = JSON.parse(previewResponse.body);
  const count = JSON.parse(countResponse.body);
  const explain = JSON.parse(explainResponse.body);
  const missingTenant = JSON.parse(missingTenantResponse.body);

  assert.equal(previewResponse.status, 200);
  assert.equal(preview.segment_code, "buyers-by-category");
  assert.deepEqual(preview.data.map((item) => item.customer_id), [customerId]);
  assert.equal(preview.data[0].matched_criteria.some((criterion) => criterion.code === "purchase_category"), true);
  assert.equal(countResponse.status, 200);
  assert.equal(count.count, 1);
  assert.equal(explainResponse.status, 200);
  assert.equal(explain.pii_policy.raw_pii_export, false);
  assert.equal(missingTenantResponse.status, 400);
  assert.deepEqual(missingTenant.error.details, [{ field: "tenant_context", reason: "required" }]);
});

test("segmentation API validates required parameterized buyer filters", async () => {
  const app = createApp({ data: createSeedData() });
  const response = await app.handle(
    "GET",
    `/api/v1/marketing/segments/buyers-by-size/preview?as_of=${encodeURIComponent(asOf)}&size_system=UK`,
    { tenantId }
  );
  const body = JSON.parse(response.body);

  assert.equal(response.status, 400);
  assert.deepEqual(body.error.details, [{ field: "size_value", reason: "required" }]);
});

function createLifecycleData() {
  const data = createSeedData();
  data.customers = [
    customerFixture({
      id: customerId,
      created_at: "2026-07-10T00:00:00+05:00",
      last_activity: {
        type: "purchase",
        channel: "pos",
        occurred_at: "2026-07-15T00:00:00+05:00",
        source_ref: "33333333-3333-4333-8333-333333333333"
      }
    }),
    customerFixture({
      id: "11111111-1111-4111-8111-111111111112",
      created_at: "2026-07-05T00:00:00+05:00",
      last_activity: {
        type: "profile_update",
        channel: "mobile_app",
        occurred_at: "2026-07-20T00:00:00+05:00",
        source_ref: "profile"
      }
    }),
    customerFixture({
      id: "11111111-1111-4111-8111-111111111113",
      created_at: "2025-01-01T00:00:00+05:00",
      last_activity: {
        type: "purchase",
        channel: "pos",
        occurred_at: "2026-03-01T00:00:00+05:00",
        source_ref: "sleeping-purchase"
      }
    }),
    customerFixture({
      id: "11111111-1111-4111-8111-111111111114",
      created_at: "2025-01-01T00:00:00+05:00",
      last_activity: {
        type: "purchase",
        channel: "pos",
        occurred_at: "2025-12-01T00:00:00+05:00",
        source_ref: "gone-purchase"
      }
    }),
    customerFixture({
      id: "11111111-1111-4111-8111-111111111115",
      created_at: "2025-01-01T00:00:00+05:00",
      last_activity: {
        type: null,
        channel: null,
        occurred_at: null,
        source_ref: null
      }
    })
  ];
  data.transactions = [
    purchaseFixture({
      id: "33333333-3333-4333-8333-333333333333",
      customer_id: customerId,
      occurred_at: "2026-07-15T00:00:00+05:00",
      business_date: "2026-07-15"
    }),
    purchaseFixture({
      id: "33333333-3333-4333-8333-333333333334",
      customer_id: "11111111-1111-4111-8111-111111111112",
      occurred_at: "2026-03-01T00:00:00+05:00",
      business_date: "2026-03-01"
    }),
    purchaseFixture({
      id: "33333333-3333-4333-8333-333333333335",
      customer_id: "11111111-1111-4111-8111-111111111113",
      occurred_at: "2026-03-01T00:00:00+05:00",
      business_date: "2026-03-01"
    }),
    purchaseFixture({
      id: "33333333-3333-4333-8333-333333333336",
      customer_id: "11111111-1111-4111-8111-111111111114",
      occurred_at: "2025-12-01T00:00:00+05:00",
      business_date: "2025-12-01"
    })
  ];
  return data;
}

function customerFixture(overrides) {
  return {
    id: overrides.id,
    tenant_id: tenantId,
    status: "active",
    preferred_locale: "ru",
    favorite_sports: [],
    size_profile: {
      shoe: { uk: null, us: null, eu: null, source: null },
      apparel: { top: null, bottom: null, source: null }
    },
    annual_spend: {
      amount: "0.00",
      currency: "KZT",
      rolling_window_days: 365
    },
    last_activity: overrides.last_activity,
    created_at: overrides.created_at,
    updated_at: overrides.last_activity?.occurred_at || overrides.created_at,
    version: 1
  };
}

function purchaseFixture(overrides) {
  const transaction = structuredClone(createSeedData().transactions[0]);
  transaction.id = overrides.id;
  transaction.customer_id = overrides.customer_id;
  transaction.occurred_at = overrides.occurred_at;
  transaction.business_date = overrides.business_date;
  transaction.external_transaction_id = overrides.id;
  transaction.lines = transaction.lines.map((line) => ({
    ...line,
    attributes: { sport_tags: ["football"] }
  }));
  return transaction;
}

function ids(preview) {
  return preview.data.map((item) => item.customer_id);
}
