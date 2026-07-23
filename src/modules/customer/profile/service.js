import { getLocaleDisplayName, translate } from "../../i18n/index.js";
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
      wallet: toWalletCard(seedData.wallet_cards.find((card) => card.customer_id === customerId) || null, customer),
      localization: toProfileLocalization(customer, acceptLanguage),
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
    getProfile360,
    updateProfile
  };

  function updateProfile({ customerId, patch }) {
    const customer = seedData.customers.find((candidate) => candidate.id === customerId);

    if (!customer) {
      return null;
    }

    let changed = false;

    if (Object.hasOwn(patch, "preferred_locale")) {
      const preferredLocale = normalizeLocale(patch.preferred_locale);
      changed = changed || customer.preferred_locale !== preferredLocale;
      customer.preferred_locale = preferredLocale;
    }

    if (Object.hasOwn(patch, "favorite_sports")) {
      changed = changed || !sameJsonValue(customer.favorite_sports, patch.favorite_sports);
      customer.favorite_sports = patch.favorite_sports;
    }

    if (Object.hasOwn(patch, "size_profile")) {
      const sizeProfile = mergeSizeProfile(customer.size_profile, patch.size_profile);
      changed = changed || !sameJsonValue(customer.size_profile, sizeProfile);
      customer.size_profile = sizeProfile;
    }

    if (!changed) {
      return {
        customer_id: customer.id,
        preferred_locale: customer.preferred_locale,
        version: customer.version,
        event_type: null
      };
    }

    customer.version = (customer.version || 1) + 1;
    customer.updated_at = new Date().toISOString();

    return {
      customer_id: customer.id,
      preferred_locale: customer.preferred_locale,
      version: customer.version,
      event_type: "customer.updated"
    };
  }
}

function toCustomerProfile(customer, acceptLanguage) {
  const preferredLocale = normalizeLocale(customer.preferred_locale || acceptLanguage);

  return {
    id: customer.id,
    status: customer.status,
    first_name: customer.first_name,
    last_name: customer.last_name,
    preferred_locale: preferredLocale,
    preferred_locale_display_name: getLocaleDisplayName(preferredLocale, acceptLanguage),
    favorite_sports: customer.favorite_sports,
    size_profile: customer.size_profile,
    annual_spend: customer.annual_spend,
    last_activity: customer.last_activity
  };
}

function toProfileLocalization(customer, acceptLanguage) {
  const requestLocale = normalizeLocale(acceptLanguage);
  const preferredLocale = normalizeLocale(customer.preferred_locale || requestLocale);

  return {
    request_locale: requestLocale,
    communication_locale: preferredLocale,
    labels: {
      customer: translate("admin", "label.customer", requestLocale),
      locale: translate("admin", "label.locale", requestLocale),
      annual_spend: translate("admin", "label.annualSpend", requestLocale),
      tier: translate("admin", "label.tier", requestLocale),
      shoe_size: translate("admin", "label.shoeSize", requestLocale),
      last_purchase: translate("admin", "label.lastPurchase", requestLocale)
    }
  };
}

function toWalletCard(walletCard, customer) {
  if (!walletCard) {
    return null;
  }

  const locale = normalizeLocale(customer.preferred_locale);

  return {
    ...walletCard,
    locale,
    labels: {
      title: translate("wallet", "card.title", locale),
      card_number: translate("wallet", "card.number", locale),
      barcode: translate("wallet", "card.barcode", locale),
      discount: translate("wallet", "card.discount", locale),
      tier: translate("wallet", "card.tier", locale)
    }
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

function sameJsonValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeSizeProfile(current, patch) {
  const sizeProfile = {
    ...current
  };

  if (Object.hasOwn(patch, "shoe")) {
    sizeProfile.shoe = {
      ...current.shoe,
      ...patch.shoe
    };
  }

  if (Object.hasOwn(patch, "apparel")) {
    sizeProfile.apparel = {
      ...current.apparel,
      ...patch.apparel
    };
  }

  return sizeProfile;
}
