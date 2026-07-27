import { buildInventoryChangedEvent } from "../events/factory.js";
import { createInventoryRepository } from "./repository.js";

export function createInventoryService(
  data,
  repository = createInventoryRepository(data)
) {
  const eventStore = ensureArray(data, "catalog_events");

  function getBalance(options) {
    return repository.getBalance(options);
  }

  function listBalances(options = {}) {
    return repository.listBalances(options);
  }

  function setBranchBalance(input, options = {}) {
    const result = repository.setBranchBalance(input);
    const events = [];

    if (result.changed) {
      const event = buildInventoryChangedEvent({
        variant: result.variant,
        branchId: result.branch_id,
        previousBalance: result.previous_balance,
        currentBalance: result.current_balance,
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

  return {
    getBalance,
    listBalances,
    setBranchBalance
  };
}

function ensureArray(target, field) {
  if (!Array.isArray(target[field])) {
    target[field] = [];
  }
  return target[field];
}
