import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/products.css";
import { PRODUCTS, formatProductPrice } from "./products-config.js";

const header = document.getElementById("header");
const navToggle = document.querySelector(".nav-toggle");

if (navToggle && header) {
  navToggle.addEventListener("click", () => {
    const open = header.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(open));
  });

  header.querySelectorAll(".nav a, .nav-cta a").forEach((link) => {
    link.addEventListener("click", () => {
      header.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });
}

window.addEventListener(
  "scroll",
  () => {
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 20);
  },
  { passive: true }
);

const revealEls = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          setTimeout(() => entry.target.classList.add("is-visible"), i * 60);
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
  );
  revealEls.forEach((el) => io.observe(el));
} else {
  revealEls.forEach((el) => el.classList.add("is-visible"));
}

const tabs = document.querySelectorAll(".showcase__tab");
const panels = document.querySelectorAll(".showcase__frame img");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab;

    tabs.forEach((t) => {
      t.classList.toggle("is-active", t === tab);
      t.setAttribute("aria-selected", t === tab ? "true" : "false");
    });

    panels.forEach((img) => {
      img.classList.toggle("is-active", img.dataset.panel === target);
    });
  });
});

const panelEls = document.querySelectorAll(".panel, .game-card, .pricing-card, .review-card");
panelEls.forEach((el) => {
  el.addEventListener("mousemove", (e) => {
    const rect = el.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 100;
    const my = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty("--mx", `${mx}%`);
    el.style.setProperty("--my", `${my}%`);
  });
});

const STORAGE_STOCK_PREFIX = "tempest_stock_";
const cards = document.querySelectorAll(".product-card");

const stockState = {};

for (const card of cards) {
  const productId = card.dataset.productId;
  const config = PRODUCTS[productId];
  const defaultStock = Number(card.dataset.stock || config?.defaultStock || 0);
  const stored = localStorage.getItem(`${STORAGE_STOCK_PREFIX}${productId}`);

  let stock = defaultStock;
  if (stored !== null && Number.isFinite(Number(stored))) {
    const storedNum = Number(stored);
    // Allow HTML default to override a saved "0" when restocking (e.g. 30-day keys)
    if (storedNum === 0 && defaultStock > 0) {
      stock = defaultStock;
      localStorage.removeItem(`${STORAGE_STOCK_PREFIX}${productId}`);
    } else {
      stock = storedNum;
    }
  }

  stockState[productId] = Math.max(0, stock);

  const priceEl = card.querySelector("[data-product-price]");
  if (priceEl && config) {
    priceEl.textContent = formatProductPrice(config);
  }
}

function stockMeta(stock) {
  if (stock <= 0) return { label: "Out of stock", cls: "is-out" };
  if (stock <= 5) return { label: "Low stock", cls: "is-low" };
  return { label: "In stock", cls: "is-in" };
}

function persistStock(productId) {
  localStorage.setItem(`${STORAGE_STOCK_PREFIX}${productId}`, String(stockState[productId]));
}

function renderProducts() {
  cards.forEach((card) => {
    const productId = card.dataset.productId;
    const stock = stockState[productId] ?? 0;
    const buyLink = card.querySelector(".buy-link");
    const stockBadge = card.querySelector("[data-stock-badge]");
    const stockCount = card.querySelector("[data-stock-count]");

    if (!buyLink || !stockBadge || !stockCount) return;

    stockCount.textContent = String(stock);
    const meta = stockMeta(stock);
    stockBadge.textContent = meta.label;
    stockBadge.classList.remove("is-in", "is-low", "is-out");
    stockBadge.classList.add(meta.cls);

    const checkoutUrl = buyLink.dataset.checkoutUrl || buyLink.getAttribute("href") || "/checkout.html";
    const disabled = stock <= 0;
    if (disabled) {
      buyLink.classList.add("btn--disabled");
      buyLink.setAttribute("aria-disabled", "true");
      buyLink.textContent = "Out of Stock";
      buyLink.removeAttribute("href");
    } else {
      buyLink.classList.remove("btn--disabled");
      buyLink.removeAttribute("aria-disabled");
      buyLink.href = checkoutUrl;
      buyLink.textContent = "Buy Now";
    }
  });
}

window.tempestStock = {
  set(productId, qty) {
    if (!(productId in stockState)) return;
    stockState[productId] = Math.max(0, Number(qty) || 0);
    persistStock(productId);
    renderProducts();
  },
  get() {
    return { ...stockState };
  },
};

renderProducts();
