/* Bora Bora Bound — interactions */
(function () {
  "use strict";

  /* ---- Tunable values ----
     These three are measurements like any other, so they live in the control
     block at the top of assets/css/styles.css and are read from there. Change
     them in the CSS, not here. */
  var root = getComputedStyle(document.documentElement);
  var knob = function (name, fallback) {
    var v = root.getPropertyValue(name).trim();
    return v === "" ? fallback : v;
  };
  var SCROLLED_AT = parseFloat(knob("--header-scrolled-at", "40px"));
  var REVEAL_TRIGGER = parseFloat(knob("--reveal-trigger", "0.12"));
  var REVEAL_MARGIN = knob("--reveal-margin", "-40px");

  /* ---- Sticky header state ---- */
  var header = document.querySelector(".site-header");
  var heroHeader = header && !header.classList.contains("is-scrolled");
  var onScroll = function () {
    if (!header || !heroHeader) return;
    header.classList.toggle("is-scrolled", window.scrollY > SCROLLED_AT);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---- Mobile nav ---- */
  var toggle = document.querySelector(".nav-toggle");
  if (toggle) {
    var setOpen = function (open) {
      document.body.classList.toggle("nav-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    };
    toggle.addEventListener("click", function () {
      setOpen(!document.body.classList.contains("nav-open"));
    });
    document.querySelectorAll(".nav-links a").forEach(function (link) {
      link.addEventListener("click", function () { setOpen(false); });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && document.body.classList.contains("nav-open")) {
        setOpen(false);
        toggle.focus();
      }
    });
  }

  /* ---- Conversion tracking ----------------------------------------------
     Every CTA carries data-cta="<location>". A click fires a GA4 event and a
     Meta Pixel Lead event, tagged with where on the site it came from, so it
     is possible to tell which page actually produces consultations.

     Both calls no-op safely when the tags are absent — the loaders in the page
     head are only emitted once GA4_ID / META_PIXEL_ID are set in
     tools/build.py. Mark generate_lead as a key event in the GA4 admin panel
     for it to count as a conversion.
  ------------------------------------------------------------------------ */
  document.querySelectorAll("[data-cta]").forEach(function (el) {
    el.addEventListener("click", function () {
      var where = el.getAttribute("data-cta") || "unknown";
      var label = (el.textContent || "").trim().slice(0, 80);

      if (typeof window.gtag === "function") {
        window.gtag("event", "generate_lead", {
          cta_location: where,
          cta_label: label,
          page_path: window.location.pathname
        });
      }
      if (typeof window.fbq === "function") {
        window.fbq("track", "Lead", { content_name: where });
      }
    });
  });

  /* ---- Placeholder form handling (kept for any form not yet wired up) ---- */
  document.querySelectorAll("form[data-placeholder]").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var note = form.querySelector(".form-feedback");
      if (note) {
        note.textContent =
          "Thanks! This form isn't connected yet — please email hello@boraborabound.com or call (656) 201-5022 in the meantime.";
        note.style.color = "var(--lagoon)";
      }
      form.reset();
    });
  });

  /* ---- Scroll reveal ---- */
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && revealEls.length) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: REVEAL_TRIGGER, rootMargin: "0px 0px " + REVEAL_MARGIN + " 0px" }
    );
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---- Display face loaded? ----
     Bebas Neue is condensed: a headline set in it is roughly a third narrower
     than the same headline in the sans that stands in while the webfont loads
     (or forever, if Google Fonts is blocked). The phone headline curve in the
     stylesheet is sized for that wider stand-in, so it only applies until the
     real face is confirmed present. document.fonts.check() is not usable here —
     it answers true for a family that was never loaded — but fonts.load()
     resolves with the FontFace objects that actually matched, so an empty array
     means the face is genuinely absent. */
  if (document.fonts && document.fonts.load) {
    document.fonts.load('1em "Bebas Neue"').then(function (faces) {
      if (faces.length) document.documentElement.classList.add("display-face-ready");
    }, function () { /* leave the stand-in sizes in place */ });
  }

  /* ---- Footer year ---- */
  var yr = document.getElementById("year");
  if (yr) yr.textContent = new Date().getFullYear();
})();
