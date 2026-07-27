import { buildProductUpsertedEvent } from "../events/factory.js";
import { resolveLocalizedValue } from "./localization.js";
import { createProductRepository } from "./repository.js";

export function createProductService(data, repository = createProductRepository(data)) {
  const eventStore = ensureArray(data, "catalog_events");

  function getProduct({ productId, tenantId = null, locale = "ru" }) {
    const product = repository.findById(productId, tenantId);
    return product ? projectProduct(product, locale) : null;
  }

  function searchProducts(options = {}) {
    const { locale = "ru", ...filters } = options;
    return repository.search(filters).map((product) => projectProduct(product, locale));
  }

  function upsertProduct(input, options = {}) {
    const result = repository.upsert(input);
    const event = buildProductUpsertedEvent({
      product: result.product,
      created: result.created,
      ...options
    });
    eventStore.push(event);

    return {
      ...result,
      product: projectProduct(result.product, options.locale),
      events: [event]
    };
  }

  return {
    getProduct,
    searchProducts,
    upsertProduct
  };
}

export function projectProduct(product, locale = "ru") {
  const name = resolveLocalizedValue(product.name, locale);
  const description = resolveLocalizedValue(product.description, locale);

  return {
    ...structuredClone(product),
    display_name: name.value,
    display_description: description.value,
    localization: {
      requested_locale: name.requested_locale,
      name_locale: name.resolved_locale,
      name_fallback_used: name.fallback_used,
      description_locale: description.resolved_locale,
      description_fallback_used: description.fallback_used
    }
  };
}

function ensureArray(target, field) {
  if (!Array.isArray(target[field])) {
    target[field] = [];
  }
  return target[field];
}
