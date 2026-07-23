import { randomUUID } from "node:crypto";
import { normalizeLocale } from "../../../shared/contracts.js";
import { absMoney, normalizeMoney, sumMoney } from "../ledger/money.js";

const createdEventTypes = new Map([
  ["purchase", "transaction.purchase.created"],
  ["return", "transaction.return.created"]
]);

export function getCreatedEventType(transactionType) {
  return createdEventTypes.get(transactionType) || null;
}

export function buildTransactionCreatedEvents({
  transaction,
  correlationId,
  causationId = null,
  idempotencyKey,
  locale = null,
  producer = "transactions.ledger"
}) {
  const eventType = getCreatedEventType(transaction.type);

  if (!eventType) {
    return [];
  }

  return [
    {
      event_id: randomUUID(),
      event_type: eventType,
      event_version: 1,
      tenant_id: transaction.tenant_id,
      aggregate_type: "transaction",
      aggregate_id: transaction.id,
      occurred_at: transaction.occurred_at,
      published_at: new Date().toISOString(),
      producer,
      correlation_id: correlationId || transaction.id,
      causation_id: causationId,
      idempotency_key: idempotencyKey,
      partition_key: transaction.id,
      payload: toEventPayload(transaction),
      metadata: {
        source_system: transaction.source_system,
        locale: locale ? normalizeLocale(locale) : null,
        pii: hasOmnichannelIdentity(transaction)
      }
    }
  ];
}

function toEventPayload(transaction) {
  if (transaction.type === "return") {
    return {
      transaction_id: transaction.id,
      original_transaction_id: transaction.original_transaction_id,
      customer_id: transaction.customer_id,
      store_id: transaction.store_id,
      channel: transaction.channel,
      occurred_at: transaction.occurred_at,
      currency: transaction.currency,
      net_amount: absMoney(transaction.totals.net_amount),
      loyalty_eligible_amount: absMoney(getTransactionEligibleAmount(transaction)),
      source_system: transaction.source_system,
      external_transaction_id: transaction.external_transaction_id,
      // Return reason belongs to the event contract, but canonical Transaction has no reason_code field yet.
      reason_code: null,
      lines: transaction.lines.map((line) => ({
        product_id: line.product_id,
        product_variant_id: line.product_variant_id,
        sku: line.sku,
        quantity: line.quantity,
        net_amount: absMoney(line.net_amount)
      }))
    };
  }

  return {
    transaction_id: transaction.id,
    customer_id: transaction.customer_id,
    store_id: transaction.store_id,
    channel: transaction.channel,
    occurred_at: transaction.occurred_at,
    currency: transaction.currency,
    net_amount: normalizeMoney(transaction.totals.net_amount),
    loyalty_eligible_amount: normalizeMoney(getTransactionEligibleAmount(transaction)),
    source_system: transaction.source_system,
    external_transaction_id: transaction.external_transaction_id,
    lines: transaction.lines.map((line) => ({
      product_id: line.product_id,
      product_variant_id: line.product_variant_id,
      sku: line.sku,
      quantity: line.quantity,
      net_amount: normalizeMoney(line.net_amount),
      sport_tags: Array.isArray(line.attributes?.sport_tags) ? line.attributes.sport_tags : []
    }))
  };
}

function getTransactionEligibleAmount(transaction) {
  const lineAmounts = transaction.lines.map((line) => line.loyalty_eligible_amount ?? line.net_amount);
  if (lineAmounts.length > 0) {
    return sumMoney(lineAmounts);
  }

  return transaction.totals.net_amount;
}

function hasOmnichannelIdentity(transaction) {
  return Boolean(transaction.omnichannel_identity?.type && transaction.omnichannel_identity?.value);
}
