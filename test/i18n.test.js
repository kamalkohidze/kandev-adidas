import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLocale, normalizeLocaleStrict } from "../src/shared/contracts.js";
import {
  createClientDictionary,
  renderMessageTemplate,
  renderTriggeredMessageTemplate,
  resolveAcceptLanguage,
  resolveCommunicationLocale,
  translate
} from "../src/modules/i18n/index.js";

test("i18n normalizes business aliases through shared Locale contract", () => {
  assert.equal(normalizeLocale("KZ"), "kk");
  assert.equal(normalizeLocale("RU"), "ru");
  assert.equal(normalizeLocale("EN"), "en");
  assert.equal(normalizeLocaleStrict("KZ"), "kk");
  assert.equal(normalizeLocaleStrict("de"), null);
});

test("Accept-Language resolver honors q values and aliases", () => {
  assert.equal(resolveAcceptLanguage("de;q=0.9,KZ;q=0.8,ru;q=0.7"), "kk");
  assert.equal(resolveAcceptLanguage("en-US,en;q=0.9,ru;q=0.3"), "en");
  assert.equal(resolveAcceptLanguage("de,fr;q=0.8"), "ru");
});

test("translation fallback uses exact locale, ru fallback, then stable key", () => {
  assert.equal(translate("admin", "action.refresh", "kk"), "Жаңарту");
  assert.equal(translate("api", "error.missing_locale_variant", "en"), "Не найден обязательный перевод");
  assert.equal(translate("api", "missing.key", "kk"), "missing.key");
});

test("message templates render with normalized locale and variables", () => {
  const rendered = renderMessageTemplate("birthday_offer", "KZ", {
    first_name: "Алибек",
    discount_percent: "15",
    expires_in_days: "14"
  });

  assert.equal(rendered.locale, "kk");
  assert.match(rendered.body, /Алибек/);
  assert.match(rendered.body, /15%/);
});

test("trigger templates select language automatically from customer preference", () => {
  const rendered = renderTriggeredMessageTemplate({
    templateCode: "welcome_discount",
    customer: {
      preferred_locale: "KZ"
    },
    variables: {
      first_name: "Алибек",
      discount_percent: "5"
    }
  });

  assert.equal(rendered.requested_locale, "kk");
  assert.equal(rendered.locale, "kk");
  assert.equal(rendered.communication_locale, "kk");
  assert.match(rendered.body, /Сәлеметсіз бе, Алибек/);
});

test("trigger templates use event payload locale when customer is absent", () => {
  const rendered = renderTriggeredMessageTemplate({
    templateCode: "tier_retention",
    eventPayload: {
      preferred_locale: "EN"
    },
    variables: {
      first_name: "Alibek",
      current_discount_percent: "10",
      retention_gap_amount: "12000",
      currency: "KZT"
    }
  });

  assert.equal(rendered.requested_locale, "en");
  assert.equal(rendered.locale, "en");
  assert.match(rendered.body, /spend 12000 KZT more/);
});

test("communication locale prefers customer and falls back to ru", () => {
  assert.equal(
    resolveCommunicationLocale({
      customer: { preferred_locale: "RU" },
      eventPayload: { preferred_locale: "EN" }
    }),
    "ru"
  );
  assert.equal(
    resolveCommunicationLocale({
      customer: { preferred_locale: "de" },
      eventPayload: { preferred_locale: "EN" }
    }),
    "ru"
  );
  assert.equal(renderTriggeredMessageTemplate({ templateCode: "missing_template" }).body, "missing_template");
});

test("client dictionary exposes admin and wallet runtime labels", () => {
  const dictionary = createClientDictionary("EN");

  assert.equal(dictionary.locale, "en");
  assert.equal(dictionary.admin["label.locale"], "Communication language");
  assert.equal(dictionary.wallet["card.discount"], "Personal discount");
});
