import {
  renderMessageTemplate,
  resolveCommunicationLocale
} from "../../i18n/index.js";

const defaultChannels = ["push", "waba", "sms", "email"];

export function evaluateMarketingTriggerCondition(condition, context) {
  if (condition.type === "marketing_consent_allows") {
    const eligibility = evaluateMarketingContactability({
      data: context.data,
      tenantId: context.tenantId,
      customerId: context.customerId,
      eventPayload: context.event?.payload || {},
      asOf: context.asOf,
      preferredChannels: normalizeChannels(condition.channels)
    });
    return {
      matched: eligibility.eligible,
      reason: eligibility.reason || "marketing_consent_allows",
      channel: eligibility.channel,
      consent: eligibility.consent
    };
  }

  if (condition.type === "birthday_window") {
    return evaluateBirthdayWindow(condition, context);
  }

  if (condition.type === "event_payload_number_greater_than") {
    const actual = parseDecimal(getPath(context.event?.payload || {}, condition.path));
    const threshold = parseDecimal(condition.value);
    return {
      matched: Number.isFinite(actual) && Number.isFinite(threshold) && actual > threshold,
      reason: "event_payload_number_greater_than",
      path: condition.path,
      expected_greater_than: condition.value,
      actual: Number.isFinite(actual) ? actual : null
    };
  }

  if (condition.type === "event_payload_number_between") {
    const actual = parseDecimal(getPath(context.event?.payload || {}, condition.path));
    const min = parseDecimal(condition.min);
    const max = parseDecimal(condition.max);
    return {
      matched:
        Number.isFinite(actual) &&
        (!Number.isFinite(min) || actual >= min) &&
        (!Number.isFinite(max) || actual <= max),
      reason: "event_payload_number_between",
      path: condition.path,
      min: Number.isFinite(min) ? min : null,
      max: Number.isFinite(max) ? max : null,
      actual: Number.isFinite(actual) ? actual : null
    };
  }

  return null;
}

export function buildMarketingTriggerDeliveryPayload({ data, instance, action, asOf }) {
  const event = instance.context.event || {};
  const eventPayload = event.payload || {};
  const customer = findCustomer(data, instance.tenant_id, instance.customer_id);
  const loyaltyAccount = findLoyaltyAccount(data, instance.tenant_id, instance.customer_id);
  const eligibility = evaluateMarketingContactability({
    data,
    tenantId: instance.tenant_id,
    customerId: instance.customer_id,
    eventPayload,
    asOf,
    preferredChannels: normalizeChannels(action.preferred_channels)
  });
  const locale = resolveCommunicationLocale({
    customer,
    eventPayload,
    fallback: event.metadata?.locale || "ru"
  });
  const variables = buildVariables({
    presetCode: action.payload_builder?.preset_code,
    customer,
    loyaltyAccount,
    eventPayload
  });
  const rendered = renderMessageTemplate(action.template_code, locale, variables);

  return {
    channel: eligibility.channel || action.channel || null,
    locale,
    variables,
    rendered_template: rendered,
    eligibility
  };
}

export function evaluateMarketingContactability({
  data,
  tenantId,
  customerId,
  eventPayload = {},
  asOf,
  preferredChannels = defaultChannels
}) {
  const customer = findCustomer(data, tenantId, customerId);
  if (customer && customer.status !== "active") {
    return { eligible: false, reason: "customer_not_active", channel: null };
  }

  if (Array.isArray(data?.identities) && customerId) {
    const hasActiveIdentity = data.identities.some(
      (identity) =>
        identity.tenant_id === tenantId &&
        identity.customer_id === customerId &&
        identity.is_active === true
    );
    if (!hasActiveIdentity) {
      return { eligible: false, reason: "active_identity_required", channel: null };
    }
  }

  const channels = normalizeChannels(preferredChannels);
  const consentRecords = data?.consents;
  if (Array.isArray(consentRecords)) {
    for (const channel of channels) {
      const consent = consentRecords.find(
        (record) =>
          record.tenant_id === tenantId &&
          record.customer_id === customerId &&
          record.channel === channel &&
          isConsentActive(record, asOf)
      );
      if (consent) {
        return {
          eligible: true,
          reason: null,
          channel,
          consent: { checked: true, consent_id: consent.id, channel }
        };
      }
    }
    return {
      eligible: false,
      reason: "marketing_consent_required",
      channel: null,
      consent: { checked: true, channel: null }
    };
  }

  const channelFromEvent = firstAllowedEventChannel(eventPayload, channels);
  if (channelFromEvent) {
    return {
      eligible: true,
      reason: null,
      channel: channelFromEvent,
      consent: { checked: true, source: "event_payload", channel: channelFromEvent }
    };
  }

  return {
    eligible: true,
    reason: null,
    channel: null,
    consent: { checked: false, reason: "consent_read_model_unavailable" }
  };
}

function evaluateBirthdayWindow(condition, context) {
  const payload = context.event?.payload || {};
  const daysBefore = parseDecimal(payload.days_before);
  const min = parseDecimal(condition.min_days_before ?? 0);
  const max = parseDecimal(condition.max_days_before ?? 7);
  const dueDateTime = payload.due_date ? Date.parse(`${payload.due_date}T00:00:00.000Z`) : Number.NaN;
  const asOfTime = Date.parse(context.asOf);
  const dueDateInWindow =
    !payload.due_date ||
    (
      Number.isFinite(asOfTime) &&
      Number.isFinite(dueDateTime) &&
      dueDateTime >= startOfUtcDay(asOfTime) &&
      dueDateTime <= addDays(startOfUtcDay(asOfTime), max)
    );

  return {
    matched:
      Number.isFinite(daysBefore) &&
      daysBefore >= min &&
      daysBefore <= max &&
      dueDateInWindow,
    reason: "birthday_window",
    min_days_before: min,
    max_days_before: max,
    actual_days_before: Number.isFinite(daysBefore) ? daysBefore : null,
    due_date: payload.due_date || null
  };
}

function buildVariables({ presetCode, customer, loyaltyAccount, eventPayload }) {
  const firstName = customer?.first_name || eventPayload.first_name || "customer";
  const variables = {
    first_name: firstName,
    customer_id: eventPayload.customer_id || customer?.id || null
  };

  if (presetCode === "welcome") {
    return {
      ...variables,
      registration_channel: eventPayload.registration_channel || null,
      discount_percent: "5.00"
    };
  }

  if (presetCode === "birthday") {
    return {
      ...variables,
      birth_date: eventPayload.birth_date || null,
      due_date: eventPayload.due_date || null,
      promotion_type: "birthday",
      discount_percent: "15.00",
      expires_in_days: 14
    };
  }

  if (presetCode === "abandoned-cart") {
    const firstItem = Array.isArray(eventPayload.items) ? eventPayload.items[0] : null;
    return {
      ...variables,
      cart_id: eventPayload.cart_id || null,
      product_variant_id: firstItem?.product_variant_id || null,
      sku: firstItem?.sku || null,
      item_name: firstItem?.name || firstItem?.sku || "item",
      item_image_url: firstItem?.image_url || null,
      recovery_url: eventPayload.recovery_url || null
    };
  }

  if (presetCode === "tier-retention") {
    return {
      ...variables,
      current_tier_code: eventPayload.current_tier_code || loyaltyAccount?.tier_code || null,
      projected_tier_code: eventPayload.projected_tier_code || null,
      current_discount_percent:
        eventPayload.current_discount_percent ||
        loyaltyAccount?.current_discount_percent ||
        loyaltyAccount?.discount_percent ||
        "0.00",
      projected_discount_percent: eventPayload.projected_discount_percent || null,
      retention_gap_amount:
        eventPayload.retention_gap_amount ||
        loyaltyAccount?.retention_gap_amount?.amount ||
        "0.00",
      currency:
        eventPayload.currency ||
        loyaltyAccount?.retention_gap_amount?.currency ||
        loyaltyAccount?.annual_eligible_spend?.currency ||
        null,
      days_until_recalculation: eventPayload.days_until_recalculation ?? null
    };
  }

  return variables;
}

function firstAllowedEventChannel(eventPayload, channels) {
  const eligibleChannels = normalizeExplicitChannels(eventPayload.eligible_channels);
  for (const channel of channels) {
    if (eligibleChannels.includes(channel)) {
      return channel;
    }
  }

  const consentSummary = eventPayload.consent_summary;
  if (consentSummary && typeof consentSummary === "object") {
    for (const channel of channels) {
      if (consentSummary[channel] === true) {
        return channel;
      }
    }
  }

  return null;
}

function findCustomer(data, tenantId, customerId) {
  return (data?.customers || []).find(
    (customer) => customer.tenant_id === tenantId && customer.id === customerId
  ) || null;
}

function findLoyaltyAccount(data, tenantId, customerId) {
  return (data?.loyalty_accounts || []).find(
    (account) => account.tenant_id === tenantId && account.customer_id === customerId
  ) || null;
}

function isConsentActive(record, asOf) {
  const asOfTime = Date.parse(asOf);
  const grantedAtTime = record.granted_at ? Date.parse(record.granted_at) : null;
  const revokedAtTime = record.revoked_at ? Date.parse(record.revoked_at) : null;
  const expiresAtTime = record.expires_at ? Date.parse(record.expires_at) : null;

  if (
    record.granted !== true ||
    !Number.isFinite(asOfTime) ||
    (record.granted_at && !Number.isFinite(grantedAtTime)) ||
    (record.revoked_at && !Number.isFinite(revokedAtTime)) ||
    (record.expires_at && !Number.isFinite(expiresAtTime))
  ) {
    return false;
  }

  return (
    (!record.granted_at || grantedAtTime <= asOfTime) &&
    (!record.revoked_at || revokedAtTime > asOfTime) &&
    (!record.expires_at || expiresAtTime > asOfTime)
  );
}

function normalizeChannels(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  const channels = values.map((item) => String(item).trim()).filter(Boolean);
  return channels.length > 0 ? channels : defaultChannels;
}

function normalizeExplicitChannels(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return values.map((item) => String(item).trim()).filter(Boolean);
}

function parseDecimal(value) {
  if (value === null || value === undefined || value === "") {
    return Number.NaN;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

function getPath(value, path) {
  if (!path || typeof path !== "string") {
    return undefined;
  }
  return path.split(".").reduce((current, key) => {
    if (current === null || current === undefined) {
      return undefined;
    }
    return current[key];
  }, value);
}

function startOfUtcDay(time) {
  const date = new Date(time);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function addDays(time, days) {
  return time + days * 24 * 60 * 60 * 1000;
}
