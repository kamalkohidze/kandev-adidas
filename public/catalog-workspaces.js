import { ApiError, apiRequest } from "./api.js";
import { getState, setError, setLoading, setResult, setState } from "./state.js";
import { badge, errorBlock, escapeHtml, formatDateTime, formatMoney, metric, stateBlock } from "./ui.js";

const localeOptions = ["kk", "ru", "en"];
const requestSequences = {
  catalogProducts: 0,
  catalogDetail: 0,
  variantDrilldown: 0,
  catalogInventory: 0,
  customerRecommendations: 0,
  segmentRecommendations: 0
};

export function wireWorkspaceEvents() {
  document.addEventListener("submit", async (event) => {
    if (event.target.id === "catalogFiltersForm") {
      event.preventDefault();
      updateCatalogFilters(event.target);
      await loadCatalogProducts({ resetSelection: true });
    }
    if (event.target.id === "inventoryFiltersForm") {
      event.preventDefault();
      updateInventoryFilters(event.target);
      await loadInventory();
    }
    if (event.target.id === "recommendationsForm") {
      event.preventDefault();
      updateRecommendationControls(event.target);
      await loadCustomerRecommendations();
    }
    if (event.target.id === "segmentRecommendationsForm") {
      event.preventDefault();
      updateRecommendationControls(event.target);
      await loadSegmentRecommendations();
    }
  });

  document.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-action]");
    if (!action) {
      return;
    }
    if (action.dataset.action === "select-product") {
      await loadProductDetail(action.dataset.productId);
    }
    if (action.dataset.action === "select-variant") {
      await loadVariantDrilldown(action.dataset.variantId);
    }
    if (action.dataset.action === "reset-catalog") {
      resetCatalogFilters();
      await loadCatalogProducts({ resetSelection: true });
      await loadInventory();
    }
  });
}

export function syncWorkspaceLocale(locale) {
  const state = getState();
  setState({
    catalog: {
      ...state.catalog,
      filters: { ...state.catalog.filters, locale }
    },
    recommendations: {
      ...state.recommendations,
      controls: { ...state.recommendations.controls, locale }
    }
  });
}

export async function loadCatalogWorkspace() {
  await Promise.all([loadCatalogProducts({ resetSelection: false }), loadInventory()]);
}

export async function refreshCatalogWorkspace() {
  const state = getState();
  await Promise.all([loadCatalogProducts({ resetSelection: false }), loadInventory()]);
  if (state.catalog.selectedVariantId) {
    await loadVariantDrilldown(state.catalog.selectedVariantId);
  }
}

export async function refreshRecommendationWorkspace() {
  await Promise.all([loadCustomerRecommendations(), loadSegmentRecommendations()]);
}

export function renderCatalogWorkspace(element, t) {
  const state = getState();
  const catalog = state.catalog;
  const selectedProduct = catalog.product;
  element.innerHTML = `
    <div class="panel-heading">
      <div>
        <h2>${label(t, "catalog.title", "Catalog / Inventory")}</h2>
        <p>${label(t, "catalog.subtitle", "Products, variants, branch prices, and stock balances")}</p>
      </div>
      ${catalog.page ? badge(`${catalog.products.length} / ${catalog.page.limit}`, "soft") : ""}
    </div>
    <div class="workspace-grid catalog-layout">
      <article class="surface catalog-list-panel">
        <div class="section-title-row">
          <h3>${label(t, "catalog.products", "Products")}</h3>
          <button class="secondary" type="button" data-action="reset-catalog">${label(t, "action.reset", "Reset")}</button>
        </div>
        ${renderCatalogFilters(catalog.filters, t)}
        ${state.errors.catalogProducts ? errorBlock(state.errors.catalogProducts, label(t, "error.title", "Request error")) : ""}
        ${state.loading.has("catalogProducts") ? skeletonList() : renderProductList(catalog, t)}
      </article>
      <article class="surface detail-panel">
        ${state.errors.catalogDetail ? errorBlock(state.errors.catalogDetail, label(t, "error.title", "Request error")) : ""}
        ${state.loading.has("catalogDetail") ? skeletonDetail() : renderProductDetail(selectedProduct, catalog, t)}
      </article>
    </div>
    <div class="grid two">
      <article class="surface">
        <h3>${label(t, "catalog.variantDrilldown", "Variant price / inventory")}</h3>
        ${state.errors.variantPrice ? errorBlock(state.errors.variantPrice, label(t, "error.title", "Request error")) : ""}
        ${state.errors.variantInventory ? errorBlock(state.errors.variantInventory, label(t, "error.title", "Request error")) : ""}
        ${state.loading.has("variantDrilldown") ? stateBlock("loading", label(t, "status.loading", "Loading")) : renderVariantDrilldown(state.results.variantPrice, state.results.variantInventory, catalog, t)}
      </article>
      <article class="surface">
        <h3>${label(t, "catalog.inventory", "Inventory")}</h3>
        ${renderInventoryFilters(catalog, t)}
        ${state.errors.catalogInventory ? errorBlock(state.errors.catalogInventory, label(t, "error.title", "Request error")) : ""}
        ${state.loading.has("catalogInventory") ? stateBlock("loading", label(t, "status.loading", "Loading")) : renderInventoryView(catalog.inventory, t)}
      </article>
    </div>
  `;
}

export function renderRecommendationWorkspace(element, t) {
  const state = getState();
  const controls = state.recommendations.controls;
  element.innerHTML = `
    <div class="panel-heading">
      <div>
        <h2>${label(t, "recommendations.title", "Recommendations")}</h2>
        <p>${label(t, "recommendations.subtitle", "Customer and segment product recommendations with stock and price context")}</p>
      </div>
      ${state.customerId ? badge(state.customerId, "soft") : ""}
    </div>
    <div class="grid two">
      <article class="surface">
        <h3>${label(t, "recommendations.customer", "Customer recommendations")}</h3>
        ${renderRecommendationForm("recommendationsForm", controls, t, true)}
        ${state.errors.customerRecommendations ? errorBlock(state.errors.customerRecommendations, label(t, "error.title", "Request error")) : ""}
        ${state.loading.has("customerRecommendations") ? skeletonList() : renderRecommendationSet(state.results.customerRecommendations, t, { showBlocks: true })}
      </article>
      <article class="surface">
        <h3>${label(t, "recommendations.segment", "Segment recommendations")}</h3>
        ${renderRecommendationForm("segmentRecommendationsForm", controls, t, false)}
        ${state.errors.segmentRecommendations ? errorBlock(state.errors.segmentRecommendations, label(t, "error.title", "Request error")) : ""}
        ${state.loading.has("segmentRecommendations") ? skeletonList() : renderRecommendationSet(state.results.segmentRecommendations, t, { showAudience: true })}
      </article>
    </div>
  `;
}

async function loadCatalogProducts({ resetSelection = false } = {}) {
  const state = getState();
  const requestId = nextRequest("catalogProducts");
  invalidateCatalogDependents();
  setLoading("catalogProducts", true);
  setError("catalogProducts", null);
  try {
    const query = buildCatalogProductQuery(state.catalog.filters);
    const response = await apiRequest(`/api/v1/catalog/products?${query}`, { locale: state.locale });
    if (!isCurrentRequest("catalogProducts", requestId)) {
      return;
    }
    const products = response?.data || [];
    const selectedProductId = resetSelection ? products[0]?.id || null : state.catalog.selectedProductId || products[0]?.id || null;
    setState({
      catalog: {
        ...getState().catalog,
        products,
        page: response?.page || null,
        selectedProductId
      }
    });
    if (selectedProductId) {
      await loadProductDetail(selectedProductId, requestId);
    } else {
      setState({ catalog: { ...getState().catalog, product: null, variants: [], selectedVariantId: null } });
      setResult("variantPrice", null);
      setResult("variantInventory", null);
    }
  } catch (error) {
    if (isCurrentRequest("catalogProducts", requestId)) {
      setError("catalogProducts", normalizeError(error));
    }
  } finally {
    if (isCurrentRequest("catalogProducts", requestId)) {
      setLoading("catalogProducts", false);
    }
  }
}

async function loadProductDetail(productId, catalogRequestId = null) {
  if (!productId) {
    return;
  }
  const state = getState();
  const requestId = nextRequest("catalogDetail");
  setLoading("catalogDetail", true);
  setError("catalogDetail", null);
  try {
    const query = buildProductDetailQuery(state.catalog.filters);
    const response = await apiRequest(`/api/v1/catalog/products/${encodeURIComponent(productId)}?${query}`, { locale: state.locale });
    if (!isCurrentCatalogDetailRequest(requestId, catalogRequestId)) {
      return;
    }
    const product = response?.data || null;
    const variants = product?.variants || [];
    const selectedVariantId = variants[0]?.id || null;
    setState({
      catalog: {
        ...getState().catalog,
        selectedProductId: productId,
        product,
        variants,
        selectedVariantId
      }
    });
    if (selectedVariantId) {
      await loadVariantDrilldown(selectedVariantId, catalogRequestId);
    }
    if (!isCurrentCatalogDetailRequest(requestId, catalogRequestId)) {
      return;
    }
    await loadInventory(catalogRequestId);
  } catch (error) {
    if (isCurrentCatalogDetailRequest(requestId, catalogRequestId)) {
      setError("catalogDetail", normalizeError(error));
    }
  } finally {
    if (isCurrentCatalogDetailRequest(requestId, catalogRequestId)) {
      setLoading("catalogDetail", false);
    }
  }
}

async function loadVariantDrilldown(variantId, catalogRequestId = null) {
  if (!variantId) {
    return;
  }
  const state = getState();
  const requestId = nextRequest("variantDrilldown");
  const query = buildVariantDrilldownQuery(state.catalog.filters);
  setLoading("variantDrilldown", true);
  setError("variantPrice", null);
  setError("variantInventory", null);
  setResult("variantPrice", null);
  setResult("variantInventory", null);
  setState({ catalog: { ...state.catalog, selectedVariantId: variantId } });
  try {
    const [price, inventory] = await Promise.allSettled([
      apiRequest(`/api/v1/catalog/variants/${encodeURIComponent(variantId)}/price?${query}`, { locale: state.locale }),
      apiRequest(`/api/v1/catalog/variants/${encodeURIComponent(variantId)}/inventory?${query}`, { locale: state.locale })
    ]);
    if (!isCurrentCatalogOperation("variantDrilldown", requestId, catalogRequestId)) {
      return;
    }
    if (price.status === "fulfilled") {
      setResult("variantPrice", price.value?.data || null);
    } else {
      setError("variantPrice", normalizeError(price.reason));
    }
    if (inventory.status === "fulfilled") {
      setResult("variantInventory", inventory.value?.data || null);
    } else {
      setError("variantInventory", normalizeError(inventory.reason));
    }
  } finally {
    if (isCurrentCatalogOperation("variantDrilldown", requestId, catalogRequestId)) {
      setLoading("variantDrilldown", false);
    }
  }
}

async function loadInventory(catalogRequestId = null) {
  const state = getState();
  const requestId = nextRequest("catalogInventory");
  setLoading("catalogInventory", true);
  setError("catalogInventory", null);
  try {
    const query = buildInventoryQuery(state.catalog);
    const response = await apiRequest(`/api/v1/catalog/inventory?${query}`, { locale: state.locale });
    if (isCurrentCatalogOperation("catalogInventory", requestId, catalogRequestId)) {
      setState({ catalog: { ...getState().catalog, inventory: response?.data || [] } });
    }
  } catch (error) {
    if (isCurrentCatalogOperation("catalogInventory", requestId, catalogRequestId)) {
      setError("catalogInventory", normalizeError(error));
    }
  } finally {
    if (isCurrentCatalogOperation("catalogInventory", requestId, catalogRequestId)) {
      setLoading("catalogInventory", false);
    }
  }
}

async function loadCustomerRecommendations() {
  const state = getState();
  const requestId = nextRequest("customerRecommendations");
  if (!state.customerId) {
    setLoading("customerRecommendations", false);
    setError("customerRecommendations", null);
    setResult("customerRecommendations", null);
    return;
  }
  setLoading("customerRecommendations", true);
  setError("customerRecommendations", null);
  try {
    const query = buildRecommendationQuery(state.recommendations.controls, { includeBlocks: true, includeSegment: true });
    const response = await apiRequest(`/api/v1/customers/${encodeURIComponent(state.customerId)}/recommendations?${query}`, { locale: state.locale });
    if (isCurrentRequest("customerRecommendations", requestId)) {
      setResult("customerRecommendations", response);
    }
  } catch (error) {
    if (isCurrentRequest("customerRecommendations", requestId)) {
      setError("customerRecommendations", normalizeError(error));
    }
  } finally {
    if (isCurrentRequest("customerRecommendations", requestId)) {
      setLoading("customerRecommendations", false);
    }
  }
}

async function loadSegmentRecommendations() {
  const state = getState();
  const requestId = nextRequest("segmentRecommendations");
  const segmentCode = state.recommendations.controls.segment_code.trim();
  if (!segmentCode) {
    setResult("segmentRecommendations", null);
    setError("segmentRecommendations", null);
    setLoading("segmentRecommendations", false);
    return;
  }
  setLoading("segmentRecommendations", true);
  setError("segmentRecommendations", null);
  try {
    const query = buildRecommendationQuery(state.recommendations.controls, { includeBlocks: false, includeSegment: false });
    const response = await apiRequest(`/api/v1/recommendations/segments/${encodeURIComponent(segmentCode)}?${query}`, { locale: state.locale });
    if (isCurrentRequest("segmentRecommendations", requestId)) {
      setResult("segmentRecommendations", response);
    }
  } catch (error) {
    if (isCurrentRequest("segmentRecommendations", requestId)) {
      setError("segmentRecommendations", normalizeError(error));
    }
  } finally {
    if (isCurrentRequest("segmentRecommendations", requestId)) {
      setLoading("segmentRecommendations", false);
    }
  }
}

function updateCatalogFilters(form) {
  const data = new FormData(form);
  const state = getState();
  setState({
    catalog: {
      ...state.catalog,
      filters: {
        ...state.catalog.filters,
        query: readForm(data, "query"),
        brand: readForm(data, "brand"),
        product_type: readForm(data, "product_type"),
        sport_tag: readForm(data, "sport_tag"),
        status: readForm(data, "status"),
        branch_id: readForm(data, "branch_id"),
        size_system: readForm(data, "size_system"),
        size_value: readForm(data, "size_value"),
        in_stock: data.get("in_stock") === "on",
        locale: readForm(data, "locale"),
        at: readForm(data, "at")
      }
    }
  });
}

function updateInventoryFilters(form) {
  const data = new FormData(form);
  const state = getState();
  setState({ catalog: { ...state.catalog, inventoryInStock: data.get("inventory_in_stock") === "on" } });
}

function updateRecommendationControls(form) {
  const data = new FormData(form);
  const state = getState();
  setState({
    recommendations: {
      ...state.recommendations,
      controls: {
        branch_id: readForm(data, "branch_id"),
        limit: readForm(data, "limit") || "10",
        segment_code: readForm(data, "segment_code"),
        locale: readForm(data, "locale")
      }
    }
  });
}

function resetCatalogFilters() {
  const state = getState();
  setState({
    catalog: {
      ...state.catalog,
      filters: {
        ...state.catalog.filters,
        query: "",
        brand: "adidas",
        product_type: "",
        sport_tag: "",
        status: "active",
        size_system: "",
        size_value: "",
        in_stock: false,
        at: ""
      }
    }
  });
}

function renderCatalogFilters(filters, t) {
  return `<form id="catalogFiltersForm" class="form-grid filters-grid">
    ${input("query", label(t, "field.search", "Search"), filters.query, "text", "query/q")}
    ${input("brand", label(t, "field.brand", "Brand"), filters.brand)}
    ${select("product_type", label(t, "field.productType", "Product type"), filters.product_type, [["", label(t, "option.any", "Any")], ["shoes", "shoes"], ["apparel", "apparel"], ["accessory", "accessory"]])}
    ${select("sport_tag", label(t, "field.sport", "Sport"), filters.sport_tag, [["", label(t, "option.any", "Any")], ["football", "football"], ["training", "training"], ["running", "running"]])}
    ${select("status", label(t, "label.status", "Status"), filters.status, [["", label(t, "option.any", "Any")], ["active", "active"], ["inactive", "inactive"]])}
    ${input("branch_id", label(t, "field.branch", "Branch ID"), filters.branch_id)}
    ${input("size_system", label(t, "field.sizeSystem", "Size system"), filters.size_system, "text", "UK / INT")}
    ${input("size_value", label(t, "field.size", "Size"), filters.size_value, "text", "10 / M")}
    ${select("locale", label(t, "label.locale", "Locale"), filters.locale, localeOptions.map((locale) => [locale, locale.toUpperCase()]))}
    ${input("at", label(t, "field.priceAt", "Price at"), filters.at, "text", "2026-07-20T00:00:00+05:00")}
    <label class="check-row"><input name="in_stock" type="checkbox" ${filters.in_stock ? "checked" : ""} /> <span>${label(t, "field.inStock", "In stock")}</span></label>
    <button class="primary" type="submit">${label(t, "action.apply", "Apply")}</button>
  </form>`;
}

function renderInventoryFilters(catalog, t) {
  return `<form id="inventoryFiltersForm" class="inline-controls">
    <label class="check-row"><input name="inventory_in_stock" type="checkbox" ${catalog.inventoryInStock ? "checked" : ""} /> <span>${label(t, "field.inStock", "In stock")}</span></label>
    <button class="secondary" type="submit">${label(t, "action.apply", "Apply")}</button>
  </form>`;
}

function renderRecommendationForm(id, controls, t, includeCustomerSegment) {
  return `<form id="${escapeHtml(id)}" class="form-grid filters-grid compact-filters">
    ${input("branch_id", label(t, "field.branch", "Branch ID"), controls.branch_id)}
    ${input("limit", label(t, "field.limit", "Limit"), controls.limit, "number")}
    ${input("segment_code", label(t, "field.segment", "Segment"), controls.segment_code, "text", "active")}
    ${select("locale", label(t, "label.locale", "Locale"), controls.locale, localeOptions.map((locale) => [locale, locale.toUpperCase()]))}
    <button class="primary ${includeCustomerSegment ? "sky" : "lavender"}" type="submit">${label(t, "action.load", "Load")}</button>
  </form>`;
}

function renderProductList(catalog, t) {
  if (!catalog.products.length) {
    return stateBlock("empty", label(t, "catalog.noProducts", "No products match the filters"), label(t, "catalog.noProductsDetail", "Adjust search, size, branch, stock, or locale filters."));
  }
  return `<div class="product-list">${catalog.products.map((product) => {
    const active = product.id === catalog.selectedProductId;
    return `<button class="product-row ${active ? "active" : ""}" type="button" data-action="select-product" data-product-id="${escapeHtml(product.id)}">
      <span>
        <strong>${escapeHtml(product.display_name || product.sku)}</strong>
        <small>${escapeHtml(product.sku)} · ${escapeHtml(product.product_type || "-")}</small>
      </span>
      <span class="row-meta">${sportSwatches(product.sport_tags)} ${badge(product.status, product.status === "active" ? "success" : "warning")}</span>
      <span class="variant-count">${escapeHtml(product.variant_count ?? 0)} ${label(t, "catalog.variantsShort", "variants")}</span>
    </button>`;
  }).join("")}</div>`;
}

function renderProductDetail(product, catalog, t) {
  if (!product) {
    return stateBlock("empty", label(t, "catalog.selectProduct", "Select a product"));
  }
  return `<div class="detail-fade">
    <div class="section-title-row">
      <div>
        <h3>${escapeHtml(product.display_name || product.sku)}</h3>
        <p class="muted">${escapeHtml(product.display_description || label(t, "empty.noData", "No data"))}</p>
      </div>
      ${badge(product.status, product.status === "active" ? "success" : "warning")}
    </div>
    <div class="mini-metrics">
      ${metric("SKU", product.sku, "sky")}
      ${metric(label(t, "field.productType", "Product type"), product.product_type || "-", "mint")}
      ${metric(label(t, "catalog.variantCount", "Variants"), String(product.variants?.length || product.variant_count || 0), "coral")}
    </div>
    <dl class="detail-list">
      <div><dt>${label(t, "field.brand", "Brand")}</dt><dd>${escapeHtml(product.brand || "-")}</dd></div>
      <div><dt>${label(t, "field.category", "Category")}</dt><dd><code>${escapeHtml(product.category_id || "-")}</code></dd></div>
      <div><dt>${label(t, "field.sport", "Sport")}</dt><dd>${sportSwatches(product.sport_tags)}</dd></div>
      <div><dt>${label(t, "catalog.discountPolicy", "Discount policy")}</dt><dd>${renderPolicy(product.discount_policy)}</dd></div>
    </dl>
    <h3 class="subhead">${label(t, "catalog.variants", "Variants")}</h3>
    ${renderVariants(catalog.variants, catalog.selectedVariantId, t)}
  </div>`;
}

function renderVariants(variants, selectedVariantId, t) {
  if (!variants.length) {
    return stateBlock("empty", label(t, "catalog.noVariants", "No variants"));
  }
  return responsiveTable(
    ["SKU", "Barcode", label(t, "field.color", "Color"), label(t, "field.size", "Size"), label(t, "label.status", "Status"), label(t, "field.price", "Price"), label(t, "field.branchPrice", "Branch price"), label(t, "catalog.available", "Available"), ""],
    variants.map((variant) => [
      `<code>${escapeHtml(variant.variant_sku)}</code>`,
      escapeHtml(variant.barcode || "-"),
      `${colorSwatch(variant.color?.code)} ${escapeHtml(variant.display_color_name || variant.color?.code || "-")}`,
      escapeHtml(formatSize(variant.size)),
      badge(variant.status, variant.status === "active" ? "success" : "warning"),
      escapeHtml(formatMoney(variant.price?.amount, variant.price?.currency || "KZT", getState().locale)),
      escapeHtml(formatMoney(variant.effective_price?.amount, variant.effective_price?.currency || "KZT", getState().locale)),
      stockBadge(variant.effective_inventory?.available, t),
      `<button class="secondary compact" type="button" data-action="select-variant" data-variant-id="${escapeHtml(variant.id)}" ${variant.id === selectedVariantId ? "aria-current=\"true\"" : ""}>${label(t, "action.open", "Open")}</button>`
    ]),
    label(t, "catalog.noVariants", "No variants")
  );
}

function renderVariantDrilldown(price, inventory, catalog, t) {
  if (!catalog.selectedVariantId) {
    return stateBlock("empty", label(t, "catalog.selectVariant", "Select a variant"));
  }
  const selected = catalog.variants.find((variant) => variant.id === catalog.selectedVariantId);
  return `<div class="result-card sky-fade">
    <h4>${escapeHtml(selected?.variant_sku || catalog.selectedVariantId)}</h4>
    <dl class="detail-list compact">
      <div><dt>${label(t, "field.priceAt", "Price at")}</dt><dd>${escapeHtml(catalog.filters.at || label(t, "catalog.now", "current time"))}</dd></div>
      <div><dt>${label(t, "field.price", "Price")}</dt><dd>${price ? escapeHtml(formatMoney(price.amount, price.currency || "KZT", getState().locale)) : "-"} ${price ? badge(price.source || "base", price.source === "branch" ? "success" : "soft") : ""}</dd></div>
      <div><dt>${label(t, "field.branch", "Branch ID")}</dt><dd><code>${escapeHtml(price?.branch_id || inventory?.branch_id || catalog.filters.branch_id || "-")}</code></dd></div>
      <div><dt>${label(t, "catalog.validFrom", "Valid from")}</dt><dd>${escapeHtml(formatDateTime(price?.valid_from, getState().locale))}</dd></div>
      <div><dt>${label(t, "catalog.available", "Available")}</dt><dd>${stockBadge(inventory?.available, t)}</dd></div>
      <div><dt>${label(t, "catalog.reserved", "Reserved")}</dt><dd>${escapeHtml(inventory?.reserved ?? "-")}</dd></div>
      <div><dt>${label(t, "catalog.total", "Total")}</dt><dd>${escapeHtml(inventory?.total_available ?? "-")}</dd></div>
    </dl>
  </div>`;
}

function renderInventoryView(items, t) {
  const visible = getState().catalog.inventoryInStock ? items.filter((item) => Number(item.available) > 0) : items;
  if (!visible.length) {
    return stateBlock("empty", label(t, "catalog.noInventory", "No inventory balances match the filters"));
  }
  return `<div class="inventory-stack">${visible.map((item) => `<article class="inventory-row">
    <div><strong>${escapeHtml(item.variant_sku)}</strong><small>${escapeHtml(formatSize(item.size))}</small></div>
    <div><span>${label(t, "field.branch", "Branch ID")}</span><code>${escapeHtml(item.branch_id || "-")}</code></div>
    <div><span>${label(t, "catalog.available", "Available")}</span>${stockBadge(item.available, t)}</div>
    <div><span>${label(t, "catalog.reserved", "Reserved")}</span><strong>${escapeHtml(item.reserved ?? 0)}</strong></div>
    <div><span>${label(t, "catalog.total", "Total")}</span><strong>${escapeHtml(item.total_available ?? "-")}</strong></div>
  </article>`).join("")}</div>`;
}

function renderRecommendationSet(set, t, options = {}) {
  if (!set) {
    return stateBlock("empty", label(t, "empty.noData", "No data"));
  }
  const warnings = [];
  if (!set.data?.length) {
    warnings.push(label(t, "recommendations.empty", "No recommendations for this context."));
  }
  if (options.showAudience && set.context?.audience_size === 0) {
    warnings.push(label(t, "recommendations.emptyAudience", "Segment audience is empty for current seed data."));
  }
  return `<div class="recommendation-set">
    <div class="mini-metrics">
      ${metric(label(t, "field.limit", "Limit"), String(set.page?.limit ?? "-"), "sky")}
      ${metric(label(t, "field.branch", "Branch ID"), set.context?.branch_id || "-", "mint")}
      ${metric(label(t, "overview.generated", "Updated"), formatDateTime(set.generated_at, getState().locale), "lavender")}
    </div>
    ${warnings.length ? `<div class="warning-list">${warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")}</div>` : ""}
    <div class="recommendation-list">${(set.data || []).map((item) => renderRecommendationItem(item, t)).join("")}</div>
    ${options.showBlocks ? renderMessageBlocks(set.message_blocks, t) : ""}
  </div>`;
}

function renderRecommendationItem(item, t) {
  return `<article class="recommendation-card">
    <div class="section-title-row">
      <div>
        <h4>${escapeHtml(item.name?.value || item.display_name || item.sku)}</h4>
        <p class="muted"><code>${escapeHtml(item.variant_sku)}</code> · ${escapeHtml(formatSize(item.size))}</p>
      </div>
      ${badge(String(item.score), "soft")}
    </div>
    <div class="swatch-line">${sportSwatches(item.sport_tags)} ${stockBadge(item.inventory?.available, t)} ${badge(formatMoney(item.price?.amount, item.price?.currency || "KZT", getState().locale), "neutral")}</div>
    <p class="reason">${escapeHtml(item.reason || "-")}</p>
    ${item.reasons?.length ? `<div class="reason-list">${item.reasons.map((reason) => `<span>${escapeHtml(reason.explanation || reason.code)}</span>`).join("")}</div>` : ""}
  </article>`;
}

function renderMessageBlocks(blocks, t) {
  if (!blocks?.blocks?.length) {
    return "";
  }
  return `<div class="message-blocks"><h4>${label(t, "recommendations.blocks", "Product blocks")}</h4>${blocks.blocks.map((block) => `<article>
    <strong>${escapeHtml(block.title)}</strong>
    <span>${escapeHtml(block.subtitle || "-")}</span>
    <code>${escapeHtml(block.variant_sku)}</code>
  </article>`).join("")}</div>`;
}

function buildCatalogProductQuery(filters) {
  return paramsFrom({
    query: filters.query,
    brand: filters.brand,
    product_type: filters.product_type,
    sport_tag: filters.sport_tag,
    status: filters.status,
    branch_id: filters.branch_id,
    size_system: filters.size_system,
    size_value: filters.size_value,
    in_stock: filters.in_stock ? "true" : "",
    locale: filters.locale
  });
}

function buildProductDetailQuery(filters) {
  return paramsFrom({ branch_id: filters.branch_id, locale: filters.locale, at: filters.at });
}

function buildVariantDrilldownQuery(filters) {
  return paramsFrom({ branch_id: filters.branch_id, locale: filters.locale, at: filters.at });
}

function buildInventoryQuery(catalog) {
  const filters = catalog.filters;
  return paramsFrom({
    product_id: catalog.selectedProductId,
    branch_id: filters.branch_id,
    size_system: filters.size_system,
    size_value: filters.size_value,
    in_stock: catalog.inventoryInStock ? "true" : ""
  });
}

function buildRecommendationQuery(controls, { includeBlocks, includeSegment }) {
  return paramsFrom({
    branch_id: controls.branch_id,
    limit: controls.limit,
    segment_code: includeSegment ? controls.segment_code : "",
    locale: controls.locale,
    include: includeBlocks ? "message_blocks" : ""
  });
}

function paramsFrom(values) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    const normalized = String(value ?? "").trim();
    if (normalized) {
      params.set(key, normalized);
    }
  });
  return params.toString();
}

function nextRequest(key) {
  requestSequences[key] += 1;
  return requestSequences[key];
}

function isCurrentRequest(key, requestId) {
  return requestSequences[key] === requestId;
}

function invalidateCatalogDependents() {
  ["catalogDetail", "variantDrilldown", "catalogInventory"].forEach((key) => nextRequest(key));
  setLoading("catalogDetail", false);
  setLoading("variantDrilldown", false);
  setLoading("catalogInventory", false);
  setError("catalogDetail", null);
  setError("variantPrice", null);
  setError("variantInventory", null);
  setError("catalogInventory", null);
}

function isCurrentCatalogDetailRequest(requestId, catalogRequestId) {
  return isCurrentCatalogOperation("catalogDetail", requestId, catalogRequestId);
}

function isCurrentCatalogOperation(key, requestId, catalogRequestId) {
  return isCurrentRequest(key, requestId) && (catalogRequestId === null || isCurrentRequest("catalogProducts", catalogRequestId));
}

function responsiveTable(headers, rows, emptyText) {
  if (!rows.length) {
    return stateBlock("empty", emptyText);
  }
  return `<div class="responsive-table"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell, index) => `<td data-label="${escapeHtml(headers[index])}">${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function input(name, text, value, type = "text", placeholder = "") {
  return `<label><span>${text}</span><input name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" /></label>`;
}

function select(name, text, value, options) {
  return `<label><span>${text}</span><select name="${escapeHtml(name)}">${options.map(([optionValue, optionText]) => `<option value="${escapeHtml(optionValue)}" ${optionValue === value ? "selected" : ""}>${escapeHtml(optionText)}</option>`).join("")}</select></label>`;
}

function sportSwatches(tags = []) {
  if (!tags.length) {
    return badge("-", "soft");
  }
  return tags.map((tag) => `<span class="swatch sport-${escapeHtml(tag)}">${escapeHtml(tag)}</span>`).join(" ");
}

function colorSwatch(color = "neutral") {
  return `<span class="color-swatch color-${escapeHtml(color)}" aria-hidden="true"></span>`;
}

function stockBadge(value, t) {
  const amount = Number(value ?? 0);
  const tone = amount > 0 ? "success" : "warning";
  return badge(`${amount} ${label(t, "field.inStock", "in stock")}`, tone);
}

function renderPolicy(policy = {}) {
  return Object.entries(policy).map(([key, value]) => badge(`${key}: ${value ? "yes" : "no"}`, value ? "success" : "warning")).join(" ");
}

function formatSize(size = {}) {
  return [size.system, size.value].filter(Boolean).join(" ") || "-";
}

function readForm(data, key) {
  return String(data.get(key) || "").trim();
}

function label(t, key, fallback) {
  const value = t(key);
  return escapeHtml(value === key ? fallback : value);
}

function skeletonList() {
  return `<div class="skeleton-list"><span></span><span></span><span></span></div>`;
}

function skeletonDetail() {
  return `<div class="skeleton-detail"><span></span><span></span><span></span><span></span></div>`;
}

function normalizeError(error) {
  if (error instanceof ApiError) {
    return error;
  }
  return new ApiError({ status: 0, code: "frontend_error", message: error.message || String(error), details: [] });
}
