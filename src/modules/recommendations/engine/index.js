import { createCatalogServices } from "../../catalog/index.js";
import { resolveLocalizedValue } from "../../catalog/products/localization.js";
import { createTransactionLedger } from "../../transactions/ledger/repository.js";
import { normalizeLocale } from "../../../shared/contracts.js";

const defaultLimit = 10;
const maxLimit = 50;

const reasonMessages = {
  favorite_sport: {
    kk: "{{sport}} бойынша таңдауыңызға сәйкес келеді",
    ru: "Подходит к предпочтению {{sport}}",
    en: "Matches {{sport}} preference"
  },
  purchase_affinity: {
    kk: "Соңғы сатып алулардағы спорт қызығушылығына ұқсас",
    ru: "Похоже на спортивные интересы из покупок",
    en: "Matches sports seen in purchase history"
  },
  customer_size_available: {
    kk: "Сіздің өлшеміңіз қолжетімді",
    ru: "Доступно в вашем размере",
    en: "Available in your size"
  },
  in_stock: {
    kk: "Қоймада бар",
    ru: "Есть в наличии",
    en: "In stock"
  }
};

export function createRecommendationEngine(data, { catalog = createCatalogServices(data) } = {}) {
  const transactionLedger = createTransactionLedger(data);

  function recommendForCustomer({
    customerId,
    tenantId = null,
    branchId = null,
    locale = "ru",
    limit = defaultLimit,
    segmentCode = null
  }) {
    const customer = findCustomer({ customerId, tenantId });
    if (!customer) {
      return null;
    }

    const normalizedLimit = parseLimit(limit);
    const normalizedLocale = normalizeLocale(locale, customer.preferred_locale || "ru");
    const transactions = transactionLedger.listCustomerTransactions({
      customerId: customer.id,
      tenantId: customer.tenant_id,
      limit: 100
    });
    const items = buildCustomerItems({
      customer,
      tenantId: customer.tenant_id,
      branchId,
      locale: normalizedLocale,
      transactions
    }).slice(0, normalizedLimit);

    return {
      id: buildRecommendationSetId({
        tenantId: customer.tenant_id,
        customerId: customer.id,
        segmentCode,
        branchId,
        locale: normalizedLocale
      }),
      tenant_id: customer.tenant_id,
      customer_id: customer.id,
      segment_code: segmentCode,
      context: {
        branch_id: branchId,
        locale: normalizedLocale
      },
      data: items,
      page: {
        limit: normalizedLimit,
        next_cursor: null,
        has_more: false
      },
      generated_at: new Date().toISOString()
    };
  }

  function recommendForSegment({
    tenantId,
    segmentCode,
    branchId = null,
    locale = "ru",
    limit = defaultLimit
  }) {
    const normalizedLimit = parseLimit(limit);
    const normalizedLocale = normalizeLocale(locale);
    const customers = data.customers
      .filter((customer) => customer.tenant_id === tenantId && customer.status === "active")
      .filter((customer) => matchesSegment(customer, segmentCode));
    const merged = new Map();

    for (const customer of customers) {
      const set = recommendForCustomer({
        customerId: customer.id,
        tenantId,
        branchId,
        locale: normalizedLocale,
        limit: maxLimit,
        segmentCode
      });

      for (const item of set?.data || []) {
        const key = item.variant_id;
        const current = merged.get(key);
        if (!current || item.score > current.score) {
          merged.set(key, {
            ...item,
            customer_id: undefined,
            segment_code: segmentCode
          });
        }
      }
    }

    const items = [...merged.values()]
      .sort(compareRecommendationItems)
      .slice(0, normalizedLimit);

    return {
      id: buildRecommendationSetId({
        tenantId,
        customerId: null,
        segmentCode,
        branchId,
        locale: normalizedLocale
      }),
      tenant_id: tenantId,
      customer_id: null,
      segment_code: segmentCode,
      context: {
        branch_id: branchId,
        locale: normalizedLocale,
        audience_size: customers.length
      },
      data: items,
      page: {
        limit: normalizedLimit,
        next_cursor: null,
        has_more: false
      },
      generated_at: new Date().toISOString()
    };
  }

  function findCustomer({ customerId, tenantId }) {
    return (
      data.customers.find(
        (customer) =>
          customer.id === customerId &&
          customer.status === "active" &&
          (!tenantId || customer.tenant_id === tenantId)
      ) || null
    );
  }

  function buildCustomerItems({ customer, tenantId, branchId, locale, transactions }) {
    const products = catalog.products.searchProducts({ tenantId, status: "active", locale });
    const transactionFeatures = buildTransactionFeatures(transactions, data);
    const items = [];

    for (const product of products) {
      const variants = catalog.variants.listVariants({
        tenantId,
        productId: product.id,
        status: "active",
        locale
      });

      for (const variant of variants) {
        const availability = catalog.inventory.getBalance({
          variantId: variant.id,
          tenantId,
          branchId
        });
        if (!availability || availability.available <= 0) {
          continue;
        }

        const sizeMatch = matchCustomerSize(customer.size_profile, product, variant);
        if (sizeMatch.required && !sizeMatch.matched) {
          continue;
        }

        const scored = scoreCandidate({
          product,
          variant,
          availability,
          customer,
          transactionFeatures,
          sizeMatch,
          locale
        });
        if (scored.score > 0) {
          items.push(scored);
        }
      }
    }

    return items.sort(compareRecommendationItems);
  }

  return {
    recommendForCustomer,
    recommendForSegment
  };
}

export function matchCustomerSize(sizeProfile, product, variant) {
  if (isShoeProduct(product)) {
    const sizes = [
      ["UK", sizeProfile?.shoe?.uk],
      ["US", sizeProfile?.shoe?.us],
      ["EU", sizeProfile?.shoe?.eu]
    ].filter(([, value]) => isFilled(value));

    return matchSizeList(sizes, variant);
  }

  if (product.product_type === "apparel") {
    const sizes = [
      ["INT", sizeProfile?.apparel?.top],
      ["INT", sizeProfile?.apparel?.bottom]
    ].filter(([, value]) => isFilled(value));

    return matchSizeList(sizes, variant);
  }

  return {
    required: false,
    matched: true,
    matched_size: null
  };
}

function scoreCandidate({
  product,
  variant,
  availability,
  customer,
  transactionFeatures,
  sizeMatch,
  locale
}) {
  const reasons = [];
  let score = 0;

  const preferredSport = firstMatchingSport(product.sport_tags, customer.favorite_sports);
  if (preferredSport) {
    const sportIndex = customer.favorite_sports.indexOf(preferredSport);
    score += 200 - sportIndex * 50;
    reasons.push(toReason("favorite_sport", locale, { sport: preferredSport }));
  }

  const affinitySports = product.sport_tags.filter((sport) => transactionFeatures.sports.has(sport));
  if (affinitySports.length > 0) {
    score += affinitySports.reduce((total, sport) => total + transactionFeatures.sports.get(sport) * 12, 0);
    reasons.push(toReason("purchase_affinity", locale));
  }

  if (transactionFeatures.productTypes.has(product.product_type)) {
    score += 8;
  }

  if (sizeMatch.matched_size) {
    score += 30;
    reasons.push(toReason("customer_size_available", locale, { size: sizeMatch.matched_size.value }));
  }

  score += Math.min(availability.available, 10);
  reasons.push(toReason("in_stock", locale, { available: availability.available }));

  const productName = resolveLocalizedValue(product.name, locale);

  return {
    product_id: product.id,
    variant_id: variant.id,
    sku: product.sku,
    variant_sku: variant.variant_sku,
    brand: product.brand,
    product_type: product.product_type,
    sport_tags: [...product.sport_tags],
    name: {
      value: productName.value,
      locale: productName.resolved_locale,
      fallback_used: productName.fallback_used
    },
    display_name: product.display_name || productName.value,
    size: structuredClone(variant.size),
    color: structuredClone(variant.color),
    price: structuredClone(variant.price),
    inventory: {
      branch_id: availability.branch_id,
      available: availability.available,
      total_available: availability.total_available
    },
    score,
    reason: reasons[0]?.explanation || "",
    reasons
  };
}

function buildTransactionFeatures(transactions, data) {
  const sports = new Map();
  const productTypes = new Map();
  const productsById = new Map(data.products.map((product) => [product.id, product]));
  const variantsById = new Map(data.product_variants.map((variant) => [variant.id, variant]));

  for (const transaction of transactions) {
    if (transaction.status !== "completed" || !["purchase", "exchange"].includes(transaction.type)) {
      continue;
    }

    for (const line of transaction.lines || []) {
      const variant = line.product_variant_id ? variantsById.get(line.product_variant_id) : null;
      const productId = line.product_id || variant?.product_id;
      const product = productId ? productsById.get(productId) : null;
      const lineSports = line.attributes?.sport_tags || product?.sport_tags || [];

      for (const sport of lineSports) {
        sports.set(sport, (sports.get(sport) || 0) + 1);
      }

      if (product?.product_type) {
        productTypes.set(product.product_type, (productTypes.get(product.product_type) || 0) + 1);
      }
    }
  }

  return {
    sports,
    productTypes
  };
}

function matchesSegment(customer, segmentCode) {
  if (!segmentCode || segmentCode === "active-customers") {
    return true;
  }

  if (segmentCode.startsWith("sport:")) {
    return customer.favorite_sports.includes(segmentCode.slice("sport:".length));
  }

  if (segmentCode === "high-value") {
    return Number.parseFloat(customer.annual_spend?.amount || "0") >= 350000;
  }

  return false;
}

function firstMatchingSport(productSports = [], favoriteSports = []) {
  for (const sport of favoriteSports) {
    if (productSports.includes(sport)) {
      return sport;
    }
  }

  return null;
}

function matchSizeList(sizes, variant) {
  if (sizes.length === 0) {
    return {
      required: false,
      matched: true,
      matched_size: null
    };
  }

  const matched = sizes.find(
    ([system, value]) =>
      String(variant.size?.system || "").toUpperCase() === system && String(variant.size?.value) === String(value)
  );

  return {
    required: true,
    matched: Boolean(matched),
    matched_size: matched ? { system: matched[0], value: String(matched[1]) } : null
  };
}

function isShoeProduct(product) {
  return product.product_type === "shoes" || product.product_type === "shoe";
}

function isFilled(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function compareRecommendationItems(left, right) {
  return (
    right.score - left.score ||
    left.sku.localeCompare(right.sku) ||
    left.variant_sku.localeCompare(right.variant_sku)
  );
}

function parseLimit(value) {
  const parsed = Number.parseInt(value || defaultLimit, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return defaultLimit;
  }

  return Math.min(parsed, maxLimit);
}

function buildRecommendationSetId({ tenantId, customerId, segmentCode, branchId, locale }) {
  return [
    "recommendation-set",
    tenantId,
    customerId || "segment",
    segmentCode || "customer",
    branchId || "all-branches",
    locale
  ].join(":");
}

function toReason(code, locale, variables = {}) {
  const normalizedLocale = normalizeLocale(locale);
  const template = reasonMessages[code]?.[normalizedLocale] || reasonMessages[code]?.ru || code;

  return {
    code,
    explanation: interpolate(template, variables)
  };
}

function interpolate(template, variables) {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (match, key) => {
    if (variables[key] === undefined || variables[key] === null) {
      return match;
    }

    return String(variables[key]);
  });
}
