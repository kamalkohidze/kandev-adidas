import { createRecommendationEngine } from "../engine/index.js";
import { normalizeLocale } from "../../../shared/contracts.js";

const ctaLabels = {
  kk: "Қарау",
  ru: "Смотреть",
  en: "View"
};

export function createRecommendationMessageBlocks(data, { engine = createRecommendationEngine(data) } = {}) {
  function forCustomer({
    customerId,
    tenantId = null,
    branchId = null,
    locale = "ru",
    limit = 4
  }) {
    const set = engine.recommendForCustomer({
      customerId,
      tenantId,
      branchId,
      locale,
      limit
    });

    return set ? buildProductBlocks(set, locale) : null;
  }

  function forRecommendationSet(recommendationSet, locale = recommendationSet?.context?.locale || "ru") {
    return buildProductBlocks(recommendationSet, locale);
  }

  return {
    forCustomer,
    forRecommendationSet
  };
}

export function buildProductBlocks(recommendationSet, locale = "ru") {
  const normalizedLocale = normalizeLocale(locale);

  return {
    recommendation_set_id: recommendationSet.id,
    tenant_id: recommendationSet.tenant_id,
    customer_id: recommendationSet.customer_id,
    segment_code: recommendationSet.segment_code,
    locale: normalizedLocale,
    blocks: recommendationSet.data.map((item) => ({
      type: "product_recommendation",
      product_id: item.product_id,
      variant_id: item.variant_id,
      sku: item.sku,
      variant_sku: item.variant_sku,
      title: item.name.value,
      subtitle: item.reason,
      price: item.price,
      size: item.size,
      inventory: item.inventory,
      cta: {
        label: ctaLabels[normalizedLocale],
        url: `/products/${encodeURIComponent(item.product_id)}?variant_id=${encodeURIComponent(item.variant_id)}`
      },
      reason: item.reason
    }))
  };
}
