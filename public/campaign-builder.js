import { ApiError, apiRequest } from "./api.js";
import {
  buildContentTemplateBody,
  buildInstanceAdvanceBody,
  buildWorkflowCreateBody,
  buildWorkflowDryRunBody,
  buildWorkflowEventBody,
  contentVariablesExample,
  mutationErrorFromJson,
  prettyJson,
  workflowDefinitionExample,
  workflowEventExample
} from "./campaign-builder-utils.js";
import { getState, setError, setLoading, setState } from "./state.js";
import { badge, errorBlock, escapeHtml, stateBlock } from "./ui.js";

const requestSequences = {
  workflows: 0,
  workflowDetail: 0,
  triggers: 0,
  templates: 0,
  instance: 0
};

const campaignState = {
  activeTab: "workflows",
  workflows: [],
  selectedWorkflowCode: "",
  workflowDetail: null,
  workflowCreate: {
    definition_json: prettyJson(workflowDefinitionExample),
    result: null
  },
  workflowEvent: {
    event_json: prettyJson(workflowEventExample),
    as_of: "",
    result: null
  },
  dryRun: {
    mode: "existing",
    workflow_code: "",
    definition_json: prettyJson(workflowDefinitionExample),
    event_json: prettyJson(workflowEventExample),
    as_of: "",
    result: null
  },
  instance: {
    instance_id: "",
    as_of: "",
    result: null,
    advanceResult: null
  },
  triggers: [],
  templates: [],
  selectedTemplateCode: "",
  content: {
    action: "preview",
    channel: "push",
    locale: getState().locale,
    customer_id: "",
    variables_json: prettyJson(contentVariablesExample),
    include_recommendations: true,
    allow_raw_pii: false,
    branch_id: getState().catalog?.filters?.branch_id || "55555555-5555-4555-8555-555555555555",
    limit: "3",
    result: null
  },
  toast: null
};

const labels = {
  kk: {
    title: "Campaigns / Automation",
    subtitle: "Workflow, trigger және content template басқару",
    workflows: "Workflows",
    dryRun: "Dry Run",
    triggers: "Triggers",
    templates: "Content Templates"
  },
  ru: {
    title: "Campaigns / Automation",
    subtitle: "Рабочий интерфейс для workflow, triggers и content templates",
    workflows: "Workflows",
    dryRun: "Dry Run",
    triggers: "Triggers",
    templates: "Content Templates"
  },
  en: {
    title: "Campaigns / Automation",
    subtitle: "Operational builder for workflows, triggers, and content templates",
    workflows: "Workflows",
    dryRun: "Dry Run",
    triggers: "Triggers",
    templates: "Content Templates"
  }
};

const presetPlaybookSummaries = {
  welcome: {
    schedule: "Immediate welcome message, then brand-story follow-up after 3 days",
    conditions: "customer.registered event for a new retail profile",
    payload: "Welcome discount and onboarding content via marketing_trigger payload"
  },
  birthday: {
    schedule: "Birthday trigger window with offer valid for 14 days",
    conditions: "customer.birthday.due event for customers approaching birthday",
    payload: "Birthday greeting and one-time discount payload"
  },
  "abandoned-cart": {
    schedule: "Push reminder after 1 hour, WABA follow-up after 24 hours",
    conditions: "cart.abandoned event with cart context",
    payload: "Cart recovery content with product/cart details"
  },
  "tier-retention": {
    schedule: "Retention notice before loyalty tier downgrade",
    conditions: "loyalty.tier.retention_risk event for customers at tier risk",
    payload: "Tier gap, current tier, and recovery offer payload"
  }
};

export async function loadCampaignBuilder() {
  await Promise.all([loadWorkflows(), loadTriggers(), loadTemplates()]);
}

export async function refreshCampaignBuilder() {
  await loadCampaignBuilder();
}

export function syncCampaignLocale(locale) {
  updateCampaignGroup("content", { locale });
}

export function wireCampaignEvents() {
  document.addEventListener("click", async (event) => {
    const tab = event.target.closest("[data-campaign-tab]");
    if (tab) {
      updateCampaign({ activeTab: tab.dataset.campaignTab });
      return;
    }

    const workflowButton = event.target.closest("[data-campaign-workflow]");
    if (workflowButton) {
      const code = workflowButton.dataset.campaignWorkflow;
      updateCampaign({
        selectedWorkflowCode: code,
        dryRun: { ...campaignState.dryRun, workflow_code: campaignState.dryRun.workflow_code || code }
      });
      await loadWorkflowDetail(code);
      return;
    }

    const triggerButton = event.target.closest("[data-trigger-action]");
    if (triggerButton) {
      await mutateTrigger(triggerButton.dataset.presetCode, triggerButton.dataset.triggerAction);
    }
  });

  document.addEventListener("change", async (event) => {
    if (event.target.id === "dryRunMode") {
      updateCampaignGroup("dryRun", { mode: event.target.value });
    }
    if (event.target.id === "contentTemplateSelect" || event.target.id === "contentTemplateListSelect") {
      updateCampaign({ selectedTemplateCode: event.target.value });
    }
  });

  document.addEventListener("submit", async (event) => {
    if (event.target.id === "workflowCreateForm") {
      event.preventDefault();
      updateCampaignGroup("workflowCreate", { definition_json: formValue(event.target, "definition_json") });
      await createWorkflowDefinition();
    }
    if (event.target.id === "workflowEventForm") {
      event.preventDefault();
      updateCampaignGroup("workflowEvent", readForm(event.target));
      await ingestWorkflowEvent();
    }
    if (event.target.id === "dryRunForm") {
      event.preventDefault();
      updateCampaignGroup("dryRun", readForm(event.target));
      await dryRunWorkflow();
    }
    if (event.target.id === "instanceForm") {
      event.preventDefault();
      updateCampaignGroup("instance", { ...campaignState.instance, ...readForm(event.target) });
      await loadJourneyInstance();
    }
    if (event.target.id === "instanceAdvanceForm") {
      event.preventDefault();
      updateCampaignGroup("instance", { ...campaignState.instance, ...readForm(event.target) });
      await advanceJourneyInstance();
    }
    if (event.target.id === "contentTemplateForm") {
      event.preventDefault();
      updateCampaignGroup("content", readFormWithChecks(event.target, ["include_recommendations", "allow_raw_pii"]));
      await renderContentTemplate();
    }
  });
}

export function renderCampaignBuilder(container) {
  if (!container) {
    return;
  }
  const state = getCampaignViewState();
  const text = translator(state.locale);

  container.innerHTML = `
    <div class="panel-heading">
      <div>
        <h2>${escapeHtml(text("title"))}</h2>
        <p>${escapeHtml(text("subtitle"))}</p>
      </div>
      <div class="marketing-context" aria-label="Campaign context">
        ${badge(`customer: ${state.customerId || "-"}`, "soft")}
        ${badge(`locale: ${state.locale}`, "neutral")}
        ${state.tenantId ? badge(`tenant: ${state.tenantId}`, "soft") : ""}
      </div>
    </div>
    ${renderToast()}
    <div class="segmented-control marketing-tabs campaign-tabs" role="tablist">
      ${campaignTab("workflows", text("workflows"), state.campaigns.activeTab)}
      ${campaignTab("dryRun", text("dryRun"), state.campaigns.activeTab)}
      ${campaignTab("triggers", text("triggers"), state.campaigns.activeTab)}
      ${campaignTab("content", text("templates"), state.campaigns.activeTab)}
    </div>
    <div class="campaign-view detail-fade">
      ${renderActiveTab(state)}
    </div>
  `;
}

async function loadWorkflows() {
  const requestId = nextRequest("workflows");
  setLoading("campaignWorkflows", true);
  setError("campaignWorkflows", null);
  try {
    const result = await apiRequest("/api/v1/marketing/workflows", { locale: getState().locale });
    if (!isCurrentRequest("workflows", requestId)) {
      return;
    }
    const workflows = result?.data || [];
    const selectedWorkflowCode = campaignState.selectedWorkflowCode || workflows[0]?.code || "";
    updateCampaign({
      workflows,
      selectedWorkflowCode,
      dryRun: {
        ...campaignState.dryRun,
        workflow_code: campaignState.dryRun.workflow_code || selectedWorkflowCode
      }
    });
    if (selectedWorkflowCode) {
      await loadWorkflowDetail(selectedWorkflowCode);
    }
  } catch (error) {
    setError("campaignWorkflows", normalizeError(error));
  } finally {
    setLoading("campaignWorkflows", false);
  }
}

async function loadWorkflowDetail(code = campaignState.selectedWorkflowCode) {
  if (!code) {
    updateCampaign({ workflowDetail: null });
    return;
  }
  const requestId = nextRequest("workflowDetail");
  setLoading("campaignWorkflowDetail", true);
  setError("campaignWorkflowDetail", null);
  try {
    const result = await apiRequest(`/api/v1/marketing/workflows/${encodeURIComponent(code)}`, { locale: getState().locale });
    if (!isCurrentRequest("workflowDetail", requestId)) {
      return;
    }
    updateCampaign({ workflowDetail: result?.data || result });
  } catch (error) {
    setError("campaignWorkflowDetail", normalizeError(error));
  } finally {
    setLoading("campaignWorkflowDetail", false);
  }
}

async function createWorkflowDefinition() {
  const parsed = buildWorkflowCreateBody(campaignState.workflowCreate.definition_json);
  if (!parsed.ok) {
    setError("campaignWorkflowCreate", mutationErrorFromJson(parsed.error));
    return;
  }

  setLoading("campaignWorkflowCreate", true);
  setError("campaignWorkflowCreate", null);
  try {
    const result = await apiRequest("/api/v1/marketing/workflows", {
      method: "POST",
      locale: getState().locale,
      idempotencyKey: createKey("workflow-create"),
      body: parsed.body
    });
    updateCampaignGroup("workflowCreate", { result });
    updateCampaign({ toast: { tone: "success", message: `Workflow ${result?.data?.code || "created"} saved` } });
    await loadWorkflows();
  } catch (error) {
    setError("campaignWorkflowCreate", normalizeError(error));
  } finally {
    setLoading("campaignWorkflowCreate", false);
  }
}

async function ingestWorkflowEvent() {
  const parsed = buildWorkflowEventBody(campaignState.workflowEvent);
  if (!parsed.ok) {
    setError("campaignWorkflowEvent", mutationErrorFromJson(parsed.error));
    return;
  }

  setLoading("campaignWorkflowEvent", true);
  setError("campaignWorkflowEvent", null);
  try {
    const result = await apiRequest("/api/v1/marketing/workflows/events", {
      method: "POST",
      locale: getState().locale,
      idempotencyKey: createKey("workflow-event"),
      body: parsed.body
    });
    updateCampaignGroup("workflowEvent", { result });
    updateCampaign({ toast: { tone: "success", message: `Event accepted: ${result.started || 0} started, ${result.continued || 0} continued` } });
    await loadWorkflows();
  } catch (error) {
    setError("campaignWorkflowEvent", normalizeError(error));
  } finally {
    setLoading("campaignWorkflowEvent", false);
  }
}

async function dryRunWorkflow() {
  const parsed = buildWorkflowDryRunBody(campaignState.dryRun);
  if (!parsed.ok) {
    setError("campaignDryRun", mutationErrorFromJson(parsed.error));
    return;
  }

  setLoading("campaignDryRun", true);
  setError("campaignDryRun", null);
  try {
    const result = await apiRequest("/api/v1/marketing/workflows/dry-run", {
      method: "POST",
      locale: getState().locale,
      idempotencyKey: createKey("workflow-dry-run"),
      body: parsed.body
    });
    updateCampaignGroup("dryRun", { result });
    updateCampaign({ toast: { tone: "success", message: `Dry run completed: ${result.started || 0} started` } });
  } catch (error) {
    setError("campaignDryRun", normalizeError(error));
  } finally {
    setLoading("campaignDryRun", false);
  }
}

async function loadJourneyInstance() {
  const instanceId = campaignState.instance.instance_id.trim();
  if (!instanceId) {
    setError("campaignInstance", mutationErrorFromJson({ field: "instance_id", reason: "required", message: "instance_id is required" }));
    return;
  }

  const requestId = nextRequest("instance");
  setLoading("campaignInstance", true);
  setError("campaignInstance", null);
  try {
    const result = await apiRequest(`/api/v1/marketing/workflows/instances/${encodeURIComponent(instanceId)}`, { locale: getState().locale });
    if (!isCurrentRequest("instance", requestId)) {
      return;
    }
    updateCampaignGroup("instance", { result, advanceResult: null });
  } catch (error) {
    setError("campaignInstance", normalizeError(error));
  } finally {
    setLoading("campaignInstance", false);
  }
}

async function advanceJourneyInstance() {
  const instanceId = campaignState.instance.instance_id.trim();
  if (!instanceId) {
    setError("campaignInstanceAdvance", mutationErrorFromJson({ field: "instance_id", reason: "required", message: "instance_id is required" }));
    return;
  }

  setLoading("campaignInstanceAdvance", true);
  setError("campaignInstanceAdvance", null);
  try {
    const result = await apiRequest(`/api/v1/marketing/workflows/instances/${encodeURIComponent(instanceId)}/advance`, {
      method: "POST",
      locale: getState().locale,
      idempotencyKey: createKey("workflow-advance"),
      body: buildInstanceAdvanceBody(campaignState.instance)
    });
    updateCampaignGroup("instance", { result, advanceResult: result });
    updateCampaign({ toast: { tone: "success", message: `Instance ${result?.data?.status || "advanced"}` } });
  } catch (error) {
    setError("campaignInstanceAdvance", normalizeError(error));
  } finally {
    setLoading("campaignInstanceAdvance", false);
  }
}

async function loadTriggers() {
  const requestId = nextRequest("triggers");
  setLoading("campaignTriggers", true);
  setError("campaignTriggers", null);
  try {
    const result = await apiRequest("/api/v1/marketing/triggers/presets", { locale: getState().locale });
    if (!isCurrentRequest("triggers", requestId)) {
      return;
    }
    updateCampaign({ triggers: result?.data || [] });
  } catch (error) {
    setError("campaignTriggers", normalizeError(error));
  } finally {
    setLoading("campaignTriggers", false);
  }
}

async function mutateTrigger(presetCode, action) {
  if (!presetCode || !["enable", "disable"].includes(action)) {
    return;
  }

  setLoading(`campaignTrigger:${presetCode}`, true);
  setError("campaignTriggers", null);
  try {
    const result = await apiRequest(`/api/v1/marketing/triggers/presets/${encodeURIComponent(presetCode)}/${action}`, {
      method: "POST",
      locale: getState().locale,
      idempotencyKey: createKey(`trigger-${action}`),
      body: { as_of: new Date().toISOString() }
    });
    const updated = result?.data;
    if (updated) {
      updateCampaign({
        triggers: campaignState.triggers.map((preset) => (preset.code === updated.code ? updated : preset)),
        toast: { tone: "success", message: `${updated.code} ${updated.enabled ? "enabled" : "disabled"}` }
      });
    }
    await loadWorkflows();
  } catch (error) {
    setError("campaignTriggers", normalizeError(error));
  } finally {
    setLoading(`campaignTrigger:${presetCode}`, false);
  }
}

async function loadTemplates() {
  const requestId = nextRequest("templates");
  setLoading("campaignTemplates", true);
  setError("campaignTemplates", null);
  try {
    const result = await apiRequest("/api/v1/marketing/content/templates", { locale: getState().locale });
    if (!isCurrentRequest("templates", requestId)) {
      return;
    }
    const templates = result?.data || [];
    updateCampaign({
      templates,
      selectedTemplateCode: campaignState.selectedTemplateCode || templates[0]?.code || "",
      content: {
        ...campaignState.content,
        channel: campaignState.content.channel || templates[0]?.channel || "push"
      }
    });
  } catch (error) {
    setError("campaignTemplates", normalizeError(error));
  } finally {
    setLoading("campaignTemplates", false);
  }
}

async function renderContentTemplate() {
  const templateCode = campaignState.selectedTemplateCode;
  if (!templateCode) {
    setError("campaignContent", mutationErrorFromJson({ field: "template_code", reason: "required", message: "template_code is required" }));
    return;
  }
  const parsed = buildContentTemplateBody(campaignState.content);
  if (!parsed.ok) {
    setError("campaignContent", mutationErrorFromJson(parsed.error));
    return;
  }

  const action = campaignState.content.action === "render" ? "render" : "preview";
  setLoading("campaignContent", true);
  setError("campaignContent", null);
  try {
    const result = await apiRequest(`/api/v1/marketing/content/templates/${encodeURIComponent(templateCode)}/${action}`, {
      method: "POST",
      locale: getState().locale,
      idempotencyKey: createKey(`content-${action}`),
      body: parsed.body
    });
    updateCampaignGroup("content", { result });
    updateCampaign({ toast: { tone: "success", message: `${templateCode} ${action} rendered` } });
  } catch (error) {
    setError("campaignContent", normalizeError(error));
  } finally {
    setLoading("campaignContent", false);
  }
}

function renderActiveTab(state) {
  if (state.campaigns.activeTab === "dryRun") {
    return renderDryRunTab(state);
  }
  if (state.campaigns.activeTab === "triggers") {
    return renderTriggersTab(state);
  }
  if (state.campaigns.activeTab === "content") {
    return renderContentTab(state);
  }
  return renderWorkflowsTab(state);
}

function renderWorkflowsTab(state) {
  return `
    <div class="workspace-grid campaign-layout">
      <article class="surface">
        <div class="section-title-row">
          <h3>Workflow definitions</h3>
          ${badge(String(state.campaigns.workflows.length), "sky")}
        </div>
        ${renderWorkflowList(state)}
      </article>
      <article class="surface">
        <div class="section-title-row">
          <h3>Definition detail</h3>
          ${state.campaigns.selectedWorkflowCode ? badge(state.campaigns.selectedWorkflowCode, "soft") : ""}
        </div>
        ${renderWorkflowDetail(state)}
      </article>
    </div>
    <div class="workspace-grid campaign-two">
      <article class="surface">
        <h3>Create definition</h3>
        ${errorBlock(state.errors.campaignWorkflowCreate, "Validation or API error")}
        <form id="workflowCreateForm" class="form-grid">
          ${textarea("definition_json", "Definition JSON", state.campaigns.workflowCreate.definition_json, "Edit a workflow definition JSON")}
          <button class="primary" type="submit" ${disabled(state, "campaignWorkflowCreate")}>Create workflow</button>
        </form>
        ${renderResult("Create response", state.campaigns.workflowCreate.result)}
      </article>
      <article class="surface">
        <h3>Event ingestion</h3>
        ${errorBlock(state.errors.campaignWorkflowEvent, "Validation or API error")}
        <form id="workflowEventForm" class="form-grid">
          ${input("as_of", "as_of", state.campaigns.workflowEvent.as_of, "datetime-local")}
          ${textarea("event_json", "Event JSON", state.campaigns.workflowEvent.event_json, "Canonical event payload")}
          <button class="primary sky" type="submit" ${disabled(state, "campaignWorkflowEvent")}>Ingest event</button>
        </form>
        ${renderWorkflowRunResult(state.campaigns.workflowEvent.result)}
      </article>
    </div>
    <article class="surface">
      <h3>Journey instances</h3>
      ${errorBlock(state.errors.campaignInstance, "Instance load error")}
      ${errorBlock(state.errors.campaignInstanceAdvance, "Advance error")}
      <div class="workspace-grid campaign-instance-grid">
        <form id="instanceForm" class="form-grid">
          ${input("instance_id", "instance_id", state.campaigns.instance.instance_id, "text", "journey instance id")}
          <button class="secondary" type="submit" ${disabled(state, "campaignInstance")}>Load instance</button>
        </form>
        <form id="instanceAdvanceForm" class="form-grid">
          ${input("instance_id", "instance_id", state.campaigns.instance.instance_id, "text", "journey instance id")}
          ${input("as_of", "advance as_of", state.campaigns.instance.as_of, "datetime-local")}
          <button class="primary lavender" type="submit" ${disabled(state, "campaignInstanceAdvance")}>Advance</button>
        </form>
      </div>
      ${renderInstance(state.campaigns.instance.result)}
    </article>
  `;
}

function renderDryRunTab(state) {
  const dry = state.campaigns.dryRun;
  return `
    <article class="surface">
      <h3>Dry-run workflow</h3>
      ${errorBlock(state.errors.campaignDryRun, "Validation or API error")}
      <form id="dryRunForm" class="form-grid campaign-dry-grid">
        ${select("mode", "Definition source", dry.mode, [["existing", "Existing workflow_code"], ["custom", "Custom definition JSON"]], "dryRunMode")}
        ${select("workflow_code", "workflow_code", dry.workflow_code, state.campaigns.workflows.map((item) => [item.code, item.code]), "", dry.mode === "custom")}
        ${input("as_of", "as_of", dry.as_of, "datetime-local")}
        <div class="${dry.mode === "custom" ? "" : "muted-panel"}">
          ${textarea("definition_json", "Custom definition JSON", dry.definition_json, "Used only in custom mode")}
        </div>
        ${textarea("event_json", "Event JSON", dry.event_json, "Event used to simulate the workflow")}
        <button class="primary coral" type="submit" ${disabled(state, "campaignDryRun")}>Run dry-run</button>
      </form>
      ${renderWorkflowRunResult(dry.result)}
    </article>
  `;
}

function renderTriggersTab(state) {
  const loading = state.loading.has("campaignTriggers");
  return `
    <article class="surface">
      <div class="section-title-row">
        <h3>Preset triggers</h3>
        ${badge(String(state.campaigns.triggers.length), "lavender")}
      </div>
      ${errorBlock(state.errors.campaignTriggers, "Trigger API error")}
      ${loading ? skeletonList() : ""}
      <div class="campaign-card-grid">
        ${state.campaigns.triggers.map((preset) => renderPresetCard(preset, state)).join("") || stateBlock("empty", "No presets")}
      </div>
    </article>
  `;
}

function renderContentTab(state) {
  const content = state.campaigns.content;
  const selectedTemplate = state.campaigns.templates.find((template) => template.code === state.campaigns.selectedTemplateCode);
  return `
    <div class="workspace-grid campaign-content-layout">
      <article class="surface">
        <div class="section-title-row">
          <h3>Templates</h3>
          ${badge(String(state.campaigns.templates.length), "sky")}
        </div>
        ${errorBlock(state.errors.campaignTemplates, "Templates API error")}
        ${state.loading.has("campaignTemplates") ? skeletonList() : ""}
        ${renderTemplateList(state)}
      </article>
      <article class="surface">
        <h3>Preview / render</h3>
        ${selectedTemplate ? renderTemplateSummary(selectedTemplate) : stateBlock("empty", "Select a template")}
        ${errorBlock(state.errors.campaignContent, "Validation or API error")}
        <form id="contentTemplateForm" class="form-grid campaign-content-form">
          ${select("template_code", "template_code", state.campaigns.selectedTemplateCode, state.campaigns.templates.map((template) => [template.code, template.code]), "contentTemplateSelect")}
          ${select("action", "Action", content.action, [["preview", "Preview"], ["render", "Render"]])}
          ${select("channel", "Channel", content.channel, channelOptions(state.campaigns.templates))}
          ${select("locale", "Locale", content.locale, [["kk", "kk"], ["ru", "ru"], ["en", "en"]])}
          ${input("customer_id", "customer_id", content.customer_id || state.customerId || "", "text", "optional")}
          ${check("include_recommendations", "include_recommendations", content.include_recommendations)}
          ${check("allow_raw_pii", "allow_raw_pii", content.allow_raw_pii)}
          ${input("branch_id", "recommendation branch_id", content.branch_id, "text")}
          ${input("limit", "recommendation limit", content.limit, "number")}
          ${textarea("variables_json", "Variables JSON", content.variables_json, "Example: { \"name\": \"Alibek\" }")}
          <button class="primary" type="submit" ${disabled(state, "campaignContent")}>Run template</button>
        </form>
        ${renderContentResult(content.result)}
      </article>
    </div>
  `;
}

function renderWorkflowList(state) {
  if (state.loading.has("campaignWorkflows")) {
    return skeletonList();
  }
  if (state.errors.campaignWorkflows) {
    return errorBlock(state.errors.campaignWorkflows, "Workflow API error");
  }
  if (!state.campaigns.workflows.length) {
    return stateBlock("empty", "No workflow definitions");
  }
  return `<div class="marketing-list">${state.campaigns.workflows.map((workflow) => `
    <button class="product-row marketing-list-row ${workflow.code === state.campaigns.selectedWorkflowCode ? "active" : ""}" type="button" data-campaign-workflow="${escapeHtml(workflow.code)}">
      <span>
        <strong>${escapeHtml(workflow.name || workflow.code)}</strong>
        <small>${escapeHtml(workflow.code)} · entry ${escapeHtml(workflow.entry_step || "-")}</small>
      </span>
      ${badge(workflow.status || "unknown", workflow.status === "active" ? "success" : "warning")}
    </button>
  `).join("")}</div>`;
}

function renderWorkflowDetail(state) {
  if (state.loading.has("campaignWorkflowDetail")) {
    return skeletonDetail();
  }
  if (state.errors.campaignWorkflowDetail) {
    return errorBlock(state.errors.campaignWorkflowDetail, "Detail API error");
  }
  const detail = state.campaigns.workflowDetail;
  if (!detail) {
    return stateBlock("empty", "Select a workflow");
  }
  return `
    <div class="mini-metrics">
      ${metricLite("status", detail.status || "-")}
      ${metricLite("trigger", (detail.trigger?.event_types || []).join(", ") || "-")}
      ${metricLite("steps", String(detail.steps?.length || 0))}
    </div>
    ${renderSteps(detail.steps || [])}
    ${jsonPanel("Definition JSON", detail)}
  `;
}

function renderWorkflowRunResult(result) {
  if (!result) {
    return "";
  }
  const instances = result.data || [];
  const events = result.emitted_events || result.events || [];
  return `
    <div class="result-card campaign-result">
      <h4>Workflow response</h4>
      <div class="mini-metrics">
        ${metricLite("started", String(result.started || 0))}
        ${metricLite("continued", String(result.continued || 0))}
        ${metricLite("duplicates", String(result.duplicate_count || 0))}
      </div>
      ${renderInstanceCards(instances)}
      ${renderWorkflowEvents(events, result)}
      ${jsonPanel("Raw response", result)}
    </div>
  `;
}

function renderInstance(result) {
  const instance = result?.data || result;
  if (!instance) {
    return "";
  }
  return `
    <div class="result-card campaign-result">
      <div class="section-title-row">
        <h4>Journey state</h4>
        ${badge(instance.status || "unknown", statusTone(instance.status))}
      </div>
      <div class="mini-metrics">
        ${metricLite("current_step", instance.current_step_code || "-")}
        ${metricLite("history", String(instance.history?.length || 0))}
        ${metricLite("pending", String((instance.step_states || []).filter((step) => ["waiting", "pending", "running"].includes(step.status)).length))}
      </div>
      ${renderSteps(instance.step_states || [])}
      ${renderHistory(instance.history || [])}
      ${jsonPanel("Raw instance", instance)}
    </div>
  `;
}

function renderInstanceCards(instances) {
  if (!instances.length) {
    return stateBlock("empty", "No instances returned");
  }
  return `<div class="campaign-card-grid">${instances.map((instance) => `
    <article class="campaign-mini-card">
      <div class="section-title-row">
        <h4>${escapeHtml(instance.journey_code || instance.workflow_code || instance.id)}</h4>
        ${badge(instance.status || "unknown", statusTone(instance.status))}
      </div>
      <dl class="detail-list compact">
        <div><dt>instance_id</dt><dd><code>${escapeHtml(instance.id)}</code></dd></div>
        <div><dt>current_step</dt><dd>${escapeHtml(instance.current_step_code || "-")}</dd></div>
        <div><dt>history</dt><dd>${escapeHtml(String(instance.history?.length || 0))}</dd></div>
        <div><dt>pending</dt><dd>${escapeHtml(String((instance.step_states || []).filter((step) => ["waiting", "pending", "running"].includes(step.status)).length))}</dd></div>
      </dl>
      <details class="campaign-json-panel campaign-instance-detail" open>
        <summary>Instance steps</summary>
        ${renderSteps(instance.step_states || [])}
      </details>
      ${renderHistory(instance.history || [])}
    </article>
  `).join("")}</div>`;
}

function renderPresetCard(preset, state) {
  const action = preset.enabled ? "disable" : "enable";
  const key = `campaignTrigger:${preset.code}`;
  const summary = presetOperationalSummary(preset);
  return `
    <article class="campaign-mini-card">
      <div class="section-title-row">
        <h4>${escapeHtml(preset.name || preset.code)}</h4>
        ${badge(preset.enabled ? "enabled" : "disabled", preset.enabled ? "success" : "warning")}
      </div>
      <dl class="detail-list compact">
        <div><dt>preset_code</dt><dd><code>${escapeHtml(preset.code)}</code></dd></div>
        <div><dt>workflow</dt><dd>${escapeHtml(preset.workflow_code || "-")}</dd></div>
        <div><dt>event source</dt><dd>${escapeHtml((preset.event_types || []).join(", ") || "-")}</dd></div>
        <div><dt>channels</dt><dd>${(preset.preferred_channels || []).map((channel) => badge(channel, "soft")).join(" ")}</dd></div>
        <div><dt>summary</dt><dd>${escapeHtml(preset.description || "-")}</dd></div>
        <div><dt>schedule</dt><dd>${escapeHtml(summary.schedule)}</dd></div>
        <div><dt>conditions</dt><dd>${escapeHtml(summary.conditions)}</dd></div>
        <div><dt>payload</dt><dd>${escapeHtml(summary.payload)}</dd></div>
      </dl>
      <button class="secondary" type="button" data-trigger-action="${action}" data-preset-code="${escapeHtml(preset.code)}" ${disabled(state, key)}>
        ${action === "enable" ? "Enable" : "Disable"}
      </button>
    </article>
  `;
}

function renderTemplateList(state) {
  if (!state.campaigns.templates.length) {
    return stateBlock("empty", "No templates");
  }
  return `
    <select id="contentTemplateListSelect" aria-label="Template">
      ${state.campaigns.templates.map((template) => `<option value="${escapeHtml(template.code)}" ${template.code === state.campaigns.selectedTemplateCode ? "selected" : ""}>${escapeHtml(template.code)}</option>`).join("")}
    </select>
    <div class="campaign-template-stack">
      ${state.campaigns.templates.map((template) => `
        <article class="inventory-row">
          <div><strong>${escapeHtml(template.name || template.code)}</strong><span>${escapeHtml(template.code)}</span></div>
          <div>${badge(template.channel || "-", "soft")} ${badge(template.category || "-", "neutral")}</div>
          <div>${badge(template.status || "-", template.status === "active" ? "success" : "warning")}</div>
          <div>${escapeHtml(String(template.variables?.length || 0))} vars</div>
          <div>${badge(template.approval?.status || "approval n/a", "lavender")}</div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderTemplateSummary(template) {
  return `
    <dl class="detail-list compact campaign-summary">
      <div><dt>name</dt><dd>${escapeHtml(template.name || template.code)}</dd></div>
      <div><dt>channel</dt><dd>${badge(template.channel || "-", "soft")}</dd></div>
      <div><dt>variables</dt><dd>${(template.variables || []).map((variable) => badge(`${variable.name}${variable.required ? "*" : ""}`, variable.pii ? "warning" : "soft")).join(" ") || "-"}</dd></div>
    </dl>
  `;
}

function renderContentResult(result) {
  const data = result?.data || result;
  if (!data) {
    return "";
  }
  return `
    <div class="result-card campaign-result">
      <div class="section-title-row">
        <h4>Rendered content</h4>
        ${badge(data.preview ? "preview" : "render", data.preview ? "sky" : "mint")}
      </div>
      <dl class="detail-list">
        <div><dt>subject</dt><dd>${escapeHtml(data.subject || "-")}</dd></div>
        <div><dt>body</dt><dd><pre class="json-panel campaign-body">${escapeHtml(data.body || "-")}</pre></dd></div>
        <div><dt>locale</dt><dd>${escapeHtml(data.locale || "-")}${data.fallback_used ? " " + badge("fallback", "warning") : ""}</dd></div>
        <div><dt>safe_mode</dt><dd>${badge(data.safe_mode ? "true" : "false", data.safe_mode ? "success" : "warning")}</dd></div>
        <div><dt>missing_tags</dt><dd>${(data.missing_tags || []).map((tag) => badge(tag, "warning")).join(" ") || "-"}</dd></div>
      </dl>
      ${renderRecommendationBlocks(data.blocks || [])}
      ${jsonPanel("Payload JSON", data.payload || data)}
    </div>
  `;
}

function renderRecommendationBlocks(blocks) {
  if (!blocks.length) {
    return stateBlock("empty", "No recommendation blocks");
  }
  return `<div class="message-blocks">${blocks.map((block) => `
    <article>
      <strong>${escapeHtml(block.title || block.sku || "Recommendation")}</strong>
      <span>${escapeHtml(block.subtitle || block.description || "")}</span>
      <span>${escapeHtml(block.price?.amount || "")} ${escapeHtml(block.price?.currency || "")}</span>
    </article>
  `).join("")}</div>`;
}

function renderSteps(steps) {
  if (!steps.length) {
    return stateBlock("empty", "No steps");
  }
  return `
    <div class="responsive-table">
      <table>
        <thead><tr><th>Step</th><th>Type/status</th><th>Action / next</th><th>Pending</th></tr></thead>
        <tbody>
          ${steps.map((step) => `
            <tr>
              <td data-label="Step"><code>${escapeHtml(step.code || step.step_code || "-")}</code></td>
              <td data-label="Type/status">${badge(step.type || step.status || "-", statusTone(step.status))}</td>
              <td data-label="Action / next">${escapeHtml(step.action?.template_code || step.next_step || step.current_step_code || "-")}</td>
              <td data-label="Pending">${escapeHtml(step.wait_until || step.available_at || "-")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderHistory(history) {
  if (!history.length) {
    return "";
  }
  return `
    <h4 class="subhead">History</h4>
    <div class="responsive-table">
      <table>
        <thead><tr><th>At</th><th>Type</th><th>Step</th></tr></thead>
        <tbody>
          ${history.map((item) => `
            <tr>
              <td data-label="At">${escapeHtml(item.at || item.created_at || "-")}</td>
              <td data-label="Type">${escapeHtml(item.type || item.event_type || "-")}</td>
              <td data-label="Step">${escapeHtml(item.step_code || item.current_step_code || "-")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderWorkflowEvents(events, result = {}) {
  if (!events.length) {
    if (result.event_id && !result.dry_run) {
      return `
        <h4 class="subhead">Generated events</h4>
        ${stateBlock("empty", "The ingest API accepted the event but does not return generated workflow events; use Dry Run to inspect emitted events.")}
      `;
    }
    return "";
  }
  return `
    <h4 class="subhead">Generated events</h4>
    <div class="campaign-event-stack">
      ${events.map((event) => `
        <article class="campaign-mini-card">
          <strong>${escapeHtml(event.event_type || event.type || "event")}</strong>
          <span>${escapeHtml(event.aggregate_id || event.instance_id || event.id || "-")}</span>
          ${jsonPanel("Event payload", event.payload || event)}
        </article>
      `).join("")}
    </div>
  `;
}

function presetOperationalSummary(preset) {
  const playbook = presetPlaybookSummaries[preset.code] || {};
  const eventSource = (preset.event_types || []).join(", ");
  const channels = (preset.preferred_channels || []).join(" -> ");
  return {
    schedule: playbook.schedule || "Step delays are not returned by the presets API; inspect the enabled workflow definition for exact timing.",
    conditions: playbook.conditions || (eventSource ? `Triggered by ${eventSource}; detailed conditions are not returned by the presets API.` : "Detailed conditions are not returned by the presets API."),
    payload: playbook.payload || (channels ? `Marketing trigger payload rendered through ${channels}.` : "Payload builder details are not returned by the presets API.")
  };
}

function renderResult(title, result) {
  return result ? `<div class="result-card campaign-result"><h4>${escapeHtml(title)}</h4>${jsonPanel("Raw response", result)}</div>` : "";
}

function jsonPanel(title, value) {
  return `<details class="campaign-json-panel" open><summary>${escapeHtml(title)}</summary><pre class="json-panel">${escapeHtml(prettyJson(value))}</pre></details>`;
}

function renderToast() {
  if (!campaignState.toast) {
    return "";
  }
  return `<div class="campaign-toast ${escapeHtml(campaignState.toast.tone || "success")}" role="status">${escapeHtml(campaignState.toast.message)}</div>`;
}

function campaignTab(code, label, activeTab) {
  const active = code === activeTab;
  return `<button class="secondary compact" type="button" data-campaign-tab="${code}" aria-selected="${active ? "true" : "false"}" aria-current="${active ? "true" : "false"}">${escapeHtml(label)}</button>`;
}

function input(name, label, value, type = "text", placeholder = "") {
  return `<label><span>${escapeHtml(label)}</span><input name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value || "")}" placeholder="${escapeHtml(placeholder)}" /></label>`;
}

function textarea(name, label, value, placeholder = "") {
  return `<label class="textarea-field"><span>${escapeHtml(label)}</span><textarea name="${escapeHtml(name)}" placeholder="${escapeHtml(placeholder)}" spellcheck="false">${escapeHtml(value || "")}</textarea></label>`;
}

function select(name, label, value, options, id = "", isDisabled = false) {
  const idAttr = id ? ` id="${escapeHtml(id)}"` : "";
  const disabledAttr = isDisabled ? " disabled" : "";
  const renderedOptions = options.length ? options : [["", "No options"]];
  return `<label><span>${escapeHtml(label)}</span><select name="${escapeHtml(name)}"${idAttr}${disabledAttr}>${renderedOptions.map(([optionValue, optionLabel]) => `<option value="${escapeHtml(optionValue)}" ${String(optionValue) === String(value || "") ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`).join("")}</select></label>`;
}

function check(name, label, checked) {
  return `<label class="check-row"><input name="${escapeHtml(name)}" type="checkbox" ${checked ? "checked" : ""} /><span>${escapeHtml(label)}</span></label>`;
}

function metricLite(label, value) {
  return `<article class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
}

function skeletonList() {
  return `<div class="skeleton-list"><span></span><span></span><span></span></div>`;
}

function skeletonDetail() {
  return `<div class="skeleton-detail"><span></span><span></span></div>`;
}

function disabled(state, key) {
  return state.loading.has(key) ? "disabled" : "";
}

function channelOptions(templates) {
  const channels = [...new Set(templates.map((template) => template.channel).filter(Boolean))];
  const all = channels.length ? channels : ["push", "email", "sms", "waba"];
  return all.map((channel) => [channel, channel]);
}

function statusTone(status) {
  if (["active", "running", "completed"].includes(status)) {
    return "success";
  }
  if (["waiting", "pending"].includes(status)) {
    return "warning";
  }
  if (["failed", "cancelled", "archived"].includes(status)) {
    return "warning";
  }
  return "soft";
}

function readForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function readFormWithChecks(form, checkNames) {
  const values = readForm(form);
  for (const name of checkNames) {
    values[name] = form.elements[name]?.checked === true;
  }
  return values;
}

function formValue(form, name) {
  return String(form.elements[name]?.value || "");
}

function updateCampaign(patch) {
  Object.assign(campaignState, patch);
  setState({});
}

function updateCampaignGroup(group, patch) {
  updateCampaign({ [group]: { ...campaignState[group], ...patch } });
}

function getCampaignViewState() {
  return { ...getState(), campaigns: campaignState };
}

function nextRequest(key) {
  requestSequences[key] += 1;
  return requestSequences[key];
}

function isCurrentRequest(key, requestId) {
  return requestSequences[key] === requestId;
}

function translator(locale) {
  const copy = labels[locale] || labels.en;
  return (key) => copy[key] || labels.en[key] || key;
}

function normalizeError(error) {
  if (error instanceof ApiError) {
    return error;
  }
  return new ApiError({ status: 0, code: "frontend_error", message: error.message || String(error), details: [] });
}

function createKey(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
