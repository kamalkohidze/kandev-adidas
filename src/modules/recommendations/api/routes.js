import {
  createJsonResponse,
  createNotFoundResponse,
  createValidationResponse
} from "../../../platform/http.js";
import { createSeedData } from "../../../platform/seed-data.js";
import { normalizeLocale } from "../../../shared/contracts.js";
import { resolveRequestLocale } from "../../i18n/index.js";
import { createRecommendationEngine } from "../engine/index.js";
import { buildProductBlocks } from "../message-blocks/index.js";

export function registerRecommendationRoutes(route, data = createSeedData()) {
  const engine = createRecommendationEngine(data);

  route("GET", "/api/v1/customers/:customer_id/recommendations", async (request) => {
    const locale = getLocale(request.headers, request.query);
    if (!isTenantContext(request.tenantId)) {
      return createValidationResponse([{ field: "tenant_context", reason: "required" }], locale);
    }

    const set = engine.recommendForCustomer({
      customerId: request.params.customer_id,
      tenantId: request.tenantId,
      branchId: request.query.get("branch_id"),
      locale,
      limit: request.query.get("limit"),
      segmentCode: request.query.get("segment_code")
    });

    if (!set) {
      return createNotFoundResponse(locale);
    }

    return createJsonResponse(200, withOptionalMessageBlocks(set, request.query, locale));
  });

  route("GET", "/api/v1/recommendations/segments/:segment_code", async (request) => {
    const locale = getLocale(request.headers, request.query);
    if (!isTenantContext(request.tenantId)) {
      return createValidationResponse([{ field: "tenant_context", reason: "required" }], locale);
    }

    const set = engine.recommendForSegment({
      tenantId: request.tenantId,
      segmentCode: request.params.segment_code,
      branchId: request.query.get("branch_id"),
      locale,
      limit: request.query.get("limit")
    });

    return createJsonResponse(200, withOptionalMessageBlocks(set, request.query, locale));
  });
}

function withOptionalMessageBlocks(set, query, locale) {
  if (parseInclude(query.get("include")).includes("message_blocks")) {
    return {
      ...set,
      message_blocks: buildProductBlocks(set, locale)
    };
  }

  return set;
}

function getLocale(headers, query) {
  return normalizeLocale(query.get("locale") || resolveRequestLocale(headers));
}

function parseInclude(value) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isTenantContext(value) {
  return typeof value === "string" && value.trim() !== "";
}
