import { randomUUID } from "node:crypto";
import { issueCoupon } from "../../promotions/index.js";
import { buildProductBlocks, createRecommendationEngine } from "../../recommendations/index.js";
import { crossSellScenarios, findCrossSellScenario, listCrossSellScenarios } from "./scenarios.js";

const dayMs = 24 * 60 * 60 * 1000;
const buyingTransactionTypes = new Set(["purchase", "exchange"]);
const deliveryCandidateChannels = ["push", "email", "sms", "waba"];
const careTerms = ["care", "clean", "cleaner", "protector", "shoe-care"];
const accessoryTypes = new Set(["accessory", "accessories", "equipment", "gear", "care", "shoe_care"]);
const runningAccessoryTypes = new Set(["accessory", "accessories", "equipment", "gear"]);

export function createCrossSellService(
  data,
  { recommendationEngine = createRecommendationEngine(data), promotionIssuer = issueCoupon } = {}
) {
  function listScenarios() {
    return listCrossSellScenarios();
  }

  function listCandidates({ tenantId, customerId = null, scenarioCode = null } = {}) {
    const details = validateListRequest({ tenantId, scenarioCode });
    if (details.length > 0) {
      return { ok: false, validationDetails: details };
    }

    return {
      ok: true,
      tenant_id: tenantId,
      data: ensureArray(data, "cross_sell_candidates")
        .filter((candidate) => candidate.tenant_id === tenantId)
        .filter((candidate) => !customerId || candidate.customer_id === customerId)
        .filter((candidate) => !scenarioCode || candidate.scenario_code === scenarioCode)
        .sort(compareCandidates)
        .map(toPublicCandidate)
    };
  }

  function generateCandidates({
    tenantId,
    asOf = new Date().toISOString(),
    branchId = null,
    locale = null,
    limit = null,
    scenarioCodes = null
  } = {}) {
    const details = validateGenerationRequest({ tenantId, asOf, scenarioCodes, limit });
    if (details.length > 0) {
      return { ok: false, validationDetails: details };
    }

    const asOfTime = Date.parse(asOf);
    const selectedScenarios = selectScenarios(scenarioCodes);
    const contexts = buildPurchaseContexts({ tenantId, asOfTime });
    const results = [];
    const skipped = [];
    let duplicate_count = 0;
    let evaluated = 0;

    for (const context of contexts) {
      for (const scenario of selectedScenarios) {
        if (limitReached(results, limit)) {
          break;
        }
        evaluated += 1;

        if (!matchesScenario(context, scenario)) {
          continue;
        }

        const idempotencyKey = buildCandidateIdempotencyKey({ scenario, context });
        const existing = findExistingCandidate(idempotencyKey);
        if (existing) {
          duplicate_count += 1;
          continue;
        }

        const eligibility = evaluateEligibility({
          data,
          customer: context.customer,
          tenantId,
          asOf,
          preferredChannels: deliveryCandidateChannels
        });
        if (!eligibility.eligible) {
          skipped.push({
            scenario_code: scenario.code,
            customer_id: context.customer.id,
            source_transaction_id: context.transaction.id,
            reason: eligibility.reason,
            eligibility
          });
          continue;
        }

        const candidate = buildCandidate({
          scenario,
          context,
          asOf,
          branchId,
          locale,
          channel: eligibility.channel,
          eligibility,
          idempotencyKey
        });
        ensureArray(data, "cross_sell_candidates").push(candidate);
        results.push(candidate);
      }
    }

    return {
      ok: true,
      tenant_id: tenantId,
      generated_at: asOf,
      evaluated,
      created: results.length,
      duplicate_count,
      skipped,
      data: results.map(toPublicCandidate)
    };
  }

  return {
    listScenarios,
    listCandidates,
    generateCandidates
  };

  function buildCandidate({ scenario, context, asOf, branchId, locale, channel, eligibility, idempotencyKey }) {
    const communicationLocale = locale || context.customer.preferred_locale || "ru";
    const recommendationSet = recommendationEngine.recommendForCustomer({
      customerId: context.customer.id,
      tenantId: context.customer.tenant_id,
      branchId,
      locale: communicationLocale,
      limit: scenario.recommendation_limit,
      segmentCode: scenario.code
    });
    const filteredRecommendationSet = filterRecommendationSet(recommendationSet, scenario, context, data);
    const coupon = scenario.coupon
      ? promotionIssuer(
          data,
          {
            customer_id: context.customer.id,
            promotion_type: "cross_sell",
            issued_at: asOf,
            valid_from: asOf,
            metadata: {
              source: "marketing.cross-sell",
              scenario_code: scenario.code,
              journey_code: scenario.journey_code,
              source_transaction_id: context.transaction.id
            }
          },
          {
            asOf,
            idempotencyKey: `${idempotencyKey}:coupon`,
            correlationId: idempotencyKey,
            producer: "marketing.cross-sell.service"
          }
        ).coupon
      : null;

    return {
      id: randomUUID(),
      tenant_id: context.customer.tenant_id,
      customer_id: context.customer.id,
      status: "candidate",
      scenario_code: scenario.code,
      journey_code: scenario.journey_code,
      campaign_code: scenario.campaign_code,
      channel,
      locale: communicationLocale,
      source_transaction_id: context.transaction.id,
      source_purchase_at: context.transaction.occurred_at,
      days_since_source_purchase: context.days_since_purchase,
      idempotency_key: idempotencyKey,
      coupon: coupon ? toCandidateCoupon(coupon) : null,
      recommendation_set: toCandidateRecommendationSet(filteredRecommendationSet),
      message_blocks: filteredRecommendationSet ? buildProductBlocks(filteredRecommendationSet, communicationLocale) : null,
      eligibility,
      created_at: asOf,
      updated_at: asOf,
      version: 1
    };
  }

  function buildPurchaseContexts({ tenantId, asOfTime }) {
    const customersById = new Map(
      (data.customers || [])
        .filter((customer) => customer.tenant_id === tenantId)
        .map((customer) => [customer.id, customer])
    );
    const productsById = new Map(
      (data.products || [])
        .filter((product) => product.tenant_id === tenantId)
        .map((product) => [product.id, product])
    );
    const productsBySku = new Map(
      (data.products || [])
        .filter((product) => product.tenant_id === tenantId)
        .map((product) => [normalizeKey(product.sku), product])
    );
    const variantsById = new Map(
      (data.product_variants || [])
        .filter((variant) => variant.tenant_id === tenantId)
        .map((variant) => [variant.id, variant])
    );
    const variantsBySku = new Map(
      (data.product_variants || [])
        .filter((variant) => variant.tenant_id === tenantId)
        .map((variant) => [normalizeKey(variant.variant_sku), variant])
    );
    const variantsByBarcode = new Map(
      (data.product_variants || [])
        .filter((variant) => variant.tenant_id === tenantId && variant.barcode)
        .map((variant) => [normalizeKey(variant.barcode), variant])
    );

    return (data.transactions || [])
      .filter((transaction) => transaction.tenant_id === tenantId)
      .filter((transaction) => transaction.customer_id && customersById.has(transaction.customer_id))
      .filter((transaction) => transaction.status === "completed" && buyingTransactionTypes.has(transaction.type))
      .map((transaction) => {
        const occurredAtTime = Date.parse(transaction.occurred_at || "");
        if (!Number.isFinite(occurredAtTime) || occurredAtTime > asOfTime) {
          return null;
        }

        return {
          transaction,
          customer: customersById.get(transaction.customer_id),
          days_since_purchase: Math.max(0, Math.floor((asOfTime - occurredAtTime) / dayMs)),
          purchased_products: (transaction.lines || [])
            .map((line) => resolvePurchasedProduct({ line, productsById, productsBySku, variantsById, variantsBySku, variantsByBarcode }))
            .filter(Boolean)
        };
      })
      .filter(Boolean)
      .sort((left, right) => Date.parse(left.transaction.occurred_at) - Date.parse(right.transaction.occurred_at));
  }

  function findExistingCandidate(idempotencyKey) {
    return ensureArray(data, "cross_sell_candidates").find(
      (candidate) => candidate.idempotency_key === idempotencyKey
    ) || null;
  }
}

function validateGenerationRequest({ tenantId, asOf, scenarioCodes, limit }) {
  const details = [];
  if (!isTenantContext(tenantId)) {
    details.push({ field: "tenant_context", reason: "required" });
  }
  if (!Number.isFinite(Date.parse(asOf))) {
    details.push({ field: "as_of", reason: "invalid_datetime" });
  }
  if (limit !== null && limit !== undefined && (!Number.isInteger(Number(limit)) || Number(limit) < 1)) {
    details.push({ field: "limit", reason: "positive_integer_required" });
  }
  for (const scenarioCode of scenarioCodes || []) {
    if (!findCrossSellScenario(scenarioCode)) {
      details.push({ field: "scenario_codes", reason: `unsupported_scenario:${scenarioCode}` });
    }
  }
  return details;
}

function validateListRequest({ tenantId, scenarioCode }) {
  const details = [];
  if (!isTenantContext(tenantId)) {
    details.push({ field: "tenant_context", reason: "required" });
  }
  if (scenarioCode && !findCrossSellScenario(scenarioCode)) {
    details.push({ field: "scenario_code", reason: "unsupported_scenario" });
  }
  return details;
}

function selectScenarios(scenarioCodes) {
  if (!Array.isArray(scenarioCodes) || scenarioCodes.length === 0) {
    return crossSellScenarios;
  }
  return scenarioCodes.map((code) => findCrossSellScenario(code)).filter(Boolean);
}

function matchesScenario(context, scenario) {
  if (context.days_since_purchase < scenario.min_days_since_purchase) {
    return false;
  }
  if (
    Number.isInteger(scenario.max_days_since_purchase) &&
    context.days_since_purchase > scenario.max_days_since_purchase
  ) {
    return false;
  }
  if (scenario.trigger_product && !context.purchased_products.some((item) => item.product.product_type === scenario.trigger_product)) {
    return false;
  }
  if (scenario.trigger_sport && !context.purchased_products.some((item) => item.sport_tags.includes(scenario.trigger_sport))) {
    return false;
  }
  return true;
}

function evaluateEligibility({ data, customer, tenantId, asOf, preferredChannels }) {
  if (!customer || customer.status !== "active" || customer.tenant_id !== tenantId) {
    return { eligible: false, reason: "customer_not_active", channel: null };
  }

  const hasActiveIdentity = (data.identities || []).some(
    (identity) =>
      identity.tenant_id === tenantId &&
      identity.customer_id === customer.id &&
      identity.is_active === true
  );

  return chooseConsentChannel({
    data,
    customerId: customer.id,
    tenantId,
    asOf,
    preferredChannels,
    hasActiveIdentity
  });
}

function chooseConsentChannel({ data, customerId, tenantId, asOf, preferredChannels, hasActiveIdentity }) {
  if (!hasActiveIdentity) {
    return { eligible: false, reason: "active_identity_required", channel: null };
  }

  const consentRecords = data.consents;
  if (!Array.isArray(consentRecords)) {
    return {
      eligible: true,
      reason: null,
      channel: null,
      consent: { checked: false, reason: "consent_read_model_unavailable" }
    };
  }

  for (const channel of preferredChannels) {
    const consent = consentRecords.find(
      (record) =>
        record.tenant_id === tenantId &&
        record.customer_id === customerId &&
        record.channel === channel &&
        isConsentActive(record, asOf)
    );
    if (consent) {
      return {
        eligible: true,
        reason: null,
        channel,
        consent: { checked: true, consent_id: consent.id, channel }
      };
    }
  }

  return {
    eligible: false,
    reason: "marketing_consent_required",
    channel: null,
    consent: { checked: true, channel: null }
  };
}

function isConsentActive(record, asOf) {
  const asOfTime = Date.parse(asOf);
  const grantedAtTime = record.granted_at ? Date.parse(record.granted_at) : null;
  const revokedAtTime = record.revoked_at ? Date.parse(record.revoked_at) : null;
  const expiresAtTime = record.expires_at ? Date.parse(record.expires_at) : null;

  if (
    record.granted !== true ||
    !Number.isFinite(asOfTime) ||
    (record.granted_at && !Number.isFinite(grantedAtTime)) ||
    (record.revoked_at && !Number.isFinite(revokedAtTime)) ||
    (record.expires_at && !Number.isFinite(expiresAtTime))
  ) {
    return false;
  }

  return (
    (grantedAtTime === null || grantedAtTime <= asOfTime) &&
    (revokedAtTime === null || revokedAtTime > asOfTime) &&
    (expiresAtTime === null || expiresAtTime > asOfTime)
  );
}

function resolvePurchasedProduct({ line, productsById, productsBySku, variantsById, variantsBySku, variantsByBarcode }) {
  const variant =
    (line.product_variant_id && variantsById.get(line.product_variant_id)) ||
    variantsBySku.get(normalizeKey(line.sku)) ||
    variantsByBarcode.get(normalizeKey(line.barcode)) ||
    null;
  const product =
    (line.product_id && productsById.get(line.product_id)) ||
    (variant?.product_id && productsById.get(variant.product_id)) ||
    productsBySku.get(normalizeKey(line.sku)) ||
    null;

  if (!product) {
    return null;
  }

  return {
    product,
    variant,
    line,
    sport_tags: [...new Set([...(product.sport_tags || []), ...(line.attributes?.sport_tags || [])])]
  };
}

function filterRecommendationSet(recommendationSet, scenario, context, data) {
  if (!recommendationSet) {
    return null;
  }

  const items = (recommendationSet.data || []).filter((item) => matchesRecommendation(item, scenario, context, data));
  return {
    ...recommendationSet,
    data: items,
    page: {
      ...recommendationSet.page,
      limit: items.length,
      has_more: false,
      next_cursor: null
    }
  };
}

function matchesRecommendation(item, scenario, context, data) {
  if (scenario.recommendation === "shoe-care") {
    return isCareProduct(item) || isAccessoryProduct(item);
  }
  if (scenario.recommendation === "running-accessories") {
    return (
      isRunningAccessoryProduct(item) &&
      item.sport_tags?.includes("running") &&
      matchesCustomerSize(item.size, context.customer.size_profile)
    );
  }
  if (scenario.recommendation === "replacement-shoes") {
    const sourceShoes = context.purchased_products.filter((entry) => entry.product.product_type === "shoes");
    const purchasedSports = new Set(sourceShoes.flatMap((entry) => entry.sport_tags));
    const sourceProductIds = new Set(sourceShoes.map((entry) => entry.product.id));
    if (item.product_type !== "shoes" || sourceProductIds.has(item.product_id)) {
      return false;
    }

    const sourceCollections = new Set(
      sourceShoes
        .map((entry) => normalizeOptional(entry.product.collection))
        .filter(Boolean)
    );
    if (sourceCollections.size > 0) {
      const recommendedProduct = (data.products || []).find((product) => product.id === item.product_id);
      const recommendedCollection = normalizeOptional(recommendedProduct?.collection);
      return recommendedCollection !== null && sourceCollections.has(recommendedCollection);
    }

    return item.sport_tags?.some((sport) => purchasedSports.has(sport));
  }
  return true;
}

function matchesCustomerSize(size, sizeProfile = {}) {
  if (!isSpecificSize(size)) {
    return true;
  }
  return customerSizeKeys(sizeProfile).has(normalizeSizeKey(size.system, size.value));
}

function isSpecificSize(size) {
  const system = normalizeSizePart(size?.system);
  const value = normalizeSizePart(size?.value);
  if (!system || !value) {
    return false;
  }
  return !["ONE", "OS", "ONE SIZE"].includes(system) && !["ONE", "OS", "ONE SIZE"].includes(value);
}

function customerSizeKeys(sizeProfile = {}) {
  return new Set(
    [
      ["UK", sizeProfile.shoe?.uk],
      ["US", sizeProfile.shoe?.us],
      ["EU", sizeProfile.shoe?.eu],
      ["INT", sizeProfile.apparel?.top],
      ["INT", sizeProfile.apparel?.bottom]
    ]
      .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
      .map(([system, value]) => normalizeSizeKey(system, value))
  );
}

function normalizeSizeKey(system, value) {
  return `${normalizeSizePart(system)}:${normalizeSizePart(value)}`;
}

function normalizeSizePart(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeOptional(value) {
  const normalized = String(value || "").trim();
  return normalized === "" ? null : normalized;
}

function isCareProduct(item) {
  const haystack = [
    item.product_type,
    item.sku,
    item.variant_sku,
    item.name?.value,
    item.display_name,
    ...(item.sport_tags || [])
  ]
    .join(" ")
    .toLowerCase();
  return careTerms.some((term) => haystack.includes(term));
}

function isAccessoryProduct(item) {
  return accessoryTypes.has(item.product_type);
}

function isRunningAccessoryProduct(item) {
  return runningAccessoryTypes.has(item.product_type);
}

function toCandidateCoupon(coupon) {
  return {
    id: coupon.id,
    code: coupon.code,
    promotion_type: coupon.promotion_type,
    discount_percent: coupon.discount_percent,
    valid_from: coupon.valid_from,
    expires_at: coupon.expires_at,
    status: coupon.status
  };
}

function toCandidateRecommendationSet(recommendationSet) {
  if (!recommendationSet) {
    return null;
  }
  return {
    id: recommendationSet.id,
    tenant_id: recommendationSet.tenant_id,
    customer_id: recommendationSet.customer_id,
    segment_code: recommendationSet.segment_code,
    context: recommendationSet.context,
    data: recommendationSet.data,
    generated_at: recommendationSet.generated_at
  };
}

function toPublicCandidate(candidate) {
  return structuredClone(candidate);
}

function buildCandidateIdempotencyKey({ scenario, context }) {
  return [
    context.customer.tenant_id,
    context.customer.id,
    scenario.code,
    context.transaction.id
  ].join(":");
}

function limitReached(results, limit) {
  return Number.isInteger(Number(limit)) && Number(limit) > 0 && results.length >= Number(limit);
}

function compareCandidates(left, right) {
  const created = Date.parse(right.created_at) - Date.parse(left.created_at);
  if (created !== 0) {
    return created;
  }
  return left.id.localeCompare(right.id);
}

function ensureArray(target, field) {
  if (!Array.isArray(target[field])) {
    target[field] = [];
  }
  return target[field];
}

function isTenantContext(value) {
  return typeof value === "string" && value.trim() !== "";
}

function normalizeKey(value) {
  return String(value || "").trim().toUpperCase();
}
