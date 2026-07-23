import { createJsonResponse } from "../../platform/http.js";
import { createClientDictionary, resolveRequestLocale } from "./index.js";

export function registerI18nRoutes(route) {
  route("GET", "/api/v1/i18n", async ({ headers, query }) => {
    const locale = query.get("locale") || resolveRequestLocale(headers);
    return createJsonResponse(200, createClientDictionary(locale));
  });
}
