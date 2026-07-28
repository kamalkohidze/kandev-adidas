export function createDeterministicProviderAdapters(behavior = {}) {
  const adapters = {};
  for (const channel of ["push", "waba", "sms", "email"]) {
    adapters[channel] = createAdapter(channel, behavior[channel]);
  }
  return adapters;
}

function createAdapter(channel, behavior) {
  const outcomes = Array.isArray(behavior) ? [...behavior] : behavior ? [behavior] : [];
  let callCount = 0;

  return {
    provider: `mock-${channel}`,
    send({ delivery, attempt }) {
      const configured = outcomes[callCount] || outcomes[outcomes.length - 1] || { ok: true };
      callCount += 1;

      if (configured.ok === false) {
        return {
          ok: false,
          provider: configured.provider || `mock-${channel}`,
          retryable: configured.retryable === true,
          failure_code: configured.failure_code || "mock_failure",
          failure_message: configured.failure_message || `Deterministic ${channel} adapter failure`
        };
      }

      return {
        ok: true,
        provider: configured.provider || `mock-${channel}`,
        provider_message_id:
          configured.provider_message_id || `${channel}-${delivery.id}-${attempt.attempt_number}`,
        status: configured.status || "sent",
        metadata: configured.metadata || {}
      };
    }
  };
}

