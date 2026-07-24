import assert from "node:assert/strict";
import test from "node:test";
import { issueCoupon, redeemCoupon, validateCoupon } from "../src/modules/promotions/coupons/repository.js";
import { evaluatePromotionCompatibility, isEarlyAccessEligible } from "../src/modules/promotions/rules/evaluator.js";
import { createApp } from "../src/platform/app.js";
import { createSeedData } from "../src/platform/seed-data.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const customerId = "11111111-1111-4111-8111-111111111111";

test("birthday coupons expire after 14 days", () => {
  const data = createSeedData();
  const issued = issueCoupon(
    data,
    {
      customer_id: customerId,
      promotion_type: "birthday",
      code: "BDAY-ALIBEK",
      issued_at: "2026-07-01T00:00:00.000Z"
    },
    { idempotencyKey: "issue-birthday-expiry", asOf: "2026-07-01T00:00:00.000Z" }
  );

  assert.equal(issued.coupon.discount_percent, "15.00");
  assert.equal(issued.coupon.expires_at, "2026-07-15T00:00:00.000Z");

  const beforeExpiry = validateCoupon(data, {
    customer_id: customerId,
    code: "BDAY-ALIBEK",
    as_of: "2026-07-14T23:59:59.000Z"
  });
  assert.equal(beforeExpiry.valid, true);

  const afterExpiry = validateCoupon(data, {
    customer_id: customerId,
    code: "BDAY-ALIBEK",
    as_of: "2026-07-15T00:00:00.000Z"
  });
  assert.equal(afterExpiry.valid, false);
  assert.equal(afterExpiry.reason, "coupon_expired");
  assert.equal(issued.coupon.status, "expired");
});

test("one-time coupons cannot be redeemed twice", () => {
  const data = createSeedData();
  issueCoupon(data, {
    customer_id: customerId,
    promotion_type: "cross_sell",
    code: "XSELL-ONE",
    issued_at: "2026-07-01T00:00:00.000Z"
  });

  const first = redeemCoupon(
    data,
    {
      customer_id: customerId,
      code: "XSELL-ONE",
      redemption_ref: "ORDER-1",
      as_of: "2026-07-02T00:00:00.000Z",
      cart: eligibleCart()
    },
    { idempotencyKey: "redeem-xsell-one" }
  );
  assert.equal(first.redeemed, true);
  assert.equal(first.coupon.status, "redeemed");
  assert.equal(first.discount_amount, "100.00");
  assert.deepEqual(first.events.map((event) => event.event_type), [
    "promotion.coupon.validated",
    "promotion.coupon.redeemed"
  ]);

  const second = redeemCoupon(
    data,
    {
      customer_id: customerId,
      code: "XSELL-ONE",
      redemption_ref: "ORDER-2",
      as_of: "2026-07-02T01:00:00.000Z",
      cart: eligibleCart()
    },
    { idempotencyKey: "redeem-xsell-again" }
  );
  assert.equal(second.redeemed, false);
  assert.equal(second.reason, "coupon_already_redeemed");
});

test("compatibility rules use catalog promotion flags and sale/loyalty stacking", () => {
  const data = createSeedData();
  const birthday = issueCoupon(data, {
    customer_id: customerId,
    promotion_type: "birthday",
    code: "BDAY-COMPAT",
    issued_at: "2026-07-01T00:00:00.000Z"
  }).coupon;
  const weekly = issueCoupon(data, {
    customer_id: customerId,
    promotion_type: "weekly_extra",
    code: "WEEKLY-SALE",
    issued_at: "2026-07-01T00:00:00.000Z"
  }).coupon;

  const productBlocked = evaluatePromotionCompatibility(data, {
    coupon: birthday,
    customerId,
    cart: {
      currency: "KZT",
      items: [{ sku: "SALE-JACKET-001-M", barcode: "4870000000013", quantity: "1", unit_price: "1000.00" }]
    },
    asOf: "2026-07-02T00:00:00.000Z"
  });
  assert.equal(productBlocked.valid, false);
  assert.equal(productBlocked.reason, "no_eligible_items");
  assert.equal(productBlocked.warnings[0].code, "personal_promo_not_allowed_for_product");

  const saleBlocked = evaluatePromotionCompatibility(data, {
    coupon: birthday,
    customerId,
    cart: {
      currency: "KZT",
      items: [
        {
          sku: "RUN-SHOE-001-UK10",
          barcode: "4870000000012",
          quantity: "1",
          unit_price: "1000.00",
          applied_discounts: [{ type: "sale", code: "SALE-20", amount: "200.00", stackable: false }]
        }
      ]
    },
    asOf: "2026-07-02T00:00:00.000Z"
  });
  assert.equal(saleBlocked.valid, false);
  assert.equal(saleBlocked.warnings[0].code, "promotion_not_stackable_with_sale");

  const weeklySale = evaluatePromotionCompatibility(data, {
    coupon: weekly,
    customerId,
    cart: {
      currency: "KZT",
      items: [
        {
          sku: "RUN-SHOE-001-UK10",
          barcode: "4870000000012",
          quantity: "1",
          unit_price: "1000.00",
          applied_discounts: [{ type: "sale", code: "SALE-20", amount: "200.00", stackable: false }]
        }
      ]
    },
    asOf: "2026-07-02T00:00:00.000Z"
  });
  assert.equal(weeklySale.valid, true);
  assert.equal(weeklySale.discount_amount, "50.00");

  const birthdayLoyaltyBlocked = evaluatePromotionCompatibility(data, {
    coupon: birthday,
    customerId,
    cart: {
      currency: "KZT",
      loyalty_discount_percent: "10.00",
      items: [{ sku: "RUN-SHOE-001-UK10", barcode: "4870000000012", quantity: "1", unit_price: "1000.00" }]
    },
    asOf: "2026-07-02T00:00:00.000Z"
  });
  assert.equal(birthdayLoyaltyBlocked.valid, false);
  assert.equal(birthdayLoyaltyBlocked.reason, "promotion_not_stackable_with_loyalty");

  const weeklyLoyaltyAllowed = evaluatePromotionCompatibility(data, {
    coupon: weekly,
    customerId,
    cart: {
      currency: "KZT",
      loyalty_discount_percent: "10.00",
      items: [{ sku: "RUN-SHOE-001-UK10", barcode: "4870000000012", quantity: "1", unit_price: "1000.00" }]
    },
    asOf: "2026-07-02T00:00:00.000Z"
  });
  assert.equal(weeklyLoyaltyAllowed.valid, true);
  assert.equal(weeklyLoyaltyAllowed.discount_amount, "50.00");
});

test("early access eligibility is based on active customer and loyalty tier read model", () => {
  const data = createSeedData();
  const eligibleCoupon = issueCoupon(data, {
    customer_id: customerId,
    promotion_type: "weekly_extra",
    code: "WEEKLY-EARLY",
    issued_at: "2026-07-01T00:00:00.000Z",
    requires_early_access: true
  }).coupon;

  assert.equal(isEarlyAccessEligible(data, customerId, tenantId), false);
  const silverBlocked = evaluatePromotionCompatibility(data, {
    coupon: eligibleCoupon,
    customerId,
    asOf: "2026-07-02T00:00:00.000Z"
  });
  assert.equal(silverBlocked.valid, false);
  assert.equal(silverBlocked.reason, "early_access_not_eligible");

  data.loyalty_accounts[0].current_tier_id = "66666666-6666-4666-8666-666666666663";
  data.loyalty_accounts[0].current_discount_percent = "15.00";

  assert.equal(isEarlyAccessEligible(data, customerId, tenantId), true);
  assert.equal(
    evaluatePromotionCompatibility(data, {
      coupon: eligibleCoupon,
      customerId,
      asOf: "2026-07-02T00:00:00.000Z"
    }).valid,
    true
  );
});

test("promotion coupon API validates, applies, and redeems coupons", async () => {
  const app = createApp();

  const missingIdempotency = await app.handle("POST", "/api/v1/promotions/coupons", {
    headers: { "Accept-Language": "ru" },
    body: { customer_id: customerId, promotion_type: "birthday" }
  });
  assert.equal(missingIdempotency.status, 400);
  assert.equal(JSON.parse(missingIdempotency.body).error.details[0].field, "Idempotency-Key");

  const created = await app.handle("POST", "/api/v1/promotions/coupons", {
    headers: { "Idempotency-Key": "api-issue-birthday", "X-Correlation-Id": "corr-promo-api" },
    body: {
      customer_id: customerId,
      promotion_type: "birthday",
      code: "BDAY-API",
      issued_at: "2026-07-01T00:00:00.000Z"
    }
  });
  const createdBody = JSON.parse(created.body);
  assert.equal(created.status, 201);
  assert.equal(createdBody.coupon.code, "BDAY-API");
  assert.deepEqual(createdBody.events, ["promotion.coupon.issued"]);

  const checked = await app.handle("POST", "/api/v1/promotions/coupons/validate", {
    headers: { "Accept-Language": "ru" },
    body: {
      customer_id: customerId,
      code: "BDAY-API",
      as_of: "2026-07-02T00:00:00.000Z",
      cart: eligibleCart()
    }
  });
  const checkedBody = JSON.parse(checked.body);
  assert.equal(checked.status, 200);
  assert.equal(checkedBody.valid, true);
  assert.equal(checkedBody.discount_percent, "15.00");
  assert.equal(checkedBody.discount_amount, "150.00");

  const redeemed = await app.handle("POST", "/api/v1/promotions/coupons/redeem", {
    headers: { "Idempotency-Key": "api-redeem-birthday" },
    body: {
      customer_id: customerId,
      code: "BDAY-API",
      redemption_ref: "ORDER-API-1",
      as_of: "2026-07-02T00:05:00.000Z",
      cart: eligibleCart()
    }
  });
  const redeemedBody = JSON.parse(redeemed.body);
  assert.equal(redeemed.status, 200);
  assert.equal(redeemedBody.redeemed, true);
  assert.equal(redeemedBody.coupon.status, "redeemed");
  assert.deepEqual(redeemedBody.events, ["promotion.coupon.validated", "promotion.coupon.redeemed"]);

  const duplicate = await app.handle("POST", "/api/v1/promotions/coupons/redeem", {
    headers: { "Idempotency-Key": "api-redeem-birthday-2" },
    body: {
      customer_id: customerId,
      code: "BDAY-API",
      redemption_ref: "ORDER-API-2",
      as_of: "2026-07-02T00:10:00.000Z",
      cart: eligibleCart()
    }
  });
  assert.equal(duplicate.status, 409);
  assert.equal(JSON.parse(duplicate.body).validation.reason, "coupon_already_redeemed");
});

test("promotion issue rejects duplicate customer coupon codes and invalid date ranges", async () => {
  const app = createApp();
  const first = await app.handle("POST", "/api/v1/promotions/coupons", {
    headers: { "Idempotency-Key": "api-issue-duplicate-1" },
    body: {
      customer_id: customerId,
      promotion_type: "birthday",
      code: "BDAY-DUPLICATE",
      issued_at: "2026-07-01T00:00:00.000Z"
    }
  });
  assert.equal(first.status, 201);

  const duplicate = await app.handle("POST", "/api/v1/promotions/coupons", {
    headers: { "Idempotency-Key": "api-issue-duplicate-2" },
    body: {
      customer_id: customerId,
      promotion_type: "birthday",
      code: "bday-duplicate",
      issued_at: "2026-07-01T00:00:00.000Z"
    }
  });
  const duplicateBody = JSON.parse(duplicate.body);
  assert.equal(duplicate.status, 400);
  assert.equal(duplicateBody.error.details[0].reason, "coupon_code_already_exists");

  const invalidDates = await app.handle("POST", "/api/v1/promotions/coupons", {
    headers: { "Idempotency-Key": "api-issue-invalid-dates" },
    body: {
      customer_id: customerId,
      promotion_type: "birthday",
      code: "BDAY-BAD-DATES",
      valid_from: "2026-07-10T00:00:00.000Z",
      expires_at: "2026-07-10T00:00:00.000Z"
    }
  });
  const invalidDatesBody = JSON.parse(invalidDates.body);
  assert.equal(invalidDates.status, 400);
  assert.deepEqual(invalidDatesBody.error.details, [{ field: "expires_at", reason: "must_be_after_valid_from" }]);
});

test("promotion API returns validation errors for malformed optional sale and loyalty amounts", async () => {
  const app = createApp();
  await app.handle("POST", "/api/v1/promotions/coupons", {
    headers: { "Idempotency-Key": "api-issue-malformed-money" },
    body: {
      customer_id: customerId,
      promotion_type: "weekly_extra",
      code: "WEEKLY-MONEY",
      issued_at: "2026-07-01T00:00:00.000Z"
    }
  });

  const validateResponse = await app.handle("POST", "/api/v1/promotions/coupons/validate", {
    headers: { "Accept-Language": "ru" },
    body: {
      customer_id: customerId,
      code: "WEEKLY-MONEY",
      as_of: "2026-07-02T00:00:00.000Z",
      cart: {
        currency: "KZT",
        loyalty_discount_percent: "10.001",
        applied_discounts: [{ type: "sale", amount: "bad" }],
        items: [
          {
            sku: "RUN-SHOE-001-UK10",
            barcode: "4870000000012",
            quantity: "1",
            unit_price: "1000.00",
            gross_amount: "bad-gross",
            sale_discount_amount: "not-money"
          }
        ]
      }
    }
  });
  const validateBody = JSON.parse(validateResponse.body);
  assert.equal(validateResponse.status, 400);
  assert.deepEqual(
    validateBody.error.details.map((detail) => detail.field),
    [
      "cart.loyalty_discount_percent",
      "cart.applied_discounts.0.amount",
      "cart.items.0.gross_amount",
      "cart.items.0.sale_discount_amount"
    ]
  );

  const redeemResponse = await app.handle("POST", "/api/v1/promotions/coupons/redeem", {
    headers: { "Idempotency-Key": "api-redeem-malformed-money" },
    body: {
      customer_id: customerId,
      code: "WEEKLY-MONEY",
      redemption_ref: "ORDER-MALFORMED-MONEY",
      as_of: "2026-07-02T00:00:00.000Z",
      cart: {
        currency: "KZT",
        items: [
          {
            sku: "RUN-SHOE-001-UK10",
            barcode: "4870000000012",
            quantity: "1",
            unit_price: "1000.00",
            gross_amount: "bad-gross"
          }
        ]
      }
    }
  });
  const redeemBody = JSON.parse(redeemResponse.body);
  assert.equal(redeemResponse.status, 400);
  assert.deepEqual(redeemBody.error.details, [
    { field: "cart.items.0.gross_amount", reason: "money_decimal_string_required" }
  ]);
});

function eligibleCart() {
  return {
    currency: "KZT",
    items: [{ sku: "RUN-SHOE-001-UK10", barcode: "4870000000012", quantity: "1", unit_price: "1000.00" }]
  };
}
