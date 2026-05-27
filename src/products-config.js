/** Single source for product prices — keep in sync with Stripe Payment Link amounts (USD). */
export const PRODUCTS = {
  "arc-1-day": {
    id: "arc-1-day",
    name: "Arc Raiders",
    duration: "1 Day Key",
    tier: "Starter",
    description: "Try Tempest for one day of raids.",
    price: 7.0,
    currency: "$",
    stripeLink: "https://buy.stripe.com/00waEQbXIfQI4Gp2dfeME06",
    defaultStock: 12,
  },
  "arc-7-day": {
    id: "arc-7-day",
    name: "Arc Raiders",
    duration: "7 Day Key",
    tier: "Best Value",
    description: "Full week coverage.",
    price: 21.0,
    currency: "$",
    stripeLink: "https://buy.stripe.com/5kQfZa5zkbAsc8R8BDeME07",
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
    price: 58.0,
    currency: "$",
    stripeLink: "https://buy.stripe.com/bJe14g2n8bAs2yh057eME09",
    defaultStock: 10,
  },
};

export function formatProductPrice(product) {
  return `${product.currency}${product.price.toFixed(2)}`;
}
