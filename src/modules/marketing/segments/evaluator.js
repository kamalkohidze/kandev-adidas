import { normalizeSizeKey } from "./read-model.js";

export function evaluateSegmentCriteria(record, definition, filters = {}) {
  const results = (definition.criteria?.all || []).map((criterion) => evaluateCriterion(record, criterion, filters));
  const matched = results.every((result) => result.matched);

  return {
    matched,
    reasons: results
  };
}

export function validateSegmentFilters(definition, filters = {}) {
  const missing = [];
  for (const field of definition.criteria?.required_filters || []) {
    if (field === "category_id" && filters.categoryIds.length === 0) {
      missing.push({ field: "category_id", reason: "required" });
    }
    if (field === "sport_tag" && filters.sportTags.length === 0) {
      missing.push({ field: "sport_tag", reason: "required" });
    }
    if (field === "size_system" && !filters.sizeSystem) {
      missing.push({ field: "size_system", reason: "required" });
    }
    if (field === "size_value" && !filters.sizeValue) {
      missing.push({ field: "size_value", reason: "required" });
    }
  }
  return missing;
}

function evaluateCriterion(record, criterion, filters) {
  if (criterion.type === "customer_status") {
    const matched = record.status === criterion.status;
    return {
      code: criterion.type,
      matched,
      explanation: matched
        ? `Customer status is ${criterion.status}.`
        : `Customer status is ${record.status}, expected ${criterion.status}.`
    };
  }

  if (criterion.type === "created_within_days") {
    const days = record.created_days_ago;
    const matched = days !== null && days <= criterion.days;
    return {
      code: criterion.type,
      matched,
      explanation: matched
        ? `Customer was created ${days} days ago.`
        : `Customer was not created within ${criterion.days} days.`
    };
  }

  if (criterion.type === "activity_within_days" || criterion.type === "purchase_within_days") {
    const days = daysSinceActivityOrPurchase(record, criterion);
    const matched = days !== null && days <= criterion.days;
    return {
      code: criterion.type,
      matched,
      explanation: matched
        ? `${recencyLabel(criterion)} was ${days} days ago.`
        : `${recencyLabel(criterion)} is outside ${criterion.days} days.`
    };
  }

  if (criterion.type === "activity_between_days" || criterion.type === "purchase_between_days") {
    const days = daysSinceActivityOrPurchase(record, criterion);
    const matched =
      days !== null &&
      days > criterion.min_days_exclusive &&
      days <= criterion.max_days_inclusive;
    return {
      code: criterion.type,
      matched,
      explanation: matched
        ? `${recencyLabel(criterion)} was ${days} days ago.`
        : `${recencyLabel(criterion)} is not between ${criterion.min_days_exclusive} and ${criterion.max_days_inclusive} days.`
    };
  }

  if (criterion.type === "activity_after_days" || criterion.type === "purchase_after_days") {
    const days = daysSinceActivityOrPurchase(record, criterion);
    const matched = days === null ? Boolean(criterion.include_missing) : days > criterion.min_days_exclusive;
    return {
      code: criterion.type,
      matched,
      explanation: matched
        ? days === null
          ? `${recencyLabel(criterion)} is missing.`
          : `${recencyLabel(criterion)} was ${days} days ago.`
        : `${recencyLabel(criterion)} is not older than ${criterion.min_days_exclusive} days.`
    };
  }

  if (criterion.type === "purchase_category") {
    const matchedValues = filters.categoryIds.filter((categoryId) =>
      record.purchases.category_ids.includes(categoryId)
    );
    return {
      code: criterion.type,
      matched: matchedValues.length > 0,
      explanation:
        matchedValues.length > 0
          ? `Bought in category ${matchedValues.join(", ")}.`
          : "No purchases in selected categories."
    };
  }

  if (criterion.type === "purchase_sport") {
    const matchedValues = filters.sportTags.filter((sport) => record.purchases.sport_tags.includes(sport));
    return {
      code: criterion.type,
      matched: matchedValues.length > 0,
      explanation:
        matchedValues.length > 0
          ? `Bought products tagged ${matchedValues.join(", ")}.`
          : "No purchases with selected sport tags."
    };
  }

  if (criterion.type === "purchase_or_profile_size") {
    const key = normalizeSizeKey(filters.sizeSystem, filters.sizeValue);
    const purchaseMatch = record.purchases.sizes.includes(key);
    const profileMatch = profileSizeKeys(record.size_profile).includes(key);
    return {
      code: criterion.type,
      matched: purchaseMatch || profileMatch,
      explanation:
        purchaseMatch || profileMatch
          ? `Matched size ${key}${purchaseMatch ? " from purchases" : " from profile"}.`
          : `No purchase or profile match for size ${key}.`
    };
  }

  return {
    code: criterion.type,
    matched: false,
    explanation: `Unsupported criterion ${criterion.type}.`
  };
}

function profileSizeKeys(sizeProfile = {}) {
  return [
    ["UK", sizeProfile.shoe?.uk],
    ["US", sizeProfile.shoe?.us],
    ["EU", sizeProfile.shoe?.eu],
    ["INT", sizeProfile.apparel?.top],
    ["INT", sizeProfile.apparel?.bottom]
  ]
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
    .map(([system, value]) => normalizeSizeKey(system, value));
}

function daysSinceActivityOrPurchase(record, criterion) {
  if (criterion.type.startsWith("purchase_")) {
    return record.purchases.days_since_last_purchase;
  }
  return record.activity.days_since_last_activity;
}

function recencyLabel(criterion) {
  return criterion.type.startsWith("purchase_") ? "Last purchase" : "Last activity";
}
