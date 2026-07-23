const health = document.querySelector("#health");
const profile = document.querySelector("#profile");
const refresh = document.querySelector("#refresh");

refresh.addEventListener("click", loadProfile);

await checkHealth();
await loadProfile();

async function checkHealth() {
  const response = await fetch("/api/v1/health");
  const data = await response.json();
  health.textContent = data.status === "ok" ? "Online" : "Issue";
  health.classList.toggle("ok", data.status === "ok");
}

async function loadProfile() {
  const response = await fetch("/api/v1/me/profile?include=identities,purchase_history", {
    headers: {
      "Accept-Language": "kk"
    }
  });
  const data = await response.json();
  const customer = data.customer;
  const loyalty = data.loyalty_snapshot;
  const purchase = data.purchase_history?.[0];

  profile.innerHTML = [
    metric("Customer", `${customer.first_name} ${customer.last_name}`),
    metric("Locale", customer.preferred_locale),
    metric("Annual spend", `${customer.annual_spend.amount} ${customer.annual_spend.currency}`),
    metric("Tier", `${loyalty.tier_name} / ${loyalty.discount_percent}%`),
    metric("Shoe size", `UK ${customer.size_profile.shoe.uk} / EU ${customer.size_profile.shoe.eu}`),
    metric("Last purchase", purchase ? `${purchase.business_date} / ${purchase.totals.net_amount} ${purchase.currency}` : "No purchases")
  ].join("");
}

function metric(label, value) {
  return `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`;
}
