import { createJsonResponse, createValidationResponse } from "../../../platform/http.js";
import { createSeedData } from "../../../platform/seed-data.js";
import { isFavoriteSport, normalizeLocaleStrict } from "../../../shared/contracts.js";
import { resolveRequestLocale, translate } from "../../i18n/index.js";
import { createIdentityService } from "../identity/service.js";
import { createCustomerProfileService } from "../profile/service.js";

const currentCustomerId = "11111111-1111-4111-8111-111111111111";
const profilePatchFields = new Set(["preferred_locale", "favorite_sports", "size_profile"]);
const sizeProfileFields = {
  shoe: new Set(["uk", "us", "eu", "source"]),
  apparel: new Set(["top", "bottom", "source"])
};

export function registerCustomerRoutes(route, data = createSeedData()) {
  const identityService = createIdentityService(data);
  const profileService = createCustomerProfileService(data, identityService);

  route("GET", "/api/v1/me/profile", async ({ headers, query }) => {
    const include = parseInclude(query.get("include"));
    const acceptLanguage = resolveRequestLocale(headers);
    const profile = profileService.getProfile360({
      customerId: currentCustomerId,
      include,
      acceptLanguage
    });

    return createJsonResponse(200, profile);
  });

  route("PATCH", "/api/v1/me/profile", async ({ headers, body }) => {
    const requestLocale = resolveRequestLocale(headers);

    if (!isPlainObject(body)) {
      return createValidationResponse([{ field: "body", reason: "object_required" }], requestLocale);
    }

    const supportedFields = Object.keys(body).filter((field) => profilePatchFields.has(field));
    if (supportedFields.length === 0) {
      return createValidationResponse([{ field: "body", reason: "no_supported_profile_fields" }], requestLocale);
    }

    const patchValidationDetails = validateProfilePatch(body);
    if (patchValidationDetails.length > 0) {
      return createValidationResponse(patchValidationDetails, requestLocale);
    }

    if (body?.preferred_locale !== undefined && !normalizeLocaleStrict(body.preferred_locale)) {
      return createValidationResponse(
        [{ field: "preferred_locale", reason: "unsupported_locale", message: translate("api", "error.unsupported_locale", requestLocale) }],
        requestLocale
      );
    }

    const result = profileService.updateProfile({
      customerId: currentCustomerId,
      patch: body || {}
    });

    return createJsonResponse(200, {
      ...result,
      message: translate("api", "profile.updated", requestLocale)
    });
  });

  route("POST", "/api/v1/customer-identities/resolve", async ({ headers, body }) => {
    const requestLocale = resolveRequestLocale(headers);

    if (!body?.tenant_id || !body?.identity?.type || !body?.identity?.value) {
      return createValidationResponse([
        { field: "tenant_id", reason: "required" },
        { field: "identity.type", reason: "required" },
        { field: "identity.value", reason: "required" }
      ], requestLocale);
    }

    try {
      const result = identityService.resolveIdentity({
        tenant_id: body.tenant_id,
        type: body.identity.type,
        value: body.identity.value,
        source_system: body.source_system
      });

      return createJsonResponse(200, result);
    } catch (error) {
      return createValidationResponse([{ field: "identity", reason: error.message }], requestLocale);
    }
  });
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateProfilePatch(body) {
  const details = [];

  if (Object.hasOwn(body, "favorite_sports")) {
    if (!Array.isArray(body.favorite_sports)) {
      details.push({ field: "favorite_sports", reason: "array_required" });
    } else {
      for (const [index, sport] of body.favorite_sports.entries()) {
        if (!isFavoriteSport(sport)) {
          details.push({ field: `favorite_sports.${index}`, reason: "unsupported_favorite_sport" });
        }
      }
    }
  }

  if (Object.hasOwn(body, "size_profile")) {
    if (!isPlainObject(body.size_profile)) {
      details.push({ field: "size_profile", reason: "object_required" });
    } else {
      const allowedSections = new Set(Object.keys(sizeProfileFields));
      for (const section of Object.keys(body.size_profile)) {
        if (!allowedSections.has(section)) {
          details.push({ field: `size_profile.${section}`, reason: "unsupported_field" });
        } else if (!isPlainObject(body.size_profile[section])) {
          details.push({ field: `size_profile.${section}`, reason: "object_required" });
        } else {
          for (const field of Object.keys(body.size_profile[section])) {
            if (!sizeProfileFields[section].has(field)) {
              details.push({ field: `size_profile.${section}.${field}`, reason: "unsupported_field" });
            } else if (!isNullableString(body.size_profile[section][field])) {
              details.push({ field: `size_profile.${section}.${field}`, reason: "string_or_null_required" });
            }
          }
        }
      }
    }
  }

  return details;
}

function parseInclude(value) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isNullableString(value) {
  return value === null || typeof value === "string";
}
