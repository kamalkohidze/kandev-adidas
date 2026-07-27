const dayMs = 24 * 60 * 60 * 1000;
const buyingTransactionTypes = new Set(["purchase", "exchange"]);

export function buildSegmentAudienceReadModel(
  data,
  { tenantId, asOf = new Date().toISOString(), purchaseWithinDays = null } = {}
) {
  const asOfTime = Date.parse(asOf);
  if (!tenantId || !Number.isFinite(asOfTime)) {
    return [];
  }
  const purchaseWindowStartTime = Number.isInteger(purchaseWithinDays)
    ? asOfTime - purchaseWithinDays * dayMs
    : null;

  const tenantProducts = (data.products || []).filter((product) => product.tenant_id === tenantId);
  const tenantVariants = (data.product_variants || []).filter((variant) => variant.tenant_id === tenantId);
  const productsById = new Map(tenantProducts.map((product) => [product.id, product]));
  const productsBySku = new Map(tenantProducts.map((product) => [normalizeKey(product.sku), product]));
  const variantsById = new Map(tenantVariants.map((variant) => [variant.id, variant]));
  const variantsBySku = new Map(tenantVariants.map((variant) => [normalizeKey(variant.variant_sku), variant]));
  const variantsByBarcode = new Map(
    tenantVariants
      .filter((variant) => variant.barcode)
      .map((variant) => [normalizeKey(variant.barcode), variant])
  );

  const purchaseFactsByCustomer = new Map();
  const lastPurchaseByCustomer = new Map();
  const lastTransactionActivityByCustomer = new Map();

  for (const transaction of data.transactions || []) {
    if (transaction.tenant_id !== tenantId || !transaction.customer_id) {
      continue;
    }

    rememberLastActivity(lastTransactionActivityByCustomer, transaction.customer_id, {
      type: transaction.type,
      channel: transaction.channel,
      occurred_at: transaction.occurred_at,
      source_ref: transaction.id
    });

    if (transaction.status !== "completed" || !buyingTransactionTypes.has(transaction.type)) {
      continue;
    }

    const occurredAt = Date.parse(transaction.occurred_at || "");
    if (Number.isFinite(occurredAt) && occurredAt <= asOfTime) {
      rememberLastPurchase(lastPurchaseByCustomer, transaction.customer_id, transaction.occurred_at);
    }

    if (
      purchaseWindowStartTime !== null &&
      (!Number.isFinite(occurredAt) || occurredAt < purchaseWindowStartTime || occurredAt > asOfTime)
    ) {
      continue;
    }

    const facts = ensurePurchaseFacts(purchaseFactsByCustomer, transaction.customer_id);
    facts.completed_purchase_count += 1;
    facts.last_purchase_at = maxIso(facts.last_purchase_at, transaction.occurred_at);

    for (const line of transaction.lines || []) {
      const variant = resolveVariant(line, variantsById, variantsBySku, variantsByBarcode);
      const product = resolveProduct(line, variant, productsById, productsBySku);

      if (product) {
        facts.product_ids.add(product.id);
        facts.product_types.add(product.product_type);
        facts.category_ids.add(product.category_id);
        for (const categoryId of product.category_path || []) {
          facts.category_ids.add(categoryId);
        }
        for (const sport of product.sport_tags || []) {
          facts.sport_tags.add(sport);
        }
      }

      for (const sport of line.attributes?.sport_tags || []) {
        facts.sport_tags.add(sport);
      }

      if (variant?.size?.system && variant?.size?.value) {
        facts.sizes.add(normalizeSizeKey(variant.size.system, variant.size.value));
      }
    }
  }

  return (data.customers || [])
    .filter((customer) => customer.tenant_id === tenantId)
    .map((customer) => projectCustomerAudienceRecord({
      customer,
      asOfTime,
      purchaseFacts: purchaseFactsByCustomer.get(customer.id) || createPurchaseFacts(),
      lastPurchaseAt: lastPurchaseByCustomer.get(customer.id) || null,
      transactionActivity: lastTransactionActivityByCustomer.get(customer.id) || null
    }));
}

export function normalizeSizeKey(system, value) {
  return `${String(system || "").trim().toUpperCase()}:${String(value || "").trim().toUpperCase()}`;
}

function projectCustomerAudienceRecord({ customer, asOfTime, purchaseFacts, lastPurchaseAt, transactionActivity }) {
  const activity = chooseLatestActivity(customer.last_activity, transactionActivity);
  const lastActivityTime = Date.parse(activity?.occurred_at || "");
  const lastPurchaseTime = Date.parse(lastPurchaseAt || "");
  const createdAtTime = Date.parse(customer.created_at || "");

  return {
    customer_id: customer.id,
    tenant_id: customer.tenant_id,
    status: customer.status,
    lifecycle_status: customer.lifecycle_status || null,
    preferred_locale: customer.preferred_locale,
    favorite_sports: [...(customer.favorite_sports || [])],
    size_profile: structuredClone(customer.size_profile || {}),
    annual_spend: structuredClone(customer.annual_spend || null),
    created_at: customer.created_at,
    activity: {
      last_type: activity?.type || null,
      last_channel: activity?.channel || null,
      last_at: activity?.occurred_at || null,
      days_since_last_activity: Number.isFinite(lastActivityTime)
        ? Math.max(0, Math.floor((asOfTime - lastActivityTime) / dayMs))
        : null,
      source_ref: activity?.source_ref || null
    },
    created_days_ago: Number.isFinite(createdAtTime)
      ? Math.max(0, Math.floor((asOfTime - createdAtTime) / dayMs))
      : null,
    purchases: {
      completed_purchase_count: purchaseFacts.completed_purchase_count,
      last_purchase_at: lastPurchaseAt,
      days_since_last_purchase: Number.isFinite(lastPurchaseTime)
        ? Math.max(0, Math.floor((asOfTime - lastPurchaseTime) / dayMs))
        : null,
      category_ids: [...purchaseFacts.category_ids].sort(),
      sport_tags: [...purchaseFacts.sport_tags].sort(),
      sizes: [...purchaseFacts.sizes].sort(),
      product_types: [...purchaseFacts.product_types].sort()
    }
  };
}

function ensurePurchaseFacts(map, customerId) {
  const current = map.get(customerId);
  if (current) {
    return current;
  }

  const facts = createPurchaseFacts();
  map.set(customerId, facts);
  return facts;
}

function createPurchaseFacts() {
  return {
    completed_purchase_count: 0,
    last_purchase_at: null,
    category_ids: new Set(),
    sport_tags: new Set(),
    sizes: new Set(),
    product_ids: new Set(),
    product_types: new Set()
  };
}

function rememberLastActivity(map, customerId, activity) {
  const current = map.get(customerId);
  if (!current || Date.parse(activity.occurred_at || "") > Date.parse(current.occurred_at || "")) {
    map.set(customerId, activity);
  }
}

function rememberLastPurchase(map, customerId, occurredAt) {
  const current = map.get(customerId);
  if (!current || Date.parse(occurredAt || "") > Date.parse(current || "")) {
    map.set(customerId, occurredAt);
  }
}

function chooseLatestActivity(profileActivity, transactionActivity) {
  const profileTime = Date.parse(profileActivity?.occurred_at || "");
  const transactionTime = Date.parse(transactionActivity?.occurred_at || "");

  if (!Number.isFinite(profileTime)) {
    return transactionActivity;
  }
  if (!Number.isFinite(transactionTime)) {
    return profileActivity;
  }

  return transactionTime > profileTime ? transactionActivity : profileActivity;
}

function maxIso(left, right) {
  if (!left) {
    return right || null;
  }
  if (!right) {
    return left;
  }
  return Date.parse(right) > Date.parse(left) ? right : left;
}

function resolveVariant(line, variantsById, variantsBySku, variantsByBarcode) {
  if (line.product_variant_id && variantsById.has(line.product_variant_id)) {
    return variantsById.get(line.product_variant_id);
  }

  return (
    variantsBySku.get(normalizeKey(line.sku)) ||
    variantsByBarcode.get(normalizeKey(line.barcode)) ||
    null
  );
}

function resolveProduct(line, variant, productsById, productsBySku) {
  if (line.product_id && productsById.has(line.product_id)) {
    return productsById.get(line.product_id);
  }
  if (variant?.product_id && productsById.has(variant.product_id)) {
    return productsById.get(variant.product_id);
  }

  return productsBySku.get(normalizeKey(line.sku)) || null;
}

function normalizeKey(value) {
  return String(value || "").trim().toUpperCase();
}
