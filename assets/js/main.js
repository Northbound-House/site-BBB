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
  var FOCUS_SETTLE = parseFloat(knob("--focus-settle", "240ms"));
  var PARALLAX_DEPTH = parseFloat(knob("--parallax-depth", "0px"));
  var SCROLL_LERP = parseFloat(knob("--scroll-lerp", "0.1"));
  var HERO_DRIFT = parseFloat(knob("--hero-drift", "0px"));
  var HEADING_START = parseFloat(knob("--heading-reveal-start", "1"));
  var HEADING_END = parseFloat(knob("--heading-reveal-end", "0.65"));

  var reducedMotion = window.matchMedia
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- Smooth scroll ----
     Lenis eases mouse-wheel and trackpad scrolling. Touch is left native,
     which is Lenis's default and the right call: a phone's own momentum is
     what its owner's hands expect. Lenis moves the real document scroll, so
     every scroll listener below keeps working unchanged and simply sees more,
     smaller steps.

     It is stopped while the mobile menu or the lightbox is open (see each),
     because a running Lenis turns a wheel over either into a scroll of the
     page behind it. */
  var lenis = null;
  if (!reducedMotion && typeof window.Lenis === "function") {
    lenis = new window.Lenis({ lerp: SCROLL_LERP, autoRaf: true });
  }

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
      if (lenis) lenis.stop();
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
      /* After the restore, not before: start() re-reads the scroll position,
         and before the restore it would read the pinned body's 0. */
      if (lenis) lenis.start();
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

    /* A stopped Lenis swallows every wheel event, including one over a menu
       tall enough to scroll on a short landscape screen. Let that one through. */
    if (lenis) panel.setAttribute("data-lenis-prevent", "");

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

  /* ---- Hero intro ----
     Plays once, on load, on pages with the full-screen hero. The photo settles
     out of a slight zoom; the tagline fades up; the headline arrives word by
     word out of a blur (after React Bits' BlurText, built on GSAP SplitText);
     the script word follows as one piece so its shine stays whole; then the
     paragraph, the buttons and the scroll cue. Every measurement is a knob in
     the control block.

     The stylesheet hides the hero's words under .motion until .motion-ready
     lands, so they never paint once in place and then vanish to animate in.
     .motion-ready is added in the finally below whatever happens here: a
     missing library or an error shows the hero as it always was, at once,
     rather than waiting for the stylesheet's failsafe.

     When it finishes, the split is reverted and the inline styles cleared, so
     the headline goes back to being one plain text node for selection, find
     and assistive tech, and nothing the intro wrote is left behind.

     On a connection slow enough that the failsafe has already shown the hero
     by the time this runs, the intro is skipped: hiding words the visitor is
     already reading, to fade them in again, is worse than no intro. */
  var docEl = document.documentElement;
  var heroEl = document.querySelector(".hero");
  var FAILSAFE_MS = parseFloat(knob("--hero-failsafe", "3s")) * 1000;
  if (heroEl && docEl.classList.contains("motion")) {
    var tl = null;
    try {
      if (!reducedMotion && window.gsap
          && !(window.performance && performance.now() > FAILSAFE_MS)) {
        var gsap = window.gsap;
        var secs = function (name, fallback) { return parseFloat(knob(name, fallback)); };
        var ZOOM_S = secs("--hero-intro-zoom-s", "2.4");
        var DELAY_S = secs("--hero-intro-delay-s", "0.15");
        var WORD_S = secs("--hero-word-s", "0.9");
        var STAGGER_S = secs("--hero-word-stagger-s", "0.08");
        var FOLLOW_S = secs("--hero-follow-s", "0.8");
        var BLUR = "blur(" + knob("--hero-word-blur", "12px") + ")";
        var FOLLOW_RISE = parseFloat(knob("--hero-follow-rise", "18px"));

        var bg = heroEl.querySelector(".hero__bg");
        var h1 = heroEl.querySelector("h1");
        var script = h1 && h1.querySelector(".script");
        var tagline = heroEl.querySelector(".tagline");
        var follow = [heroEl.querySelector(".lede"), heroEl.querySelector(".hero__actions")]
          .filter(Boolean);
        var cue = heroEl.querySelector(".scroll-cue");

        /* The rise is an em knob so it scales with the headline; GSAP wants px. */
        var rise = parseFloat(knob("--hero-word-rise", "0.35em"))
          * (h1 ? parseFloat(getComputedStyle(h1).fontSize) : 16);

        var split = null;
        var words = [];
        if (h1 && window.SplitText) {
          gsap.registerPlugin(window.SplitText);
          split = window.SplitText.create(h1, { type: "words", ignore: ".script", aria: "auto" });
          words = split.words;
        }

        var arriving = { opacity: 0, y: rise, filter: BLUR };
        var arrived = { opacity: 1, y: 0, filter: "blur(0px)", ease: "power3.out" };
        var touched = [tagline, script, cue].concat(words, follow).filter(Boolean);

        tl = gsap.timeline({
          onComplete: function () {
            gsap.set(touched, { clearProps: "opacity,transform,filter" });
            if (split) split.revert();
          }
        });
        if (bg) tl.to(bg, { scale: 1, duration: ZOOM_S, ease: "power2.out" }, 0);
        if (tagline) {
          tl.from(tagline, { opacity: 0, y: FOLLOW_RISE, duration: FOLLOW_S, ease: "power3.out" }, DELAY_S);
        }
        if (words.length) {
          tl.fromTo(words, arriving,
            Object.assign({ duration: WORD_S, stagger: STAGGER_S }, arrived), DELAY_S + STAGGER_S);
        }
        if (script) {
          tl.fromTo(script, arriving,
            Object.assign({ duration: WORD_S * 1.4 }, arrived), ">-" + (WORD_S * 0.5));
        }
        if (follow.length) {
          tl.from(follow, { opacity: 0, y: FOLLOW_RISE, duration: FOLLOW_S, stagger: STAGGER_S * 2,
            ease: "power3.out" }, ">-" + (WORD_S * 0.7));
        }
        if (cue) tl.from(cue, { opacity: 0, duration: FOLLOW_S }, ">-" + (FOLLOW_S * 0.3));
      }
    } catch (err) {
      /* Half-built: some words may already sit at their hidden start. Jump to
         the end, which runs the cleanup, then let the error surface. */
      if (tl) tl.progress(1);
      throw err;
    } finally {
      docEl.classList.add("motion-ready");
    }
  }

  /* ---- Section headings: split into words ----
     Each word goes in its own span so the stylesheet can brighten them one at
     a time (see .heading-reveal there); the scroll loop below says how far
     each heading has risen. The headings are plain text, so a word is simply
     a run of non-space characters, and the spaces between are left as they
     were. The spans are hidden from assistive tech and the heading carries its
     own text as a label, so it is still announced once, as one phrase, rather
     than word by word -- the same arrangement GSAP's SplitText uses. */
  var revealHeadings = [];
  if (!reducedMotion && docEl.classList.contains("motion")) {
    document.querySelectorAll(".section-head h2").forEach(function (h) {
      if (h.children.length) return; /* not plain text: leave it alone */
      var text = h.textContent;
      var parts = text.split(/(\s+)/);
      var count = 0;
      var frag = document.createDocumentFragment();
      parts.forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
        var span = document.createElement("span");
        span.className = "word";
        span.setAttribute("aria-hidden", "true");
        span.style.setProperty("--i", count++);
        span.textContent = part;
        frag.appendChild(span);
      });
      h.setAttribute("aria-label", text.replace(/\s+/g, " ").trim());
      h.textContent = "";
      h.appendChild(frag);
      h.style.setProperty("--words", count);
      h.classList.add("heading-reveal");
      revealHeadings.push(h);
    });
  }

  /* ---- Scroll-linked effects ----
     Four things move with the scroll rather than on it: the review and BOUND
     promise cards colour in as they reach the middle of the window, the
     closing band's photo drifts against the page, so does the hero's, and the
     section headings brighten as they rise. All
     are measured here and drawn by the stylesheet — this writes one number per
     element and nothing else, so the look is tuned in the control block, not
     in code.

     One frame per scroll event, never more: the handler only asks for a frame
     if one is not already pending. Both are skipped when the visitor has asked
     for reduced motion; the stylesheet drops the styling too, so the cards
     simply show at full colour and the photo stays put. */
  var focusCards = document.querySelectorAll(".media-card");
  var bands = document.querySelectorAll(".cta-band");
  var heroBg = document.querySelector(".hero .hero__bg");
  if (!reducedMotion && (focusCards.length || (bands.length && PARALLAX_DEPTH)
      || (heroBg && HERO_DRIFT) || revealHeadings.length)) {
    var pending = false;

    /* The words used to lift the moment a card crossed the middle of the
       window, so the artwork -- which is the thing being shown -- was covered
       for most of the time the card was on screen. The lift now waits for the
       page to stop moving: scroll past and you see the cards, stop on one and
       its words come up. A hover or a tab still lifts it at once, from the
       stylesheet, because either is already a deliberate act.

       Starts settled so a card that is already centred on load is readable
       without touching anything. */
    var settled = true;
    var settleTimer = null;

    var updateFocus = function (vh) {
      var centre = vh * FOCUS_CENTRE;
      var hold = vh * FOCUS_HOLD;
      var reach = vh * FOCUS_BAND;
      if (reach <= hold) reach = hold + 1;
      focusCards.forEach(function (card) {
        /* Still moving: every card rests, whole artwork visible. */
        if (!settled) { card.style.setProperty("--focus-scroll", "0"); return; }
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

    /* Measured from the hero's own box rather than from scrollY, like the
       band above: the mobile menu pins the body to lock scrolling, which reads
       as scrollY 0 while the page has not visibly moved. A scrollY-based drift
       would jump the photo behind the open menu.

       Written to the separate translate property, not transform, because the
       intro animates transform (the zoom) on the same element and the two
       must not overwrite each other. The photo sinks by at most --hero-drift,
       which is far less than the hero is tall, so its top edge is always off
       the top of the window by the time it has moved; the hero clips the
       bottom edge. */
    var updateHeroDrift = function () {
      if (!heroBg || !HERO_DRIFT) return;
      var r = heroBg.parentNode.getBoundingClientRect();
      if (r.bottom < 0 || !r.height) return;
      var p = -r.top / r.height;
      if (p < 0) p = 0;
      if (p > 1) p = 1;
      heroBg.style.translate = "0 " + (p * HERO_DRIFT).toFixed(1) + "px";
    };

    /* 0 while a heading's top is at or below --heading-reveal-start (as a
       share of the window, from the top), 1 once it has risen to
       --heading-reveal-end, in proportion between. Measured from its box for
       the same reason as the drift above. Scrubbed both ways, so scrolling
       back up lets a heading fade again as it sinks. */
    var updateHeadings = function (vh) {
      var span = HEADING_START - HEADING_END;
      if (span <= 0) span = 1;
      revealHeadings.forEach(function (h) {
        var r = h.getBoundingClientRect();
        var p = (HEADING_START - r.top / vh) / span;
        if (p < 0) p = 0;
        if (p > 1) p = 1;
        var v = p.toFixed(3);
        if (h.style.getPropertyValue("--heading-progress") !== v) {
          h.style.setProperty("--heading-progress", v);
        }
      });
    };

    var frame = function () {
      pending = false;
      var vh = window.innerHeight;
      updateFocus(vh);
      updateParallax(vh);
      updateHeroDrift();
      updateHeadings(vh);
    };
    var schedule = function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(frame);
    };
    /* Scrolling drops every card back to its artwork straight away, then
       arms the settle timer. The timer is restarted by each scroll event, so
       the words only come up once the page has actually stopped -- not on a
       lull mid-flick. The parallax is unaffected either way: it follows the
       scroll, which is the point of it -- so every scroll event asks for a
       frame, not only the first one. It used to ask only when the page started
       moving, which left both photos frozen mid-scroll and jumping into place
       once it settled. schedule() still caps it at one frame per refresh. */
    var onScroll = function () {
      settled = false;
      schedule();
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(function () {
        settled = true;
        schedule();
      }, FOCUS_SETTLE);
    };

    schedule();
    window.addEventListener("scroll", onScroll, { passive: true });
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
        if (lenis) lenis.start();
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
        if (lenis) lenis.stop();
        dialog.showModal();
      });
    });
  }

  /* ---- Magnetic buttons ----
     The page's main call-to-action buttons lean toward a mouse pointer that
     comes within --magnet-reach of them, by --magnet-pull of the distance
     from their centre and never more than --magnet-max, after React Bits'
     Magnet. Only for a fine pointer that
     hovers -- the stylesheet draws nothing otherwise -- and never under
     reduced motion. The lean goes back to nothing when the pointer leaves.

     The button's own box moves as it leans, so its centre is taken from the
     box with the current lean subtracted; measuring the leaned box would chase
     its own tail. One frame per pointer move or scroll, as with the scroll
     loop above. The nav pill's button is not included (see the stylesheet). */
  var magnets = document.querySelectorAll("main .btn--primary");
  if (!reducedMotion && magnets.length && docEl.classList.contains("motion")
      && window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    var REACH = parseFloat(knob("--magnet-reach", "48px"));
    var PULL = parseFloat(knob("--magnet-pull", "0.15"));
    var LEAN_MAX = parseFloat(knob("--magnet-max", "10px"));
    var pointer = null;
    var leanFrame = false;
    var leans = new Map();

    var lean = function () {
      leanFrame = false;
      magnets.forEach(function (btn) {
        var was = leans.get(btn) || { x: 0, y: 0 };
        var x = 0;
        var y = 0;
        if (pointer) {
          var r = btn.getBoundingClientRect();
          var cx = r.left + r.width / 2 - was.x;
          var cy = r.top + r.height / 2 - was.y;
          var dx = pointer.x - cx;
          var dy = pointer.y - cy;
          if (Math.abs(dx) < r.width / 2 + REACH && Math.abs(dy) < r.height / 2 + REACH) {
            x = dx * PULL;
            y = dy * PULL;
            /* A wide button's centre is far from a pointer at its end, so
               without a cap the widest buttons would lean the most. */
            var len = Math.sqrt(x * x + y * y);
            if (len > LEAN_MAX) { x *= LEAN_MAX / len; y *= LEAN_MAX / len; }
          }
        }
        if (x === was.x && y === was.y) return;
        leans.set(btn, { x: x, y: y });
        btn.style.setProperty("--magnet-x", x.toFixed(1) + "px");
        btn.style.setProperty("--magnet-y", y.toFixed(1) + "px");
      });
    };
    var askLean = function () {
      if (leanFrame) return;
      leanFrame = true;
      requestAnimationFrame(lean);
    };
    document.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      pointer = { x: e.clientX, y: e.clientY };
      askLean();
    }, { passive: true });
    /* The pointer left the window: let everything settle back. */
    document.documentElement.addEventListener("pointerleave", function () {
      pointer = null;
      askLean();
    });
    window.addEventListener("scroll", function () { if (pointer) askLean(); }, { passive: true });
  }

  /* ---- Trip-type strip ----
     Drifts sideways at --marquee-speed, after React Bits' ScrollVelocity.
     Scrolling speeds it up in proportion to how fast the page is moving, up
     to --marquee-boost-max, and it eases back once the page stops; scrolling
     up turns it round. It only animates while it is on screen.

     The markup holds one group of trip types. Copies are added until the
     track is at least one group wider than the window, so moving it by
     exactly one group's width and wrapping is seamless. Copies are refilled on
     resize, since a wider window needs more of them.

     The speed reads scrollY, so the mobile menu's scroll lock -- which drops
     scrollY to 0 and puts it back on close -- would read as a violent scroll.
     While the menu is open the reading is ignored and re-based afterwards. */
  var strip = document.querySelector(".marquee");
  if (strip && !reducedMotion && docEl.classList.contains("motion")) {
    var track = strip.querySelector(".marquee__track");
    var group = track && track.querySelector(".marquee__group");
    if (track && group) {
      var SPEED = parseFloat(knob("--marquee-speed", "40"));
      var BOOST = parseFloat(knob("--marquee-boost", "0.006"));
      var BOOST_MAX = parseFloat(knob("--marquee-boost-max", "6"));
      var SETTLE = parseFloat(knob("--marquee-settle", "0.08"));

      var groupWidth = 0;
      var fill = function () {
        groupWidth = group.getBoundingClientRect().width;
        if (!groupWidth) return;
        var need = Math.ceil(window.innerWidth / groupWidth) + 1;
        var have = track.children.length;
        for (; have < need; have++) track.appendChild(group.cloneNode(true));
      };
      fill();
      strip.classList.add("is-running");

      var offset = 0;
      var factor = 1;
      var direction = 1;
      var lastY = null;
      var lastT = null;
      var running = false;

      var step = function (t) {
        if (!running) return;
        var dt = lastT === null ? 0 : Math.min((t - lastT) / 1000, 0.1);
        lastT = t;

        var target = 1;
        if (document.body.classList.contains("nav-open")) {
          lastY = null;
        } else {
          var y = window.scrollY;
          if (lastY !== null && dt > 0) {
            var v = (y - lastY) / dt;
            if (v > 0) direction = 1;
            else if (v < 0) direction = -1;
            target = 1 + Math.min(Math.abs(v) * BOOST, BOOST_MAX);
          }
          lastY = y;
        }
        factor += (target - factor) * SETTLE;

        offset -= direction * SPEED * factor * dt;
        if (groupWidth) {
          offset %= groupWidth;
          if (offset > 0) offset -= groupWidth;
        }
        track.style.transform = "translate3d(" + offset.toFixed(2) + "px,0,0)";
        requestAnimationFrame(step);
      };

      var setRunning = function (on) {
        if (on === running) return;
        running = on;
        lastT = null;
        lastY = null;
        if (on) requestAnimationFrame(step);
      };
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (entries) {
          setRunning(entries[entries.length - 1].isIntersecting);
        }).observe(strip);
      } else {
        setRunning(true);
      }
      window.addEventListener("resize", fill);
      /* The display face is condensed, so the group is narrower once it
         lands; re-measure then too. */
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(fill);
    }
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
