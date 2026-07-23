import { createJsonResponse, createValidationResponse } from "../../../platform/http.js";
import { seedData } from "../../../platform/seed-data.js";
import { normalizeLocale } from "../../../shared/contracts.js";
import { createIdentityService } from "../identity/service.js";
import { createCustomerProfileService } from "../profile/service.js";

const currentCustomerId = "11111111-1111-4111-8111-111111111111";
const identityService = createIdentityService(seedData);
const profileService = createCustomerProfileService(seedData, identityService);

export function registerCustomerRoutes(route) {
  route("GET", "/api/v1/me/profile", async ({ headers, query }) => {
    const include = parseInclude(query.get("include"));
    const acceptLanguage = normalizeLocale(headers["accept-language"] || headers["Accept-Language"]);
    const profile = profileService.getProfile360({
      customerId: currentCustomerId,
      include,
      acceptLanguage
    });

    return createJsonResponse(200, profile);
  });

  route("POST", "/api/v1/customer-identities/resolve", async ({ body }) => {
    if (!body?.tenant_id || !body?.identity?.type || !body?.identity?.value) {
      return createValidationResponse([
        { field: "tenant_id", reason: "required" },
        { field: "identity.type", reason: "required" },
        { field: "identity.value", reason: "required" }
      ]);
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
      return createValidationResponse([{ field: "identity", reason: error.message }]);
    }
  });
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
