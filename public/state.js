const listeners = new Set();
const savedLocale = localStorage.getItem("admin-locale") || "ru";
const defaultBranchId = "55555555-5555-4555-8555-555555555555";

const state = {
  locale: savedLocale,
  activeSection: "overview",
  dictionary: null,
  health: null,
  modules: [],
  profile: null,
  customerId: localStorage.getItem("selected-customer-id") || null,
  tenantId: null,
  loading: new Set(),
  errors: {},
  results: {
    discount: null,
    transaction: null,
    issuedCoupon: null,
    couponValidation: null,
    redemption: null,
    variantPrice: null,
    variantInventory: null,
    customerRecommendations: null,
    segmentRecommendations: null
  },
  ui: {
    includeBlockedItem: false,
    promoSale: false,
    promoLoyalty: false
  },
  catalog: {
    filters: {
      query: "",
      brand: "adidas",
      product_type: "",
      sport_tag: "",
      status: "active",
      branch_id: defaultBranchId,
      size_system: "",
      size_value: "",
      in_stock: false,
      locale: savedLocale,
      at: ""
    },
    products: [],
    page: null,
    selectedProductId: null,
    product: null,
    variants: [],
    selectedVariantId: null,
    inventory: [],
    inventoryInStock: true
  },
  recommendations: {
    controls: {
      branch_id: defaultBranchId,
      limit: "10",
      segment_code: "active",
      locale: savedLocale
    }
  }
};

export function getState() {
  return state;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setState(patch) {
  Object.assign(state, patch);
  notify();
}

export function setLocale(locale) {
  state.locale = locale;
  localStorage.setItem("admin-locale", locale);
  notify();
}

export function setActiveSection(section) {
  state.activeSection = section;
  notify();
}

export function setCustomerContext(profile) {
  const customerId = profile?.customer?.id || state.customerId;
  state.profile = profile;
  state.customerId = customerId;
  state.tenantId = profile?.loyalty_snapshot?.tenant_id || state.tenantId;
  if (customerId) {
    localStorage.setItem("selected-customer-id", customerId);
  }
  notify();
}

export function setLoading(key, value) {
  if (value) {
    state.loading.add(key);
  } else {
    state.loading.delete(key);
  }
  notify();
}

export function setError(key, error) {
  state.errors = {
    ...state.errors,
    [key]: error || null
  };
  notify();
}

export function setResult(key, value) {
  state.results = {
    ...state.results,
    [key]: value
  };
  notify();
}

export function updateUi(patch) {
  state.ui = {
    ...state.ui,
    ...patch
  };
  notify();
}

function notify() {
  listeners.forEach((listener) => listener(state));
}
