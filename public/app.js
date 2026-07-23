const health = document.querySelector("#health");
const profile = document.querySelector("#profile");
const refresh = document.querySelector("#refresh");
const localeSelect = document.querySelector("#locale");

let dictionary = null;
let currentLocale = localStorage.getItem("admin-locale") || "ru";

localeSelect.value = currentLocale;
refresh.addEventListener("click", loadProfile);
localeSelect.addEventListener("change", async () => {
  currentLocale = localeSelect.value;
  localStorage.setItem("admin-locale", currentLocale);
  await loadDictionary();
  await loadProfile();
});

await loadDictionary();
await checkHealth();
await loadProfile();

async function loadDictionary() {
  const response = await fetch(`/api/v1/i18n?locale=${encodeURIComponent(currentLocale)}`, {
    headers: {
      "Accept-Language": currentLocale
    }
  });
  dictionary = await response.json();
  currentLocale = dictionary.locale;
  localeSelect.value = currentLocale;
  document.documentElement.lang = currentLocale;

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
}

async function checkHealth() {
  const response = await fetch("/api/v1/health");
  const data = await response.json();
  health.textContent = data.status === "ok" ? t("status.online") : t("status.issue");
  health.classList.toggle("ok", data.status === "ok");
}

async function loadProfile() {
  const response = await fetch("/api/v1/me/profile?include=identities,purchase_history", {
    headers: {
      "Accept-Language": currentLocale
    }
  });
  const data = await response.json();
  const customer = data.customer;
  const loyalty = data.loyalty_snapshot;
  const purchase = data.purchase_history?.[0];

  profile.innerHTML = [
    metric(t("label.customer"), `${customer.first_name} ${customer.last_name}`),
    metric(t("label.locale"), customer.preferred_locale_display_name),
    metric(t("label.annualSpend"), `${customer.annual_spend.amount} ${customer.annual_spend.currency}`),
    metric(t("label.tier"), `${loyalty.tier_name} / ${loyalty.discount_percent}%`),
    metric(t("label.shoeSize"), `UK ${customer.size_profile.shoe.uk} / EU ${customer.size_profile.shoe.eu}`),
    metric(
      t("label.lastPurchase"),
      purchase ? `${purchase.business_date} / ${purchase.totals.net_amount} ${purchase.currency}` : t("label.noPurchases")
    )
  ].join("");
}

function metric(label, value) {
  return `<article class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
}

function t(key) {
  return dictionary?.admin?.[key] || key;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
