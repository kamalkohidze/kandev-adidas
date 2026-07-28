import {
  createJsonResponse,
  createNotFoundResponse,
  createValidationResponse
} from "../../../../platform/http.js";
import { createSeedData } from "../../../../platform/seed-data.js";
import { normalizeLocale } from "../../../../shared/contracts.js";
import { resolveRequestLocale } from "../../../i18n/index.js";
import { createWorkflowService } from "../service.js";

export function registerWorkflowRoutes(route, data = createSeedData()) {
  const workflows = createWorkflowService(data);

  route("GET", "/api/v1/marketing/workflows", async (request) => {
    const locale = getLocale(request.headers, request.query);
    const result = workflows.listDefinitions({ tenantId: request.tenantId });
    if (!result.ok) {
      return createValidationResponse(result.validationDetails, locale);
    }
    return createJsonResponse(200, result);
  });

  route("POST", "/api/v1/marketing/workflows", async (request) => {
    const locale = getLocale(request.headers, request.query);
    const body = isPlainObject(request.body) ? request.body : {};
    const result = workflows.createDefinition({
      tenantId: request.tenantId,
      definition: body.definition || body,
      asOf: new Date().toISOString()
    });
    if (!result.ok) {
      return createValidationResponse(result.validationDetails, locale);
    }
    return createJsonResponse(201, result);
  });

  route("GET", "/api/v1/marketing/workflows/:workflow_code", async (request) => {
    const locale = getLocale(request.headers, request.query);
    const result = workflows.getDefinition({
      tenantId: request.tenantId,
      code: request.params.workflow_code
    });
    if (!result) {
      return createNotFoundResponse(locale);
    }
    if (!result.ok) {
      return createValidationResponse(result.validationDetails, locale);
    }
    return createJsonResponse(200, result);
  });

  route("POST", "/api/v1/marketing/workflows/events", async (request) => {
    const locale = getLocale(request.headers, request.query);
    const body = isPlainObject(request.body) ? request.body : {};
    const result = workflows.handleEvent({
      tenantId: request.tenantId,
      event: body.event || body,
      asOf: body.as_of || body.event?.occurred_at || new Date().toISOString()
    });
    if (!result.ok) {
      return createValidationResponse(result.validationDetails, locale);
    }
    return createJsonResponse(202, result);
  });

  route("POST", "/api/v1/marketing/workflows/dry-run", async (request) => {
    const locale = getLocale(request.headers, request.query);
    const body = isPlainObject(request.body) ? request.body : {};
    const result = workflows.dryRun({
      tenantId: request.tenantId,
      definition: body.definition || null,
      workflowCode: body.workflow_code || body.workflowCode || null,
      event: body.event,
      asOf: body.as_of || body.event?.occurred_at || new Date().toISOString()
    });
    if (!result) {
      return createNotFoundResponse(locale);
    }
    if (!result.ok) {
      return createValidationResponse(result.validationDetails, locale);
    }
    return createJsonResponse(200, result);
  });

  route("GET", "/api/v1/marketing/workflows/instances/:instance_id", async (request) => {
    const locale = getLocale(request.headers, request.query);
    const result = workflows.getInstance({
      tenantId: request.tenantId,
      instanceId: request.params.instance_id
    });
    if (!result) {
      return createNotFoundResponse(locale);
    }
    if (!result.ok) {
      return createValidationResponse(result.validationDetails, locale);
    }
    return createJsonResponse(200, result);
  });

  route("POST", "/api/v1/marketing/workflows/instances/:instance_id/advance", async (request) => {
    const locale = getLocale(request.headers, request.query);
    const body = isPlainObject(request.body) ? request.body : {};
    const result = workflows.advanceInstance({
      tenantId: request.tenantId,
      instanceId: request.params.instance_id,
      asOf: body.as_of || new Date().toISOString()
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

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
