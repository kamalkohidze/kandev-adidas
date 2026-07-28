import { createJsonResponse, createNotFoundResponse, createValidationResponse } from "../../../../platform/http.js";
import { createSeedData } from "../../../../platform/seed-data.js";
import { normalizeLocale } from "../../../../shared/contracts.js";
import { resolveRequestLocale } from "../../../i18n/index.js";
import { createDeliveryService } from "../service.js";

export function registerDeliveryRoutes(route, data = createSeedData()) {
  const delivery = createDeliveryService(data);

  route("POST", "/api/v1/messages/send", async (request) => enqueueRoute({ request, delivery }));
  route("POST", "/api/v1/marketing/delivery/enqueue", async (request) => enqueueRoute({ request, delivery }));
  route("POST", "/api/v1/messages/provider-receipts/:provider", async (request) =>
    callbackRoute({ request, delivery })
  );
  route("POST", "/api/v1/marketing/delivery/process", async (request) => {
    const locale = getLocale(request);
    if (!isTenantContext(request.tenantId)) {
      return createValidationResponse([{ field: "tenant_context", reason: "required" }], locale);
    }
    const result = delivery.processDueDeliveries({
      tenantId: request.tenantId,
      asOf: request.body?.as_of || new Date().toISOString(),
      limit: request.body?.limit || 50
    });
    return createJsonResponse(200, result);
  });
  route("GET", "/api/v1/marketing/delivery/requests/:request_id", async (request) => {
    const locale = getLocale(request);
    if (!isTenantContext(request.tenantId)) {
      return createValidationResponse([{ field: "tenant_context", reason: "required" }], locale);
    }
    const result = delivery.getRequest({ tenantId: request.tenantId, requestId: request.params.request_id });
    return result ? createJsonResponse(200, result) : createNotFoundResponse(locale);
  });
}

async function enqueueRoute({ request, delivery }) {
  const locale = getLocale(request);
  if (!isTenantContext(request.tenantId)) {
    return createValidationResponse([{ field: "tenant_context", reason: "required" }], locale);
  }
  if (!isPlainObject(request.body)) {
    return createValidationResponse([{ field: "body", reason: "object_required" }], locale);
  }

  const result = delivery.enqueueDelivery({
    tenantId: request.tenantId,
    request: request.body,
    asOf: request.body.as_of || new Date().toISOString()
  });
  if (!result.ok) {
    return createValidationResponse(result.validationDetails || [], locale);
  }

  return createJsonResponse(result.duplicate ? 200 : 202, {
    delivery_id: result.delivery?.id || null,
    delivery_request_id: result.data.id,
    status: result.delivery?.status || result.data.status,
    provider: result.delivery?.provider || null,
    correlation_id: result.data.correlation_id,
    duplicate: result.duplicate === true,
    data: result.data
  });
}

async function callbackRoute({ request, delivery }) {
  const locale = getLocale(request);
  if (!isTenantContext(request.tenantId)) {
    return createValidationResponse([{ field: "tenant_context", reason: "required" }], locale);
  }
  if (!isPlainObject(request.body)) {
    return createValidationResponse([{ field: "body", reason: "object_required" }], locale);
  }

  const result = delivery.handleStatusCallback({
    tenantId: request.tenantId,
    provider: request.params.provider,
    providerMessageId: request.body.provider_message_id,
    status: request.body.status,
    occurredAt: request.body.occurred_at || new Date().toISOString(),
    metadata: request.body.metadata || {}
  });
  if (result === null) {
    return createNotFoundResponse(locale);
  }
  if (!result.ok) {
    return createValidationResponse(result.validationDetails || [], locale);
  }

  return createJsonResponse(202, {
    delivery_id: result.data.id,
    event_type: result.event_type,
    accepted: result.accepted,
    duplicate: result.duplicate === true,
    data: result.data
  });
}

function getLocale(request) {
  return normalizeLocale(request.body?.locale || request.query.get("locale") || resolveRequestLocale(request.headers));
}

function isTenantContext(value) {
  return typeof value === "string" && value.trim() !== "";
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

