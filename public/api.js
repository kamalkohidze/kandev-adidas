export class ApiError extends Error {
  constructor({ status, code, message, details, data }) {
    super(message || code || `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.code = code || "request_failed";
    this.details = Array.isArray(details) ? details : [];
    this.data = data || null;
  }
}

export async function apiRequest(path, options = {}) {
  const {
    method = "GET",
    body,
    headers = {},
    locale = "ru",
    timeoutMs = 10000,
    signal,
    idempotencyKey,
    allowStatuses = []
  } = options;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort("timeout"), timeoutMs);

  if (signal) {
    if (signal.aborted) {
      controller.abort(signal.reason);
    } else {
      signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
    }
  }

  const requestHeaders = new Headers(headers);
  requestHeaders.set("Accept", "application/json");
  requestHeaders.set("Accept-Language", locale);
  if (idempotencyKey) {
    requestHeaders.set("Idempotency-Key", idempotencyKey);
    requestHeaders.set("X-Correlation-Id", idempotencyKey);
  }
  if (body !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
  }

  let response;
  try {
    response = await fetch(path, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    window.clearTimeout(timeout);
    if (controller.signal.aborted) {
      throw new ApiError({ status: 0, code: "request_timeout", message: "Request timed out", details: [] });
    }
    throw new ApiError({ status: 0, code: "network_error", message: error.message, details: [] });
  }

  window.clearTimeout(timeout);
  const data = await parseJson(response);

  if (!response.ok && !allowStatuses.includes(response.status)) {
    const envelope = data?.error || {};
    throw new ApiError({
      status: response.status,
      code: envelope.code || `http_${response.status}`,
      message: envelope.message || response.statusText,
      details: envelope.details,
      data
    });
  }

  return data;
}

async function parseJson(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ApiError({
      status: response.status,
      code: "invalid_json",
      message: "Response was not valid JSON",
      details: [{ field: "body", reason: error.message }]
    });
  }
}
