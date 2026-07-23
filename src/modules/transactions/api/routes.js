import { createJsonResponse, createValidationResponse } from "../../../platform/http.js";
import { createSeedData } from "../../../platform/seed-data.js";
import { resolveRequestLocale } from "../../i18n/index.js";
import { createTransactionLedger } from "../ledger/repository.js";

export function registerTransactionRoutes(route, data = createSeedData()) {
  const ledger = createTransactionLedger(data);

  route("POST", "/api/v1/pos/transactions", async ({ headers, body }) => {
    const requestLocale = resolveRequestLocale(headers);
    const idempotencyKey = getHeader(headers, "idempotency-key");

    if (!idempotencyKey) {
      return createValidationResponse([{ field: "Idempotency-Key", reason: "required" }], requestLocale);
    }

    let result;
    try {
      result = ledger.ingestTransaction(body, {
        idempotencyKey,
        correlationId: getHeader(headers, "x-correlation-id") || idempotencyKey,
        locale: requestLocale,
        producer: "pos.transactions.api"
      });
    } catch (error) {
      return createValidationResponse([{ field: "body", reason: error.message || "invalid_transaction_payload" }], requestLocale);
    }

    if (!result.ok) {
      return createValidationResponse(result.validationDetails, requestLocale);
    }

    return createJsonResponse(result.created ? 201 : 200, {
      transaction_id: result.transaction.id,
      customer_id: result.transaction.customer_id,
      loyalty_recalculation_status: "queued",
      annual_spend: result.annual_spend,
      idempotent: !result.created,
      events: result.events.map((event) => event.event_type)
    });
  });

  route("GET", "/api/v1/customers/:customer_id/transactions", async ({ query, params }) => {
    const limit = parseLimit(query.get("limit"));
    const transactions = ledger.listCustomerTransactions({
      customerId: params.customer_id,
      tenantId: query.get("tenant_id") || null,
      limit
    });

    return createJsonResponse(200, {
      data: transactions.map(toPurchaseHistoryItem),
      page: {
        limit,
        next_cursor: null,
        has_more: false
      }
    });
  });
}

function toPurchaseHistoryItem(transaction) {
  return {
    transaction_id: transaction.id,
    type: transaction.type,
    status: transaction.status,
    channel: transaction.channel,
    store_id: transaction.store_id,
    business_date: transaction.business_date,
    occurred_at: transaction.occurred_at,
    currency: transaction.currency,
    totals: transaction.totals,
    loyalty: transaction.loyalty,
    lines: transaction.lines.map((line) => ({
      sku: line.sku,
      name: line.name,
      quantity: line.quantity,
      net_amount: line.net_amount,
      product_variant_id: line.product_variant_id
    }))
  };
}

function parseLimit(value) {
  const limit = Number.parseInt(value || "50", 10);
  if (!Number.isInteger(limit) || limit < 1) {
    return 50;
  }

  return Math.min(limit, 100);
}

function getHeader(headers, name) {
  if (typeof headers?.get === "function") {
    return headers.get(name);
  }

  const lowerName = name.toLowerCase();
  const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === lowerName);
  return entry?.[1] || null;
}
