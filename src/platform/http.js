import { translate } from "../modules/i18n/index.js";

export function createJsonResponse(status, payload, headers = {}) {
  return {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers
    },
    body: JSON.stringify(payload)
  };
}

export function createNotFoundResponse(locale = "ru") {
  return createJsonResponse(404, {
    error: {
      code: "not_found",
      message: translate("api", "error.not_found", locale),
      details: []
    }
  });
}

export function createValidationResponse(details, locale = "ru") {
  return createJsonResponse(400, {
    error: {
      code: "validation_error",
      message: translate("api", "error.validation_error", locale),
      details
    }
  });
}

export async function parseJsonBody(request) {
  if (!["POST", "PUT", "PATCH"].includes(request.method || "")) {
    return null;
  }

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return null;
  }

  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim() === "") {
    return null;
  }

  return JSON.parse(text);
}
