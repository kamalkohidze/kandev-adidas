import { resolveLocalizedValue } from "../products/localization.js";
import { createVariantRepository } from "./repository.js";

export function createVariantService(data, repository = createVariantRepository(data)) {
  function getVariant({ variantId, tenantId = null, locale = "ru" }) {
    const variant = repository.findById(variantId, tenantId);
    return variant ? projectVariant(variant, locale) : null;
  }

  function listVariants(options = {}) {
    const { locale = "ru", ...filters } = options;
    return repository.list(filters).map((variant) => projectVariant(variant, locale));
  }

  function upsertVariant(input, options = {}) {
    const result = repository.upsert(input);
    return {
      ...result,
      variant: projectVariant(result.variant, options.locale)
    };
  }

  return {
    getVariant,
    listVariants,
    upsertVariant
  };
}

export function projectVariant(variant, locale = "ru") {
  const colorName = resolveLocalizedValue(variant.color?.name, locale);
  return {
    ...structuredClone(variant),
    display_color_name: colorName.value,
    localization: {
      requested_locale: colorName.requested_locale,
      color_locale: colorName.resolved_locale,
      color_fallback_used: colorName.fallback_used
    }
  };
}
