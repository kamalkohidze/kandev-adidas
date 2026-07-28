export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatMoney(value, currency = "KZT", locale = "ru") {
  const amount = Number.parseFloat(String(value ?? "0"));
  if (!Number.isFinite(amount)) {
    return "-";
  }
  return new Intl.NumberFormat(toIntlLocale(locale), {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(amount);
}

export function formatPercent(value, locale = "ru") {
  const amount = Number.parseFloat(String(value ?? "0"));
  if (!Number.isFinite(amount)) {
    return "-";
  }
  return `${new Intl.NumberFormat(toIntlLocale(locale), { maximumFractionDigits: 2 }).format(amount)}%`;
}

export function formatDate(value, locale = "ru") {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    year: "numeric",
    month: "short",
    day: "2-digit"
  }).format(date);
}

export function formatDateTime(value, locale = "ru") {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function metric(label, value, tone = "") {
  return `<article class="metric ${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
}

export function badge(value, tone = "neutral") {
  return `<span class="badge ${tone}">${escapeHtml(value)}</span>`;
}

export function stateBlock(kind, title, detail = "") {
  const detailHtml = detail ? `<p>${escapeHtml(detail)}</p>` : "";
  return `<div class="state-block ${kind}"><strong>${escapeHtml(title)}</strong>${detailHtml}</div>`;
}

export function errorBlock(error, title = "Request failed") {
  if (!error) {
    return "";
  }
  const details = (error.details || [])
    .map((detail) => `<li><code>${escapeHtml(detail.field || "body")}</code> ${escapeHtml(detail.reason || detail.message || "invalid")}</li>`)
    .join("");
  const detailsHtml = details ? `<ul>${details}</ul>` : "";
  return `<div class="state-block error"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(error.message || error.code)}</p>${detailsHtml}</div>`;
}

export function table(headers, rows, emptyText) {
  if (!rows.length) {
    return stateBlock("empty", emptyText, "");
  }

  return `<div class="table-wrap"><table><thead><tr>${headers
    .map((header) => `<th>${escapeHtml(header)}</th>`)
    .join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

export function toIntlLocale(locale) {
  if (locale === "kk") {
    return "kk-KZ";
  }
  if (locale === "en") {
    return "en-US";
  }
  return "ru-RU";
}
