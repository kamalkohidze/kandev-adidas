export const marketingTriggerPresets = [
  {
    code: "welcome",
    workflow_code: "trigger-welcome",
    name: "Welcome",
    description: "Starts a welcome journey when a customer is registered and marketing consent allows contact.",
    event_types: ["customer.registered"],
    preferred_channels: ["push", "email", "sms", "waba"],
    definition: {
      code: "trigger-welcome",
      name: "Welcome",
      status: "active",
      journey_code: "welcome",
      trigger: {
        event_types: ["customer.registered"],
        condition: {
          all: [
            { type: "event_type_is", event_type: "customer.registered" },
            { type: "event_payload_exists", path: "customer_id" },
            {
              type: "marketing_consent_allows",
              channels: ["push", "email", "sms", "waba"]
            }
          ]
        }
      },
      entry_step: "send_welcome",
      steps: [
        {
          code: "send_welcome",
          type: "action",
          action: {
            type: "request_delivery",
            template_code: "welcome_discount",
            preferred_channels: ["waba"],
            payload_builder: { type: "marketing_trigger", preset_code: "welcome" }
          },
          next_step: "wait_before_brand_email"
        },
        {
          code: "wait_before_brand_email",
          type: "delay",
          delay: { amount: 3, unit: "days" },
          next_step: "send_brand_email"
        },
        {
          code: "send_brand_email",
          type: "action",
          action: {
            type: "request_delivery",
            template_code: "welcome_brand_story",
            preferred_channels: ["email"],
            payload_builder: { type: "marketing_trigger", preset_code: "welcome" }
          },
          next_step: "done"
        },
        { code: "done", type: "end" }
      ]
    }
  },
  {
    code: "birthday",
    workflow_code: "trigger-birthday",
    name: "Birthday",
    description: "Sends the birthday offer inside the scheduler birthday window.",
    event_types: ["customer.birthday.due"],
    preferred_channels: ["push", "waba", "sms", "email"],
    definition: {
      code: "trigger-birthday",
      name: "Birthday",
      status: "active",
      journey_code: "birthday",
      trigger: {
        event_types: ["customer.birthday.due"],
        condition: {
          all: [
            { type: "event_type_is", event_type: "customer.birthday.due" },
            { type: "event_payload_exists", path: "customer_id" },
            { type: "birthday_window", min_days_before: 0, max_days_before: 7 },
            {
              type: "marketing_consent_allows",
              channels: ["push", "waba", "sms", "email"]
            }
          ]
        }
      },
      entry_step: "send_birthday_offer",
      steps: [
        {
          code: "send_birthday_offer",
          type: "action",
          action: {
            type: "request_delivery",
            template_code: "birthday_offer",
            preferred_channels: ["push", "waba", "sms", "email"],
            payload_builder: { type: "marketing_trigger", preset_code: "birthday" }
          },
          next_step: "done"
        },
        { code: "done", type: "end" }
      ]
    }
  },
  {
    code: "abandoned-cart",
    workflow_code: "trigger-abandoned-cart",
    name: "Abandoned Cart",
    description: "Waits one hour after cart abandonment before requesting a recovery message.",
    event_types: ["cart.abandoned"],
    preferred_channels: ["push", "waba", "sms", "email"],
    definition: {
      code: "trigger-abandoned-cart",
      name: "Abandoned Cart",
      status: "active",
      journey_code: "abandoned-cart",
      trigger: {
        event_types: ["cart.abandoned"],
        condition: {
          all: [
            { type: "event_type_is", event_type: "cart.abandoned" },
            { type: "event_payload_exists", path: "customer_id" },
            {
              type: "marketing_consent_allows",
              channels: ["push", "waba", "sms", "email"]
            }
          ]
        }
      },
      entry_step: "wait_after_abandonment",
      steps: [
        {
          code: "wait_after_abandonment",
          type: "delay",
          delay: { amount: 1, unit: "hours" },
          next_step: "send_cart_push"
        },
        {
          code: "send_cart_push",
          type: "action",
          action: {
            type: "request_delivery",
            template_code: "abandoned_cart_push",
            preferred_channels: ["push"],
            payload_builder: { type: "marketing_trigger", preset_code: "abandoned-cart" }
          },
          next_step: "wait_before_waba_followup"
        },
        {
          code: "wait_before_waba_followup",
          type: "delay",
          delay: { amount: 23, unit: "hours" },
          next_step: "send_cart_waba"
        },
        {
          code: "send_cart_waba",
          type: "action",
          action: {
            type: "request_delivery",
            template_code: "abandoned_cart_waba",
            preferred_channels: ["waba"],
            payload_builder: { type: "marketing_trigger", preset_code: "abandoned-cart" }
          },
          next_step: "done"
        },
        { code: "done", type: "end" }
      ]
    }
  },
  {
    code: "tier-retention",
    workflow_code: "trigger-tier-retention",
    name: "Tier Retention",
    description: "Warns customers with a positive tier retention gap before recalculation.",
    event_types: ["loyalty.tier.retention_risk"],
    preferred_channels: ["push", "sms", "email", "waba"],
    definition: {
      code: "trigger-tier-retention",
      name: "Tier Retention",
      status: "active",
      journey_code: "tier-retention",
      trigger: {
        event_types: ["loyalty.tier.retention_risk"],
        condition: {
          all: [
            { type: "event_type_is", event_type: "loyalty.tier.retention_risk" },
            { type: "event_payload_exists", path: "customer_id" },
            { type: "event_payload_number_greater_than", path: "retention_gap_amount", value: 0 },
            {
              type: "event_payload_number_between",
              path: "days_until_recalculation",
              min: 0,
              max: 30
            },
            {
              type: "marketing_consent_allows",
              channels: ["push", "sms", "email", "waba"]
            }
          ]
        }
      },
      entry_step: "send_retention_gap",
      steps: [
        {
          code: "send_retention_gap",
          type: "action",
          action: {
            type: "request_delivery",
            template_code: "tier_retention",
            preferred_channels: ["push", "sms", "email", "waba"],
            payload_builder: { type: "marketing_trigger", preset_code: "tier-retention" }
          },
          next_step: "done"
        },
        { code: "done", type: "end" }
      ]
    }
  }
];

const presetsByCode = new Map(marketingTriggerPresets.map((preset) => [preset.code, preset]));

export function listMarketingTriggerPresets() {
  return marketingTriggerPresets.map((preset) => clonePreset(preset));
}

export function getMarketingTriggerPreset(code) {
  const preset = presetsByCode.get(String(code || ""));
  return preset ? clonePreset(preset) : null;
}

function clonePreset(preset) {
  return structuredClone(preset);
}
