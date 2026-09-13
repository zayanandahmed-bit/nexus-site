(function () {
  "use strict";

  // ---- nav: border once scrolled, mobile menu toggle ----
  var nav = document.getElementById("nav");
  var toggle = document.getElementById("navToggle");
  var links = document.getElementById("navLinks");

  function onScroll() {
    nav.classList.toggle("scrolled", window.scrollY > 8);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  function setMenu(open) {
    nav.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
  }
  toggle.addEventListener("click", function () {
    setMenu(!nav.classList.contains("open"));
  });
  links.addEventListener("click", function (e) {
    if (e.target.closest("a")) setMenu(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") setMenu(false);
  });

  // ---- reveal on scroll (content stays visible if IO is unavailable) ----
  var items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    items.forEach(function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });
  }

  // ---- footer year ----
  var year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  // ---- warn while the contact placeholders are still unset ----
  var unset = Array.prototype.filter.call(
    document.querySelectorAll("[data-placeholder]"),
    function (a) { return a.getAttribute("href").indexOf("__YOUR_") !== -1; }
  );
  if (unset.length) {
    console.warn(
      "[NEXUS] Contact placeholders not set: " +
      unset.map(function (a) { return a.dataset.placeholder; }).join(", ") +
      ". Replace __YOUR_WHATSAPP__ / __YOUR_EMAIL__ in index.html."
    );
  }
})();
