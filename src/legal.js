import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/legal.css";

const header = document.getElementById("header");
const navToggle = document.querySelector(".nav-toggle");

if (navToggle && header) {
  navToggle.addEventListener("click", () => {
    const open = header.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(open));
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
