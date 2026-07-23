import { randomUUID } from "node:crypto";
import { assertIdentityType } from "../../../shared/contracts.js";
import { buildTransactionCreatedEvents } from "../events/factory.js";
import { absMoney, addMoney, negateMoney, normalizeMoney, parseMoney, sumMoney } from "./money.js";

export const transactionTypes = ["purchase", "return", "exchange", "cancellation", "adjustment"];
const negativeSpendTypes = new Set(["return", "cancellation"]);

export function createTransactionLedger(seedData) {
  const transactions = seedData.transactions;
  const eventStore = ensureArray(seedData, "transaction_events");

  function ingestTransaction(input, options = {}) {
    const validationDetails = validateTransactionInput(input);
    if (validationDetails.length > 0) {
      return {
        ok: false,
        validationDetails
      };
    }

    const existing = findByExternalId({
      tenantId: input.tenant_id,
      sourceSystem: input.source_system,
      externalTransactionId: input.external_transaction_id
    });

    if (existing) {
      return {
        ok: true,
        created: false,
        transaction: existing,
        events: eventStore.filter((event) => event.aggregate_id === existing.id),
        annual_spend: calculateRollingAnnualSpend({
          customerId: existing.customer_id,
          tenantId: existing.tenant_id,
          currency: existing.currency,
          asOf: options.asOf || existing.occurred_at
        })
      };
    }

    const transaction = canonicalizeTransaction(input);
    transactions.push(transaction);

    const idempotencyKey = options.idempotencyKey || buildExternalIdempotencyKey(transaction);
    const events = buildTransactionCreatedEvents({
      transaction,
      correlationId: options.correlationId,
      causationId: options.causationId || null,
      idempotencyKey,
      locale: options.locale || null,
      producer: options.producer || "transactions.ledger"
    });
    eventStore.push(...events);

    const annualSpend = calculateRollingAnnualSpend({
      customerId: transaction.customer_id,
      tenantId: transaction.tenant_id,
      currency: transaction.currency,
      asOf: options.asOf || transaction.occurred_at
    });
    updateCustomerAnnualSpend(transaction.customer_id, annualSpend, transaction);

    return {
      ok: true,
      created: true,
      transaction,
      events,
      annual_spend: annualSpend
    };
  }

  function findByExternalId({ tenantId, sourceSystem, externalTransactionId }) {
    return transactions.find(
      (transaction) =>
        transaction.tenant_id === tenantId &&
        transaction.source_system === sourceSystem &&
        transaction.external_transaction_id === externalTransactionId
    );
  }

  function listCustomerTransactions({ customerId, tenantId = null, limit = 50 }) {
    return transactions
      .filter((transaction) => transaction.customer_id === customerId)
      .filter((transaction) => !tenantId || transaction.tenant_id === tenantId)
      .sort((left, right) => Date.parse(right.occurred_at) - Date.parse(left.occurred_at))
      .slice(0, limit);
  }

  function calculateRollingAnnualSpend({ customerId, tenantId, currency = null, asOf = new Date().toISOString() }) {
    if (!customerId) {
      return null;
    }

    const asOfTime = Date.parse(asOf);
    const windowStartTime = asOfTime - 365 * 24 * 60 * 60 * 1000;
    const eligible = transactions.filter((transaction) => {
      const occurredAt = Date.parse(transaction.occurred_at);
      return (
        transaction.customer_id === customerId &&
        transaction.tenant_id === tenantId &&
        (!currency || transaction.currency === currency) &&
        Number.isFinite(occurredAt) &&
        occurredAt >= windowStartTime &&
        occurredAt <= asOfTime
      );
    });

    const amount = eligible.reduce((total, transaction) => total + parseMoney(getSignedEligibleAmount(transaction)), 0n);

    return {
      amount: normalizeMoneyFromMinor(amount),
      currency: currency || eligible[0]?.currency || "KZT",
      rolling_window_days: 365
    };
  }

  return {
    ingestTransaction,
    listCustomerTransactions,
    calculateRollingAnnualSpend,
    findByExternalId
  };

  function updateCustomerAnnualSpend(customerId, annualSpend, transaction) {
    if (!customerId || !annualSpend) {
      return;
    }

    const customer = seedData.customers.find((candidate) => candidate.id === customerId && candidate.tenant_id === transaction.tenant_id);
    if (!customer) {
      return;
    }

    customer.annual_spend = annualSpend;
    customer.last_activity = {
      type: transaction.type,
      channel: transaction.channel,
      occurred_at: transaction.occurred_at,
      source_ref: transaction.id
    };
    customer.updated_at = new Date().toISOString();
  }
}

export function canonicalizeTransaction(input) {
  const now = new Date().toISOString();
  const currency = input.currency;
  const lines = (input.lines || []).map((line, index) => canonicalizeLine(line, index, currency));

  return {
    id: input.id || randomUUID(),
    tenant_id: input.tenant_id,
    type: input.type,
    status: input.status || "completed",
    customer_id: input.customer_id ?? null,
    omnichannel_identity: canonicalizeOmnichannelIdentity(input.omnichannel_identity),
    store_id: input.store_id ?? null,
    channel: input.channel,
    source_system: input.source_system,
    external_transaction_id: input.external_transaction_id,
    fiscal_receipt_id: input.fiscal_receipt_id ?? null,
    original_transaction_id: input.original_transaction_id ?? null,
    business_date: input.business_date,
    occurred_at: input.occurred_at,
    currency,
    totals: canonicalizeTotals(input.totals || {}),
    payment_methods: Array.isArray(input.payment_methods) ? input.payment_methods.map(canonicalizePaymentMethod) : [],
    loyalty: canonicalizeLoyalty(input.loyalty || {}),
    lines,
    created_at: input.created_at || now,
    updated_at: input.updated_at || now,
    version: Number.isInteger(input.version) ? input.version : 1
  };
}

export function validateTransactionInput(input) {
  const details = [];

  if (!isPlainObject(input)) {
    return [{ field: "body", reason: "object_required" }];
  }

  requireString(input, "tenant_id", details);
  if (!transactionTypes.includes(input.type)) {
    details.push({ field: "type", reason: "unsupported_transaction_type" });
  }
  requireString(input, "channel", details);
  requireString(input, "source_system", details);
  requireString(input, "external_transaction_id", details);
  requireString(input, "business_date", details);
  requireString(input, "occurred_at", details);
  requireString(input, "currency", details);

  if (!isPlainObject(input.totals)) {
    details.push({ field: "totals", reason: "object_required" });
  } else if (input.totals.net_amount === undefined) {
    details.push({ field: "totals.net_amount", reason: "required" });
  }

  if (!input.customer_id && (!input.omnichannel_identity?.type || !input.omnichannel_identity?.value)) {
    details.push({ field: "customer_id", reason: "customer_id_or_omnichannel_identity_required" });
  }

  if (input.omnichannel_identity?.type) {
    try {
      assertIdentityType(input.omnichannel_identity.type);
    } catch (error) {
      details.push({ field: "omnichannel_identity.type", reason: "unsupported_identity_type" });
    }
  }

  validateMoney(input.totals?.net_amount, "totals.net_amount", details);
  if (input.totals) {
    for (const field of ["gross_amount", "discount_amount", "loyalty_discount_amount", "promo_discount_amount", "tax_amount"]) {
      if (input.totals[field] !== undefined) {
        validateMoney(input.totals[field], `totals.${field}`, details);
      }
    }
  }

  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    details.push({ field: "lines", reason: "non_empty_array_required" });
  } else {
    input.lines.forEach((line, index) => validateLine(line, index, details));
  }

  if (input.payment_methods !== undefined) {
    validatePaymentMethods(input.payment_methods, details);
  }

  return details;
}

export function getSignedEligibleAmount(transaction) {
  const eligibleAmount = getEligibleAmount(transaction);

  if (transaction.type === "adjustment") {
    return normalizeMoney(eligibleAmount);
  }

  if (negativeSpendTypes.has(transaction.type)) {
    return negateMoney(absMoney(eligibleAmount));
  }

  return absMoney(eligibleAmount);
}

export function getEligibleAmount(transaction) {
  const lineAmounts = (transaction.lines || []).map((line) => line.loyalty_eligible_amount ?? line.net_amount);
  if (lineAmounts.length > 0) {
    return sumMoney(lineAmounts);
  }

  return transaction.totals?.net_amount ?? "0.00";
}

function canonicalizeLine(line, index, currency) {
  return {
    id: line.id || randomUUID(),
    line_number: Number.isInteger(line.line_number) ? line.line_number : index + 1,
    product_id: line.product_id ?? null,
    product_variant_id: line.product_variant_id ?? null,
    sku: line.sku,
    barcode: line.barcode ?? null,
    name: line.name || line.sku,
    quantity: normalizeQuantity(line.quantity ?? "1"),
    unit_price: {
      amount: normalizeMoney(line.unit_price?.amount ?? line.unit_price ?? line.net_amount ?? "0.00"),
      currency: line.unit_price?.currency || currency
    },
    gross_amount: normalizeMoney(line.gross_amount ?? line.net_amount ?? "0.00"),
    discount_amount: normalizeMoney(line.discount_amount ?? "0.00"),
    net_amount: normalizeMoney(line.net_amount ?? "0.00"),
    loyalty_eligible_amount: normalizeMoney(line.loyalty_eligible_amount ?? line.net_amount ?? "0.00"),
    tax_amount: normalizeMoney(line.tax_amount ?? "0.00"),
    applied_discounts: Array.isArray(line.applied_discounts) ? line.applied_discounts.map(canonicalizeAppliedDiscount) : [],
    attributes: isPlainObject(line.attributes) ? line.attributes : {}
  };
}

function canonicalizeTotals(totals) {
  return {
    gross_amount: normalizeMoney(totals.gross_amount ?? totals.net_amount ?? "0.00"),
    discount_amount: normalizeMoney(totals.discount_amount ?? "0.00"),
    loyalty_discount_amount: normalizeMoney(totals.loyalty_discount_amount ?? "0.00"),
    promo_discount_amount: normalizeMoney(totals.promo_discount_amount ?? "0.00"),
    tax_amount: normalizeMoney(totals.tax_amount ?? "0.00"),
    net_amount: normalizeMoney(totals.net_amount ?? "0.00")
  };
}

function canonicalizePaymentMethod(paymentMethod) {
  return {
    type: paymentMethod.type || "unknown",
    amount: normalizeMoney(paymentMethod.amount ?? "0.00"),
    provider_ref: paymentMethod.provider_ref ?? null
  };
}

function canonicalizeLoyalty(loyalty) {
  return {
    tier_id: loyalty.tier_id ?? null,
    discount_percent: loyalty.discount_percent ?? null,
    evaluation_id: loyalty.evaluation_id ?? null
  };
}

function canonicalizeAppliedDiscount(discount) {
  return {
    type: discount.type || "unknown",
    code: discount.code ?? null,
    amount: normalizeMoney(discount.amount ?? "0.00"),
    stackable: Boolean(discount.stackable)
  };
}

function canonicalizeOmnichannelIdentity(identity) {
  return {
    type: identity?.type ?? null,
    value: identity?.value ?? null
  };
}

function normalizeQuantity(value) {
  const raw = String(value ?? "0").trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new Error("quantity_decimal_string_required");
  }

  return raw;
}

function validateLine(line, index, details) {
  if (!isPlainObject(line)) {
    details.push({ field: `lines.${index}`, reason: "object_required" });
    return;
  }

  if (typeof line.sku !== "string" || line.sku.trim() === "") {
    details.push({ field: `lines.${index}.sku`, reason: "required" });
  }
  if (line.quantity !== undefined) {
    validateQuantity(line.quantity, `lines.${index}.quantity`, details);
  }
  validateLineUnitPrice(line, index, details);
  for (const field of ["gross_amount", "discount_amount", "tax_amount"]) {
    if (line[field] !== undefined) {
      validateMoney(line[field], `lines.${index}.${field}`, details);
    }
  }
  validateMoney(line.net_amount, `lines.${index}.net_amount`, details);

  if (line.loyalty_eligible_amount !== undefined) {
    validateMoney(line.loyalty_eligible_amount, `lines.${index}.loyalty_eligible_amount`, details);
  }

  if (line.applied_discounts !== undefined) {
    validateAppliedDiscounts(line.applied_discounts, `lines.${index}.applied_discounts`, details);
  }
}

function validateLineUnitPrice(line, index, details) {
  if (line.unit_price === undefined) {
    return;
  }

  if (isPlainObject(line.unit_price)) {
    if (line.unit_price.amount !== undefined) {
      validateMoney(line.unit_price.amount, `lines.${index}.unit_price.amount`, details);
    } else {
      details.push({ field: `lines.${index}.unit_price.amount`, reason: "required" });
    }
    return;
  }

  validateMoney(line.unit_price, `lines.${index}.unit_price`, details);
}

function validatePaymentMethods(paymentMethods, details) {
  if (!Array.isArray(paymentMethods)) {
    return;
  }

  paymentMethods.forEach((paymentMethod, index) => {
    if (!isPlainObject(paymentMethod)) {
      details.push({ field: `payment_methods.${index}`, reason: "object_required" });
      return;
    }

    if (paymentMethod.amount !== undefined) {
      validateMoney(paymentMethod.amount, `payment_methods.${index}.amount`, details);
    }
  });
}

function validateAppliedDiscounts(appliedDiscounts, field, details) {
  if (!Array.isArray(appliedDiscounts)) {
    return;
  }

  appliedDiscounts.forEach((discount, index) => {
    if (!isPlainObject(discount)) {
      details.push({ field: `${field}.${index}`, reason: "object_required" });
      return;
    }

    if (discount.amount !== undefined) {
      validateMoney(discount.amount, `${field}.${index}.amount`, details);
    }
  });
}

function validateQuantity(value, field, details) {
  try {
    normalizeQuantity(value);
  } catch (error) {
    details.push({ field, reason: error.message });
  }
}

function validateMoney(value, field, details) {
  try {
    parseMoney(value);
  } catch (error) {
    details.push({ field, reason: error.message });
  }
}

function requireString(source, field, details) {
  if (typeof source[field] !== "string" || source[field].trim() === "") {
    details.push({ field, reason: "required" });
  }
}

function buildExternalIdempotencyKey(transaction) {
  return `${transaction.tenant_id}:${transaction.source_system}:${transaction.external_transaction_id}`;
}

function ensureArray(target, field) {
  if (!Array.isArray(target[field])) {
    target[field] = [];
  }

  return target[field];
}

function normalizeMoneyFromMinor(value) {
  return addMoney("0.00", valueToDecimalString(value));
}

function valueToDecimalString(value) {
  const sign = value < 0n ? "-" : "";
  const unsigned = value < 0n ? -value : value;
  const units = unsigned / 100n;
  const fraction = String(unsigned % 100n).padStart(2, "0");

  return `${sign}${units}.${fraction}`;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
