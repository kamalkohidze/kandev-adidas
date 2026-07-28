import { createRecommendationMessageBlocks } from "../../recommendations/message-blocks/index.js";
import { normalizeLocale } from "../../../shared/contracts.js";
import { createMessageTemplateRepository } from "./repository.js";
import {
  extractTemplateTags,
  renderMessageTemplateContent
} from "./renderer.js";

export function createMessageTemplateService(data, {
  repository = createMessageTemplateRepository(data),
  recommendationBlocks = createRecommendationMessageBlocks(data)
} = {}) {
  function listTemplates({ tenantId, status = "active" } = {}) {
    return repository.listTemplates({ tenantId, status }).map(toTemplateSummary);
  }

  function getTemplate({ tenantId, templateCode, channel = null } = {}) {
    return repository.getTemplate({ tenantId, code: templateCode, channel });
  }

  function renderTemplate({
    tenantId,
    templateCode,
    channel = null,
    locale = "ru",
    customerId = null,
    variables = {},
    recommendation = {},
    includeRecommendations = false,
    allowRawPii = false
  } = {}) {
    const template = getTemplate({ tenantId, templateCode, channel });
    if (!template) {
      return {
        ok: false,
        reason: "template_not_found",
        validationDetails: [{ field: "template_code", reason: "not_found" }]
      };
    }

    const normalizedLocale = normalizeLocale(locale);
    const customer = findCustomer(data, tenantId, customerId || variables.customer_id);
    const loyaltyAccount = findLoyaltyAccount(data, tenantId, customer?.id || customerId || variables.customer_id);
    const productBlocks = resolveProductBlocks({
      template,
      tenantId,
      customerId: customer?.id || customerId || variables.customer_id,
      locale: normalizedLocale,
      recommendation,
      includeRecommendations
    });

    return {
      ok: true,
      data: {
        template: toTemplateSummary(template),
        ...renderMessageTemplateContent(template, {
          locale: normalizedLocale,
          variables,
          customer,
          loyaltyAccount,
          productBlocks,
          allowRawPii
        })
      }
    };
  }

  function previewTemplate(options = {}) {
    return renderTemplate({
      ...options,
      allowRawPii: options.allowRawPii === true
    });
  }

  return {
    listTemplates,
    getTemplate,
    renderTemplate,
    previewTemplate
  };

  function resolveProductBlocks({ template, tenantId, customerId, locale, recommendation, includeRecommendations }) {
    const tags = extractTemplateTags(template);
    const needsBlocks = includeRecommendations ||
      tags.includes("product_blocks") ||
      tags.includes("recommendations");
    if (!needsBlocks || !customerId) {
      return null;
    }

    return recommendationBlocks.forCustomer({
      customerId,
      tenantId,
      branchId: recommendation?.branch_id || null,
      locale,
      limit: recommendation?.limit || 4
    });
  }
}

function toTemplateSummary(template) {
  return {
    id: template.id,
    tenant_id: template.tenant_id,
    code: template.code,
    name: template.name,
    channel: template.channel,
    category: template.category,
    status: template.status,
    approval: template.approval,
    variables: template.variables
  };
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
