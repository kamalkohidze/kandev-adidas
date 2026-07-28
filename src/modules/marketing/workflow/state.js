export const journeyStatuses = ["running", "waiting", "completed", "cancelled", "failed"];
export const stepStatuses = ["pending", "running", "waiting", "completed", "skipped", "failed"];

const journeyTransitions = {
  running: new Set(["waiting", "completed", "cancelled", "failed"]),
  waiting: new Set(["running", "completed", "cancelled", "failed"]),
  completed: new Set([]),
  cancelled: new Set([]),
  failed: new Set([])
};

const stepTransitions = {
  pending: new Set(["running", "skipped", "failed"]),
  running: new Set(["waiting", "completed", "skipped", "failed"]),
  waiting: new Set(["running", "completed", "skipped", "failed"]),
  completed: new Set([]),
  skipped: new Set([]),
  failed: new Set([])
};

export function transitionJourney(instance, nextStatus, at) {
  if (!journeyStatuses.includes(nextStatus)) {
    throw new Error(`Unsupported journey status: ${nextStatus}`);
  }
  if (instance.status === nextStatus) {
    return instance;
  }
  if (!journeyTransitions[instance.status]?.has(nextStatus)) {
    throw new Error(`Invalid journey transition: ${instance.status} -> ${nextStatus}`);
  }

  instance.status = nextStatus;
  instance.updated_at = at;
  if (nextStatus === "completed") {
    instance.completed_at = at;
  }
  if (nextStatus === "cancelled") {
    instance.cancelled_at = at;
  }
  if (nextStatus === "failed") {
    instance.failed_at = at;
  }
  instance.version += 1;
  return instance;
}

export function transitionStep(stepState, nextStatus, at, patch = {}) {
  if (!stepStatuses.includes(nextStatus)) {
    throw new Error(`Unsupported step status: ${nextStatus}`);
  }
  if (stepState.status !== nextStatus && !stepTransitions[stepState.status]?.has(nextStatus)) {
    throw new Error(`Invalid step transition: ${stepState.status} -> ${nextStatus}`);
  }

  stepState.status = nextStatus;
  Object.assign(stepState, patch);
  if (nextStatus === "running" && !stepState.started_at) {
    stepState.started_at = at;
  }
  if (["completed", "skipped", "failed"].includes(nextStatus)) {
    stepState.completed_at = at;
  }
  stepState.updated_at = at;
  return stepState;
}
