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

const cards = document.querySelectorAll(".product-card");
const stockState = {};

const STOCK_API_URL =
  import.meta.env.VITE_STOCK_API_URL ||
  "https://tempest-cheats-production.up.railway.app";

for (const card of cards) {
  const productId = card.dataset.productId;
  const config = PRODUCTS[productId];
  const defaultStock = Number(card.dataset.stock || config?.defaultStock || 0);

  stockState[productId] = Math.max(0, defaultStock);

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

async function refreshLiveStock() {
  if (!STOCK_API_URL) return;
  try {
    const res = await fetch(`${STOCK_API_URL.replace(/\/$/, "")}/api/stock`, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
    });
    if (!res.ok) return;
    const body = await res.json();
    const live = body?.stock;
    if (!live || typeof live !== "object") return;

    for (const productId of Object.keys(stockState)) {
      const entry = live[productId];
      if (entry && Number.isFinite(Number(entry.available))) {
        stockState[productId] = Math.max(0, Number(entry.available));
      }
    }
    renderProducts();
  } catch {
    // Network/CORS errors are silent — HTML defaults stay in place.
  }
}

renderProducts();
refreshLiveStock();
