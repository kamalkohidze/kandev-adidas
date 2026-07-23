import { normalizeLocale } from "../../../shared/contracts.js";

export function createCustomerProfileService(seedData, identityService) {
  function getProfile360({ customerId, include = [], acceptLanguage = "ru" }) {
    const customer = seedData.customers.find((candidate) => candidate.id === customerId);

    if (!customer) {
      return null;
    }

    const profile = {
      customer: toCustomerProfile(customer, acceptLanguage),
      loyalty_snapshot: seedData.loyalty_accounts.find((account) => account.customer_id === customerId) || null,
      wallet: seedData.wallet_cards.find((card) => card.customer_id === customerId) || null,
      generated_at: new Date().toISOString()
    };

    if (include.includes("identities")) {
      profile.identities = identityService.listPublicIdentities(customerId);
    }

    if (include.includes("purchase_history")) {
      profile.purchase_history = seedData.transactions
        .filter((transaction) => transaction.customer_id === customerId)
        .map(toPurchaseHistoryItem);
    }

    return profile;
  }

  return {
    getProfile360
  };
}

function toCustomerProfile(customer, acceptLanguage) {
  return {
    id: customer.id,
    status: customer.status,
    first_name: customer.first_name,
    last_name: customer.last_name,
    preferred_locale: normalizeLocale(customer.preferred_locale || acceptLanguage),
    favorite_sports: customer.favorite_sports,
    size_profile: customer.size_profile,
    annual_spend: customer.annual_spend,
    last_activity: customer.last_activity
  };
}

function toPurchaseHistoryItem(transaction) {
  return {
    transaction_id: transaction.id,
    type: transaction.type,
    status: transaction.status,
    channel: transaction.channel,
    store_id: transaction.store_id,
    business_date: transaction.business_date,
    occurred_at: transaction.occurred_at,
    currency: transaction.currency,
    totals: transaction.totals,
    loyalty: transaction.loyalty,
    lines: transaction.lines.map((line) => ({
      sku: line.sku,
      name: line.name,
      quantity: line.quantity,
      net_amount: line.net_amount,
      product_variant_id: line.product_variant_id
    }))
  };
}
