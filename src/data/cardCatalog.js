// src/data/cardCatalog.js
export const CARD_PRODUCTS = [
  {
    productId: "amex_platinum",
    displayName: "The Platinum Card® from American Express",
    issuer: "American Express",
    aliases: ["amex platinum", "american express platinum", "platinum amex"],
    perks: [
      {
        perk_id: "amex_platinum_lounge",
        title: "Airport lounge access",
        category: "Travel",
        est_value: "300",
        details: "Lounge access (program rules apply).",
        enrollment_url: "",
      },
      {
        perk_id: "amex_platinum_uber",
        title: "Rideshare / Uber credits",
        category: "Lifestyle",
        est_value: "200",
        details: "Monthly credits (terms apply).",
        enrollment_url: "",
      },
    ],
  },
  {
    productId: "chase_sapphire_preferred",
    displayName: "Chase Sapphire Preferred®",
    issuer: "Chase",
    aliases: ["csp", "sapphire preferred", "chase sapphire preferred"],
    perks: [
      {
        perk_id: "csp_travel_portal",
        title: "Travel portal rewards boost",
        category: "Travel",
        est_value: "150",
        details: "Enhanced value when booking through issuer travel.",
        enrollment_url: "",
      },
    ],
  },
];

// Helper: find a product by ID
export function getProductById(productId) {
  return CARD_PRODUCTS.find((p) => p.productId === productId) || null;
}
