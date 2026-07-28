import { defaultLocale, getFallbackChain } from "../../i18n/index.js";
import { normalizeLocale } from "../../../shared/contracts.js";

const tagPattern = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
const piiTagNames = new Set([
  "name",
  "first_name",
  "last_name",
  "middle_name",
  "phone",
  "email",
  "customer_id",
  "identity",
  "recipient"
]);

const genericNameByLocale = {
  kk: "клиент",
  ru: "клиент",
  en: "customer"
};

export function renderMessageTemplateContent(template, options = {}) {
  const requestedLocale = normalizeLocale(options.locale, defaultLocale);
  const variantResult = resolveVariant(template, requestedLocale);
  const variables = options.variables && typeof options.variables === "object" ? options.variables : {};
  const customer = options.customer || null;
  const loyaltyAccount = options.loyaltyAccount || null;
  const productBlocks = options.productBlocks || null;
  const allowRawPii = options.allowRawPii === true;
  const metadataByName = new Map((template.variables || []).map((variable) => [variable.name, variable]));
  const missingTags = new Set();
  const usedTags = new Set();

  const subject = renderText(variantResult.variant?.subject ?? null);
  const body = renderText(variantResult.variant?.body ?? template.code);
  for (const variable of template.variables || []) {
    if (variable.required && !usedTags.has(variable.name) && resolveTag(variable.name).missing) {
      missingTags.add(variable.name);
    }
  }

  return {
    template_code: template.code,
    template_id: template.id,
    channel: template.channel,
    requested_locale: requestedLocale,
    locale: variantResult.locale,
    fallback_used: variantResult.locale !== requestedLocale,
    subject,
    body,
    media_refs: variantResult.variant?.media_refs || [],
    blocks: productBlocks?.blocks || [],
    missing_tags: [...missingTags],
    used_tags: [...usedTags],
    safe_mode: !allowRawPii
  };

  function renderText(value) {
    if (value === null || value === undefined) {
      return null;
    }

    return String(value).replace(tagPattern, (match, tagName) => {
      const resolved = resolveTag(tagName);
      usedTags.add(tagName);
      if (resolved.missing) {
        missingTags.add(tagName);
        return match;
      }
      return resolved.value;
    });
  }

  function resolveTag(tagName) {
    if (tagName === "product_blocks" || tagName === "recommendations") {
      if (!productBlocks?.blocks?.length) {
        return { missing: true };
      }
      return { value: renderProductBlocksText(productBlocks.blocks) };
    }

    const rawValue = resolveTagValue(tagName, { variables, customer, loyaltyAccount });
    if (rawValue === undefined || rawValue === null || rawValue === "") {
      return { missing: true };
    }

    const metadata = metadataByName.get(tagName);
    if (!allowRawPii && (metadata?.pii === true || piiTagNames.has(tagName))) {
      return { value: genericNameByLocale[variantResult.locale] || genericNameByLocale.ru };
    }

    return { value: stringifyValue(rawValue) };
  }
}

export function extractTemplateTags(template) {
  const tags = new Set();
  for (const variant of Object.values(template.locale_variants || {})) {
    collectTags(variant?.subject, tags);
    collectTags(variant?.body, tags);
  }
  return [...tags];
}

function resolveVariant(template, requestedLocale) {
  for (const locale of getFallbackChain(requestedLocale)) {
    const variant = template.locale_variants?.[locale];
    if (variant && typeof variant.body === "string" && variant.body.length > 0) {
      return { locale, variant };
    }
  }

  return { locale: requestedLocale, variant: null };
}

function resolveTagValue(tagName, { variables, customer, loyaltyAccount }) {
  if (variables[tagName] !== undefined) {
    return variables[tagName];
  }

  if (tagName === "name") {
    return variables.name ?? variables.first_name ?? customer?.first_name ?? customer?.last_name;
  }

  if (tagName === "size") {
    return variables.size ?? formatCustomerSize(customer);
  }

  if (tagName === "discount") {
    return variables.discount ??
      variables.discount_percent ??
      variables.current_discount_percent ??
      loyaltyAccount?.current_discount_percent ??
      loyaltyAccount?.discount_percent;
  }

  return undefined;
}

function formatCustomerSize(customer) {
  const shoe = customer?.size_profile?.shoe;
  if (shoe?.uk) {
    return `UK ${shoe.uk}`;
  }
  if (shoe?.eu) {
    return `EU ${shoe.eu}`;
  }
  if (shoe?.us) {
    return `US ${shoe.us}`;
  }

  const apparel = customer?.size_profile?.apparel;
  if (apparel?.top) {
    return apparel.top;
  }
  if (apparel?.bottom) {
    return apparel.bottom;
  }

  return null;
}

function renderProductBlocksText(blocks) {
  return blocks
    .map((block, index) => {
      const price = block.price?.amount && block.price?.currency
        ? ` - ${block.price.amount} ${block.price.currency}`
        : "";
      const size = block.size?.system && block.size?.value
        ? `, ${block.size.system} ${block.size.value}`
        : "";
      return `${index + 1}. ${block.title}${size}${price}`;
    })
    .join("\n");
}

function stringifyValue(value) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return JSON.stringify(value);
}

function collectTags(value, tags) {
  if (!value) {
    return;
  }

  for (const match of String(value).matchAll(tagPattern)) {
    tags.add(match[1]);
  }
}
