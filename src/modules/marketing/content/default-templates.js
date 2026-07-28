const seedTenantId = "00000000-0000-4000-8000-000000000001";
const now = "2026-07-28T00:00:00.000Z";

export const defaultMessageTemplates = [
  template({
    id: "content-template-welcome-discount-waba",
    code: "welcome_discount",
    name: "Welcome discount",
    channel: "waba",
    category: "trigger",
    locale_variants: {
      kk: {
        subject: null,
        body: "Сәлеметсіз бе, {{name}}! Сіздің adidas клубындағы бастапқы жеңілдігіңіз - {{discount}}%.",
        media_refs: []
      },
      ru: {
        subject: null,
        body: "Здравствуйте, {{name}}! Ваша стартовая скидка в клубе adidas - {{discount}}%.",
        media_refs: []
      },
      en: {
        subject: null,
        body: "Hi {{name}}! Your starting adidas club discount is {{discount}}%.",
        media_refs: []
      }
    },
    variables: [
      variable("name", "string", true, true, "Alibek"),
      variable("discount", "decimal", true, false, "5.00")
    ]
  }),
  template({
    id: "content-template-birthday-offer-push",
    code: "birthday_offer",
    name: "Birthday offer",
    channel: "push",
    category: "trigger",
    locale_variants: {
      kk: {
        subject: "Туған күніңізбен",
        body: "{{name}}, туған күніңіз құтты болсын! {{expires_in_days}} күн ішінде бір реттік {{discount}}% жеңілдікті пайдаланыңыз.",
        media_refs: []
      },
      ru: {
        subject: "С днем рождения",
        body: "{{name}}, с днем рождения! Используйте разовую скидку {{discount}}% в течение {{expires_in_days}} дней.",
        media_refs: []
      },
      en: {
        subject: "Happy birthday",
        body: "Happy birthday, {{name}}! Use your one-time {{discount}}% discount within {{expires_in_days}} days.",
        media_refs: []
      }
    },
    variables: [
      variable("name", "string", true, true, "Alibek"),
      variable("discount", "decimal", true, false, "15.00"),
      variable("expires_in_days", "integer", true, false, "14")
    ]
  }),
  template({
    id: "content-template-profile-offer-push",
    code: "profile_offer",
    name: "Profile offer",
    channel: "push",
    category: "preview",
    locale_variants: {
      kk: {
        subject: "adidas ұсынысы",
        body: "{{name}}, сіздің өлшеміңіз {{size}}. Жеке жеңілдік: {{discount}}%.",
        media_refs: []
      },
      ru: {
        subject: "Предложение adidas",
        body: "{{name}}, ваш размер {{size}}. Персональная скидка: {{discount}}%.",
        media_refs: []
      },
      en: {
        subject: "adidas offer",
        body: "{{name}}, your size is {{size}}. Personal discount: {{discount}}%.",
        media_refs: []
      }
    },
    variables: [
      variable("name", "string", true, true, "Alibek"),
      variable("size", "string", true, false, "UK 10"),
      variable("discount", "decimal", true, false, "10.00")
    ]
  }),
  template({
    id: "content-template-recommendations-push",
    code: "recommendations_personalized",
    name: "Personalized recommendations",
    channel: "push",
    category: "recommendations",
    locale_variants: {
      kk: {
        subject: "Сізге таңдалды",
        body: "{{name}}, сізге осы тауарлар сәйкес келеді:\n{{product_blocks}}",
        media_refs: []
      },
      ru: {
        subject: "Подборка для вас",
        body: "{{name}}, вам могут подойти эти товары:\n{{product_blocks}}",
        media_refs: []
      },
      en: {
        subject: "Picked for you",
        body: "{{name}}, these products may fit you:\n{{product_blocks}}",
        media_refs: []
      }
    },
    variables: [
      variable("name", "string", true, true, "Alibek"),
      variable("product_blocks", "recommendation_block", true, false, "Product list")
    ]
  }),
  template({
    id: "content-template-abandoned-cart-push",
    code: "abandoned_cart_push",
    name: "Abandoned cart push",
    channel: "push",
    category: "trigger",
    locale_variants: {
      kk: { subject: null, body: "{{name}}, {{item_name}} әлі себетіңізде.", media_refs: [] },
      ru: { subject: null, body: "{{name}}, {{item_name}} все еще в вашей корзине.", media_refs: [] },
      en: { subject: null, body: "{{name}}, {{item_name}} is still in your cart.", media_refs: [] }
    },
    variables: [
      variable("name", "string", true, true, "Alibek"),
      variable("item_name", "string", true, false, "RUN-SHOE-001-UK10")
    ]
  }),
  template({
    id: "content-template-tier-retention-push",
    code: "tier_retention",
    name: "Tier retention",
    channel: "push",
    category: "trigger",
    locale_variants: {
      kk: {
        subject: null,
        body: "{{name}}, {{discount}}% жеңілдікті сақтау үшін {{retention_gap_amount}} {{currency}} сомасына сатып алу қалды.",
        media_refs: []
      },
      ru: {
        subject: null,
        body: "{{name}}, до сохранения скидки {{discount}}% осталось покупок на {{retention_gap_amount}} {{currency}}.",
        media_refs: []
      },
      en: {
        subject: null,
        body: "{{name}}, spend {{retention_gap_amount}} {{currency}} more to keep your {{discount}}% discount.",
        media_refs: []
      }
    },
    variables: [
      variable("name", "string", true, true, "Alibek"),
      variable("discount", "decimal", true, false, "10.00"),
      variable("retention_gap_amount", "decimal", true, false, "25000.00"),
      variable("currency", "string", true, false, "KZT")
    ]
  })
];

function template(overrides) {
  return {
    id: overrides.id,
    tenant_id: seedTenantId,
    status: "active",
    code: overrides.code,
    name: overrides.name,
    channel: overrides.channel,
    category: overrides.category,
    locale_variants: overrides.locale_variants,
    variables: overrides.variables,
    provider_metadata: {
      waba_template_name: null,
      email_layout_id: null,
      push_category: overrides.category
    },
    approval: {
      required: false,
      status: "approved",
      approved_by: null,
      approved_at: now
    },
    created_at: now,
    updated_at: now,
    version: 1
  };
}

function variable(name, type, required, pii, example) {
  return { name, type, required, pii, example };
}
