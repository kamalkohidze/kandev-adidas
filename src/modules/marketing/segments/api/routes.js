import {
  createJsonResponse,
  createNotFoundResponse,
  createValidationResponse
} from "../../../../platform/http.js";
import { createSeedData } from "../../../../platform/seed-data.js";
import { normalizeLocale } from "../../../../shared/contracts.js";
import { resolveRequestLocale } from "../../../i18n/index.js";
import { createSegmentService } from "../service.js";

export function registerSegmentRoutes(route, data = createSeedData()) {
  const segments = createSegmentService(data);

  route("GET", "/api/v1/marketing/segments", async () =>
    createJsonResponse(200, {
      data: segments.listSegments()
    })
  );

  route("GET", "/api/v1/marketing/segments/:segment_code/explain", async (request) => {
    const locale = getLocale(request.headers, request.query);
    const explanation = segments.explainCriteria({
      segmentCode: request.params.segment_code,
      filters: filtersFromQuery(request.query)
    });

    if (!explanation) {
      return createNotFoundResponse(locale);
    }

    return createJsonResponse(200, explanation);
  });

  route("GET", "/api/v1/marketing/segments/:segment_code/count", async (request) => {
    const locale = getLocale(request.headers, request.query);
    const result = segments.countAudience({
      tenantId: request.tenantId,
      segmentCode: request.params.segment_code,
      filters: filtersFromQuery(request.query),
      asOf: request.query.get("as_of") || new Date().toISOString()
    });

    if (!result) {
      return createNotFoundResponse(locale);
    }
    if (!result.ok) {
      return createValidationResponse(result.validationDetails, locale);
    }

    return createJsonResponse(200, {
      segment_code: result.segment_code,
      tenant_id: result.tenant_id,
      count: result.count,
      generated_at: result.generated_at
    });
  });

  route("GET", "/api/v1/marketing/segments/:segment_code/preview", async (request) => {
    const locale = getLocale(request.headers, request.query);
    const result = segments.previewAudience({
      tenantId: request.tenantId,
      segmentCode: request.params.segment_code,
      filters: filtersFromQuery(request.query),
      asOf: request.query.get("as_of") || new Date().toISOString(),
      limit: request.query.get("limit")
    });

    if (!result) {
      return createNotFoundResponse(locale);
    }
    if (!result.ok) {
      return createValidationResponse(result.validationDetails, locale);
    }

    return createJsonResponse(200, result);
  });
}

function filtersFromQuery(query) {
  return {
    category_ids: valuesFromQuery(query, "category_id", "category_ids"),
    sport_tags: valuesFromQuery(query, "sport_tag", "sport_tags", "sport"),
    size_system: query.get("size_system"),
    size_value: query.get("size_value"),
    purchase_within_days: query.get("purchase_within_days")
  };
}

function valuesFromQuery(query, ...names) {
  const values = [];
  for (const name of names) {
    values.push(...query.getAll(name));
  }
  return values.flatMap((value) => String(value).split(",")).map((value) => value.trim()).filter(Boolean);
}

function getLocale(headers, query) {
  return normalizeLocale(query.get("locale") || resolveRequestLocale(headers));
}
