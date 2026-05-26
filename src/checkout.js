import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/checkout.css";
import { PRODUCTS, formatProductPrice } from "./products-config.js";

const STORAGE_EMAIL_KEY = "tempest_purchase_email";

const params = new URLSearchParams(window.location.search);
const productId = params.get("product") || "arc-7-day";
const product = PRODUCTS[productId];

const heroAmount = document.getElementById("hero-amount");
const lineTitle = document.getElementById("line-title");
const lineSub = document.getElementById("line-sub");
const linePrice = document.getElementById("line-price");
const rowSubtotal = document.getElementById("row-subtotal");
const rowTotal = document.getElementById("row-total");

const emailInput = document.getElementById("checkout-email");
const termsInput = document.getElementById("agree-terms");
const form = document.getElementById("checkout-form");
const submitBtn = document.getElementById("checkout-submit");
const feedbackEl = document.getElementById("checkout-feedback");

const couponInput = document.getElementById("coupon-code");
const couponApply = document.getElementById("coupon-apply");
const couponFeedback = document.getElementById("coupon-feedback");

const paymentCards = document.querySelectorAll(".payment-card");
const paymentInputs = document.querySelectorAll('input[name="payment-method"]');

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function setFeedback(message, ok = true) {
  if (!feedbackEl) return;
  feedbackEl.textContent = message;
  feedbackEl.classList.toggle("is-error", !ok);
}

function renderProductSummary() {
  if (!product) {
    if (heroAmount) heroAmount.textContent = "N/A";
    if (lineTitle) lineTitle.textContent = "Product not found";
    if (lineSub) lineSub.textContent = "Please return to products and choose a valid option.";
    if (linePrice) linePrice.textContent = "—";
    if (rowSubtotal) rowSubtotal.textContent = "—";
    if (rowTotal) rowTotal.textContent = "—";
    if (form) form.setAttribute("hidden", "hidden");
    return;
  }
  const formatted = formatProductPrice(product);
  if (heroAmount) heroAmount.textContent = formatted;
  if (lineTitle) lineTitle.textContent = product.name;
  if (lineSub) lineSub.textContent = product.duration;
  if (linePrice) linePrice.textContent = formatted;
  if (rowSubtotal) rowSubtotal.textContent = formatted;
  if (rowTotal) rowTotal.textContent = formatted;
}

function prefillEmail() {
  if (!emailInput) return;
  const savedEmail = localStorage.getItem(STORAGE_EMAIL_KEY) || "";
  if (savedEmail) emailInput.value = savedEmail;
}

function bindPaymentMethods() {
  paymentInputs.forEach((input) => {
    input.addEventListener("change", () => {
      paymentCards.forEach((card) => {
        const cardInput = card.querySelector('input[name="payment-method"]');
        card.classList.toggle("is-active", cardInput?.checked === true);
      });
    });
  });
}

function bindCoupon() {
  if (!couponApply || !couponInput) return;
  couponApply.addEventListener("click", () => {
    const code = couponInput.value.trim();
    if (!code) {
      couponFeedback.textContent = "Enter a coupon code to apply.";
      couponFeedback.style.color = "";
      return;
    }
    couponFeedback.textContent = `Coupon "${code}" will be validated at payment.`;
    couponFeedback.style.color = "";
  });
}

function handleSubmit(event) {
  event.preventDefault();
  if (!product) return;

  const email = (emailInput?.value || "").trim();
  const agreed = Boolean(termsInput?.checked);
  const selectedMethod =
    document.querySelector('input[name="payment-method"]:checked')?.value || "stripe";

  if (!isValidEmail(email)) {
    setFeedback("Please enter a valid email address before continuing.", false);
    emailInput?.focus();
    return;
  }

  if (!agreed) {
    setFeedback("You must agree to the Terms of Service to continue.", false);
    return;
  }

  localStorage.setItem(STORAGE_EMAIL_KEY, email);

  if (selectedMethod === "crypto") {
    setFeedback(
      "Litecoin payments are coordinated manually. Please open a Discord ticket to receive a payment address.",
      false
    );
    return;
  }

  submitBtn?.classList.add("is-loading");
  setFeedback("Redirecting to secure payment");

  const checkoutQuery = new URLSearchParams({
    prefilled_email: email,
    client_reference_id: product.id,
  });

  window.location.href = `${product.stripeLink}?${checkoutQuery.toString()}`;
}

renderProductSummary();
prefillEmail();
bindPaymentMethods();
bindCoupon();

if (form && product) {
  form.addEventListener("submit", handleSubmit);
}
