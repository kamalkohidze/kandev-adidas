import { ApiError, apiRequest } from "./api.js";
import {
  getState,
  setError,
  setLoading,
  setState
} from "./state.js";
import {
  badge,
  errorBlock,
  escapeHtml,
  formatDate,
  formatDateTime,
  formatMoney,
  formatPercent,
  metric,
  stateBlock
} from "./ui.js";
import {
  buildCrossSellGenerateBody,
  buildLifecycleAuditBody,
  buildSegmentQuery,
  splitCsv
} from "./marketing-utils.js";

const requestSequences = {
  segments: 0,
  segmentDetails: 0,
  lifecycle: 0,
  audit: 0,
  scenarios: 0,
  candidates: 0,
  generate: 0
};

const defaultMarketingBranchId = getState().catalog?.filters?.branch_id || "55555555-5555-4555-8555-555555555555";
const marketingState = {
  activeTab: "segments",
  selectedSegmentCode: null,
  segments: [],
  segmentExplain: null,
  segmentCount: null,
  segmentPreview: null,
  lifecycleResult: null,
  lifecycleAuditResult: null,
  crossSellScenarios: [],
  crossSellCandidates: null,
  crossSellGenerated: null,
  segmentFilters: {
    category_ids: "",
    sport_tags: "",
    size_system: "",
    size_value: "",
    purchase_within_days: "",
    as_of: "",
    limit: "10"
  },
  lifecycle: {
    customer_id: "",
    as_of: ""
  },
  lifecycleAudit: {
    audit_mode: "customer",
    customer_id: "",
    limit: "20",
    as_of: ""
  },
  crossSell: {
    customer_id: "",
    scenario_code: ""
  },
  crossSellGenerate: {
    as_of: "",
    branch_id: defaultMarketingBranchId,
    locale: getState().locale,
    limit: "10",
    scenario_codes: ""
  }
};


const labels = {
  en: {
    title: "Segments & Lifecycle",
    subtitle: "Marketing audience, lifecycle, and cross-sell operations",
    contextCustomer: "Customer",
    contextTenant: "Tenant",
    segments: "Segments",
    audience: "Audience Preview",
    lifecycle: "Lifecycle",
    crossSell: "Cross-sell",
    code: "Code",
    name: "Name",
    criteria: "Criteria",
    filters: "Filters",
    count: "Audience count",
    generatedAt: "Generated",
    preview: "Preview",
    categoryIds: "Category IDs",
    sportTags: "Sport tags",
    sizeSystem: "Size system",
    sizeValue: "Size value",
    purchaseWindow: "Purchase within days",
    asOf: "As of",
    limit: "Limit",
    apply: "Apply",
    customerId: "Customer ID",
    status: "Status",
    activity: "Activity",
    purchases: "Purchases",
    sports: "Sports",
    sizes: "Sizes",
    productTypes: "Product types",
    matched: "Matched criteria",
    lifecycleStatus: "Lifecycle status",
    retentionGap: "Retention gap",
    action: "Action",
    risk: "Risk",
    events: "Events",
    audit: "Audit",
    auditMode: "Audit mode",
    customerMode: "Customer",
    tenantMode: "Tenant-wide",
    runAudit: "Run audit",
    scenarios: "Scenarios",
    candidates: "Candidates",
    scenarioCode: "Scenario code",
    branchId: "Branch ID",
    locale: "Locale",
    scenarioCodes: "Scenario codes",
    loadCandidates: "Load candidates",
    generate: "Generate",
    created: "Created",
    duplicate: "Duplicate",
    evaluated: "Evaluated",
    skipped: "Skipped",
    coupon: "Coupon",
    recommendations: "Recommendations",
    channel: "Channel",
    sourcePurchase: "Source purchase",
    days: "days",
    required: "Required",
    allScenarios: "All scenarios"
  },
  ru: {
    title: "Сегменты и жизненный цикл",
    subtitle: "Аудитории, жизненный цикл и операции кросс-сейла",
    contextCustomer: "Клиент",
    contextTenant: "Тенант",
    segments: "Сегменты",
    audience: "Предпросмотр аудитории",
    lifecycle: "Жизненный цикл",
    crossSell: "Кросс-сейл",
    code: "Код",
    name: "Название",
    criteria: "Критерии",
    filters: "Фильтры",
    count: "Размер аудитории",
    generatedAt: "Сформировано",
    preview: "Предпросмотр",
    categoryIds: "ID категорий",
    sportTags: "Спортивные теги",
    sizeSystem: "Система размеров",
    sizeValue: "Размер",
    purchaseWindow: "Покупка за дни",
    asOf: "На дату",
    limit: "Лимит",
    apply: "Применить",
    customerId: "ID клиента",
    status: "Статус",
    activity: "Активность",
    purchases: "Покупки",
    sports: "Спорт",
    sizes: "Размеры",
    productTypes: "Типы товаров",
    matched: "Совпавшие критерии",
    lifecycleStatus: "Статус жизненного цикла",
    retentionGap: "Разрыв удержания",
    action: "Действие",
    risk: "Риск",
    events: "События",
    audit: "Аудит",
    auditMode: "Режим аудита",
    customerMode: "Клиент",
    tenantMode: "Весь тенант",
    runAudit: "Запустить аудит",
    scenarios: "Сценарии",
    candidates: "Кандидаты",
    scenarioCode: "Код сценария",
    branchId: "ID филиала",
    locale: "Локаль",
    scenarioCodes: "Коды сценариев",
    loadCandidates: "Загрузить кандидатов",
    generate: "Сгенерировать",
    created: "Создано",
    duplicate: "Дубликат",
    evaluated: "Проверено",
    skipped: "Пропущено",
    coupon: "Купон",
    recommendations: "Рекомендации",
    channel: "Канал",
    sourcePurchase: "Исходная покупка",
    days: "дн.",
    required: "Обязательно",
    allScenarios: "Все сценарии"
  },
  kk: {
    title: "Сегменттер және өмірлік цикл",
    subtitle: "Маркетинг аудиториялары, өмірлік цикл және кросс-сейл операциялары",
    contextCustomer: "Клиент",
    contextTenant: "Тенант",
    segments: "Сегменттер",
    audience: "Аудиторияны алдын ала қарау",
    lifecycle: "Өмірлік цикл",
    crossSell: "Кросс-сейл",
    code: "Код",
    name: "Атауы",
    criteria: "Критерийлер",
    filters: "Сүзгілер",
    count: "Аудитория саны",
    generatedAt: "Қалыптастырылды",
    preview: "Алдын ала қарау",
    categoryIds: "Санат ID-лері",
    sportTags: "Спорт тегтері",
    sizeSystem: "Өлшем жүйесі",
    sizeValue: "Өлшем",
    purchaseWindow: "Сатып алу күндері",
    asOf: "Күні",
    limit: "Лимит",
    apply: "Қолдану",
    customerId: "Клиент ID",
    status: "Статус",
    activity: "Белсенділік",
    purchases: "Сатып алулар",
    sports: "Спорт",
    sizes: "Өлшемдер",
    productTypes: "Тауар түрлері",
    matched: "Сәйкес критерийлер",
    lifecycleStatus: "Өмірлік цикл статусы",
    retentionGap: "Ұстап қалу алшақтығы",
    action: "Әрекет",
    risk: "Тәуекел",
    events: "Оқиғалар",
    audit: "Аудит",
    auditMode: "Аудит режимі",
    customerMode: "Клиент",
    tenantMode: "Барлық тенант",
    runAudit: "Аудитті іске қосу",
    scenarios: "Сценарийлер",
    candidates: "Кандидаттар",
    scenarioCode: "Сценарий коды",
    branchId: "Филиал ID",
    locale: "Локаль",
    scenarioCodes: "Сценарий кодтары",
    loadCandidates: "Кандидаттарды жүктеу",
    generate: "Қалыптастыру",
    created: "Құрылды",
    duplicate: "Дубликат",
    evaluated: "Тексерілді",
    skipped: "Өткізілді",
    coupon: "Купон",
    recommendations: "Ұсынымдар",
    channel: "Арна",
    sourcePurchase: "Бастапқы сатып алу",
    days: "күн",
    required: "Міндетті",
    allScenarios: "Барлық сценарийлер"
  }
};

export async function loadMarketingWorkspace() {
  await Promise.all([loadSegments(), loadScenarios()]);
  await Promise.all([loadSegmentDetails(), loadLifecycle(), loadCrossSellCandidates()]);
}

export async function refreshMarketingWorkspace() {
  await loadMarketingWorkspace();
}

export function syncMarketingLocale(locale) {
  updateMarketingGroup("crossSell", { locale });
  updateMarketingGroup("crossSellGenerate", { locale });
}

export function wireMarketingEvents() {
  document.addEventListener("click", async (event) => {
    const tab = event.target.closest("[data-marketing-tab]");
    if (tab) {
      updateMarketing({ activeTab: tab.dataset.marketingTab });
      return;
    }

    const segmentButton = event.target.closest("[data-segment-code]");
    if (segmentButton) {
      updateMarketing({ selectedSegmentCode: segmentButton.dataset.segmentCode });
      await loadSegmentDetails();
    }
  });

  document.addEventListener("submit", async (event) => {
    if (event.target.id === "marketingSegmentFilterForm") {
      event.preventDefault();
      updateMarketingGroup("segmentFilters", readForm(event.target));
      await loadSegmentDetails();
    }
    if (event.target.id === "marketingLifecycleForm") {
      event.preventDefault();
      updateMarketingGroup("lifecycle", readForm(event.target));
      await loadLifecycle();
    }
    if (event.target.id === "marketingLifecycleAuditForm") {
      event.preventDefault();
      updateMarketingGroup("lifecycleAudit", readForm(event.target));
      await auditLifecycle();
    }
    if (event.target.id === "marketingCrossSellFilterForm") {
      event.preventDefault();
      updateMarketingGroup("crossSell", readForm(event.target));
      await loadCrossSellCandidates();
    }
    if (event.target.id === "marketingCrossSellGenerateForm") {
      event.preventDefault();
      updateMarketingGroup("crossSellGenerate", readForm(event.target));
      await generateCrossSellCandidates();
    }
  });
}

export function renderMarketingWorkspace(container, t) {
  const state = getMarketingViewState();
  const marketing = state.marketing;
  const text = translator(state.locale);
  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="panel-heading">
      <div>
        <h2>${escapeHtml(text("title"))}</h2>
        <p>${escapeHtml(text("subtitle"))}</p>
      </div>
      <div class="marketing-context" aria-label="Marketing context">
        ${badge(`${text("contextCustomer")}: ${state.customerId || "-"}`, "soft")}
        ${badge(`${text("locale")}: ${state.locale}`, "neutral")}
        ${state.tenantId ? badge(`${text("contextTenant")}: ${state.tenantId}`, "soft") : ""}
      </div>
    </div>
    <div class="segmented-control marketing-tabs" role="tablist">
      ${marketingTab("segments", text("segments"), marketing.activeTab)}
      ${marketingTab("audience", text("audience"), marketing.activeTab)}
      ${marketingTab("lifecycle", text("lifecycle"), marketing.activeTab)}
      ${marketingTab("crossSell", text("crossSell"), marketing.activeTab)}
    </div>
    <div class="marketing-view detail-fade">
      ${renderActiveMarketingTab({ state, text, t })}
    </div>
  `;
}

async function loadSegments() {
  const requestId = nextRequest("segments");
  setLoading("marketingSegments", true);
  setError("marketingSegments", null);
  try {
    const result = await apiRequest("/api/v1/marketing/segments", { locale: getState().locale });
    if (!isCurrentRequest("segments", requestId)) {
      return;
    }
    const segments = result?.data || [];
    const selectedSegmentCode = marketingState.selectedSegmentCode || segments[0]?.code || null;
    updateMarketing({ segments, selectedSegmentCode });
  } catch (error) {
    setError("marketingSegments", normalizeError(error));
  } finally {
    setLoading("marketingSegments", false);
  }
}

async function loadSegmentDetails() {
  const state = getMarketingViewState();
  const segmentCode = state.marketing.selectedSegmentCode;
  if (!segmentCode) {
    return;
  }

  const requestId = nextRequest("segmentDetails");
  const query = buildSegmentQuery(state.marketing.segmentFilters, state.locale);
  const suffix = query ? `?${query}` : "";
  setLoading("marketingSegmentDetails", true);
  setError("marketingSegmentDetails", null);
  try {
    const [explain, count, preview] = await Promise.all([
      apiRequest(`/api/v1/marketing/segments/${encodeURIComponent(segmentCode)}/explain${suffix}`, { locale: state.locale }),
      apiRequest(`/api/v1/marketing/segments/${encodeURIComponent(segmentCode)}/count${suffix}`, { locale: state.locale }),
      apiRequest(`/api/v1/marketing/segments/${encodeURIComponent(segmentCode)}/preview${suffix}`, { locale: state.locale })
    ]);
    if (!isCurrentRequest("segmentDetails", requestId)) {
      return;
    }
    updateMarketing({ segmentExplain: explain, segmentCount: count, segmentPreview: preview });
  } catch (error) {
    setError("marketingSegmentDetails", normalizeError(error));
  } finally {
    setLoading("marketingSegmentDetails", false);
  }
}

async function loadLifecycle() {
  const state = getMarketingViewState();
  const lifecycle = state.marketing.lifecycle;
  const customerId = lifecycle.customer_id || state.customerId;
  if (!customerId) {
    setError("marketingLifecycle", missingCustomerError());
    return;
  }

  const requestId = nextRequest("lifecycle");
  const params = new URLSearchParams();
  if (lifecycle.as_of) {
    params.set("as_of", lifecycle.as_of);
  }
  params.set("locale", state.locale);
  setLoading("marketingLifecycle", true);
  setError("marketingLifecycle", null);
  try {
    const result = await apiRequest(`/api/v1/marketing/lifecycle/${encodeURIComponent(customerId)}?${params.toString()}`, {
      locale: state.locale
    });
    if (!isCurrentRequest("lifecycle", requestId)) {
      return;
    }
    updateMarketing({ lifecycleResult: result });
  } catch (error) {
    setError("marketingLifecycle", normalizeError(error));
  } finally {
    setLoading("marketingLifecycle", false);
  }
}

async function auditLifecycle() {
  const state = getMarketingViewState();
  const body = buildLifecycleAuditBody(state.marketing.lifecycleAudit, state.customerId);
  const requestId = nextRequest("audit");
  setLoading("marketingLifecycleAudit", true);
  setError("marketingLifecycleAudit", null);
  try {
    const result = await apiRequest(`/api/v1/marketing/lifecycle/audit?locale=${encodeURIComponent(state.locale)}`, {
      method: "POST",
      locale: state.locale,
      idempotencyKey: createKey("lifecycle-audit"),
      body
    });
    if (!isCurrentRequest("audit", requestId)) {
      return;
    }
    updateMarketing({ lifecycleAuditResult: result });
  } catch (error) {
    setError("marketingLifecycleAudit", normalizeError(error));
  } finally {
    setLoading("marketingLifecycleAudit", false);
  }
}

async function loadScenarios() {
  const requestId = nextRequest("scenarios");
  setLoading("marketingScenarios", true);
  setError("marketingScenarios", null);
  try {
    const result = await apiRequest("/api/v1/marketing/cross-sell/scenarios", { locale: getState().locale });
    if (!isCurrentRequest("scenarios", requestId)) {
      return;
    }
    const scenarios = result?.data || [];
    const current = marketingState.crossSell.scenario_code;
    updateMarketing({
      crossSellScenarios: scenarios,
      crossSell: {
        ...marketingState.crossSell,
        scenario_code: current || scenarios[0]?.code || ""
      }
    });
  } catch (error) {
    setError("marketingScenarios", normalizeError(error));
  } finally {
    setLoading("marketingScenarios", false);
  }
}

async function loadCrossSellCandidates() {
  const state = getMarketingViewState();
  const controls = state.marketing.crossSell;
  const params = new URLSearchParams();
  const customerId = controls.customer_id || state.customerId;
  if (customerId) {
    params.set("customer_id", customerId);
  }
  if (controls.scenario_code) {
    params.set("scenario_code", controls.scenario_code);
  }
  params.set("locale", state.locale);

  const requestId = nextRequest("candidates");
  setLoading("marketingCandidates", true);
  setError("marketingCandidates", null);
  try {
    const result = await apiRequest(`/api/v1/marketing/cross-sell/candidates?${params.toString()}`, {
      locale: state.locale
    });
    if (!isCurrentRequest("candidates", requestId)) {
      return;
    }
    updateMarketing({ crossSellCandidates: result });
  } catch (error) {
    setError("marketingCandidates", normalizeError(error));
  } finally {
    setLoading("marketingCandidates", false);
  }
}

async function generateCrossSellCandidates() {
  const state = getMarketingViewState();
  const body = buildCrossSellGenerateBody(state.marketing.crossSellGenerate, state.locale);
  const requestId = nextRequest("generate");
  setLoading("marketingGenerate", true);
  setError("marketingGenerate", null);
  try {
    const result = await apiRequest(`/api/v1/marketing/cross-sell/candidates?locale=${encodeURIComponent(state.locale)}`, {
      method: "POST",
      locale: state.locale,
      idempotencyKey: createKey("cross-sell"),
      body
    });
    if (!isCurrentRequest("generate", requestId)) {
      return;
    }
    updateMarketing({ crossSellGenerated: result });
    await loadCrossSellCandidates();
  } catch (error) {
    setError("marketingGenerate", normalizeError(error));
  } finally {
    setLoading("marketingGenerate", false);
  }
}

function renderActiveMarketingTab({ state, text, t }) {
  if (state.marketing.activeTab === "audience") {
    return renderAudienceTab(state, text, t);
  }
  if (state.marketing.activeTab === "lifecycle") {
    return renderLifecycleTab(state, text, t);
  }
  if (state.marketing.activeTab === "crossSell") {
    return renderCrossSellTab(state, text, t);
  }
  return renderSegmentsTab(state, text, t);
}

function renderSegmentsTab(state, text, t) {
  return `
    <div class="workspace-grid marketing-layout">
      <article class="surface">
        <div class="section-title-row">
          <h3>${escapeHtml(text("segments"))}</h3>
          ${badge(String(state.marketing.segments.length), "sky")}
        </div>
        ${renderSegmentList(state, text, t)}
      </article>
      <article class="surface">
        ${renderSegmentInsight(state, text, t)}
      </article>
    </div>
  `;
}

function renderAudienceTab(state, text, t) {
  return `
    <div class="workspace-grid">
      <article class="surface">
        <div class="section-title-row">
          <h3>${escapeHtml(text("filters"))}</h3>
          ${state.marketing.selectedSegmentCode ? badge(state.marketing.selectedSegmentCode, "lavender") : ""}
        </div>
        ${renderSegmentFilterForm(state, text)}
      </article>
      <article class="surface">
        <div class="section-title-row">
          <h3>${escapeHtml(text("audience"))}</h3>
          ${state.marketing.segmentCount ? badge(String(state.marketing.segmentCount.count), "success") : ""}
        </div>
        ${state.errors.marketingSegmentDetails ? errorBlock(state.errors.marketingSegmentDetails, t("error.title")) : ""}
        ${state.loading.has("marketingSegmentDetails") ? stateBlock("loading", t("status.loading")) : renderAudiencePreview(state, text, t, false)}
      </article>
    </div>
  `;
}

function renderLifecycleTab(state, text, t) {
  return `
    <div class="grid two">
      <article class="surface">
        <h3>${escapeHtml(text("lifecycle"))}</h3>
        ${renderLifecycleForm(state, text)}
        ${state.errors.marketingLifecycle ? errorBlock(state.errors.marketingLifecycle, t("error.title")) : ""}
        ${state.loading.has("marketingLifecycle") ? stateBlock("loading", t("status.loading")) : renderLifecycleResult(state, text, t)}
      </article>
      <article class="surface">
        <h3>${escapeHtml(text("audit"))}</h3>
        ${renderLifecycleAuditForm(state, text)}
        ${state.errors.marketingLifecycleAudit ? errorBlock(state.errors.marketingLifecycleAudit, t("error.title")) : ""}
        ${state.loading.has("marketingLifecycleAudit") ? stateBlock("loading", t("status.loading")) : renderLifecycleAuditResult(state, text, t)}
      </article>
    </div>
  `;
}

function renderCrossSellTab(state, text, t) {
  return `
    <div class="workspace-grid marketing-cross-sell">
      <article class="surface">
        <div class="section-title-row">
          <h3>${escapeHtml(text("scenarios"))}</h3>
          ${badge(String(state.marketing.crossSellScenarios.length), "coral")}
        </div>
        ${renderScenarioList(state, text, t)}
      </article>
      <article class="surface">
        <h3>${escapeHtml(text("candidates"))}</h3>
        ${renderCrossSellFilterForm(state, text)}
        ${state.errors.marketingCandidates ? errorBlock(state.errors.marketingCandidates, t("error.title")) : ""}
        ${state.loading.has("marketingCandidates") ? stateBlock("loading", t("status.loading")) : renderCandidates(state, text, t)}
      </article>
      <article class="surface">
        <h3>${escapeHtml(text("generate"))}</h3>
        ${renderCrossSellGenerateForm(state, text)}
        ${state.errors.marketingGenerate ? errorBlock(state.errors.marketingGenerate, t("error.title")) : ""}
        ${state.loading.has("marketingGenerate") ? stateBlock("loading", t("status.loading")) : renderGenerated(state, text, t)}
      </article>
    </div>
  `;
}

function renderSegmentList(state, text, t) {
  if (state.loading.has("marketingSegments")) {
    return stateBlock("loading", t("status.loading"));
  }
  if (state.errors.marketingSegments) {
    return errorBlock(state.errors.marketingSegments, t("error.title"));
  }
  if (!state.marketing.segments.length) {
    return stateBlock("empty", t("empty.noData"));
  }
  return `<div class="marketing-list">${state.marketing.segments.map((segment) => {
    const active = segment.code === state.marketing.selectedSegmentCode;
    return `
      <button class="product-row marketing-list-row ${active ? "active" : ""}" type="button" data-segment-code="${escapeHtml(segment.code)}" aria-current="${active ? "true" : "false"}">
        <span>
          <strong>${escapeHtml(segment.title || segment.name || segment.code)}</strong>
          <small><code>${escapeHtml(segment.code)}</code> ${escapeHtml(segment.description || "")}</small>
        </span>
        <span class="variant-count">${escapeHtml(criteriaSummary(segment.criteria))}</span>
      </button>
    `;
  }).join("")}</div>`;
}

function renderSegmentInsight(state, text, t) {
  if (!state.marketing.selectedSegmentCode) {
    return stateBlock("empty", t("empty.noData"));
  }
  if (state.errors.marketingSegmentDetails) {
    return errorBlock(state.errors.marketingSegmentDetails, t("error.title"));
  }
  if (state.loading.has("marketingSegmentDetails")) {
    return stateBlock("loading", t("status.loading"));
  }

  const explain = state.marketing.segmentExplain;
  const count = state.marketing.segmentCount;
  return `
    <div class="section-title-row">
      <div>
        <h3>${escapeHtml(explain?.title || state.marketing.selectedSegmentCode)}</h3>
        <p class="muted">${escapeHtml(explain?.description || "")}</p>
      </div>
      ${badge(state.marketing.selectedSegmentCode, "lavender")}
    </div>
    <div class="metrics-grid marketing-metrics">
      ${metric(text("count"), count ? String(count.count) : "-", "mint")}
      ${metric(text("generatedAt"), count?.generated_at ? formatDateTime(count.generated_at, state.locale) : "-", "sky")}
      ${metric(text("criteria"), criteriaSummary(explain?.criteria), "coral")}
      ${metric(text("filters"), filtersSummary(explain?.filters), "lavender")}
    </div>
    ${renderCriteria(explain?.criteria, text)}
    <h4 class="subhead">${escapeHtml(text("preview"))}</h4>
    ${renderAudiencePreview(state, text, t, true)}
  `;
}

function renderSegmentFilterForm(state, text) {
  const filters = state.marketing.segmentFilters;
  return `
    <form id="marketingSegmentFilterForm" class="form-grid filters-grid compact-filters">
      ${input("category_ids", text("categoryIds"), filters.category_ids, "text", "bbbb...,cccc...")}
      ${input("sport_tags", text("sportTags"), filters.sport_tags, "text", "running,football")}
      ${input("size_system", text("sizeSystem"), filters.size_system, "text", "UK")}
      ${input("size_value", text("sizeValue"), filters.size_value, "text", "10")}
      ${input("purchase_within_days", text("purchaseWindow"), filters.purchase_within_days, "number", "183")}
      ${input("as_of", text("asOf"), filters.as_of, "datetime-local")}
      ${input("limit", text("limit"), filters.limit, "number")}
      <button class="primary" type="submit">${escapeHtml(text("apply"))}</button>
    </form>
  `;
}

function renderAudiencePreview(state, text, t, compact) {
  const preview = state.marketing.segmentPreview;
  if (!preview?.data?.length) {
    return stateBlock("empty", t("empty.noData"));
  }
  const rows = preview.data.map((item) => [
    `<code>${escapeHtml(item.customer_id)}</code>`,
    `${badge(item.status || "-", "success")} ${badge(item.lifecycle_status || "-", lifecycleTone(item.lifecycle_status))}`,
    escapeHtml(activitySummary(item.activity, state.locale)),
    escapeHtml(purchaseSummary(item.purchases, state.locale)),
    renderPills(combineAudienceSports(item)),
    escapeHtml(sizeSummary(item.size_profile, item.purchases?.sizes)),
    renderPills(item.purchases?.product_types || []),
    compact ? renderPills((item.matched_criteria || []).map((criterion) => criterion.code || criterion.type)) : renderMatchedCriteria(item.matched_criteria)
  ]);
  return responsiveTable(
    [
      text("customerId"),
      text("status"),
      text("activity"),
      text("purchases"),
      text("sports"),
      text("sizes"),
      text("productTypes"),
      text("matched")
    ],
    compact ? rows.slice(0, 5) : rows,
    t("empty.noData")
  );
}

function renderLifecycleForm(state, text) {
  const lifecycle = state.marketing.lifecycle;
  return `
    <form id="marketingLifecycleForm" class="form-grid">
      ${input("customer_id", text("customerId"), lifecycle.customer_id || state.customerId || "")}
      ${input("as_of", text("asOf"), lifecycle.as_of, "datetime-local")}
      <button class="primary sky" type="submit">${escapeHtml(text("apply"))}</button>
    </form>
  `;
}

function renderLifecycleResult(state, text, t) {
  const result = state.marketing.lifecycleResult;
  if (!result) {
    return stateBlock("empty", t("empty.noData"));
  }
  return `
    <div class="result-card sky-fade marketing-result">
      <div class="section-title-row">
        <h4>${badge(result.lifecycle_status, lifecycleTone(result.lifecycle_status))}</h4>
        <span class="muted">${escapeHtml(formatDateTime(result.as_of, state.locale))}</span>
      </div>
      <div class="mini-metrics">
        ${metric(text("activity"), daysText(result.activity?.days_since_last_activity, text), "sky")}
        ${metric(text("retentionGap"), formatMoney(result.retention_risk?.retention_gap_amount, result.retention_risk?.currency || "KZT", state.locale), result.retention_risk?.at_risk ? "coral" : "mint")}
        ${metric(text("action"), result.recommended_action?.code || "-", "lavender")}
      </div>
      <dl class="detail-list compact">
        <div><dt>${escapeHtml(text("customerId"))}</dt><dd><code>${escapeHtml(result.customer_id)}</code></dd></div>
        <div><dt>${escapeHtml(text("activity"))}</dt><dd>${escapeHtml(activitySummary(result.activity, state.locale))}</dd></div>
        <div><dt>${escapeHtml(text("purchases"))}</dt><dd>${escapeHtml(lifecyclePurchaseSummary(result.purchases, state.locale))}</dd></div>
        <div><dt>${escapeHtml(text("risk"))}</dt><dd>${badge(result.retention_risk?.risk_level || "none", result.retention_risk?.at_risk ? "warning" : "success")}</dd></div>
        <div><dt>${escapeHtml(text("action"))}</dt><dd>${escapeHtml(actionSummary(result.recommended_action))}</dd></div>
      </dl>
    </div>
  `;
}

function renderLifecycleAuditForm(state, text) {
  const audit = state.marketing.lifecycleAudit;
  return `
    <form id="marketingLifecycleAuditForm" class="form-grid">
      <label>
        <span>${escapeHtml(text("auditMode"))}</span>
        <select name="audit_mode">
          <option value="customer" ${audit.audit_mode === "customer" ? "selected" : ""}>${escapeHtml(text("customerMode"))}</option>
          <option value="tenant" ${audit.audit_mode === "tenant" ? "selected" : ""}>${escapeHtml(text("tenantMode"))}</option>
        </select>
      </label>
      ${input("customer_id", text("customerId"), audit.customer_id || state.customerId || "")}
      ${input("limit", text("limit"), audit.limit, "number")}
      ${input("as_of", text("asOf"), audit.as_of, "datetime-local")}
      <button class="primary lavender" type="submit">${escapeHtml(text("runAudit"))}</button>
    </form>
  `;
}

function renderLifecycleAuditResult(state, text, t) {
  const result = state.marketing.lifecycleAuditResult;
  if (!result) {
    return stateBlock("empty", t("empty.noData"));
  }
  const lifecycleItems = result.data || (result.lifecycle ? [result.lifecycle] : []);
  const lifecycleRows = lifecycleItems.map((item) => [
    `<code>${escapeHtml(item.customer_id)}</code>`,
    badge(item.lifecycle_status, lifecycleTone(item.lifecycle_status)),
    escapeHtml(daysText(item.activity?.days_since_last_activity, text)),
    escapeHtml(item.recommended_action?.code || "-"),
    badge(item.retention_risk?.risk_level || "none", item.retention_risk?.at_risk ? "warning" : "success")
  ]);
  return `
    <div class="result-card lavender-fade marketing-result">
      <div class="mini-metrics">
        ${metric(text("evaluated"), String(result.evaluated ?? lifecycleRows.length), "sky")}
        ${metric(text("events"), String((result.events || []).length), "mint")}
        ${metric(text("risk"), String(lifecycleItems.filter((item) => item.retention_risk?.at_risk).length), "coral")}
      </div>
      ${responsiveTable([text("customerId"), text("lifecycleStatus"), text("activity"), text("action"), text("risk")], lifecycleRows, t("empty.noData"))}
      ${renderEventRows(result.events || [], text)}
    </div>
  `;
}

function renderScenarioList(state, text, t) {
  if (state.loading.has("marketingScenarios")) {
    return stateBlock("loading", t("status.loading"));
  }
  if (state.errors.marketingScenarios) {
    return errorBlock(state.errors.marketingScenarios, t("error.title"));
  }
  if (!state.marketing.crossSellScenarios.length) {
    return stateBlock("empty", t("empty.noData"));
  }
  return `<div class="marketing-list">${state.marketing.crossSellScenarios.map((scenario, index) => `
    <article class="recommendation-card scenario-card tone-${index % 3}">
      <div class="section-title-row">
        <h4>${escapeHtml(scenario.code)}</h4>
        ${badge(scenario.coupon ? text("coupon") : "-", scenario.coupon ? "success" : "neutral")}
      </div>
      <div class="row-meta">
        ${badge(scenario.journey_code, "soft")}
        ${badge(scenario.campaign_code, "soft")}
        ${scenario.trigger_product ? badge(scenario.trigger_product, "mint") : ""}
        ${scenario.trigger_sport ? badge(scenario.trigger_sport, "sky") : ""}
      </div>
      <dl class="detail-list compact">
        <div><dt>${escapeHtml(text("sourcePurchase"))}</dt><dd>${escapeHtml(windowSummary(scenario, text))}</dd></div>
        <div><dt>${escapeHtml(text("recommendations"))}</dt><dd>${escapeHtml(`${scenario.recommendation} / ${scenario.recommendation_limit}`)}</dd></div>
      </dl>
    </article>
  `).join("")}</div>`;
}

function renderCrossSellFilterForm(state, text) {
  const controls = state.marketing.crossSell;
  return `
    <form id="marketingCrossSellFilterForm" class="form-grid filters-grid">
      ${input("customer_id", text("customerId"), controls.customer_id || state.customerId || "")}
      <label>
        <span>${escapeHtml(text("scenarioCode"))}</span>
        <select name="scenario_code">
          <option value="">${escapeHtml(text("allScenarios"))}</option>
          ${scenarioOptions(state.marketing.crossSellScenarios, controls.scenario_code)}
        </select>
      </label>
      <button class="primary coral" type="submit">${escapeHtml(text("loadCandidates"))}</button>
    </form>
  `;
}

function renderCrossSellGenerateForm(state, text) {
  const controls = state.marketing.crossSellGenerate;
  return `
    <form id="marketingCrossSellGenerateForm" class="form-grid filters-grid">
      ${input("as_of", text("asOf"), controls.as_of, "datetime-local")}
      ${input("branch_id", text("branchId"), controls.branch_id)}
      <label>
        <span>${escapeHtml(text("locale"))}</span>
        <select name="locale">
          ${["kk", "ru", "en"].map((locale) => `<option value="${locale}" ${locale === controls.locale ? "selected" : ""}>${locale.toUpperCase()}</option>`).join("")}
        </select>
      </label>
      ${input("limit", text("limit"), controls.limit, "number")}
      ${input("scenario_codes", text("scenarioCodes"), controls.scenario_codes, "text", "shoe-care-after-purchase")}
      <button class="primary" type="submit">${escapeHtml(text("generate"))}</button>
    </form>
  `;
}

function renderCandidates(state, text, t) {
  const result = state.marketing.crossSellCandidates;
  if (!result?.data?.length) {
    return stateBlock("empty", t("empty.noData"));
  }
  return `<div class="candidate-stack marketing-result">${result.data.map((candidate) => renderCandidate(candidate, state, text)).join("")}</div>`;
}

function renderGenerated(state, text, t) {
  const result = state.marketing.crossSellGenerated;
  if (!result) {
    return stateBlock("empty", t("empty.noData"));
  }
  return `
    <div class="result-card mint-fade marketing-result">
      <div class="mini-metrics">
        ${metric(text("created"), String(result.created || 0), "mint")}
        ${metric(text("duplicate"), String(result.duplicate_count || 0), "warning")}
        ${metric(text("evaluated"), String(result.evaluated || 0), "sky")}
      </div>
      ${result.skipped?.length ? `<h4 class="subhead">${escapeHtml(text("skipped"))}</h4>${renderPills(result.skipped.map((item) => `${item.customer_id}: ${item.reason}`))}` : ""}
      <div class="candidate-stack">${(result.data || []).map((candidate) => renderCandidate(candidate, state, text)).join("")}</div>
    </div>
  `;
}

function renderCandidate(candidate, state, text) {
  return `
    <article class="recommendation-card candidate-card">
      <div class="section-title-row">
        <h4><code>${escapeHtml(candidate.customer_id)}</code></h4>
        ${badge(candidate.scenario_code, "lavender")}
      </div>
      <div class="row-meta">
        ${badge(candidate.status, "success")}
        ${badge(candidate.channel || "-", "sky")}
        ${badge(`${candidate.days_since_source_purchase} ${text("days")}`, "soft")}
        ${candidate.coupon ? badge(`${text("coupon")}: ${candidate.coupon.code}`, "coral") : ""}
      </div>
      <dl class="detail-list compact">
        <div><dt>${escapeHtml(text("sourcePurchase"))}</dt><dd>${escapeHtml(formatDateTime(candidate.source_purchase_at, state.locale))}</dd></div>
        <div><dt>${escapeHtml(text("action"))}</dt><dd>${escapeHtml(candidate.journey_code)} / ${escapeHtml(candidate.campaign_code)}</dd></div>
      </dl>
      ${renderRecommendationItems(candidate.recommendation_set?.data || candidate.message_blocks?.blocks || [], state)}
    </article>
  `;
}

function renderRecommendationItems(items, state) {
  if (!items.length) {
    return "";
  }
  return `<div class="message-blocks">${items.slice(0, 6).map((item) => `
    <article>
      <strong>${escapeHtml(item.title || item.display_name || item.name?.[state.locale] || item.name?.en || item.sku || item.variant_sku || item.product_id)}</strong>
      <span>${escapeHtml([item.sku, item.variant_sku, item.product_type, formatSize(item.size)].filter(Boolean).join(" / "))}</span>
      <span>${escapeHtml(formatItemPrice(item, state.locale))}</span>
    </article>
  `).join("")}</div>`;
}

function renderCriteria(criteria, text) {
  const required = criteria?.required_filters || [];
  const all = criteria?.all || [];
  if (!required.length && !all.length) {
    return "";
  }
  return `
    <div class="criteria-panel">
      <div class="row-meta">
        ${all.map((criterion) => badge(criteriaItemSummary(criterion), "soft")).join("")}
        ${required.map((filter) => badge(`${text("required")}: ${filter}`, "warning")).join("")}
      </div>
    </div>
  `;
}

function renderEventRows(events, text) {
  if (!events.length) {
    return "";
  }
  return `
    <h4 class="subhead">${escapeHtml(text("events"))}</h4>
    <div class="event-row">
      ${events.map((event) => badge(`${event.event_type}: ${event.aggregate_id}`, "soft")).join("")}
    </div>
  `;
}

function responsiveTable(headers, rows, emptyText) {
  if (!rows.length) {
    return stateBlock("empty", emptyText);
  }
  return `<div class="responsive-table"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell, index) => `<td data-label="${escapeHtml(headers[index])}">${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function marketingTab(code, label, activeTab) {
  const active = code === activeTab;
  return `<button class="secondary compact" type="button" data-marketing-tab="${code}" aria-selected="${active ? "true" : "false"}" aria-current="${active ? "true" : "false"}">${escapeHtml(label)}</button>`;
}

function scenarioOptions(scenarios, selected) {
  return scenarios.map((scenario) => `<option value="${escapeHtml(scenario.code)}" ${scenario.code === selected ? "selected" : ""}>${escapeHtml(scenario.code)}</option>`).join("");
}

function input(name, label, value, type = "text", placeholder = "") {
  return `<label><span>${escapeHtml(label)}</span><input name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value || "")}" placeholder="${escapeHtml(placeholder)}" /></label>`;
}

function readForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function updateMarketing(patch) {
  Object.assign(marketingState, patch);
  setState({});
}

function updateMarketingGroup(group, patch) {
  updateMarketing({ [group]: { ...marketingState[group], ...patch } });
}

function getMarketingViewState() {
  return { ...getState(), marketing: marketingState };
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

function criteriaSummary(criteria = {}) {
  const all = criteria?.all || [];
  if (!all.length) {
    return "-";
  }
  return all.map((criterion) => criterion.type).join(" + ");
}

function criteriaItemSummary(criterion = {}) {
  const details = Object.entries(criterion)
    .filter(([key]) => key !== "type")
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ");
  return details ? `${criterion.type} (${details})` : criterion.type || "-";
}

function filtersSummary(filters = {}) {
  const parts = Object.entries(filters || {})
    .filter(([, value]) => value !== null && value !== "" && (!Array.isArray(value) || value.length > 0))
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(",") : value}`);
  return parts.join(" / ") || "-";
}

function activitySummary(activity = {}, locale = "ru") {
  const type = activity?.last_type || "-";
  const date = activity?.last_at ? formatDateTime(activity.last_at, locale) : "-";
  const days = activity?.days_since_last_activity ?? "-";
  return `${type} / ${date} / ${days}d`;
}

function purchaseSummary(purchases = {}, locale = "ru") {
  const count = purchases?.completed_purchase_count ?? 0;
  const last = purchases?.last_purchase_at ? formatDate(purchases.last_purchase_at, locale) : "-";
  return `${count} / ${last}`;
}

function lifecyclePurchaseSummary(purchases = {}, locale = "ru") {
  const last = purchases?.last_purchase_at ? formatDateTime(purchases.last_purchase_at, locale) : "-";
  const days = purchases?.days_since_last_purchase ?? "-";
  return `${last} / ${days}d`;
}

function actionSummary(action = {}) {
  return [action.code, action.priority, action.reason].filter(Boolean).join(" / ") || "-";
}

function sizeSummary(sizeProfile = {}, purchaseSizes = []) {
  const shoe = sizeProfile?.shoe || {};
  const apparel = sizeProfile?.apparel || {};
  const profile = [
    shoe.uk ? `UK ${shoe.uk}` : "",
    shoe.us ? `US ${shoe.us}` : "",
    shoe.eu ? `EU ${shoe.eu}` : "",
    apparel.top ? `Top ${apparel.top}` : "",
    apparel.bottom ? `Bottom ${apparel.bottom}` : ""
  ].filter(Boolean);
  return [...profile, ...(purchaseSizes || [])].join(", ") || "-";
}

function combineAudienceSports(item = {}) {
  return [...(item.favorite_sports || []), ...(item.purchases?.sport_tags || [])];
}

function renderMatchedCriteria(criteria = []) {
  return renderPills(criteria.map((criterion) => criterion.code || criterion.type || criterion.reason || JSON.stringify(criterion)));
}

function renderPills(items = []) {
  const unique = [...new Set(items.filter(Boolean))];
  if (!unique.length) {
    return badge("-", "soft");
  }
  return `<span class="row-meta">${unique.map((item) => badge(item, "soft")).join("")}</span>`;
}

function lifecycleTone(status) {
  if (status === "active") {
    return "success";
  }
  if (status === "new") {
    return "sky";
  }
  if (status === "sleeping") {
    return "warning";
  }
  if (status === "gone") {
    return "neutral";
  }
  return "soft";
}

function daysText(value, text) {
  return value === null || value === undefined ? "-" : `${value} ${text("days")}`;
}

function windowSummary(scenario, text) {
  const min = scenario.min_days_since_purchase ?? 0;
  const max = scenario.max_days_since_purchase ?? "+";
  return `${min}-${max} ${text("days")}`;
}

function formatSize(size = {}) {
  return [size.system, size.value].filter(Boolean).join(" ");
}

function formatItemPrice(item, locale) {
  const price = item.price || item.current_price || item.list_price;
  if (price?.amount) {
    return formatMoney(price.amount, price.currency || "KZT", locale);
  }
  return "";
}

function missingCustomerError() {
  return new ApiError({
    status: 0,
    code: "frontend_validation",
    message: "Customer ID is required",
    details: [{ field: "customer_id", reason: "required" }]
  });
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
