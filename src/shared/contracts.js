export const locales = ["kk", "ru", "en"];

export const identityTypes = [
  "phone",
  "email",
  "wallet_card",
  "wallet_barcode",
  "app_user",
  "web_account",
  "pos_customer",
  "erp_counterparty",
  "messenger_contact",
  "device"
];

export const customerStatuses = ["active", "blocked", "merged", "deleted"];

export function normalizeLocale(value, fallback = "ru") {
  const normalized = String(value || fallback).trim().toLowerCase();
  const aliases = new Map([
    ["kz", "kk"],
    ["kk-kz", "kk"],
    ["ru-kz", "ru"],
    ["ru-ru", "ru"],
    ["en-us", "en"],
    ["en-gb", "en"]
  ]);

  const locale = aliases.get(normalized) || normalized;
  return locales.includes(locale) ? locale : fallback;
}

export function assertIdentityType(type) {
  if (!identityTypes.includes(type)) {
    throw new Error(`Unsupported identity type: ${type}`);
  }
}
