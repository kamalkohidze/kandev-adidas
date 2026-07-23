import { locales, normalizeLocale, normalizeLocaleStrict } from "../../shared/contracts.js";
import { defaultLocale, dictionaries, fallbackLocale } from "./resources.js";

export { defaultLocale, dictionaries, fallbackLocale };

export function getFallbackChain(locale) {
  const normalized = normalizeLocale(locale, defaultLocale);
  return [...new Set([normalized, fallbackLocale])];
}

export function translate(namespace, key, locale = defaultLocale, variables = {}) {
  const entries = dictionaries[namespace]?.[key];

  if (!entries) {
    return key;
  }

  for (const candidate of getFallbackChain(locale)) {
    const value = entries[candidate];
    if (typeof value === "string" && value.length > 0) {
      return interpolate(value, variables);
    }
  }

  return key;
}

export function renderMessageTemplate(templateCode, locale = defaultLocale, variables = {}) {
  const requested_locale = normalizeLocale(locale, defaultLocale);
  const variants = dictionaries.templates[templateCode];

  if (!variants) {
    return {
      template_code: templateCode,
      requested_locale,
      locale: requested_locale,
      body: templateCode,
      fallback_used: false
    };
  }

  for (const candidate of getFallbackChain(requested_locale)) {
    if (typeof variants[candidate] === "string" && variants[candidate].length > 0) {
      return {
        template_code: templateCode,
        requested_locale,
        locale: candidate,
        body: interpolate(variants[candidate], variables),
        fallback_used: candidate !== requested_locale
      };
    }
  }

  return {
    template_code: templateCode,
    requested_locale,
    locale: requested_locale,
    body: templateCode,
    fallback_used: false
  };
}

export function renderTriggeredMessageTemplate({
  templateCode,
  customer = null,
  eventPayload = null,
  variables = {},
  fallbackLocale: localeFallback = defaultLocale
}) {
  const locale = resolveCommunicationLocale({ customer, eventPayload, fallback: localeFallback });
  return {
    ...renderMessageTemplate(templateCode, locale, variables),
    communication_locale: locale
  };
}

export function resolveCommunicationLocale({ customer = null, eventPayload = null, fallback = defaultLocale } = {}) {
  return normalizeLocale(
    customer?.preferred_locale ?? eventPayload?.preferred_locale ?? fallback,
    normalizeLocale(fallback, defaultLocale)
  );
}

export function resolveRequestLocale(headers = {}, fallback = defaultLocale) {
  const value = getHeader(headers, "accept-language");
  return resolveAcceptLanguage(value, fallback);
}

export function resolveAcceptLanguage(value, fallback = defaultLocale) {
  if (!value) {
    return normalizeLocale(fallback, defaultLocale);
  }

  const candidates = String(value)
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const qParam = params.find((param) => param.trim().startsWith("q="));
      const q = qParam ? Number(qParam.trim().slice(2)) : 1;
      return {
        tag,
        q: Number.isFinite(q) ? q : 0
      };
    })
    .filter((candidate) => candidate.tag)
    .sort((left, right) => right.q - left.q);

  for (const candidate of candidates) {
    const locale = normalizeLocaleStrict(candidate.tag);
    if (locale) {
      return locale;
    }
  }

  return normalizeLocale(fallback, defaultLocale);
}

export function createClientDictionary(locale = defaultLocale) {
  const normalized = normalizeLocale(locale, defaultLocale);
  const admin = Object.fromEntries(
    Object.keys(dictionaries.admin).map((key) => [key, translate("admin", key, normalized)])
  );
  const wallet = Object.fromEntries(
    Object.keys(dictionaries.wallet).map((key) => [key, translate("wallet", key, normalized)])
  );

  return {
    locale: normalized,
    supported_locales: locales,
    admin,
    wallet
  };
}

export function getLocaleDisplayName(locale, displayLocale = locale) {
  const normalized = normalizeLocale(locale, defaultLocale);
  return translate("admin", `locale.${normalized}`, displayLocale);
}

function interpolate(value, variables) {
  return value.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    if (variables[key] === undefined || variables[key] === null) {
      return match;
    }

    return String(variables[key]);
  });
}

function getHeader(headers, name) {
  if (typeof headers.get === "function") {
    return headers.get(name);
  }

  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()];
}
