import assert from "node:assert/strict";
import test from "node:test";
import { identityTypes, locales, normalizeLocale } from "../src/shared/contracts.js";
import { maskBarcode, maskEmail, maskPhone } from "../src/shared/masking.js";
import { normalizeIdentity } from "../src/modules/customer/identity/normalization.js";

test("locale aliases follow docs/data-contracts.md", () => {
  assert.deepEqual(locales, ["kk", "ru", "en"]);
  assert.equal(normalizeLocale("KZ"), "kk");
  assert.equal(normalizeLocale("RU"), "ru");
  assert.equal(normalizeLocale("EN"), "en");
  assert.equal(normalizeLocale("unknown"), "ru");
});

test("identity type registry includes CustomerIdentity contract values", () => {
  assert.ok(identityTypes.includes("phone"));
  assert.ok(identityTypes.includes("wallet_barcode"));
  assert.ok(identityTypes.includes("erp_counterparty"));
});

test("identity normalization supports POS phone and wallet lookup", () => {
  assert.equal(normalizeIdentity("phone", "8 (701) 757-83-20"), "+77017578320");
  assert.equal(normalizeIdentity("wallet_barcode", "980 124-000001"), "980124000001");
});

test("PII masking keeps API read models safe by default", () => {
  assert.equal(maskPhone("+77017578320"), "+7701***8320");
  assert.equal(maskEmail("alibek@example.com"), "al***@example.com");
  assert.equal(maskBarcode("980124000001"), "980124******");
});
