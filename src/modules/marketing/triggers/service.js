import { createWorkflowService } from "../workflow/index.js";
import {
  getMarketingTriggerPreset,
  listMarketingTriggerPresets
} from "./definitions.js";

export function createMarketingTriggerService(data, options = {}) {
  const workflows = options.workflows || createWorkflowService(data, options.workflowOptions || {});
  const now = options.now || (() => new Date().toISOString());

  function listPresets({ tenantId }) {
    const validationDetails = validateTenant({ tenantId });
    if (validationDetails.length > 0) {
      return { ok: false, validationDetails };
    }

    return {
      ok: true,
      data: listMarketingTriggerPresets().map((preset) => toPresetStatus(data, tenantId, preset))
    };
  }

  function enablePreset({ tenantId, presetCode, asOf = now() }) {
    const validationDetails = validateTenant({ tenantId });
    if (validationDetails.length > 0) {
      return { ok: false, validationDetails };
    }

    const preset = getMarketingTriggerPreset(presetCode);
    if (!preset) {
      return null;
    }

    const existing = findWorkflowDefinition(data, tenantId, preset.workflow_code);
    if (existing) {
      existing.status = "active";
      existing.updated_at = asOf;
      existing.version = Number.isInteger(existing.version) ? existing.version + 1 : 1;
      existing.metadata = {
        ...(existing.metadata || {}),
        trigger_preset_code: preset.code,
        trigger_preset_enabled_at: asOf
      };
      return { ok: true, data: toPresetStatus(data, tenantId, preset), workflow: structuredClone(existing) };
    }

    const result = workflows.createDefinition({
      tenantId,
      definition: {
        ...preset.definition,
        metadata: {
          ...(preset.definition.metadata || {}),
          trigger_preset_code: preset.code,
          trigger_preset_enabled_at: asOf
        }
      },
      asOf
    });

    if (!result.ok) {
      return result;
    }

    return { ok: true, data: toPresetStatus(data, tenantId, preset), workflow: result.data };
  }

  function disablePreset({ tenantId, presetCode, asOf = now() }) {
    const validationDetails = validateTenant({ tenantId });
    if (validationDetails.length > 0) {
      return { ok: false, validationDetails };
    }

    const preset = getMarketingTriggerPreset(presetCode);
    if (!preset) {
      return null;
    }

    const existing = findWorkflowDefinition(data, tenantId, preset.workflow_code);
    if (existing) {
      existing.status = "archived";
      existing.updated_at = asOf;
      existing.version = Number.isInteger(existing.version) ? existing.version + 1 : 1;
      existing.metadata = {
        ...(existing.metadata || {}),
        trigger_preset_code: preset.code,
        trigger_preset_disabled_at: asOf
      };
    }

    return {
      ok: true,
      data: toPresetStatus(data, tenantId, preset),
      workflow: existing ? structuredClone(existing) : null
    };
  }

  return {
    listPresets,
    enablePreset,
    disablePreset
  };
}

function toPresetStatus(data, tenantId, preset) {
  const definition = findWorkflowDefinition(data, tenantId, preset.workflow_code);
  return {
    code: preset.code,
    name: preset.name,
    description: preset.description,
    workflow_code: preset.workflow_code,
    event_types: preset.event_types,
    preferred_channels: preset.preferred_channels,
    enabled: definition?.status === "active",
    workflow_status: definition?.status || null,
    workflow_definition_id: definition?.id || null
  };
}

function findWorkflowDefinition(data, tenantId, workflowCode) {
  return ensureArray(data, "workflow_definitions").find(
    (definition) => definition.tenant_id === tenantId && definition.code === workflowCode
  ) || null;
}

function ensureArray(target, field) {
  if (!Array.isArray(target[field])) {
    target[field] = [];
  }
  return target[field];
}

function validateTenant({ tenantId }) {
  return typeof tenantId === "string" && tenantId.trim() !== ""
    ? []
    : [{ field: "tenant_context", reason: "required" }];
}
