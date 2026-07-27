import { findSegmentDefinition, listSegmentDefinitions } from "./definitions.js";
import { evaluateSegmentCriteria, validateSegmentFilters } from "./evaluator.js";
import { buildSegmentAudienceReadModel } from "./read-model.js";

const defaultLimit = 50;
const maxLimit = 100;
const defaultBuyerPurchaseWithinDays = 183;
const buyerPurchaseCriteria = new Set(["purchase_category", "purchase_sport", "purchase_or_profile_size"]);

export function createSegmentService(data) {
  function listSegments() {
    return listSegmentDefinitions();
  }

  function explainCriteria({ segmentCode, filters = {} }) {
    const definition = findSegmentDefinition(segmentCode);
    if (!definition) {
      return null;
    }

    const normalizedFilters = normalizeFilters(filters);
    applyDefaultBuyerPurchaseWindow(definition, normalizedFilters);
    return {
      segment_code: definition.code,
      title: definition.title,
      description: definition.description,
      criteria: definition.criteria,
      filters: summarizeFilters(normalizedFilters),
      pii_policy: {
        audience_preview: "safe_projection_only",
        raw_pii_export: false
      }
    };
  }

  function countAudience(options) {
    const preview = previewAudience({ ...options, limit: 1 });
    if (!preview?.ok) {
      return preview;
    }

    return {
      ok: true,
      segment_code: preview.segment_code,
      tenant_id: preview.tenant_id,
      count: preview.count,
      generated_at: preview.generated_at
    };
  }

  function previewAudience({ tenantId, segmentCode, filters = {}, asOf = new Date().toISOString(), limit = defaultLimit }) {
    const definition = findSegmentDefinition(segmentCode);
    if (!definition) {
      return null;
    }

    const normalizedFilters = normalizeFilters(filters);
    applyDefaultBuyerPurchaseWindow(definition, normalizedFilters);
    const validationDetails = validateRequest({ tenantId, definition, filters: normalizedFilters, asOf });
    if (validationDetails.length > 0) {
      return {
        ok: false,
        validationDetails
      };
    }

    const normalizedLimit = parseLimit(limit);
    const evaluated = buildSegmentAudienceReadModel(data, {
      tenantId,
      asOf,
      purchaseWithinDays: normalizedFilters.purchaseWithinDays
    })
      .map((record) => ({
        record,
        evaluation: evaluateSegmentCriteria(record, definition, normalizedFilters)
      }))
      .filter((entry) => entry.evaluation.matched)
      .sort(compareAudienceEntries);

    return {
      ok: true,
      segment_code: definition.code,
      tenant_id: tenantId,
      count: evaluated.length,
      data: evaluated.slice(0, normalizedLimit).map((entry) => toAudiencePreviewItem(entry)),
      page: {
        limit: normalizedLimit,
        next_cursor: null,
        has_more: evaluated.length > normalizedLimit
      },
      criteria: definition.criteria,
      filters: summarizeFilters(normalizedFilters),
      generated_at: new Date().toISOString()
    };
  }

  return {
    listSegments,
    explainCriteria,
    countAudience,
    previewAudience
  };
}

export function normalizeFilters(filters = {}) {
  const purchaseWithinDays = parseOptionalPositiveInteger(
    filters.purchase_within_days ?? filters.purchaseWithinDays
  );
  return {
    categoryIds: listFilter(filters.category_id ?? filters.category_ids ?? filters.categoryIds),
    sportTags: listFilter(filters.sport_tag ?? filters.sport_tags ?? filters.sportTags),
    sizeSystem: nullableString(filters.size_system ?? filters.sizeSystem)?.toUpperCase() || null,
    sizeValue: nullableString(filters.size_value ?? filters.sizeValue)?.toUpperCase() || null,
    purchaseWithinDays
  };
}

function validateRequest({ tenantId, definition, filters, asOf }) {
  const details = [];
  if (!isTenantContext(tenantId)) {
    details.push({ field: "tenant_context", reason: "required" });
  }
  if (!Number.isFinite(Date.parse(asOf))) {
    details.push({ field: "as_of", reason: "invalid_datetime" });
  }
  if (filters.purchaseWithinDays !== null && !Number.isInteger(filters.purchaseWithinDays)) {
    details.push({ field: "purchase_within_days", reason: "positive_integer_required" });
  }
  details.push(...validateSegmentFilters(definition, filters));
  return details;
}

function toAudiencePreviewItem({ record, evaluation }) {
  return {
    customer_id: record.customer_id,
    status: record.status,
    lifecycle_status: record.lifecycle_status,
    preferred_locale: record.preferred_locale,
    favorite_sports: record.favorite_sports,
    size_profile: record.size_profile,
    annual_spend: record.annual_spend,
    activity: {
      last_type: record.activity.last_type,
      last_channel: record.activity.last_channel,
      last_at: record.activity.last_at,
      days_since_last_activity: record.activity.days_since_last_activity
    },
    purchases: record.purchases,
    matched_criteria: evaluation.reasons
  };
}

function compareAudienceEntries(left, right) {
  const leftActivity = Date.parse(left.record.activity.last_at || "") || 0;
  const rightActivity = Date.parse(right.record.activity.last_at || "") || 0;
  return rightActivity - leftActivity || left.record.customer_id.localeCompare(right.record.customer_id);
}

function summarizeFilters(filters) {
  return {
    category_ids: [...filters.categoryIds],
    sport_tags: [...filters.sportTags],
    size_system: filters.sizeSystem,
    size_value: filters.sizeValue,
    purchase_within_days: filters.purchaseWithinDays
  };
}

function listFilter(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return values.map((item) => String(item).trim()).filter(Boolean);
}

function nullableString(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }
  return String(value).trim();
}

function applyDefaultBuyerPurchaseWindow(definition, filters) {
  if (filters.purchaseWithinDays === null && isBuyerSegment(definition)) {
    filters.purchaseWithinDays = defaultBuyerPurchaseWithinDays;
  }
}

function isBuyerSegment(definition) {
  return (definition.criteria?.all || []).some((criterion) => buyerPurchaseCriteria.has(criterion.type));
}

function parseOptionalPositiveInteger(value) {
  const raw = nullableString(value);
  if (raw === null) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  return String(parsed) === raw && parsed > 0 ? parsed : Number.NaN;
}

function parseLimit(value) {
  const parsed = Number.parseInt(value || defaultLimit, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return defaultLimit;
  }

  return Math.min(parsed, maxLimit);
}

function isTenantContext(value) {
  return typeof value === "string" && value.trim() !== "";
}
