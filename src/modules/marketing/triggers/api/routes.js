import {
  createJsonResponse,
  createNotFoundResponse,
  createValidationResponse
} from "../../../../platform/http.js";
import { createSeedData } from "../../../../platform/seed-data.js";
import { normalizeLocale } from "../../../../shared/contracts.js";
import { resolveRequestLocale } from "../../../i18n/index.js";
import { createMarketingTriggerService } from "../service.js";

export function registerMarketingTriggerRoutes(route, data = createSeedData()) {
  const triggers = createMarketingTriggerService(data);

  route("GET", "/api/v1/marketing/triggers/presets", async (request) => {
    const locale = getLocale(request.headers, request.query);
    const result = triggers.listPresets({ tenantId: request.tenantId });
    if (!result.ok) {
      return createValidationResponse(result.validationDetails, locale);
    }
    return createJsonResponse(200, result);
  });

  route("POST", "/api/v1/marketing/triggers/presets/:preset_code/enable", async (request) => {
    const locale = getLocale(request.headers, request.query);
    const body = isPlainObject(request.body) ? request.body : {};
    const result = triggers.enablePreset({
      tenantId: request.tenantId,
      presetCode: request.params.preset_code,
      asOf: body.as_of || new Date().toISOString()
    });
    return mutationResponse(result, locale);
  });

  route("POST", "/api/v1/marketing/triggers/presets/:preset_code/disable", async (request) => {
    const locale = getLocale(request.headers, request.query);
    const body = isPlainObject(request.body) ? request.body : {};
    const result = triggers.disablePreset({
      tenantId: request.tenantId,
      presetCode: request.params.preset_code,
      asOf: body.as_of || new Date().toISOString()
    });
    return mutationResponse(result, locale);
  });
}

function mutationResponse(result, locale) {
  if (!result) {
    return createNotFoundResponse(locale);
  }
  if (!result.ok) {
    return createValidationResponse(result.validationDetails, locale);
  }
  return createJsonResponse(200, result);
}

function getLocale(headers, query) {
  return normalizeLocale(query.get("locale") || resolveRequestLocale(headers));
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
