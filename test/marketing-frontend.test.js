import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCrossSellGenerateBody,
  buildLifecycleAuditBody,
  buildSegmentQuery,
  parsePositiveInt,
  splitCsv
} from "../public/marketing-utils.js";

test("marketing segment query serializes audience filters", () => {
  const query = buildSegmentQuery({
    category_ids: "cat-1, cat-2",
    sport_tags: "running,football",
    size_system: "uk",
    size_value: "10",
    purchase_within_days: "183",
    as_of: "2026-07-27T00:00",
    limit: "25"
  }, "en");
  const params = new URLSearchParams(query);

  assert.deepEqual(params.getAll("category_ids"), ["cat-1", "cat-2"]);
  assert.deepEqual(params.getAll("sport_tags"), ["running", "football"]);
  assert.equal(params.get("size_system"), "uk");
  assert.equal(params.get("size_value"), "10");
  assert.equal(params.get("purchase_within_days"), "183");
  assert.equal(params.get("as_of"), "2026-07-27T00:00");
  assert.equal(params.get("limit"), "25");
  assert.equal(params.get("locale"), "en");
});

test("marketing lifecycle audit body supports customer and tenant modes", () => {
  assert.deepEqual(
    buildLifecycleAuditBody({ audit_mode: "customer", as_of: "2026-07-27T00:00" }, "customer-1"),
    { as_of: "2026-07-27T00:00", customer_id: "customer-1" }
  );
  assert.deepEqual(
    buildLifecycleAuditBody({ audit_mode: "tenant", limit: "50" }, "customer-1"),
    { limit: 50 }
  );
});

test("marketing cross-sell generate body compacts optional fields", () => {
  assert.deepEqual(
    buildCrossSellGenerateBody({
      as_of: "2026-07-16T00:00",
      branch_id: "branch-1",
      locale: "en",
      limit: "10",
      scenario_codes: "shoe-care-after-purchase, running-accessories-after-14-days"
    }, "ru"),
    {
      as_of: "2026-07-16T00:00",
      branch_id: "branch-1",
      locale: "en",
      limit: 10,
      scenario_codes: ["shoe-care-after-purchase", "running-accessories-after-14-days"]
    }
  );
  assert.deepEqual(splitCsv(" a, ,b "), ["a", "b"]);
  assert.equal(parsePositiveInt("0"), null);
  assert.equal(parsePositiveInt("12"), 12);
});
