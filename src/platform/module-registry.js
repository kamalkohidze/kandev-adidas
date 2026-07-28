export const moduleRegistry = [
  {
    code: "customer",
    title: "Customer 360 and Omnichannel ID",
    source_task: "02",
    directories: ["src/modules/customer/profile", "src/modules/customer/identity", "src/modules/customer/api"],
    contracts: ["Customer", "CustomerIdentity", "Consent", "Customer360Profile"]
  },
  {
    code: "i18n",
    title: "Multilingual KZ/RU/EN",
    source_task: "03",
    directories: ["src/modules/i18n"],
    contracts: ["Locale"]
  },
  {
    code: "transactions",
    title: "Transactions, receipts, returns, annual spend",
    source_task: "04",
    directories: ["src/modules/transactions"],
    contracts: ["Transaction", "TransactionLine"]
  },
  {
    code: "loyalty",
    title: "Loyalty tiers and discounts",
    source_task: "05",
    directories: ["src/modules/loyalty"],
    contracts: ["LoyaltyAccount"]
  },
  {
    code: "promotions",
    title: "Personalized coupon issuing, validation, and redemption",
    source_task: "promotions",
    directories: ["src/modules/promotions/coupons", "src/modules/promotions/rules", "src/modules/promotions/api"],
    contracts: ["PromotionCoupon"]
  },
  {
    code: "catalog",
    title: "Catalog, variants, prices, inventory",
    source_task: "07",
    directories: ["src/modules/catalog"],
    contracts: ["Product", "ProductVariant"]
  },
  {
    code: "marketing",
    title: "Segments, workflow, triggers, content, delivery",
    source_task: "09-15",
    directories: [
      "src/modules/marketing",
      "src/modules/marketing/segments",
      "src/modules/marketing/lifecycle",
      "src/modules/marketing/cross-sell",
      "src/modules/marketing/workflow"
    ],
    contracts: ["Segment", "LifecycleState", "WorkflowDefinition", "JourneyInstance", "MessageTemplate", "CrossSellCandidate"]
  },
  {
    code: "recommendations",
    title: "Deterministic product recommendations",
    source_task: "recommendations",
    directories: [
      "src/modules/recommendations/engine",
      "src/modules/recommendations/api",
      "src/modules/recommendations/message-blocks"
    ],
    contracts: ["RecommendationSet", "RecommendationItem", "RecommendationReason"]
  },
  {
    code: "integrations",
    title: "POS, ecommerce, mobile app, 1C, ERP, providers",
    source_task: "18-20",
    directories: ["src/modules/integrations"],
    contracts: ["IntegrationEndpoint", "ExternalSystemMapping", "SyncJob"]
  },
  {
    code: "security",
    title: "RBAC, audit, masking, export policy",
    source_task: "21",
    directories: ["src/modules/security"],
    contracts: ["User", "Role", "Permission", "AuditLog", "DataAccessPolicy"]
  }
];
