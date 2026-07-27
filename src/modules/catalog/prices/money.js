export function canonicalizePrice(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("price_object_required");
  }

  return {
    amount: normalizePriceAmount(value.amount),
    currency: normalizeCurrency(value.currency)
  };
}

export function normalizePriceAmount(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
    throw new Error("price_amount_decimal_string_required");
  }

  const [whole, fraction = ""] = text.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

function normalizeCurrency(value) {
  const currency = String(value ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("price_currency_required");
  }
  return currency;
}
