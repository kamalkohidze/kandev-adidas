import { defaultMessageTemplates } from "./default-templates.js";

export function createMessageTemplateRepository(data = {}) {
  function listTemplates({ tenantId = null, status = "active" } = {}) {
    return allTemplates()
      .filter((template) => matchesTenant(template, tenantId))
      .filter((template) => !status || template.status === status)
      .map(cloneTemplate);
  }

  function getTemplate({ tenantId, code, channel = null } = {}) {
    const normalizedCode = String(code || "").trim();
    const normalizedChannel = channel ? String(channel).trim() : null;
    if (!normalizedCode) {
      return null;
    }

    const candidates = allTemplates()
      .filter((template) => matchesTenant(template, tenantId))
      .filter((template) => template.code === normalizedCode)
      .filter((template) => !normalizedChannel || template.channel === normalizedChannel)
      .filter((template) => template.status === "active");

    return candidates[0] ? cloneTemplate(candidates[0]) : null;
  }

  function upsertTemplate(template) {
    if (!Array.isArray(data.message_templates)) {
      data.message_templates = [];
    }

    const index = data.message_templates.findIndex(
      (candidate) =>
        candidate.tenant_id === template.tenant_id &&
        candidate.code === template.code &&
        candidate.channel === template.channel
    );
    const nextTemplate = cloneTemplate(template);

    if (index >= 0) {
      data.message_templates[index] = nextTemplate;
    } else {
      data.message_templates.push(nextTemplate);
    }

    return cloneTemplate(nextTemplate);
  }

  return {
    listTemplates,
    getTemplate,
    upsertTemplate
  };

  function allTemplates() {
    return [...(Array.isArray(data.message_templates) ? data.message_templates : []), ...defaultMessageTemplates];
  }
}

function matchesTenant(template, tenantId) {
  return !tenantId || template.tenant_id === tenantId;
}

function cloneTemplate(template) {
  return structuredClone(template);
}
