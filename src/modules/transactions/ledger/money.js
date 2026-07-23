const moneyScale = 2;

export function normalizeMoney(value) {
  return formatMinor(parseMoney(value));
}

export function addMoney(left, right) {
  return formatMinor(parseMoney(left) + parseMoney(right));
}

export function subtractMoney(left, right) {
  return formatMinor(parseMoney(left) - parseMoney(right));
}

export function negateMoney(value) {
  return formatMinor(-parseMoney(value));
}

export function absMoney(value) {
  const amount = parseMoney(value);
  return formatMinor(amount < 0n ? -amount : amount);
}

export function compareMoney(left, right) {
  const difference = parseMoney(left) - parseMoney(right);
  return difference === 0n ? 0 : difference > 0n ? 1 : -1;
}

export function sumMoney(values) {
  return formatMinor(values.reduce((total, value) => total + parseMoney(value), 0n));
}

export function parseMoney(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("money_finite_number_required");
    }
    value = value.toFixed(moneyScale);
  }

  const raw = String(value ?? "0").trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(raw)) {
    throw new Error("money_decimal_string_required");
  }

  const sign = raw.startsWith("-") ? -1n : 1n;
  const unsigned = raw.replace(/^-/, "");
  const [units, fraction = ""] = unsigned.split(".");
  const minor = BigInt(units) * 100n + BigInt(fraction.padEnd(moneyScale, "0"));

  return sign * minor;
}

export function formatMinor(value) {
  const sign = value < 0n ? "-" : "";
  const unsigned = value < 0n ? -value : value;
  const units = unsigned / 100n;
  const fraction = String(unsigned % 100n).padStart(moneyScale, "0");

  return `${sign}${units}.${fraction}`;
}
