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
