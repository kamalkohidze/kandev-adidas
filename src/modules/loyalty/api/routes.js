import { createJsonResponse, createValidationResponse } from "../../../platform/http.js";
import { createSeedData } from "../../../platform/seed-data.js";
import { resolveRequestLocale } from "../../i18n/index.js";
import { evaluateLoyaltyDiscount, validateDiscountEvaluationRequest } from "../discount-rules/evaluator.js";

export function registerLoyaltyRoutes(route, data = createSeedData()) {
  route("POST", "/api/v1/pos/discounts/evaluate", async ({ headers, body }) => {
    const requestLocale = resolveRequestLocale(headers);
    const validationDetails = validateDiscountEvaluationRequest(body);

    if (validationDetails.length > 0) {
      return createValidationResponse(validationDetails, requestLocale);
    }

    const customer = (data.customers || []).find((candidate) => candidate.id === body.customer_id);
    if (!customer) {
      return createValidationResponse([{ field: "customer_id", reason: "customer_not_found" }], requestLocale);
    }

    let result;
    try {
      result = evaluateLoyaltyDiscount(data, body, {
        tenantId: customer.tenant_id,
        correlationId: getHeader(headers, "x-correlation-id"),
        idempotencyKey: getHeader(headers, "idempotency-key"),
        locale: requestLocale,
        producer: "loyalty.pos-discounts.api"
      });
    } catch (error) {
      return createValidationResponse([{ field: "body", reason: error.message || "invalid_discount_evaluation_payload" }], requestLocale);
    }

    return createJsonResponse(200, {
      evaluation_id: result.evaluation_id,
      discount_percent: result.discount_percent,
      discount_amount: result.discount_amount,
      net_amount: result.net_amount,
      lines: result.lines.map((line) => ({
        sku: line.sku,
        loyalty_discount_allowed: line.loyalty_discount_allowed,
        discount_amount: line.discount_amount,
        blocked_by_global_sale: line.blocked_by_global_sale
      })),
      warnings: result.warnings,
      events: result.events.map((event) => event.event_type)
    });
  });
}

function getHeader(headers, name) {
  if (typeof headers?.get === "function") {
    return headers.get(name);
  }

  const lowerName = name.toLowerCase();
  const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === lowerName);
  return entry?.[1] || null;
}
