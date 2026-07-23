import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createApp } from "../src/platform/app.js";

test("GET /api/v1/i18n returns runtime admin and wallet labels", async () => {
  const app = createApp();
  const response = await app.handle("GET", "/api/v1/i18n?locale=kk");
  const body = JSON.parse(response.body);

  assert.equal(response.status, 200);
  assert.equal(body.locale, "kk");
  assert.equal(body.admin["action.refresh"], "Жаңарту");
  assert.equal(body.wallet["card.title"], "adidas клуб картасы");
});

test("GET /api/v1/me/profile localizes API labels without changing communication locale", async () => {
  const app = createApp();
  const response = await app.handle("GET", "/api/v1/me/profile?include=purchase_history", {
    headers: {
      "accept-language": "EN"
    }
  });
  const body = JSON.parse(response.body);

  assert.equal(response.status, 200);
  assert.equal(body.customer.preferred_locale, "kk");
  assert.equal(body.customer.preferred_locale_display_name, "Kazakh");
  assert.equal(body.localization.request_locale, "en");
  assert.equal(body.localization.communication_locale, "kk");
  assert.equal(body.localization.labels.locale, "Communication language");
  assert.equal(body.wallet.locale, "kk");
  assert.equal(body.wallet.labels.discount, "Жеке жеңілдік");
});

test("PATCH /api/v1/me/profile saves normalized preferred_locale aliases", async () => {
  const app = createApp();
  const patch = await app.handle("PATCH", "/api/v1/me/profile", {
    headers: {
      "accept-language": "ru"
    },
    body: {
      preferred_locale: "EN"
    }
  });
  const patchBody = JSON.parse(patch.body);

  assert.equal(patch.status, 200);
  assert.equal(patchBody.preferred_locale, "en");
  assert.equal(patchBody.message, "Профиль обновлен");

  const get = await app.handle("GET", "/api/v1/me/profile", {
    headers: {
      "accept-language": "ru"
    }
  });
  const getBody = JSON.parse(get.body);

  assert.equal(getBody.customer.preferred_locale, "en");
  assert.equal(getBody.customer.preferred_locale_display_name, "Английский");
});

test("profile mutations are isolated per createApp instance", async () => {
  const firstApp = createApp();
  await firstApp.handle("PATCH", "/api/v1/me/profile", {
    headers: {
      "accept-language": "en"
    },
    body: {
      preferred_locale: "EN"
    }
  });

  const secondApp = createApp();
  const response = await secondApp.handle("GET", "/api/v1/me/profile", {
    headers: {
      "accept-language": "en"
    }
  });
  const body = JSON.parse(response.body);

  assert.equal(body.customer.preferred_locale, "kk");
  assert.equal(body.customer.preferred_locale_display_name, "Kazakh");
});

test("PATCH /api/v1/me/profile rejects empty or unsupported profile updates", async () => {
  const app = createApp();
  const emptyBody = await app.handle("PATCH", "/api/v1/me/profile", {
    headers: {
      "accept-language": "en"
    },
    body: null
  });
  const unsupportedFields = await app.handle("PATCH", "/api/v1/me/profile", {
    headers: {
      "accept-language": "en"
    },
    body: {
      marketing_locale: "en"
    }
  });
  const profile = await app.handle("GET", "/api/v1/me/profile", {
    headers: {
      "accept-language": "en"
    }
  });

  assert.equal(emptyBody.status, 400);
  assert.equal(JSON.parse(emptyBody.body).error.details[0].reason, "object_required");
  assert.equal(unsupportedFields.status, 400);
  assert.equal(JSON.parse(unsupportedFields.body).error.details[0].reason, "no_supported_profile_fields");
  assert.equal(JSON.parse(profile.body).customer.preferred_locale, "kk");
});

test("PATCH /api/v1/me/profile does not emit customer.updated for unchanged values", async () => {
  const app = createApp();
  const response = await app.handle("PATCH", "/api/v1/me/profile", {
    headers: {
      "accept-language": "en"
    },
    body: {
      preferred_locale: "KZ",
      size_profile: {}
    }
  });
  const body = JSON.parse(response.body);

  assert.equal(response.status, 200);
  assert.equal(body.preferred_locale, "kk");
  assert.equal(body.version, 1);
  assert.equal(body.event_type, null);
});

test("PATCH /api/v1/me/profile rejects invalid supported field shapes without mutation", async () => {
  const app = createApp();
  const cases = [
    {
      body: { favorite_sports: "bad" },
      field: "favorite_sports",
      reason: "array_required"
    },
    {
      body: { favorite_sports: null },
      field: "favorite_sports",
      reason: "array_required"
    },
    {
      body: { favorite_sports: ["bad"] },
      field: "favorite_sports.0",
      reason: "unsupported_favorite_sport"
    },
    {
      body: { size_profile: "bad" },
      field: "size_profile",
      reason: "object_required"
    },
    {
      body: { size_profile: { shoe: null } },
      field: "size_profile.shoe",
      reason: "object_required"
    },
    {
      body: { size_profile: { unsupported: {} } },
      field: "size_profile.unsupported",
      reason: "unsupported_field"
    },
    {
      body: { size_profile: { shoe: { jp: "28" } } },
      field: "size_profile.shoe.jp",
      reason: "unsupported_field"
    },
    {
      body: { size_profile: { apparel: { hat: "M" } } },
      field: "size_profile.apparel.hat",
      reason: "unsupported_field"
    },
    {
      body: { size_profile: { shoe: { uk: { bad: true } } } },
      field: "size_profile.shoe.uk",
      reason: "string_or_null_required"
    },
    {
      body: { size_profile: { shoe: { source: ["profile"] } } },
      field: "size_profile.shoe.source",
      reason: "string_or_null_required"
    },
    {
      body: { size_profile: { apparel: { top: { bad: true } } } },
      field: "size_profile.apparel.top",
      reason: "string_or_null_required"
    }
  ];

  for (const testCase of cases) {
    const response = await app.handle("PATCH", "/api/v1/me/profile", {
      headers: {
        "accept-language": "en"
      },
      body: testCase.body
    });
    const body = JSON.parse(response.body);

    assert.equal(response.status, 400);
    assert.deepEqual(body.error.details[0], {
      field: testCase.field,
      reason: testCase.reason
    });
  }

  const profile = await app.handle("GET", "/api/v1/me/profile", {
    headers: {
      "accept-language": "en"
    }
  });
  const customer = JSON.parse(profile.body).customer;

  assert.deepEqual(customer.favorite_sports, ["football", "running"]);
  assert.deepEqual(customer.size_profile, {
    shoe: { uk: "10", us: null, eu: "44", source: "profile" },
    apparel: { top: "M", bottom: null, source: "profile" }
  });
});

test("PATCH /api/v1/me/profile preserves size_profile nested contract fields", async () => {
  const app = createApp();
  const shoePatch = await app.handle("PATCH", "/api/v1/me/profile", {
    headers: {
      "accept-language": "en"
    },
    body: {
      size_profile: {
        shoe: {
          uk: "11"
        }
      }
    }
  });
  const apparelPatch = await app.handle("PATCH", "/api/v1/me/profile", {
    headers: {
      "accept-language": "en"
    },
    body: {
      size_profile: {
        apparel: {
          top: "L"
        }
      }
    }
  });
  const profile = await app.handle("GET", "/api/v1/me/profile", {
    headers: {
      "accept-language": "en"
    }
  });
  const customer = JSON.parse(profile.body).customer;

  assert.equal(shoePatch.status, 200);
  assert.equal(apparelPatch.status, 200);
  assert.deepEqual(customer.size_profile, {
    shoe: { uk: "11", us: null, eu: "44", source: "profile" },
    apparel: { top: "L", bottom: null, source: "profile" }
  });
});

test("validation errors are localized through the shared i18n helper", async () => {
  const app = createApp();
  const response = await app.handle("PATCH", "/api/v1/me/profile", {
    headers: {
      "accept-language": "KZ"
    },
    body: {
      preferred_locale: "de"
    }
  });
  const body = JSON.parse(response.body);

  assert.equal(response.status, 400);
  assert.equal(body.error.code, "validation_error");
  assert.equal(body.error.message, "Сұрауда қате бар");
  assert.equal(body.error.details[0].reason, "unsupported_locale");
  assert.equal(body.error.details[0].message, "Таңдалған тіл қолжетімді емес");
});

test("admin UI script uses runtime i18n instead of hardcoded RU-only labels", async () => {
  const appJs = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(appJs, /\/api\/v1\/i18n/);
  assert.doesNotMatch(appJs, /Последняя покупка|Годовые траты|Язык коммуникации/);
  assert.doesNotMatch(appJs, /metric\("Customer"/);
});
