import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";

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

const instagramLink = document.querySelector(".social-link--placeholder");
if (instagramLink) {
  instagramLink.addEventListener("click", (e) => {
    e.preventDefault();
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

const reviewForm = document.getElementById("review-form");
const reviewsGrid = document.getElementById("reviews-grid");
const reviewStatus = document.getElementById("review-status");

const REVIEWS_KEY = "tempest:reviews:v1";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch]);
}

function initialsFor(name) {
  const cleaned = String(name).replace(/[^A-Za-z0-9]+/g, " ").trim();
  if (!cleaned) return "??";
  const parts = cleaned.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return cleaned.slice(0, 2).toUpperCase();
}

function loadReviews() {
  try {
    const raw = localStorage.getItem(REVIEWS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveReviews(list) {
  try {
    localStorage.setItem(REVIEWS_KEY, JSON.stringify(list));
  } catch {
    /* storage may be unavailable (private mode, full); fail silently */
  }
}

function buildReviewCard(review, { isNew = false } = {}) {
  const article = document.createElement("article");
  article.className = "review-card reveal is-visible" + (isNew ? " review-card--new" : "");
  const rating = Math.max(1, Math.min(5, Number(review.rating) || 5));
  const stars = "★".repeat(rating) + "☆".repeat(5 - rating);

  article.innerHTML = `
    <div class="review-card__stars" aria-label="${rating} out of 5 stars">${stars}</div>
    <p>${escapeHtml(review.body)}</p>
    <div class="review-card__meta">
      <div class="review-card__avatar">${escapeHtml(initialsFor(review.author))}</div>
      <div>
        <div class="review-card__author">${escapeHtml(review.author)}</div>
        <div class="review-card__game">${escapeHtml(review.plan)}</div>
      </div>
    </div>
  `;
  return article;
}

function renderStoredReviews() {
  if (!reviewsGrid) return;
  const stored = loadReviews();
  if (!stored.length) return;
  for (const review of stored) {
    reviewsGrid.prepend(buildReviewCard(review));
  }
}

renderStoredReviews();

if (reviewForm && reviewsGrid) {
  const textarea = reviewForm.querySelector('textarea[name="body"]');
  const counter = reviewForm.querySelector("[data-count]");

  if (textarea && counter) {
    const updateCount = () => {
      counter.textContent = String(textarea.value.length);
    };
    textarea.addEventListener("input", updateCount);
    updateCount();
  }

  const setStatus = (message, state = "") => {
    if (!reviewStatus) return;
    reviewStatus.textContent = message;
    if (state) reviewStatus.setAttribute("data-state", state);
    else reviewStatus.removeAttribute("data-state");
  };

  reviewForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const data = new FormData(reviewForm);
    const author = String(data.get("author") || "").trim();
    const plan = String(data.get("plan") || "").trim();
    const body = String(data.get("body") || "").trim();
    const rating = Number(data.get("rating") || 5);

    if (!author || author.length < 2) {
      setStatus("Please enter a display name (2+ characters).", "error");
      return;
    }
    if (!plan) {
      setStatus("Please select a plan.", "error");
      return;
    }
    if (body.length < 10) {
      setStatus("Review must be at least 10 characters.", "error");
      return;
    }

    const review = {
      author,
      plan,
      body,
      rating,
      createdAt: Date.now(),
    };

    const stored = loadReviews();
    stored.unshift(review);
    saveReviews(stored.slice(0, 50));

    const card = buildReviewCard(review, { isNew: true });
    reviewsGrid.prepend(card);

    reviewForm.reset();
    if (counter) counter.textContent = "0";
    setStatus("Thanks — your review is posted.", "success");

    card.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => card.classList.remove("review-card--new"), 1200);
    window.setTimeout(() => setStatus(""), 4000);
  });
}

const heroVisual = document.querySelector(".hero__visual");
const supportsHover = window.matchMedia("(hover: hover)").matches;
if (
  heroVisual &&
  supportsHover &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches
) {
  const frame = heroVisual.querySelector(".hero__visual-frame");
  heroVisual.addEventListener("mousemove", (e) => {
    if (!frame) return;
    const rect = heroVisual.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    frame.style.setProperty("--tilt-x", `${-y * 3}deg`);
    frame.style.setProperty("--tilt-y", `${x * 3}deg`);
  });
  heroVisual.addEventListener("mouseleave", () => {
    if (!frame) return;
    frame.style.setProperty("--tilt-x", `0deg`);
    frame.style.setProperty("--tilt-y", `0deg`);
  });
}
