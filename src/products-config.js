/** Single source for product prices — keep in sync with Stripe Payment Link amounts (USD). */
export const PRODUCTS = {
  "arc-1-day": {
    id: "arc-1-day",
    name: "Arc Raiders",
    duration: "1 Day Key",
    tier: "Starter",
    description: "Try Tempest for one day of raids.",
    price: 9.99,
    currency: "$",
    stripeLink: "https://buy.stripe.com/5kQfZa5zk33WegZcRTeME04",
    defaultStock: 12,
  },
  "arc-3-day": {
    id: "arc-3-day",
    name: "Arc Raiders",
    duration: "3 Day Key",
    tier: "Short Term",
    description: "Weekend-ready access.",
    price: 18.99,
    currency: "$",
    stripeLink: "https://buy.stripe.com/dRm8wI9PA33W8WF057eME03",
    defaultStock: 9,
  },
  "arc-7-day": {
    id: "arc-7-day",
    name: "Arc Raiders",
    duration: "7 Day Key",
    tier: "Best Value",
    description: "Full week coverage.",
    price: 29.99,
    currency: "$",
    stripeLink: "https://buy.stripe.com/4gM00c6DofQI2yhbNPeME02",
    defaultStock: 4,
    featured: true,
    ribbon: "Most Popular",
  },
  "arc-30-day": {
    id: "arc-30-day",
    name: "Arc Raiders",
    duration: "30 Day Key",
    tier: "Pro",
    description: "Extended monthly access.",
    price: 79.99,
    currency: "$",
    stripeLink: "https://buy.stripe.com/8x29AMaTE9skgp7dVXeME01",
    defaultStock: 10,
  },
};

export function formatProductPrice(product) {
  return `${product.currency}${product.price.toFixed(2)}`;
}
