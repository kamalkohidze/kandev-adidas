export const defaultLocale = "ru";

export const fallbackLocale = "ru";

export const dictionaries = {
  admin: {
    "app.title": {
      kk: "UCO CRM",
      ru: "UCO CRM",
      en: "UCO CRM"
    },
    "app.subtitle": {
      kk: "Headless retail loyalty platform scaffold",
      ru: "Headless scaffold платформы лояльности для ритейла",
      en: "Headless retail loyalty platform scaffold"
    },
    "status.checking": {
      kk: "Тексеру",
      ru: "Проверка",
      en: "Checking"
    },
    "status.online": {
      kk: "Онлайн",
      ru: "Онлайн",
      en: "Online"
    },
    "status.issue": {
      kk: "Мәселе",
      ru: "Проблема",
      en: "Issue"
    },
    "nav.customer360": {
      kk: "Клиент 360",
      ru: "Клиент 360",
      en: "Customer 360"
    },
    "nav.loyalty": {
      kk: "Адалдық",
      ru: "Лояльность",
      en: "Loyalty"
    },
    "nav.marketing": {
      kk: "Маркетинг",
      ru: "Маркетинг",
      en: "Marketing"
    },
    "nav.integrations": {
      kk: "Интеграциялар",
      ru: "Интеграции",
      en: "Integrations"
    },
    "toolbar.customer360": {
      kk: "Клиент 360",
      ru: "Клиент 360",
      en: "Customer 360"
    },
    "action.refresh": {
      kk: "Жаңарту",
      ru: "Обновить",
      en: "Refresh"
    },
    "label.customer": {
      kk: "Клиент",
      ru: "Клиент",
      en: "Customer"
    },
    "label.locale": {
      kk: "Байланыс тілі",
      ru: "Язык коммуникации",
      en: "Communication language"
    },
    "label.annualSpend": {
      kk: "Жылдық шығын",
      ru: "Годовые траты",
      en: "Annual spend"
    },
    "label.tier": {
      kk: "Деңгей",
      ru: "Уровень",
      en: "Tier"
    },
    "label.shoeSize": {
      kk: "Аяқ киім өлшемі",
      ru: "Размер обуви",
      en: "Shoe size"
    },
    "label.lastPurchase": {
      kk: "Соңғы сатып алу",
      ru: "Последняя покупка",
      en: "Last purchase"
    },
    "label.noPurchases": {
      kk: "Сатып алулар жоқ",
      ru: "Покупок нет",
      en: "No purchases"
    },
    "locale.kk": {
      kk: "Қазақша",
      ru: "Казахский",
      en: "Kazakh"
    },
    "locale.ru": {
      kk: "Орысша",
      ru: "Русский",
      en: "Russian"
    },
    "locale.en": {
      kk: "Ағылшынша",
      ru: "Английский",
      en: "English"
    }
  },
  api: {
    "error.not_found": {
      kk: "Бағыт табылмады",
      ru: "Маршрут не найден",
      en: "Route not found"
    },
    "error.validation_error": {
      kk: "Сұрауда қате бар",
      ru: "В запросе есть ошибка",
      en: "Request validation failed"
    },
    "error.unsupported_locale": {
      kk: "Таңдалған тіл қолжетімді емес",
      ru: "Выбранный язык недоступен",
      en: "The selected language is not supported"
    },
    "error.missing_locale_variant": {
      kk: "Қажетті аударма табылмады",
      ru: "Не найден обязательный перевод"
    },
    "profile.updated": {
      kk: "Профиль жаңартылды",
      ru: "Профиль обновлен",
      en: "Profile updated"
    }
  },
  wallet: {
    "card.title": {
      kk: "adidas клуб картасы",
      ru: "Карта клуба adidas",
      en: "adidas club card"
    },
    "card.number": {
      kk: "Карта нөмірі",
      ru: "Номер карты",
      en: "Card number"
    },
    "card.barcode": {
      kk: "Штрихкод",
      ru: "Штрихкод",
      en: "Barcode"
    },
    "card.discount": {
      kk: "Жеке жеңілдік",
      ru: "Персональная скидка",
      en: "Personal discount"
    },
    "card.tier": {
      kk: "Деңгей",
      ru: "Уровень",
      en: "Tier"
    },
    "geofence.store_nearby": {
      kk: "{{first_name}}, сіз {{store_name}} дүкенінің жанындасыз. Сіздің жеке жеңілдігіңіз {{discount_percent}}%.",
      ru: "{{first_name}}, вы рядом с магазином {{store_name}}. Ваша персональная скидка {{discount_percent}}%.",
      en: "{{first_name}}, you are near {{store_name}}. Your personal discount is {{discount_percent}}%."
    }
  },
  templates: {
    welcome_discount: {
      kk: "Сәлеметсіз бе, {{first_name}}! Сіздің adidas клубындағы бастапқы жеңілдігіңіз - {{discount_percent}}%.",
      ru: "Здравствуйте, {{first_name}}! Ваша стартовая скидка в клубе adidas - {{discount_percent}}%.",
      en: "Hi {{first_name}}! Your starting adidas club discount is {{discount_percent}}%."
    },
    birthday_offer: {
      kk: "{{first_name}}, туған күніңіз құтты болсын! {{expires_in_days}} күн ішінде бір реттік {{discount_percent}}% жеңілдікті пайдаланыңыз.",
      ru: "{{first_name}}, с днем рождения! Используйте разовую скидку {{discount_percent}}% в течение {{expires_in_days}} дней.",
      en: "Happy birthday, {{first_name}}! Use your one-time {{discount_percent}}% discount within {{expires_in_days}} days."
    },
    abandoned_cart_push: {
      kk: "{{first_name}}, {{item_name}} әлі себетіңізде. Тапсырысты аяқтай аласыз.",
      ru: "{{first_name}}, {{item_name}} все еще в вашей корзине. Вы можете завершить заказ.",
      en: "{{first_name}}, {{item_name}} is still in your cart. You can complete the order."
    },
    tier_retention: {
      kk: "{{first_name}}, {{current_discount_percent}}% жеңілдікті сақтау үшін {{retention_gap_amount}} {{currency}} сомасына сатып алу қалды.",
      ru: "{{first_name}}, до сохранения скидки {{current_discount_percent}}% осталось покупок на {{retention_gap_amount}} {{currency}}.",
      en: "{{first_name}}, spend {{retention_gap_amount}} {{currency}} more to keep your {{current_discount_percent}}% discount."
    }
  }
};
