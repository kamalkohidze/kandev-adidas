import {
  createJsonResponse,
  createNotFoundResponse,
  createValidationResponse
} from "../../../../platform/http.js";
import { createSeedData } from "../../../../platform/seed-data.js";
import { normalizeLocale } from "../../../../shared/contracts.js";
import { resolveRequestLocale } from "../../../i18n/index.js";
import { createMessageTemplateService } from "../service.js";

export function registerContentRoutes(route, data = createSeedData()) {
  const templates = createMessageTemplateService(data);

  route("GET", "/api/v1/marketing/content/templates", async (request) => {
    const locale = getLocale(request.headers, request.query);
    if (!isTenantContext(request.tenantId)) {
      return createValidationResponse([{ field: "tenant_context", reason: "required" }], locale);
    }

    return createJsonResponse(200, {
      data: templates.listTemplates({
        tenantId: request.tenantId,
        status: request.query.get("status") || "active"
      })
    });
  });

  route("POST", "/api/v1/marketing/content/templates/:template_code/preview", async (request) =>
    renderTemplateRoute({ request, templates, preview: true })
  );

  route("POST", "/api/v1/marketing/content/templates/:template_code/render", async (request) =>
    renderTemplateRoute({ request, templates, preview: false })
  );
}

async function renderTemplateRoute({ request, templates, preview }) {
  const locale = getLocale(request.headers, request.query, request.body?.locale);
  if (!isTenantContext(request.tenantId)) {
    return createValidationResponse([{ field: "tenant_context", reason: "required" }], locale);
  }
  if (!isPlainObject(request.body)) {
    return createValidationResponse([{ field: "body", reason: "object_required" }], locale);
  }

  const options = {
    tenantId: request.tenantId,
    templateCode: request.params.template_code,
    channel: request.body.channel || request.query.get("channel"),
    locale,
    customerId: request.body.customer_id || null,
    variables: isPlainObject(request.body.variables) ? request.body.variables : {},
    includeRecommendations: request.body.include_recommendations === true,
    recommendation: isPlainObject(request.body.recommendation) ? request.body.recommendation : {},
    allowRawPii: request.body.allow_raw_pii === true
  };
  const result = preview ? templates.previewTemplate(options) : templates.renderTemplate(options);

  if (!result.ok) {
    return result.reason === "template_not_found"
      ? createNotFoundResponse(locale)
      : createValidationResponse(result.validationDetails || [], locale);
  }

  return createJsonResponse(200, {
    data: {
      ...result.data,
      preview
    }
  });
}

function getLocale(headers, query, bodyLocale = null) {
  return normalizeLocale(bodyLocale || query.get("locale") || resolveRequestLocale(headers));
}

function isTenantContext(value) {
  return typeof value === "string" && value.trim() !== "";
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
