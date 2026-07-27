export const segmentDefinitions = [
  {
    code: "new",
    title: "New customers",
    description: "Customers created in the last 30 days.",
    criteria: {
      all: [
        { type: "customer_status", status: "active" },
        { type: "created_within_days", days: 30 }
      ]
    }
  },
  {
    code: "active",
    title: "Active customers",
    description: "Customers with a completed purchase or exchange in the last 90 days.",
    criteria: {
      all: [
        { type: "customer_status", status: "active" },
        { type: "purchase_within_days", days: 90 }
      ]
    }
  },
  {
    code: "sleeping-90-days",
    title: "Sleeping 90 days",
    description: "Customers whose last completed purchase or exchange is older than 90 days and not older than 180 days.",
    criteria: {
      all: [
        { type: "customer_status", status: "active" },
        { type: "purchase_between_days", min_days_exclusive: 90, max_days_inclusive: 180 }
      ]
    }
  },
  {
    code: "gone-180-days",
    title: "Gone 180 days",
    description: "Customers whose last completed purchase or exchange is older than 180 days or missing.",
    criteria: {
      all: [
        { type: "customer_status", status: "active" },
        { type: "purchase_after_days", min_days_exclusive: 180, include_missing: true }
      ]
    }
  },
  {
    code: "buyers-by-category",
    title: "Buyers by category",
    description: "Customers who bought products in a selected category or category path.",
    criteria: {
      all: [
        { type: "customer_status", status: "active" },
        { type: "purchase_category" }
      ],
      required_filters: ["category_id"]
    }
  },
  {
    code: "buyers-by-sport",
    title: "Buyers by sport",
    description: "Customers who bought products tagged with a selected sport.",
    criteria: {
      all: [
        { type: "customer_status", status: "active" },
        { type: "purchase_sport" }
      ],
      required_filters: ["sport_tag"]
    }
  },
  {
    code: "buyers-by-size",
    title: "Buyers by size",
    description: "Customers who bought or declared a selected footwear or apparel size.",
    criteria: {
      all: [
        { type: "customer_status", status: "active" },
        { type: "purchase_or_profile_size" }
      ],
      required_filters: ["size_system", "size_value"]
    }
  }
];

const definitionsByCode = new Map(segmentDefinitions.map((definition) => [definition.code, definition]));

export function listSegmentDefinitions() {
  return segmentDefinitions.map((definition) => structuredClone(definition));
}

export function findSegmentDefinition(code) {
  const definition = definitionsByCode.get(code);
  return definition ? structuredClone(definition) : null;
}
