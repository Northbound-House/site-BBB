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
  var FOCUS_HOLD = parseFloat(knob("--focus-hold", "0.18"));
  var FOCUS_BAND = parseFloat(knob("--focus-band", "0.45"));
  var FOCUS_CENTRE = parseFloat(knob("--focus-centre", "0.5"));
  var PARALLAX_DEPTH = parseFloat(knob("--parallax-depth", "0px"));

  var reducedMotion = window.matchMedia
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- Sticky header state ---- */
  var header = document.querySelector(".site-header");
  var heroHeader = header && !header.classList.contains("is-scrolled");
  var onScroll = function () {
    if (!header || !heroHeader) return;
    header.classList.toggle("is-scrolled", window.scrollY > SCROLLED_AT);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---- Mobile nav ----
     The markup gives the panel an id and the toggle an aria-controls pointing
     at it, so the pair is announced as one control. Three things happen here
     that the markup cannot do on its own:

       - Focus moves into the panel on open and back to the toggle on close.
         Without it the menu opens behind the reader: aria-expanded says "true"
         while focus is still sitting on the button, and the next Tab walks into
         the page rather than the menu that just appeared.
       - The body is scroll-locked while it is open. The panel is anchored under
         the floating pill, so a page that keeps scrolling drags the menu away
         from what it is attached to.
       - Focus leaving the header closes it, so focus can never end up inside a
         panel the reader has visually left.

     The closed panel is already out of the tab order: the stylesheet hides it
     with visibility: hidden, which removes it from the accessibility tree too.
  ---------------------------------------------------------------------------*/
  var toggle = document.querySelector(".nav-toggle");
  var panel = toggle && toggle.getAttribute("aria-controls")
    ? document.getElementById(toggle.getAttribute("aria-controls"))
    : document.querySelector(".nav-links");

  if (toggle && panel) {
    var isOpen = function () { return document.body.classList.contains("nav-open"); };

    /* Where the page was when the menu opened, so it can be put back.
       null means "not currently locked". */
    var lockedAt = null;

    /* iOS Safari ignores overflow: hidden on the body often enough that it
       cannot be relied on — the page keeps scrolling behind the panel, which is
       the defect this is here to fix. Pinning the body at its own offset with
       position: fixed is the technique that actually holds, and it works
       everywhere else too. The stylesheet keeps overflow: hidden as well, so a
       visitor with JS disabled gets the better-than-nothing version. */
    var lockScroll = function () {
      lockedAt = window.scrollY;
      /* Fixing the body removes the scrollbar, which would shunt the page
         sideways. Hand its width to the stylesheet to pay back as padding. */
      var gap = window.innerWidth - document.documentElement.clientWidth;
      document.documentElement.style.setProperty("--scrollbar-width", gap + "px");
      document.body.style.top = -lockedAt + "px";
    };

    var unlockScroll = function () {
      if (lockedAt === null) return;
      var y = lockedAt;
      lockedAt = null;
      document.body.style.top = "";
      document.documentElement.style.removeProperty("--scrollbar-width");
      /* The sheet sets scroll-behavior: smooth, which would animate the
         restore into a visible jump back up the page. */
      window.scrollTo({ top: y, behavior: "instant" });
    };

    var setOpen = function (open, returnFocus) {
      if (open === isOpen()) return;

      if (open) lockScroll();

      document.body.classList.toggle("nav-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");

      if (open) {
        /* The panel is visibility: hidden until .nav-open lands, and an element
           that computes to hidden cannot take focus. Style has not been
           recalculated yet at this point in the same task, so wait a frame —
           calling focus() straight away silently does nothing. */
        requestAnimationFrame(function () {
          var first = panel.querySelector("a[href], button");
          if (first && isOpen()) first.focus();
        });
      } else {
        unlockScroll();
        if (returnFocus !== false) toggle.focus();
      }
    };

    toggle.addEventListener("click", function () { setOpen(!isOpen()); });

    /* Following a link closes the menu, but the browser is already navigating —
       pulling focus back to the toggle would fight that. */
    panel.querySelectorAll("a[href]").forEach(function (link) {
      link.addEventListener("click", function () { setOpen(false, false); });
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isOpen()) setOpen(false);
    });

    document.addEventListener("pointerdown", function (e) {
      if (isOpen() && header && !header.contains(e.target)) setOpen(false, false);
    });

    document.addEventListener("focusin", function (e) {
      if (isOpen() && header && !header.contains(e.target)) setOpen(false, false);
    });
  }

  /* ---- Images that did not arrive ----
     Most photos on the site are still hotlinked placeholders, and a hotlink
     rots without warning — one had been withdrawn upstream, so two cards
     printed a sentence of alt text where the picture should have been. Swap a
     failed image for a quiet brand-tinted tile and move the description to a
     title, so the layout survives the next withdrawal. The reserved box does
     not change size: every img here carries width and height. */
  document.querySelectorAll("img").forEach(function (img) {
    var onBroken = function () {
      if (img.dataset.failed) return;
      img.dataset.failed = "1";
      if (img.alt) { img.title = img.alt; img.alt = ""; }
      img.classList.add("img-missing");
    };
    if (img.complete && img.naturalWidth === 0) onBroken();
    else img.addEventListener("error", onBroken);
  });

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
        note.style.color = "var(--link)";
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

  /* ---- Scroll-linked effects ----
     Two things move with the scroll rather than on it: the review and BOUND
     promise cards colour in as they reach the middle of the window, and the
     closing band's photo drifts against the page. Both are measured here and
     drawn by the stylesheet — this writes one number per element and nothing
     else, so the look is tuned in the control block, not in code.

     One frame per scroll event, never more: the handler only asks for a frame
     if one is not already pending. Both are skipped when the visitor has asked
     for reduced motion; the stylesheet drops the styling too, so the cards
     simply show at full colour and the photo stays put. */
  var focusCards = document.querySelectorAll(".media-card");
  var bands = document.querySelectorAll(".cta-band");
  if (!reducedMotion && (focusCards.length || (bands.length && PARALLAX_DEPTH))) {
    var pending = false;

    var updateFocus = function (vh) {
      var centre = vh * FOCUS_CENTRE;
      var hold = vh * FOCUS_HOLD;
      var reach = vh * FOCUS_BAND;
      if (reach <= hold) reach = hold + 1;
      focusCards.forEach(function (card) {
        var r = card.getBoundingClientRect();
        /* Off screen: leave it resting. */
        if (r.bottom < 0 || r.top > vh) { card.style.setProperty("--focus-scroll", "0"); return; }
        var mid = r.top + r.height / 2;
        /* Fully in focus anywhere inside the hold zone around the middle, so a
           card being read is never soft; from there it falls to rest by the
           time it is a band's width away. */
        var f = (reach - Math.abs(mid - centre)) / (reach - hold);
        if (f < 0) f = 0;
        if (f > 1) f = 1;
        /* Ease the ends so a card settles into and out of focus rather than
           hitting a corner at either edge of the band. */
        f = f * f * (3 - 2 * f);
        /* --focus-scroll rather than --focus: the stylesheet derives --focus
           from it, and lets a hovered or keyboard-focused card override. */
        card.style.setProperty("--focus-scroll", f.toFixed(3));
      });
    };

    var updateParallax = function (vh) {
      if (!PARALLAX_DEPTH) return;
      bands.forEach(function (band) {
        var bg = band.querySelector(".cta-band__bg");
        if (!bg) return;
        var r = band.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) return;
        /* -0.5 with the band's middle at the bottom edge of the window, +0.5
           at the top edge. The photo moves the other way, slower than the
           page, by at most half the depth — which is what the band's overscan
           in the stylesheet is sized to cover. */
        var p = (r.top + r.height / 2 - vh / 2) / (vh + r.height);
        bg.style.transform = "translate3d(0," + (-p * PARALLAX_DEPTH).toFixed(1) + "px,0)";
      });
    };

    var frame = function () {
      pending = false;
      var vh = window.innerHeight;
      updateFocus(vh);
      updateParallax(vh);
    };
    var schedule = function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(frame);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("load", schedule);
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

  /* ---- Review cards open full size ----
     The cards are 1080px squares drawn at roughly 340px, so the wording inside
     the artwork is small until it is opened.

     Each card is wrapped in a real link to the image file. That is the whole
     no-JavaScript story: the link still opens the picture. Everything below is
     an enhancement layered on top of something that already works.

     A native <dialog> does the hard parts — focus trap, Escape to close, the
     page behind made inert, focus returned to the link on close — all of which
     are easy to get subtly wrong by hand. Where showModal is missing the
     listener never binds, so the link keeps its default behaviour. */
  var zoomLinks = document.querySelectorAll("a[data-zoom]");
  if (zoomLinks.length && typeof HTMLDialogElement === "function"
      && HTMLDialogElement.prototype.showModal) {
    var dialog = null;
    var dialogImg = null;

    var buildDialog = function () {
      dialog = document.createElement("dialog");
      dialog.className = "lightbox";

      var inner = document.createElement("div");
      inner.className = "lightbox__inner";

      dialogImg = document.createElement("img");

      var close = document.createElement("button");
      close.type = "button";
      close.className = "lightbox__close";
      close.setAttribute("aria-label", "Close");
      close.textContent = "✕";
      close.addEventListener("click", function () { dialog.close(); });

      inner.appendChild(dialogImg);
      inner.appendChild(close);
      dialog.appendChild(inner);

      /* Click outside the picture closes it. The dialog fills the viewport, so
         a click landing on the dialog itself rather than on .lightbox__inner or
         its children is a click on the backdrop area. */
      dialog.addEventListener("click", function (e) {
        if (e.target === dialog) dialog.close();
      });

      /* Drop the src on close so a large PNG is not held decoded for the rest
         of the visit, and so the next open cannot flash the previous card. */
      dialog.addEventListener("close", function () {
        dialogImg.removeAttribute("src");
        dialogImg.removeAttribute("alt");
      });

      document.body.appendChild(dialog);
    };

    Array.prototype.forEach.call(zoomLinks, function (link) {
      link.addEventListener("click", function (e) {
        /* Leave modified clicks alone — a new tab is a reasonable thing to
           want, and hijacking it is the sort of thing that makes people
           distrust a page. */
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        if (!dialog) buildDialog();
        var img = link.querySelector("img");
        dialogImg.src = link.getAttribute("href");
        /* The card's caption carries the whole review as text, so the opened
           copy says the same thing rather than being announced as an
           unlabelled image. */
        var figure = link.closest("figure");
        var caption = figure && figure.querySelector("figcaption");
        var words = caption ? caption.textContent.replace(/\s+/g, " ").trim() : "";
        dialogImg.alt = words || (img ? img.getAttribute("alt") || "" : "");
        dialog.showModal();
      });
    });
  }

  /* ---- Footer folds ----
     Two footer columns are <details> so they can fold shut on a phone, where
     four stacked lists ran to two screens. The markup ships them open, so
     without this the lists simply show everywhere. Under --bp-mobile they
     start folded and the heading row is the control; above it the fold is
     inert and its summary leaves the tab order, so a desktop reader cannot
     collapse a footer column by accident. */
  var folds = document.querySelectorAll("details.footer-col__fold");
  if (folds.length && window.matchMedia) {
    var foldQuery = window.matchMedia("(max-width: " + knob("--bp-mobile", "720px") + ")");
    var applyFolds = function () {
      folds.forEach(function (fold) {
        fold.open = !foldQuery.matches;
        var summary = fold.querySelector("summary");
        if (summary) summary.tabIndex = foldQuery.matches ? 0 : -1;
      });
    };
    applyFolds();
    if (foldQuery.addEventListener) foldQuery.addEventListener("change", applyFolds);
  }

  /* ---- Footer year ---- */
  var yr = document.getElementById("year");
  if (yr) yr.textContent = new Date().getFullYear();
})();
