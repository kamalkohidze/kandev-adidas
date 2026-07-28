import assert from "node:assert/strict";
import test from "node:test";
import { createCrossSellService } from "../src/modules/marketing/cross-sell/index.js";
import { createApp } from "../src/platform/app.js";
import { createSeedData } from "../src/platform/seed-data.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const customerId = "11111111-1111-4111-8111-111111111111";
const branchId = "55555555-5555-4555-8555-555555555555";

test("shoe-care coupon after purchase", () => {
  const data = createCrossSellData();
  const crossSell = createCrossSellService(data);

  const result = crossSell.generateCandidates({
    tenantId,
    asOf: "2026-07-16T00:00:00.000Z",
    branchId,
    locale: "en",
    scenarioCodes: ["shoe-care-after-purchase"]
  });

  assert.equal(result.ok, true);
  assert.equal(result.created, 1);
  assert.equal(data.promotion_coupons.length, 1);

  const [candidate] = result.data;
  assert.equal(candidate.scenario_code, "shoe-care-after-purchase");
  assert.equal(candidate.journey_code, "shoe-care");
  assert.equal(candidate.coupon.promotion_type, "cross_sell");
  assert.equal(candidate.coupon.discount_percent, "10.00");
  assert.equal(candidate.message_blocks.blocks.some((block) => block.sku === "SHOE-CARE-001"), true);
});

test("running accessories after 14 days", () => {
  const data = createCrossSellData();
  data.transactions = [purchaseFixture({
    id: "33333333-3333-4333-8333-333333333501",
    product_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
    product_variant_id: "88888888-8888-4888-8888-888888888893",
    sku: "RUN-SHOE-002-UK10",
    barcode: "4870000000100",
    sport_tags: ["running"],
    occurred_at: "2026-07-01T00:00:00.000Z",
    business_date: "2026-07-01"
  })];

  const result = createCrossSellService(data).generateCandidates({
    tenantId,
    asOf: "2026-07-15T00:00:00.000Z",
    branchId,
    locale: "en",
    scenarioCodes: ["running-accessories-after-14-days"]
  });

  assert.equal(result.ok, true);
  assert.equal(result.created, 1);
  assert.equal(result.data[0].days_since_source_purchase, 14);
  assert.equal(result.data[0].scenario_code, "running-accessories-after-14-days");
  assert.equal(result.data[0].recommendation_set.data.every((item) => item.product_type === "accessory"), true);
  assert.equal(result.data[0].recommendation_set.data.some((item) => item.sku === "RUN-SOCK-001"), true);
  assert.equal(result.data[0].recommendation_set.data.some((item) => item.sku === "RUN-SOCK-002"), false);
});

test("replacement after 12 months", () => {
  const data = createCrossSellData();
  data.transactions = [purchaseFixture({
    id: "33333333-3333-4333-8333-333333333601",
    product_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6",
    product_variant_id: "88888888-8888-4888-8888-888888888896",
    sku: "OLD-RUN-SHOE-001-UK10",
    barcode: "4870000000200",
    sport_tags: ["running"],
    occurred_at: "2025-07-15T00:00:00.000Z",
    business_date: "2025-07-15"
  })];

  const result = createCrossSellService(data).generateCandidates({
    tenantId,
    asOf: "2026-07-15T00:00:00.000Z",
    branchId,
    locale: "en",
    scenarioCodes: ["shoe-replacement-after-12-months"]
  });

  assert.equal(result.ok, true);
  assert.equal(result.created, 1);
  assert.equal(result.data[0].days_since_source_purchase, 365);
  assert.equal(result.data[0].journey_code, "shoe-replacement");
  assert.equal(result.data[0].recommendation_set.data.every((item) => item.product_type === "shoes"), true);
  assert.equal(result.data[0].recommendation_set.data.some((item) => item.sku === "RUN-SHOE-REPL-001"), true);
  assert.equal(result.data[0].recommendation_set.data.some((item) => item.sku === "RUN-SHOE-OTHER-001"), false);
});

test("no duplicate candidate", () => {
  const data = createCrossSellData();
  const crossSell = createCrossSellService(data);
  const request = {
    tenantId,
    asOf: "2026-07-16T00:00:00.000Z",
    branchId,
    scenarioCodes: ["shoe-care-after-purchase"]
  };

  const first = crossSell.generateCandidates(request);
  const second = crossSell.generateCandidates(request);

  assert.equal(first.created, 1);
  assert.equal(second.created, 0);
  assert.equal(second.duplicate_count, 1);
  assert.equal(data.cross_sell_candidates.length, 1);
  assert.equal(data.promotion_coupons.length, 1);
});

test("revoked consent blocks cross-sell candidate", () => {
  const data = createCrossSellData();
  data.consents = [
    consentFixture({
      channel: "push",
      revoked_at: "2026-07-15T23:59:59.000Z"
    })
  ];

  const result = createCrossSellService(data).generateCandidates({
    tenantId,
    asOf: "2026-07-16T00:00:00.000Z",
    branchId,
    scenarioCodes: ["shoe-care-after-purchase"]
  });

  assert.equal(result.ok, true);
  assert.equal(result.created, 0);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].reason, "marketing_consent_required");
  assert.equal(data.cross_sell_candidates?.length || 0, 0);
  assert.equal(data.promotion_coupons.length, 0);
});

test("future consent grant does not authorize cross-sell candidate", () => {
  const data = createCrossSellData();
  data.consents = [
    consentFixture({
      channel: "push",
      granted_at: "2026-07-17T00:00:00.000Z"
    })
  ];

  const result = createCrossSellService(data).generateCandidates({
    tenantId,
    asOf: "2026-07-16T00:00:00.000Z",
    branchId,
    scenarioCodes: ["shoe-care-after-purchase"]
  });

  assert.equal(result.ok, true);
  assert.equal(result.created, 0);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].reason, "marketing_consent_required");
  assert.equal(data.cross_sell_candidates?.length || 0, 0);
  assert.equal(data.promotion_coupons.length, 0);
});

test("cross-sell API generates and lists candidates without delivery events", async () => {
  const data = createCrossSellData();
  const app = createApp({ data });

  const created = await app.handle("POST", "/api/v1/marketing/cross-sell/candidates", {
    tenantId,
    body: {
      as_of: "2026-07-16T00:00:00.000Z",
      branch_id: branchId,
      locale: "en",
      scenario_codes: ["shoe-care-after-purchase"]
    }
  });
  const createdBody = JSON.parse(created.body);
  assert.equal(created.status, 201);
  assert.equal(createdBody.created, 1);
  assert.equal(data.promotion_events.some((event) => event.event_type === "message.delivery.requested"), false);

  const listed = await app.handle("GET", "/api/v1/marketing/cross-sell/candidates?scenario_code=shoe-care-after-purchase", {
    tenantId
  });
  const listedBody = JSON.parse(listed.body);
  assert.equal(listed.status, 200);
  assert.equal(listedBody.data.length, 1);
});

function createCrossSellData() {
  const data = createSeedData();
  data.consents = [consentFixture({ channel: "push" })];
  data.products.push(
    productFixture({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
      sku: "RUN-SHOE-002",
      name: { kk: "Running shoes", ru: "Running shoes", en: "Running shoes" },
      sport_tags: ["running"],
      product_type: "shoes"
    }),
    productFixture({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
      sku: "SHOE-CARE-001",
      name: { kk: "Shoe care kit", ru: "Shoe care kit", en: "Shoe care kit" },
      sport_tags: ["football", "running"],
      product_type: "care"
    }),
    productFixture({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5",
      sku: "RUN-SOCK-001",
      name: { kk: "Running socks", ru: "Running socks", en: "Running socks" },
      sport_tags: ["running"],
      product_type: "accessory"
    }),
    productFixture({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8",
      sku: "RUN-SOCK-002",
      name: { kk: "Wrong size running socks", ru: "Wrong size running socks", en: "Wrong size running socks" },
      sport_tags: ["running"],
      product_type: "accessory"
    }),
    productFixture({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6",
      sku: "OLD-RUN-SHOE-001",
      name: { kk: "Old running shoes", ru: "Old running shoes", en: "Old running shoes" },
      sport_tags: ["running"],
      product_type: "shoes",
      collection: "adizero"
    }),
    productFixture({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7",
      sku: "RUN-SHOE-REPL-001",
      name: { kk: "Replacement running shoes", ru: "Replacement running shoes", en: "Replacement running shoes" },
      sport_tags: ["running"],
      product_type: "shoes",
      collection: "adizero"
    }),
    productFixture({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9",
      sku: "RUN-SHOE-OTHER-001",
      name: { kk: "Other line running shoes", ru: "Other line running shoes", en: "Other line running shoes" },
      sport_tags: ["running"],
      product_type: "shoes",
      collection: "ultraboost"
    })
  );
  data.product_variants.push(
    variantFixture({
      id: "88888888-8888-4888-8888-888888888893",
      product_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
      variant_sku: "RUN-SHOE-002-UK10",
      barcode: "4870000000100",
      size: { system: "UK", value: "10" },
      available: 8
    }),
    variantFixture({
      id: "88888888-8888-4888-8888-888888888894",
      product_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
      variant_sku: "SHOE-CARE-001-OS",
      barcode: "4870000000101",
      size: { system: "ONE", value: "OS" },
      available: 12
    }),
    variantFixture({
      id: "88888888-8888-4888-8888-888888888895",
      product_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5",
      variant_sku: "RUN-SOCK-001-M",
      barcode: "4870000000102",
      size: { system: "INT", value: "M" },
      available: 10
    }),
    variantFixture({
      id: "88888888-8888-4888-8888-888888888898",
      product_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8",
      variant_sku: "RUN-SOCK-002-L",
      barcode: "4870000000103",
      size: { system: "INT", value: "L" },
      available: 10
    }),
    variantFixture({
      id: "88888888-8888-4888-8888-888888888896",
      product_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6",
      variant_sku: "OLD-RUN-SHOE-001-UK10",
      barcode: "4870000000200",
      size: { system: "UK", value: "10" },
      available: 0
    }),
    variantFixture({
      id: "88888888-8888-4888-8888-888888888897",
      product_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7",
      variant_sku: "RUN-SHOE-REPL-001-UK10",
      barcode: "4870000000201",
      size: { system: "UK", value: "10" },
      available: 9
    }),
    variantFixture({
      id: "88888888-8888-4888-8888-888888888899",
      product_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9",
      variant_sku: "RUN-SHOE-OTHER-001-UK10",
      barcode: "4870000000202",
      size: { system: "UK", value: "10" },
      available: 9
    })
  );
  return data;
}

function consentFixture({ channel, granted_at = "2026-01-01T00:00:00.000Z", revoked_at = null, expires_at = "2027-01-01T00:00:00.000Z" }) {
  return {
    id: `consent-${channel}`,
    tenant_id: tenantId,
    customer_id: customerId,
    channel,
    purpose: "marketing",
    granted: true,
    source_system: "test",
    evidence_ref: "test-consent",
    granted_at,
    revoked_at,
    expires_at,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    version: 1
  };
}

function productFixture(overrides) {
  return {
    id: overrides.id,
    tenant_id: tenantId,
    status: "active",
    sku: overrides.sku,
    name: overrides.name,
    description: { kk: null, ru: null, en: null },
    brand: "adidas",
    category_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9",
    category_path: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9"],
    sport_tags: overrides.sport_tags,
    product_type: overrides.product_type,
    collection: overrides.collection || null,
    season: null,
    attributes: {},
    discount_policy: {
      loyalty_discount_allowed: true,
      global_sale_excluded: false,
      personal_promo_allowed: true
    },
    external_refs: [],
    created_at: "2026-01-01T00:00:00+05:00",
    updated_at: "2026-01-01T00:00:00+05:00",
    version: 1
  };
}

function variantFixture(overrides) {
  return {
    id: overrides.id,
    tenant_id: tenantId,
    product_id: overrides.product_id,
    variant_sku: overrides.variant_sku,
    barcode: overrides.barcode,
    color: { code: "black", name: { kk: null, ru: "Black", en: "Black" } },
    size: overrides.size,
    price: { amount: "79990.00", currency: "KZT" },
    branch_prices: [],
    inventory: {
      total_available: overrides.available,
      by_branch: [{ branch_id: branchId, available: overrides.available, reserved: 0 }]
    },
    status: "active",
    external_refs: [],
    created_at: "2026-01-01T00:00:00+05:00",
    updated_at: "2026-01-01T00:00:00+05:00",
    version: 1
  };
}

function purchaseFixture(overrides) {
  return {
    id: overrides.id,
    tenant_id: tenantId,
    type: "purchase",
    status: "completed",
    customer_id: customerId,
    omnichannel_identity: { type: "wallet_barcode", value: "980124000001" },
    store_id: branchId,
    channel: "pos",
    source_system: "test-pos",
    external_transaction_id: overrides.id,
    fiscal_receipt_id: overrides.id,
    original_transaction_id: null,
    business_date: overrides.business_date,
    occurred_at: overrides.occurred_at,
    currency: "KZT",
    totals: {
      gross_amount: "79990.00",
      discount_amount: "0.00",
      loyalty_discount_amount: "0.00",
      promo_discount_amount: "0.00",
      tax_amount: "0.00",
      net_amount: "79990.00"
    },
    payment_methods: [{ type: "card", amount: "79990.00", provider_ref: null }],
    loyalty: null,
    lines: [
      {
        id: `${overrides.id}:line:1`,
        line_number: 1,
        product_id: overrides.product_id,
        product_variant_id: overrides.product_variant_id,
        sku: overrides.sku,
        barcode: overrides.barcode,
        name: overrides.sku,
        quantity: "1",
        unit_price: { amount: "79990.00", currency: "KZT" },
        gross_amount: "79990.00",
        discount_amount: "0.00",
        net_amount: "79990.00",
        loyalty_eligible_amount: "79990.00",
        tax_amount: "0.00",
        applied_discounts: [],
        attributes: { sport_tags: overrides.sport_tags }
      }
    ],
    created_at: overrides.occurred_at,
    updated_at: overrides.occurred_at,
    version: 1
  };
}
