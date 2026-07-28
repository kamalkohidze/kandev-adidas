import {
  createJsonResponse,
  createNotFoundResponse,
  createValidationResponse
} from "../../../../platform/http.js";
import { createSeedData } from "../../../../platform/seed-data.js";
import { normalizeLocale } from "../../../../shared/contracts.js";
import { resolveRequestLocale } from "../../../i18n/index.js";
import { createLifecycleService } from "../service.js";

export function registerLifecycleRoutes(route, data = createSeedData()) {
  const lifecycle = createLifecycleService(data);

  route("GET", "/api/v1/marketing/lifecycle/:customer_id", async (request) => {
    const locale = getLocale(request.headers, request.query);
    const result = lifecycle.getCustomerLifecycle({
      tenantId: request.tenantId,
      customerId: request.params.customer_id,
      asOf: request.query.get("as_of") || new Date().toISOString()
    });

    if (!result) {
      return createNotFoundResponse(locale);
    }
    if (!result.ok) {
      return createValidationResponse(result.validationDetails, locale);
    }

    return createJsonResponse(200, result);
  });

  route("POST", "/api/v1/marketing/lifecycle/audit", async (request) => {
    const locale = getLocale(request.headers, request.query);
    const body = request.body || {};
    const asOf = body.as_of || request.query.get("as_of") || new Date().toISOString();
    const result = body.customer_id
      ? lifecycle.auditCustomerLifecycle({
          tenantId: request.tenantId,
          customerId: body.customer_id,
          asOf,
          correlationId: request.headers["x-correlation-id"] || request.headers["X-Correlation-Id"] || null
        })
      : lifecycle.auditTenantLifecycle({
          tenantId: request.tenantId,
          asOf,
          limit: parseLimit(body.limit)
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

function getLocale(headers, query) {
  return normalizeLocale(query.get("locale") || resolveRequestLocale(headers));
}

function parseLimit(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
