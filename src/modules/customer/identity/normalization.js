import { assertIdentityType } from "../../../shared/contracts.js";

export function normalizeIdentity(type, value) {
  assertIdentityType(type);

  if (value === undefined || value === null || String(value).trim() === "") {
    throw new Error("Identity value is required");
  }

  if (type === "phone") {
    return normalizePhone(value);
  }

  if (type === "email") {
    return String(value).trim().toLowerCase();
  }

  if (type === "wallet_card" || type === "wallet_barcode") {
    return String(value).replace(/[\s-]/g, "");
  }

  return String(value).trim();
}

function normalizePhone(value) {
  const compact = String(value).replace(/[^\d+]/g, "");

  if (compact.startsWith("+")) {
    return compact;
  }

  if (compact.startsWith("8") && compact.length === 11) {
    return `+7${compact.slice(1)}`;
  }

  if (compact.startsWith("7") && compact.length === 11) {
    return `+${compact}`;
  }

  return compact;
}
