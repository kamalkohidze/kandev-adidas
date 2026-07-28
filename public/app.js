import { ApiError, apiRequest } from "./api.js";
import {
  getState,
  setActiveSection,
  setCustomerContext,
  setError,
  setLoading,
  setLocale,
  setResult,
  setState,
  subscribe,
  updateUi
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
  stateBlock,
  table
} from "./ui.js";

const sections = ["overview", "customer", "pos", "promotions"];
const storageKeyCoupon = "last-issued-coupon-code";
const seedItems = [
  {
    sku: "RUN-SHOE-001-UK10",
    barcode: "4870000000012",
    name: "Football boots",
    product_variant_id: "88888888-8888-4888-8888-888888888888",
    quantity: "1",
    unit_price: "79990.00",
    sport_tags: ["football"]
  },
  {
    sku: "SALE-JACKET-001-M",
    barcode: "4870000000013",
    name: "Sale jacket",
    product_variant_id: "88888888-8888-4888-8888-888888888889",
    quantity: "1",
    unit_price: "59990.00",
    sport_tags: ["training"],
    applied_discounts: [{ type: "global_sale", code: "SALE-20", amount: "12000.00", stackable: false }]
  }
];

const localCopy = {
  kk: {
    "app.title": "UCO CRM",
    "app.subtitle": "Headless retail loyalty платформасы",
    "label.language": "Тіл",
    "nav.overview": "Шолу",
    "nav.customer360": "Клиент 360",
    "nav.posLoyalty": "POS/Адалдық",
    "nav.promotions": "Промо",
    "overview.title": "Операциялық шолу",
    "overview.subtitle": "Backend API, модульдер және негізгі клиент деректері",
    "overview.health": "Backend",
    "overview.modules": "Модульдер",
    "overview.customer": "Клиент",
    "overview.generated": "Жаңартылды",
    "aria.sections": "Бөлімдер",
    "aria.dashboardSections": "Dashboard бөлімдері",
    "customer.title": "Клиент 360",
    "customer.profile": "Профиль",
    "customer.wallet": "Wallet card",
    "customer.identities": "Идентификаторлар",
    "customer.history": "Сатып алу тарихы",
    "customer.favoriteSports": "Сүйікті спорт",
    "customer.sizes": "Өлшемдер",
    "customer.status": "Статус",
    "customer.lastActivity": "Соңғы белсенділік",
    "pos.title": "POS/Loyalty demo",
    "pos.evaluate": "Жеңілдікті есептеу",
    "pos.ingest": "Транзакция жіберу",
    "pos.includeBlocked": "Sale jacket жолын қосу",
    "promotions.title": "Promotions",
    "promotions.issue": "Купон беру",
    "promotions.validate": "Тексеру",
    "promotions.redeem": "Өтеу",
    "action.evaluate": "Есептеу",
    "action.submit": "Жіберу",
    "action.issue": "Беру",
    "action.validate": "Тексеру",
    "action.redeem": "Өтеу",
    "action.refresh": "Жаңарту",
    "field.customer": "Customer ID",
    "field.type": "Түрі",
    "field.promotionType": "Промо түрі",
    "field.code": "Код",
    "field.quantity": "Саны",
    "field.unitPrice": "Баға",
    "field.receipt": "Чек",
    "field.redemptionRef": "Өтеу сілтемесі",
    "field.saleStack": "Sale жеңілдігі",
    "field.loyaltyStack": "Loyalty жеңілдігі",
    "label.customer": "Клиент",
    "label.locale": "Тіл",
    "label.annualSpend": "Жылдық шығын",
    "label.tier": "Деңгей",
    "label.shoeSize": "Аяқ киім өлшемі",
    "label.lastPurchase": "Соңғы сатып алу",
    "label.noPurchases": "Сатып алулар жоқ",
    "label.status": "Статус",
    "label.service": "Сервис",
    "label.code": "Код",
    "label.title": "Атауы",
    "label.contracts": "Контракттар",
    "label.value": "Мәні",
    "label.source": "Дереккөзі",
    "label.verified": "Расталды",
    "label.date": "Күні",
    "label.channel": "Арна",
    "label.lines": "Жолдар",
    "label.discount": "Жеңілдік",
    "label.net": "Таза сома",
    "label.idempotent": "Идемпотентті",
    "label.validPeriod": "Жарамдылық",
    "label.stacking": "Біріктіру",
    "label.eligibility": "Сәйкестік",
    "label.allowed": "Рұқсат",
    "label.warnings": "Ескертулер",
    "label.loyalty": "Адалдық",
    "label.sale": "Жеңілдік",
    "result.discount": "Нәтиже",
    "result.transaction": "Транзакция",
    "result.coupon": "Купон",
    "option.purchase": "Сатып алу",
    "option.return": "Қайтару",
    "option.birthday": "Туған күн",
    "option.crossSell": "Кросс-сейл",
    "option.weeklyExtra": "Апталық қосымша",
    "value.yes": "Иә",
    "value.no": "Жоқ",
    "empty.noData": "Дерек жоқ",
    "status.loading": "Жүктелуде",
    "status.checking": "Тексерілуде",
    "status.valid": "Жарамды",
    "status.invalid": "Жарамсыз",
    "status.redeemed": "Өтелді",
    "error.title": "Сұрау қатесі"
  },
  ru: {
    "app.title": "UCO CRM",
    "app.subtitle": "Headless retail loyalty платформа",
    "label.language": "Язык",
    "nav.overview": "Overview",
    "nav.customer360": "Клиент 360",
    "nav.posLoyalty": "POS/Лояльность",
    "nav.promotions": "Promotions",
    "overview.title": "Операционный обзор",
    "overview.subtitle": "Backend API, модули и ключевой клиентский контекст",
    "overview.health": "Backend",
    "overview.modules": "Модули",
    "overview.customer": "Клиент",
    "overview.generated": "Обновлено",
    "aria.sections": "Разделы",
    "aria.dashboardSections": "Разделы дашборда",
    "customer.title": "Клиент 360",
    "customer.profile": "Профиль",
    "customer.wallet": "Wallet card",
    "customer.identities": "Идентификаторы",
    "customer.history": "История покупок",
    "customer.favoriteSports": "Любимые виды спорта",
    "customer.sizes": "Размеры",
    "customer.status": "Статус",
    "customer.lastActivity": "Последняя активность",
    "pos.title": "POS/Loyalty demo",
    "pos.evaluate": "Оценка скидки",
    "pos.ingest": "Ingest transaction",
    "pos.includeBlocked": "Добавить строку Sale jacket",
    "promotions.title": "Promotions",
    "promotions.issue": "Выдать купон",
    "promotions.validate": "Проверить",
    "promotions.redeem": "Погасить",
    "action.evaluate": "Оценить",
    "action.submit": "Отправить",
    "action.issue": "Выдать",
    "action.validate": "Проверить",
    "action.redeem": "Погасить",
    "action.refresh": "Обновить",
    "field.customer": "Customer ID",
    "field.type": "Тип",
    "field.promotionType": "Тип промо",
    "field.code": "Код",
    "field.quantity": "Количество",
    "field.unitPrice": "Цена",
    "field.receipt": "Чек",
    "field.redemptionRef": "Ссылка погашения",
    "field.saleStack": "Sale скидка",
    "field.loyaltyStack": "Loyalty скидка",
    "label.customer": "Клиент",
    "label.locale": "Язык",
    "label.annualSpend": "Траты за год",
    "label.tier": "Уровень",
    "label.shoeSize": "Размер обуви",
    "label.lastPurchase": "Недавняя покупка",
    "label.noPurchases": "Нет покупок",
    "label.status": "Статус",
    "label.service": "Сервис",
    "label.code": "Код",
    "label.title": "Название",
    "label.contracts": "Контракты",
    "label.value": "Значение",
    "label.source": "Источник",
    "label.verified": "Проверен",
    "label.date": "Дата",
    "label.channel": "Канал",
    "label.lines": "Строки",
    "label.discount": "Скидка",
    "label.net": "Нетто",
    "label.idempotent": "Идемпотентно",
    "label.validPeriod": "Срок действия",
    "label.stacking": "Совмещение",
    "label.eligibility": "Правила доступности",
    "label.allowed": "Разрешено",
    "label.warnings": "Предупреждения",
    "label.loyalty": "Лояльность",
    "label.sale": "Распродажа",
    "result.discount": "Результат",
    "result.transaction": "Транзакция",
    "result.coupon": "Купон",
    "option.purchase": "Покупка",
    "option.return": "Возврат",
    "option.birthday": "День рождения",
    "option.crossSell": "Кросс-сейл",
    "option.weeklyExtra": "Еженедельный бонус",
    "value.yes": "Да",
    "value.no": "Нет",
    "empty.noData": "Нет данных",
    "status.loading": "Загрузка",
    "status.checking": "Проверка",
    "status.valid": "Валиден",
    "status.invalid": "Невалиден",
    "status.redeemed": "Погашен",
    "error.title": "Ошибка запроса"
  },
  en: {
    "app.title": "UCO CRM",
    "app.subtitle": "Headless retail loyalty platform",
    "label.language": "Language",
    "nav.overview": "Overview",
    "nav.customer360": "Customer 360",
    "nav.posLoyalty": "POS/Loyalty",
    "nav.promotions": "Promotions",
    "overview.title": "Operations overview",
    "overview.subtitle": "Backend API, modules, and current customer context",
    "overview.health": "Backend",
    "overview.modules": "Modules",
    "overview.customer": "Customer",
    "overview.generated": "Updated",
    "aria.sections": "Sections",
    "aria.dashboardSections": "Dashboard sections",
    "customer.title": "Customer 360",
    "customer.profile": "Profile",
    "customer.wallet": "Wallet card",
    "customer.identities": "Identities",
    "customer.history": "Purchase history",
    "customer.favoriteSports": "Favorite sports",
    "customer.sizes": "Sizes",
    "customer.status": "Status",
    "customer.lastActivity": "Last activity",
    "pos.title": "POS/Loyalty demo",
    "pos.evaluate": "Discount evaluation",
    "pos.ingest": "Ingest transaction",
    "pos.includeBlocked": "Add Sale jacket line",
    "promotions.title": "Promotions",
    "promotions.issue": "Issue coupon",
    "promotions.validate": "Validate",
    "promotions.redeem": "Redeem",
    "action.evaluate": "Evaluate",
    "action.submit": "Submit",
    "action.issue": "Issue",
    "action.validate": "Validate",
    "action.redeem": "Redeem",
    "action.refresh": "Refresh",
    "field.customer": "Customer ID",
    "field.type": "Type",
    "field.promotionType": "Promotion type",
    "field.code": "Code",
    "field.quantity": "Quantity",
    "field.unitPrice": "Unit price",
    "field.receipt": "Receipt",
    "field.redemptionRef": "Redemption ref",
    "field.saleStack": "Sale discount",
    "field.loyaltyStack": "Loyalty discount",
    "label.customer": "Customer",
    "label.locale": "Locale",
    "label.annualSpend": "Annual spend",
    "label.tier": "Tier",
    "label.shoeSize": "Shoe size",
    "label.lastPurchase": "Last purchase",
    "label.noPurchases": "No purchases",
    "label.status": "Status",
    "label.service": "Service",
    "label.code": "Code",
    "label.title": "Title",
    "label.contracts": "Contracts",
    "label.value": "Value",
    "label.source": "Source",
    "label.verified": "Verified",
    "label.date": "Date",
    "label.channel": "Channel",
    "label.lines": "Lines",
    "label.discount": "Discount",
    "label.net": "Net",
    "label.idempotent": "Idempotent",
    "label.validPeriod": "Valid",
    "label.stacking": "Stacking",
    "label.eligibility": "Eligibility",
    "label.allowed": "Allowed",
    "label.warnings": "Warnings",
    "label.loyalty": "Loyalty",
    "label.sale": "Sale",
    "result.discount": "Result",
    "result.transaction": "Transaction",
    "result.coupon": "Coupon",
    "option.purchase": "Purchase",
    "option.return": "Return",
    "option.birthday": "Birthday",
    "option.crossSell": "Cross-sell",
    "option.weeklyExtra": "Weekly extra",
    "value.yes": "Yes",
    "value.no": "No",
    "empty.noData": "No data",
    "status.loading": "Loading",
    "status.checking": "Checking",
    "status.valid": "Valid",
    "status.invalid": "Invalid",
    "status.redeemed": "Redeemed",
    "error.title": "Request error"
  }
};

const elements = {
  locale: document.querySelector("#locale"),
  health: document.querySelector("#health"),
  refresh: document.querySelector("#refresh"),
  modulesCompact: document.querySelector("#modulesCompact"),
  overview: document.querySelector("#overviewPanel"),
  customer: document.querySelector("#customerPanel"),
  pos: document.querySelector("#posPanel"),
  promotions: document.querySelector("#promotionsPanel")
};

subscribe(render);
wireEvents();
await boot();

async function boot() {
  elements.locale.value = getState().locale;
  await loadDictionary();
  applyStaticLabels();
  render();
  await Promise.all([loadSystem(), loadProfile()]);
}

function wireEvents() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => setActiveSection(button.dataset.section));
  });

  elements.refresh.addEventListener("click", () => refreshAll());
  elements.locale.addEventListener("change", async () => {
    setLocale(elements.locale.value);
    await loadDictionary();
    applyStaticLabels();
    await refreshAll();
  });

  document.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (event.target.id === "discountForm") {
      await evaluateDiscount();
    }
    if (event.target.id === "transactionForm") {
      await submitTransaction();
    }
    if (event.target.id === "issueCouponForm") {
      await issueCoupon();
    }
    if (event.target.id === "validateCouponForm") {
      await validateCoupon();
    }
    if (event.target.id === "redeemCouponForm") {
      await redeemCoupon();
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target.id === "posIncludeBlocked") {
      updateUi({ includeBlockedItem: event.target.checked });
    }
    if (event.target.id === "promoApplySale") {
      updateUi({ promoSale: event.target.checked });
    }
    if (event.target.id === "promoApplyLoyalty") {
      updateUi({ promoLoyalty: event.target.checked });
    }
  });
}

async function refreshAll() {
  await Promise.all([loadSystem(), loadProfile()]);
}

async function loadDictionary() {
  setLoading("i18n", true);
  setError("i18n", null);
  try {
    const dictionary = await apiRequest(`/api/v1/i18n?locale=${encodeURIComponent(getState().locale)}`, {
      locale: getState().locale
    });
    const locale = dictionary?.locale || getState().locale;
    setState({ dictionary, locale });
    localStorage.setItem("admin-locale", locale);
    document.documentElement.lang = locale;
    elements.locale.value = locale;
  } catch (error) {
    setError("i18n", normalizeError(error));
  } finally {
    setLoading("i18n", false);
  }
}

async function loadSystem() {
  setLoading("system", true);
  setError("system", null);
  try {
    const [health, modules] = await Promise.all([
      apiRequest("/api/v1/health", { locale: getState().locale }),
      apiRequest("/api/v1/modules", { locale: getState().locale })
    ]);
    setState({ health, modules: modules?.data || [] });
  } catch (error) {
    setError("system", normalizeError(error));
  } finally {
    setLoading("system", false);
  }
}

async function loadProfile() {
  setLoading("profile", true);
  setError("profile", null);
  try {
    const profile = await apiRequest("/api/v1/me/profile?include=identities,purchase_history", {
      locale: getState().locale
    });
    setCustomerContext(profile);
  } catch (error) {
    setError("profile", normalizeError(error));
  } finally {
    setLoading("profile", false);
  }
}

async function evaluateDiscount() {
  let body;
  try {
    body = {
      store_id: "55555555-5555-4555-8555-555555555555",
      customer_id: requireCustomerId(),
      cart: buildCartFromPosForm()
    };
  } catch (error) {
    setError("discount", normalizeError(error));
    return;
  }

  setLoading("discount", true);
  setError("discount", null);
  setResult("discount", null);
  try {
    const result = await apiRequest("/api/v1/pos/discounts/evaluate", {
      method: "POST",
      locale: getState().locale,
      idempotencyKey: createKey("discount"),
      body
    });
    setResult("discount", result);
  } catch (error) {
    setError("discount", normalizeError(error));
  } finally {
    setLoading("discount", false);
  }
}

async function submitTransaction() {
  let payload;
  try {
    payload = buildTransactionPayload();
  } catch (error) {
    setError("transaction", normalizeError(error));
    return;
  }

  setLoading("transaction", true);
  setError("transaction", null);
  setResult("transaction", null);
  try {
    const result = await apiRequest("/api/v1/pos/transactions", {
      method: "POST",
      locale: getState().locale,
      idempotencyKey: createKey("transaction"),
      body: payload
    });
    setResult("transaction", result);
    await loadProfile();
  } catch (error) {
    setError("transaction", normalizeError(error));
  } finally {
    setLoading("transaction", false);
  }
}

async function issueCoupon() {
  let body;
  try {
    const form = document.querySelector("#issueCouponForm");
    const promotionType = form.elements.promotion_type.value;
    const code = form.elements.code.value.trim().toUpperCase() || createCouponCode(promotionType);
    body = {
      customer_id: requireCustomerId(),
      promotion_type: promotionType,
      code,
      issued_at: new Date().toISOString()
    };
  } catch (error) {
    setError("issueCoupon", normalizeError(error));
    return;
  }

  setLoading("issueCoupon", true);
  setError("issueCoupon", null);
  setResult("issuedCoupon", null);
  try {
    const result = await apiRequest("/api/v1/promotions/coupons", {
      method: "POST",
      locale: getState().locale,
      idempotencyKey: createKey("issue"),
      body
    });
    localStorage.setItem(storageKeyCoupon, result.coupon.code);
    setResult("issuedCoupon", result);
  } catch (error) {
    setError("issueCoupon", normalizeError(error));
  } finally {
    setLoading("issueCoupon", false);
  }
}

async function validateCoupon() {
  let body;
  try {
    body = {
      customer_id: requireCustomerId(),
      code: getCouponCodeFromForm("#validateCouponForm"),
      as_of: new Date().toISOString(),
      cart: buildPromoCart()
    };
  } catch (error) {
    setError("validateCoupon", normalizeError(error));
    return;
  }

  setLoading("validateCoupon", true);
  setError("validateCoupon", null);
  setResult("couponValidation", null);
  try {
    const result = await apiRequest("/api/v1/promotions/coupons/validate", {
      method: "POST",
      locale: getState().locale,
      body
    });
    setResult("couponValidation", result);
  } catch (error) {
    setError("validateCoupon", normalizeError(error));
  } finally {
    setLoading("validateCoupon", false);
  }
}

async function redeemCoupon() {
  let body;
  try {
    const form = document.querySelector("#redeemCouponForm");
    body = {
      customer_id: requireCustomerId(),
      code: getCouponCodeFromForm("#redeemCouponForm"),
      redemption_ref: form.elements.redemption_ref.value.trim() || createKey("order"),
      as_of: new Date().toISOString(),
      cart: buildPromoCart()
    };
  } catch (error) {
    setError("redeemCoupon", normalizeError(error));
    return;
  }

  setLoading("redeemCoupon", true);
  setError("redeemCoupon", null);
  setResult("redemption", null);
  try {
    const result = await apiRequest("/api/v1/promotions/coupons/redeem", {
      method: "POST",
      locale: getState().locale,
      idempotencyKey: createKey("redeem"),
      allowStatuses: [409],
      body
    });
    setResult("redemption", result);
    if (result?.coupon?.code) {
      localStorage.setItem(storageKeyCoupon, result.coupon.code);
    }
  } catch (error) {
    setError("redeemCoupon", normalizeError(error));
  } finally {
    setLoading("redeemCoupon", false);
  }
}

function render(state = getState()) {
  applyStaticLabels();
  renderNavigation(state);
  renderTopHealth(state);
  renderModulesCompact(state);
  renderOverview(state);
  renderCustomer(state);
  renderPos(state);
  renderPromotions(state);
}

function renderNavigation(state) {
  document.querySelectorAll(".tab").forEach((button) => {
    const active = button.dataset.section === state.activeSection;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  sections.forEach((section) => {
    document.querySelector(`[data-panel="${section}"]`).classList.toggle("active", section === state.activeSection);
  });
}

function renderTopHealth(state) {
  if (state.loading.has("system")) {
    elements.health.textContent = t("status.checking");
    elements.health.className = "status pending";
    return;
  }
  const ok = state.health?.status === "ok";
  elements.health.textContent = ok ? t("status.online") : t("status.issue");
  elements.health.className = ok ? "status ok" : "status issue";
}

function renderModulesCompact(state) {
  if (state.loading.has("system")) {
    elements.modulesCompact.innerHTML = stateBlock("loading", t("status.loading"));
    return;
  }
  if (state.errors.system) {
    elements.modulesCompact.innerHTML = errorBlock(state.errors.system, t("error.title"));
    return;
  }
  const modules = state.modules.slice(0, 6);
  elements.modulesCompact.innerHTML = `
    <h2>${escapeHtml(t("overview.modules"))}</h2>
    <div class="module-pills">
      ${modules.map((module) => badge(module.code, "soft")).join("")}
    </div>
  `;
}

function renderOverview(state) {
  const profile = state.profile;
  const customer = profile?.customer;
  const loyalty = profile?.loyalty_snapshot;
  const healthGenerated = state.health?.generated_at ? formatDateTime(state.health.generated_at, state.locale) : "-";

  elements.overview.innerHTML = `
    <div class="panel-heading">
      <div>
        <h2>${escapeHtml(t("overview.title"))}</h2>
        <p>${escapeHtml(t("overview.subtitle"))}</p>
      </div>
    </div>
    ${state.errors.system ? errorBlock(state.errors.system, t("error.title")) : ""}
    ${state.errors.profile ? errorBlock(state.errors.profile, t("error.title")) : ""}
    <div class="metrics-grid">
      ${metric(t("overview.health"), state.health?.status || t("status.checking"), state.health?.status === "ok" ? "mint" : "")}
      ${metric(t("overview.modules"), String(state.modules.length || 0), "sky")}
      ${metric(t("overview.customer"), customer ? `${customer.first_name} ${customer.last_name}` : t("empty.noData"), "coral")}
      ${metric(t("label.tier"), loyalty ? `${loyalty.tier_name} / ${formatPercent(loyalty.discount_percent, state.locale)}` : "-", "lavender")}
    </div>
    <div class="grid two">
      <article class="surface">
        <h3>${escapeHtml(t("overview.modules"))}</h3>
        ${renderModulesTable(state)}
      </article>
      <article class="surface">
        <h3>${escapeHtml(t("overview.health"))}</h3>
        <dl class="detail-list">
          <div><dt>${escapeHtml(t("label.status"))}</dt><dd>${badge(state.health?.status || "unknown", state.health?.status === "ok" ? "success" : "warning")}</dd></div>
          <div><dt>${escapeHtml(t("label.service"))}</dt><dd>${escapeHtml(state.health?.service || "-")}</dd></div>
          <div><dt>${escapeHtml(t("overview.generated"))}</dt><dd>${escapeHtml(healthGenerated)}</dd></div>
        </dl>
      </article>
    </div>
  `;
}

function renderCustomer(state) {
  if (state.loading.has("profile") && !state.profile) {
    elements.customer.innerHTML = stateBlock("loading", t("status.loading"));
    return;
  }
  if (state.errors.profile) {
    elements.customer.innerHTML = errorBlock(state.errors.profile, t("error.title"));
    return;
  }
  const profile = state.profile;
  if (!profile?.customer) {
    elements.customer.innerHTML = stateBlock("empty", t("empty.noData"));
    return;
  }

  const customer = profile.customer;
  const loyalty = profile.loyalty_snapshot;
  const wallet = profile.wallet;
  const purchaseHistory = profile.purchase_history || [];
  const lastPurchase = purchaseHistory[0];

  elements.customer.innerHTML = `
    <div class="panel-heading">
      <div>
        <h2>${escapeHtml(t("customer.title"))}</h2>
        <p>${escapeHtml(customer.id)}</p>
      </div>
      ${badge(customer.status, "success")}
    </div>
    <div class="metrics-grid">
      ${metric(t("label.customer"), `${customer.first_name} ${customer.last_name}`, "mint")}
      ${metric(t("label.locale"), customer.preferred_locale_display_name || customer.preferred_locale, "sky")}
      ${metric(t("label.annualSpend"), formatMoney(customer.annual_spend?.amount, customer.annual_spend?.currency, state.locale), "coral")}
      ${metric(t("label.tier"), loyalty ? `${loyalty.tier_name} / ${formatPercent(loyalty.discount_percent, state.locale)}` : "-", "lavender")}
      ${metric(t("label.shoeSize"), renderShoeSizeText(customer.size_profile), "mint")}
      ${metric(t("label.lastPurchase"), lastPurchase ? `${formatDate(lastPurchase.business_date, state.locale)} / ${formatMoney(lastPurchase.totals.net_amount, lastPurchase.currency, state.locale)}` : t("label.noPurchases"), "sky")}
    </div>
    <div class="grid two">
      <article class="surface">
        <h3>${escapeHtml(t("customer.profile"))}</h3>
        <dl class="detail-list">
          <div><dt>${escapeHtml(t("customer.favoriteSports"))}</dt><dd>${escapeHtml((customer.favorite_sports || []).join(", ") || "-")}</dd></div>
          <div><dt>${escapeHtml(t("customer.sizes"))}</dt><dd>${escapeHtml(renderSizeText(customer.size_profile))}</dd></div>
          <div><dt>${escapeHtml(t("customer.lastActivity"))}</dt><dd>${escapeHtml(customer.last_activity?.type || "-")} / ${escapeHtml(formatDateTime(customer.last_activity?.occurred_at, state.locale))}</dd></div>
          <div><dt>${escapeHtml(t("overview.generated"))}</dt><dd>${escapeHtml(formatDateTime(profile.generated_at, state.locale))}</dd></div>
        </dl>
      </article>
      <article class="wallet-card">
        <h3>${escapeHtml(wallet?.labels?.title || t("customer.wallet"))}</h3>
        ${wallet ? `
          <div class="wallet-number">${escapeHtml(wallet.card_number_masked)}</div>
          <dl class="detail-list compact">
            <div><dt>${escapeHtml(wallet.labels.barcode)}</dt><dd>${escapeHtml(wallet.barcode_masked)}</dd></div>
            <div><dt>${escapeHtml(wallet.labels.discount)}</dt><dd>${escapeHtml(formatPercent(loyalty?.discount_percent, state.locale))}</dd></div>
            <div><dt>${escapeHtml(wallet.labels.tier)}</dt><dd>${escapeHtml(loyalty?.tier_name || "-")}</dd></div>
          </dl>
        ` : stateBlock("empty", t("empty.noData"))}
      </article>
    </div>
    <article class="surface">
      <h3>${escapeHtml(t("customer.identities"))}</h3>
      ${renderIdentities(profile.identities || [])}
    </article>
    <article class="surface">
      <h3>${escapeHtml(t("customer.history"))}</h3>
      ${renderPurchaseHistory(purchaseHistory, state.locale)}
    </article>
  `;
}

function renderPos(state) {
  const customerId = state.customerId || "";
  const defaultReceipt = createReceiptId();
  elements.pos.innerHTML = `
    <div class="panel-heading">
      <div>
        <h2>${escapeHtml(t("pos.title"))}</h2>
        <p>${escapeHtml(t("field.customer"))}: ${escapeHtml(customerId || "-")}</p>
      </div>
    </div>
    <div class="grid two">
      <article class="surface">
        <h3>${escapeHtml(t("pos.evaluate"))}</h3>
        <form id="discountForm" class="form-grid">
          ${field("customer_id", t("field.customer"), customerId, { readonly: true })}
          ${field("run_quantity", t("field.quantity"), seedItems[0].quantity)}
          ${field("run_unit_price", t("field.unitPrice"), seedItems[0].unit_price)}
          <label class="check-row"><input id="posIncludeBlocked" type="checkbox" ${state.ui.includeBlockedItem ? "checked" : ""} /> <span>${escapeHtml(t("pos.includeBlocked"))}</span></label>
          <button class="primary" type="submit" ${state.loading.has("discount") ? "disabled" : ""}>${escapeHtml(t("action.evaluate"))}</button>
        </form>
        ${state.errors.discount ? errorBlock(state.errors.discount, t("error.title")) : ""}
        ${state.loading.has("discount") ? stateBlock("loading", t("status.loading")) : renderDiscountResult(state.results.discount, state.locale)}
      </article>
      <article class="surface">
        <h3>${escapeHtml(t("pos.ingest"))}</h3>
        <form id="transactionForm" class="form-grid">
          <label><span>${escapeHtml(t("field.type"))}</span><select name="type">${option("purchase", "option.purchase")}${option("return", "option.return")}</select></label>
          ${field("receipt", t("field.receipt"), defaultReceipt)}
          <button class="primary coral" type="submit" ${state.loading.has("transaction") ? "disabled" : ""}>${escapeHtml(t("action.submit"))}</button>
        </form>
        ${state.errors.transaction ? errorBlock(state.errors.transaction, t("error.title")) : ""}
        ${state.loading.has("transaction") ? stateBlock("loading", t("status.loading")) : renderTransactionResult(state.results.transaction, state.locale)}
      </article>
    </div>
  `;
}

function renderPromotions(state) {
  const lastCode = state.results.issuedCoupon?.coupon?.code || localStorage.getItem(storageKeyCoupon) || "";
  elements.promotions.innerHTML = `
    <div class="panel-heading">
      <div>
        <h2>${escapeHtml(t("promotions.title"))}</h2>
        <p>${escapeHtml(t("field.customer"))}: ${escapeHtml(state.customerId || "-")}</p>
      </div>
    </div>
    <div class="grid three">
      <article class="surface">
        <h3>${escapeHtml(t("promotions.issue"))}</h3>
        <form id="issueCouponForm" class="form-grid">
          <label><span>${escapeHtml(t("field.promotionType"))}</span><select name="promotion_type">${option("birthday", "option.birthday")}${option("cross_sell", "option.crossSell")}${option("weekly_extra", "option.weeklyExtra")}</select></label>
          ${field("code", t("field.code"), createCouponCode("birthday"), { autocomplete: "off" })}
          <button class="primary" type="submit" ${state.loading.has("issueCoupon") ? "disabled" : ""}>${escapeHtml(t("action.issue"))}</button>
        </form>
        ${state.errors.issueCoupon ? errorBlock(state.errors.issueCoupon, t("error.title")) : ""}
        ${state.loading.has("issueCoupon") ? stateBlock("loading", t("status.loading")) : renderCouponIssue(state.results.issuedCoupon, state.locale)}
      </article>
      <article class="surface">
        <h3>${escapeHtml(t("promotions.validate"))}</h3>
        <form id="validateCouponForm" class="form-grid">
          ${field("code", t("field.code"), lastCode, { autocomplete: "off" })}
          <label class="check-row"><input id="promoApplySale" type="checkbox" ${state.ui.promoSale ? "checked" : ""} /> <span>${escapeHtml(t("field.saleStack"))}</span></label>
          <label class="check-row"><input id="promoApplyLoyalty" type="checkbox" ${state.ui.promoLoyalty ? "checked" : ""} /> <span>${escapeHtml(t("field.loyaltyStack"))}</span></label>
          <button class="primary sky" type="submit" ${state.loading.has("validateCoupon") ? "disabled" : ""}>${escapeHtml(t("action.validate"))}</button>
        </form>
        ${state.errors.validateCoupon ? errorBlock(state.errors.validateCoupon, t("error.title")) : ""}
        ${state.loading.has("validateCoupon") ? stateBlock("loading", t("status.loading")) : renderValidation(state.results.couponValidation, state.locale)}
      </article>
      <article class="surface">
        <h3>${escapeHtml(t("promotions.redeem"))}</h3>
        <form id="redeemCouponForm" class="form-grid">
          ${field("code", t("field.code"), lastCode, { autocomplete: "off" })}
          ${field("redemption_ref", t("field.redemptionRef"), `ORDER-${Date.now().toString().slice(-6)}`)}
          <button class="primary lavender" type="submit" ${state.loading.has("redeemCoupon") ? "disabled" : ""}>${escapeHtml(t("action.redeem"))}</button>
        </form>
        ${state.errors.redeemCoupon ? errorBlock(state.errors.redeemCoupon, t("error.title")) : ""}
        ${state.loading.has("redeemCoupon") ? stateBlock("loading", t("status.loading")) : renderRedemption(state.results.redemption, state.locale)}
      </article>
    </div>
  `;
}

function renderModulesTable(state) {
  return table(
    [t("label.code"), t("label.title"), t("label.contracts")],
    state.modules.map(
      (module) => `<tr><td>${escapeHtml(module.code)}</td><td>${escapeHtml(module.title)}</td><td>${escapeHtml((module.contracts || []).slice(0, 3).join(", "))}</td></tr>`
    ),
    t("empty.noData")
  );
}

function renderIdentities(identities) {
  return table(
    [t("field.type"), t("label.value"), t("label.source"), t("label.verified")],
    identities.map(
      (identity) => `<tr><td>${escapeHtml(identity.type)}</td><td>${escapeHtml(identity.normalized_value)}</td><td>${escapeHtml(identity.source_system)}</td><td>${booleanBadge(identity.is_verified)}</td></tr>`
    ),
    t("empty.noData")
  );
}

function renderPurchaseHistory(items, locale) {
  return table(
    [t("label.date"), t("field.type"), t("label.channel"), t("label.net"), t("label.lines")],
    items.map(
      (item) => `<tr><td>${escapeHtml(formatDate(item.business_date, locale))}</td><td>${escapeHtml(formatTransactionType(item.type))}</td><td>${escapeHtml(item.channel)}</td><td>${escapeHtml(formatMoney(item.totals.net_amount, item.currency, locale))}</td><td>${escapeHtml((item.lines || []).map((line) => line.sku).join(", "))}</td></tr>`
    ),
    t("label.noPurchases")
  );
}

function renderDiscountResult(result, locale) {
  if (!result) {
    return stateBlock("empty", t("empty.noData"));
  }
  return `
    <div class="result-card mint-fade">
      <h4>${escapeHtml(t("result.discount"))}</h4>
      <div class="mini-metrics">
        ${metric("%", formatPercent(result.discount_percent, locale))}
        ${metric(t("label.discount"), formatMoney(result.discount_amount, "KZT", locale))}
        ${metric(t("label.net"), formatMoney(result.net_amount, "KZT", locale))}
      </div>
      ${renderResultLines(result.lines, locale, "loyalty_discount_allowed")}
      ${renderWarnings(result.warnings)}
      ${renderEvents(result.events)}
    </div>
  `;
}

function renderTransactionResult(result, locale) {
  if (!result) {
    return stateBlock("empty", t("empty.noData"));
  }
  return `
    <div class="result-card coral-fade">
      <h4>${escapeHtml(t("result.transaction"))}</h4>
      <dl class="detail-list compact">
        <div><dt>ID</dt><dd>${escapeHtml(result.transaction_id)}</dd></div>
        <div><dt>${escapeHtml(t("label.annualSpend"))}</dt><dd>${escapeHtml(formatMoney(result.annual_spend?.amount, result.annual_spend?.currency, locale))}</dd></div>
        <div><dt>${escapeHtml(t("label.idempotent"))}</dt><dd>${booleanBadge(Boolean(result.idempotent), result.idempotent ? "warning" : "success")}</dd></div>
      </dl>
      ${renderEvents(result.events)}
    </div>
  `;
}

function renderCouponIssue(result, locale) {
  if (!result) {
    return stateBlock("empty", t("empty.noData"));
  }
  return renderCouponCard(result.coupon, locale, result.events);
}

function renderValidation(result, locale) {
  if (!result) {
    return stateBlock("empty", t("empty.noData"));
  }
  const tone = result.valid ? "success" : "warning";
  return `
    <div class="result-card sky-fade">
      <h4>${badge(result.valid ? t("status.valid") : t("status.invalid"), tone)}</h4>
      ${result.reason ? `<p class="reason">${escapeHtml(result.reason)}</p>` : ""}
      ${result.coupon ? renderCouponSummary(result.coupon, locale) : ""}
      <div class="mini-metrics">
        ${metric("%", formatPercent(result.discount_percent, locale))}
        ${metric(t("label.discount"), formatMoney(result.discount_amount, "KZT", locale))}
        ${metric(t("label.net"), result.net_amount ? formatMoney(result.net_amount, "KZT", locale) : "-")}
      </div>
      ${renderResultLines(result.lines, locale, "promotion_discount_allowed")}
      ${renderWarnings(result.warnings)}
      ${renderEvents(result.events)}
    </div>
  `;
}

function renderRedemption(result, locale) {
  if (!result) {
    return stateBlock("empty", t("empty.noData"));
  }
  if (result.error && result.validation) {
    return `
      <div class="result-card warning-fade">
        ${errorBlock(new ApiError({ status: 409, ...result.error }), t("error.title"))}
        ${renderValidation(result.validation, locale)}
      </div>
    `;
  }
  return `
    <div class="result-card lavender-fade">
      <h4>${badge(result.redeemed ? t("status.redeemed") : t("status.invalid"), result.redeemed ? "success" : "warning")}</h4>
      ${renderCouponSummary(result.coupon, locale)}
      <div class="mini-metrics">
        ${metric(t("label.discount"), formatMoney(result.discount_amount, "KZT", locale))}
        ${metric(t("label.net"), result.net_amount ? formatMoney(result.net_amount, "KZT", locale) : "-")}
      </div>
      ${renderResultLines(result.lines, locale, "promotion_discount_allowed")}
      ${renderWarnings(result.warnings)}
      ${renderEvents(result.events)}
    </div>
  `;
}

function renderCouponCard(coupon, locale, events = []) {
  return `
    <div class="result-card lavender-fade">
      <h4>${escapeHtml(t("result.coupon"))} ${badge(coupon.status, coupon.status === "active" ? "success" : "warning")}</h4>
      ${renderCouponSummary(coupon, locale)}
      ${renderEvents(events)}
    </div>
  `;
}

function renderCouponSummary(coupon, locale) {
  return `
    <dl class="detail-list compact">
      <div><dt>${escapeHtml(t("label.code"))}</dt><dd><code>${escapeHtml(coupon.code)}</code></dd></div>
      <div><dt>${escapeHtml(t("field.type"))}</dt><dd>${escapeHtml(formatPromotionType(coupon.promotion_type))}</dd></div>
      <div><dt>${escapeHtml(t("label.discount"))}</dt><dd>${escapeHtml(formatPercent(coupon.discount_percent, locale))}</dd></div>
      <div><dt>${escapeHtml(t("label.validPeriod"))}</dt><dd>${escapeHtml(formatDateTime(coupon.valid_from, locale))} - ${escapeHtml(formatDateTime(coupon.expires_at, locale))}</dd></div>
      <div><dt>${escapeHtml(t("label.stacking"))}</dt><dd>${stackingBadge("label.loyalty", coupon.stackable_with_loyalty)} ${stackingBadge("label.sale", coupon.stackable_with_sale)}</dd></div>
      <div><dt>${escapeHtml(t("label.eligibility"))}</dt><dd>${escapeHtml(JSON.stringify(coupon.eligibility || {}))}</dd></div>
    </dl>
  `;
}

function renderResultLines(lines = [], locale, allowedField) {
  if (!lines.length) {
    return "";
  }
  return table(
    ["SKU", t("label.allowed"), t("label.discount"), t("label.net")],
    lines.map(
      (line) => `<tr><td>${escapeHtml(line.sku)}</td><td>${booleanBadge(line[allowedField])}</td><td>${escapeHtml(formatMoney(line.discount_amount, "KZT", locale))}</td><td>${escapeHtml(formatMoney(line.net_amount || "0.00", "KZT", locale))}</td></tr>`
    ),
    t("empty.noData")
  );
}

function renderWarnings(warnings = []) {
  if (!warnings.length) {
    return "";
  }
  return `<div class="warning-list"><strong>${escapeHtml(t("label.warnings"))}</strong>${warnings
    .map((warning) => `<p><code>${escapeHtml(warning.code)}</code> ${warning.sku ? escapeHtml(warning.sku) : ""}</p>`)
    .join("")}</div>`;
}

function renderEvents(events = []) {
  if (!events.length) {
    return "";
  }
  return `<div class="event-row">${events.map((event) => badge(event, "soft")).join("")}</div>`;
}

function field(name, label, value, options = {}) {
  const readonly = options.readonly ? "readonly" : "";
  const autocomplete = options.autocomplete ? `autocomplete="${escapeHtml(options.autocomplete)}"` : "";
  return `<label><span>${escapeHtml(label)}</span><input name="${escapeHtml(name)}" value="${escapeHtml(value)}" ${readonly} ${autocomplete} /></label>`;
}

function option(value, labelKey) {
  return `<option value="${escapeHtml(value)}">${escapeHtml(t(labelKey))}</option>`;
}

function booleanBadge(value, tone = value ? "success" : "warning") {
  return badge(t(value ? "value.yes" : "value.no"), tone);
}

function stackingBadge(labelKey, value) {
  return badge(`${t(labelKey)}: ${t(value ? "value.yes" : "value.no")}`, value ? "success" : "warning");
}

function formatTransactionType(type) {
  const keys = { purchase: "option.purchase", return: "option.return" };
  return keys[type] ? t(keys[type]) : type;
}

function formatPromotionType(type) {
  const keys = { birthday: "option.birthday", cross_sell: "option.crossSell", weekly_extra: "option.weeklyExtra" };
  return keys[type] ? t(keys[type]) : type;
}

function buildCartFromPosForm() {
  const form = document.querySelector("#discountForm");
  const items = [
    {
      sku: seedItems[0].sku,
      barcode: seedItems[0].barcode,
      product_variant_id: seedItems[0].product_variant_id,
      quantity: form.elements.run_quantity.value.trim() || "1",
      unit_price: form.elements.run_unit_price.value.trim() || seedItems[0].unit_price
    }
  ];
  if (getState().ui.includeBlockedItem) {
    items.push({ ...seedItems[1] });
  }
  return { currency: "KZT", items };
}

function buildPromoCart() {
  const state = getState();
  const item = {
    sku: seedItems[0].sku,
    barcode: seedItems[0].barcode,
    product_variant_id: seedItems[0].product_variant_id,
    quantity: "1",
    unit_price: "1000.00"
  };
  if (state.ui.promoSale) {
    item.applied_discounts = [{ type: "sale", code: "SALE-20", amount: "200.00", stackable: false }];
  }
  const cart = { currency: "KZT", items: [item] };
  if (state.ui.promoLoyalty) {
    cart.loyalty_discount_percent = "10.00";
  }
  return cart;
}

function buildTransactionPayload() {
  const state = getState();
  const form = document.querySelector("#transactionForm");
  const tenantId = state.tenantId;
  if (!tenantId) {
    throw new ApiError({
      status: 0,
      code: "tenant_context_missing",
      message: "Tenant context is unavailable from profile response",
      details: [{ field: "loyalty_snapshot.tenant_id", reason: "required" }]
    });
  }

  const cart = buildCartFromPosForm();
  const discount = state.results.discount;
  const lines = cart.items.map((item, index) => {
    const evaluatedLine = discount?.lines?.find((line) => line.sku === item.sku);
    const grossAmount = multiplyMoney(item.unit_price, item.quantity || "1");
    const discountAmount = evaluatedLine?.discount_amount || "0.00";
    return {
      line_number: index + 1,
      product_id: evaluatedLine?.product_id || null,
      product_variant_id: item.product_variant_id || evaluatedLine?.product_variant_id || null,
      sku: item.sku,
      barcode: item.barcode || null,
      name: item.name || item.sku,
      quantity: item.quantity || "1",
      unit_price: { amount: item.unit_price, currency: "KZT" },
      gross_amount: grossAmount,
      discount_amount: discountAmount,
      net_amount: subtractMoney(grossAmount, discountAmount),
      loyalty_eligible_amount: subtractMoney(grossAmount, discountAmount),
      tax_amount: "0.00",
      applied_discounts: discountAmount === "0.00" ? [] : [{ type: "loyalty", code: null, amount: discountAmount, stackable: false }],
      attributes: { sport_tags: item.sport_tags || [] }
    };
  });
  const grossAmount = sumMoney(lines.map((line) => line.gross_amount));
  const discountAmount = sumMoney(lines.map((line) => line.discount_amount));
  const netAmount = sumMoney(lines.map((line) => line.net_amount));
  const receipt = form.elements.receipt.value.trim() || createKey("receipt");
  const now = new Date();

  return {
    tenant_id: tenantId,
    type: form.elements.type.value,
    status: "completed",
    customer_id: requireCustomerId(),
    omnichannel_identity: { type: "wallet_barcode", value: "980124000001" },
    store_id: "55555555-5555-4555-8555-555555555555",
    channel: "pos",
    source_system: "frontend-pos",
    external_transaction_id: receipt,
    fiscal_receipt_id: `FISCAL-${receipt}`,
    original_transaction_id: null,
    business_date: now.toISOString().slice(0, 10),
    occurred_at: now.toISOString(),
    currency: "KZT",
    totals: {
      gross_amount: grossAmount,
      discount_amount: discountAmount,
      loyalty_discount_amount: discountAmount,
      promo_discount_amount: "0.00",
      tax_amount: "0.00",
      net_amount: netAmount
    },
    payment_methods: [{ type: "card", amount: netAmount, provider_ref: null }],
    loyalty: {
      tier_id: state.profile?.loyalty_snapshot?.current_tier_id || null,
      discount_percent: discount?.discount_percent || state.profile?.loyalty_snapshot?.discount_percent || null,
      evaluation_id: discount?.evaluation_id || null
    },
    lines
  };
}

function requireCustomerId() {
  const customerId = getState().customerId;
  if (!customerId) {
    throw new ApiError({ status: 0, code: "customer_missing", message: "Customer is not loaded", details: [] });
  }
  return customerId;
}

function getCouponCodeFromForm(selector) {
  const form = document.querySelector(selector);
  const code = form.elements.code.value.trim().toUpperCase() || localStorage.getItem(storageKeyCoupon) || "";
  if (!code) {
    throw new ApiError({
      status: 0,
      code: "coupon_code_missing",
      message: "Coupon code is required",
      details: [{ field: "code", reason: "required" }]
    });
  }
  return code;
}

function applyStaticLabels() {
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((node) => {
    const value = t(node.dataset.i18nTitle);
    node.title = value;
    node.setAttribute("aria-label", value);
  });
}

function t(key) {
  const state = getState();
  return state.dictionary?.admin?.[key] || localCopy[state.locale]?.[key] || localCopy.ru[key] || key;
}

function renderShoeSizeText(sizeProfile = {}) {
  const shoe = sizeProfile.shoe || {};
  return [`UK ${shoe.uk || "-"}`, `EU ${shoe.eu || "-"}`].join(" / ");
}

function renderSizeText(sizeProfile = {}) {
  const shoe = sizeProfile.shoe || {};
  const apparel = sizeProfile.apparel || {};
  return `UK ${shoe.uk || "-"}, EU ${shoe.eu || "-"}; top ${apparel.top || "-"}, bottom ${apparel.bottom || "-"}`;
}

function createCouponCode(type) {
  const prefix = { birthday: "BDAY", cross_sell: "XSELL", weekly_extra: "WEEKLY" }[type] || "PROMO";
  return `${prefix}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

function createReceiptId() {
  return `FRONT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function createKey(prefix) {
  if (window.crypto?.randomUUID) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeError(error) {
  if (error instanceof ApiError) {
    return error;
  }
  return new ApiError({ status: 0, code: "frontend_error", message: error.message || String(error), details: [] });
}

function toMinor(value) {
  const [units, fraction = ""] = String(value || "0").split(".");
  return BigInt(units || "0") * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
}

function fromMinor(value) {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

function multiplyMoney(amount, quantity) {
  const quantityUnits = BigInt(Math.round(Number.parseFloat(quantity || "1") * 1000));
  return fromMinor((toMinor(amount) * quantityUnits + 500n) / 1000n);
}

function subtractMoney(left, right) {
  return fromMinor(toMinor(left) - toMinor(right));
}

function sumMoney(values) {
  return fromMinor(values.reduce((total, value) => total + toMinor(value), 0n));
}
