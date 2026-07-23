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

export function createNotFoundResponse() {
  return createJsonResponse(404, {
    error: {
      code: "not_found",
      message: "Route not found",
      details: []
    }
  });
}

export function createValidationResponse(details) {
  return createJsonResponse(400, {
    error: {
      code: "validation_error",
      message: "Request validation failed",
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
