import { randomUUID } from "node:crypto";
import { maskIdentity } from "../../../shared/masking.js";
import { normalizeIdentity } from "./normalization.js";

export function createIdentityService(seedData) {
  const identities = seedData.identities;

  function listPublicIdentities(customerId) {
    return identities
      .filter((identity) => identity.customer_id === customerId && identity.is_active)
      .map(toPublicIdentity);
  }

  function resolveIdentity({ tenant_id, type, value, source_system = "unknown" }) {
    const normalizedValue = normalizeIdentity(type, value);
    const matches = identities.filter(
      (identity) =>
        identity.tenant_id === tenant_id &&
        identity.type === type &&
        identity.normalized_value === normalizedValue &&
        identity.is_active
    );

    if (matches.length === 0) {
      return {
        match_status: "not_found",
        customer_id: null,
        identity: {
          type,
          value_masked: maskIdentity(type, normalizedValue),
          source_system
        },
        correlation_id: randomUUID()
      };
    }

    if (matches.length > 1) {
      return {
        match_status: "conflict",
        customer_id: null,
        duplicate_candidates: matches.map((match) => ({
          customer_id: match.customer_id,
          reason: "active_identity_conflict",
          confidence: "1.00"
        })),
        correlation_id: randomUUID()
      };
    }

    const [match] = matches;
    const customer = seedData.customers.find((candidate) => candidate.id === match.customer_id);

    return {
      match_status: customer?.status === "merged" ? "merged_customer" : "matched",
      customer_id: customer?.id || match.customer_id,
      identity: toPublicIdentity(match),
      linked_channels: buildLinkedChannels(match.customer_id),
      correlation_id: randomUUID()
    };
  }

  function buildLinkedChannels(customerId) {
    const activeTypes = new Set(
      identities
        .filter((identity) => identity.customer_id === customerId && identity.is_active)
        .map((identity) => identity.type)
    );

    return {
      pos: activeTypes.has("pos_customer"),
      web: activeTypes.has("web_account"),
      mobile_app: activeTypes.has("app_user"),
      wallet: activeTypes.has("wallet_card") || activeTypes.has("wallet_barcode"),
      phone: activeTypes.has("phone")
    };
  }

  return {
    listPublicIdentities,
    resolveIdentity
  };
}

function toPublicIdentity(identity) {
  return {
    id: identity.id,
    type: identity.type,
    value_masked: maskIdentity(identity.type, identity.normalized_value),
    source_system: identity.source_system,
    is_primary: identity.is_primary,
    is_verified: identity.is_verified,
    is_active: identity.is_active,
    first_seen_at: identity.first_seen_at,
    last_seen_at: identity.last_seen_at
  };
}
