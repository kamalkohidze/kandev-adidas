export const locales = ["kk", "ru", "en"];

export const localeAliases = new Map([
  ["kz", "kk"],
  ["kk", "kk"],
  ["kk-kz", "kk"],
  ["ru", "ru"],
  ["ru-kz", "ru"],
  ["ru-ru", "ru"],
  ["en", "en"],
  ["en-us", "en"],
  ["en-gb", "en"]
]);

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

export const favoriteSports = ["running", "training", "football"];

export function normalizeLocale(value, fallback = "ru") {
  const raw = String(value ?? "").trim().toLowerCase();
  const locale = localeAliases.get(raw) || raw;
  return locales.includes(locale) ? locale : fallback;
}

export function normalizeLocaleStrict(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  const locale = localeAliases.get(raw) || raw;
  return locales.includes(locale) ? locale : null;
}

export function isLocale(value) {
  return normalizeLocaleStrict(value) !== null;
}

export function isFavoriteSport(value) {
  return favoriteSports.includes(value);
}

export function assertIdentityType(type) {
  if (!identityTypes.includes(type)) {
    throw new Error(`Unsupported identity type: ${type}`);
  }
}
