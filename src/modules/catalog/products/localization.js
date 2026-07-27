import { normalizeLocale } from "../../../shared/contracts.js";

const fallbackLocales = ["ru", "en", "kk"];

export function resolveLocalizedValue(values, locale = "ru") {
  const requestedLocale = normalizeLocale(locale);
  const candidates = [...new Set([requestedLocale, ...fallbackLocales])];

  for (const candidate of candidates) {
    const value = values?.[candidate];
    if (typeof value === "string" && value.trim() !== "") {
      return {
        value,
        requested_locale: requestedLocale,
        resolved_locale: candidate,
        fallback_used: candidate !== requestedLocale
      };
    }
  }

  return {
    value: null,
    requested_locale: requestedLocale,
    resolved_locale: null,
    fallback_used: false
  };
}
