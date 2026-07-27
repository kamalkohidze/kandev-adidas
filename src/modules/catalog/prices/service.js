import { buildPriceChangedEvent } from "../events/factory.js";
import { createPriceRepository } from "./repository.js";

export function createPriceService(data, repository = createPriceRepository(data)) {
  const eventStore = ensureArray(data, "catalog_events");

  function getPrice(options) {
    return repository.getPrice(options);
  }

  function listPrices(options = {}) {
    return repository.listPrices(options);
  }

  function setBasePrice(input, options = {}) {
    return persistPriceChange(repository.setBasePrice(input), options);
  }

  function setBranchPrice(input, options = {}) {
    return persistPriceChange(repository.setBranchPrice(input), options);
  }

  return {
    getPrice,
    listPrices,
    setBasePrice,
    setBranchPrice
  };

  function persistPriceChange(result, options) {
    const events = [];
    if (result.changed) {
      const event = buildPriceChangedEvent({
        variant: result.variant,
        branchId: result.branch_id,
        previousPrice: result.previous_price,
        currentPrice: result.current_price,
        ...options
      });
      eventStore.push(event);
      events.push(event);
    }

    return {
      ...result,
      events
    };
  }
}

function ensureArray(target, field) {
  if (!Array.isArray(target[field])) {
    target[field] = [];
  }
  return target[field];
}
