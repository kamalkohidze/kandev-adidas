import { createJsonResponse, createValidationResponse } from "../../../../platform/http.js";
import { createSeedData } from "../../../../platform/seed-data.js";
import { normalizeLocale } from "../../../../shared/contracts.js";
import { resolveRequestLocale } from "../../../i18n/index.js";
import { createCrossSellService } from "../service.js";

export function registerCrossSellRoutes(route, data = createSeedData()) {
  const crossSell = createCrossSellService(data);

  route("GET", "/api/v1/marketing/cross-sell/scenarios", async () =>
    createJsonResponse(200, {
      data: crossSell.listScenarios()
    })
  );

  route("GET", "/api/v1/marketing/cross-sell/candidates", async (request) => {
    const locale = getLocale(request.headers, request.query);
    const result = crossSell.listCandidates({
      tenantId: request.tenantId,
      customerId: request.query.get("customer_id"),
      scenarioCode: request.query.get("scenario_code")
    });

    if (!result.ok) {
      return createValidationResponse(result.validationDetails, locale);
    }

    return createJsonResponse(200, result);
  });

  route("POST", "/api/v1/marketing/cross-sell/candidates", async (request) => {
    const locale = getLocale(request.headers, request.query);
    const body = isPlainObject(request.body) ? request.body : {};
    const result = crossSell.generateCandidates({
      tenantId: request.tenantId,
      asOf: body.as_of || new Date().toISOString(),
      branchId: body.branch_id || null,
      locale: body.locale ? normalizeLocale(body.locale) : locale,
      limit: body.limit ?? null,
      scenarioCodes: normalizeScenarioCodes(body.scenario_codes)
    });

    if (!result.ok) {
      return createValidationResponse(result.validationDetails, locale);
    }

    return createJsonResponse(201, result);
  });
}

function normalizeScenarioCodes(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function getLocale(headers, query) {
  return normalizeLocale(query.get("locale") || resolveRequestLocale(headers));
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
