#!/usr/bin/env node
/* Bora Bora Bound — detector suite.
 *
 * Dev tooling only. Nothing here ships: GitHub Pages serves the repo root, and
 * this folder's node_modules is gitignored.
 *
 *   cd tools/audit && npm install
 *   node audit.mjs                 # run every detector
 *   node audit.mjs --screenshots   # also capture 1280x800 stills to .shots/
 *   node audit.mjs --shots-dir X   # where to put them (default .shots)
 *
 * Every detector runs against RENDERED output, not source text — hit areas are
 * measured by hit-testing, colours by resolving them in the browser. That is the
 * point: source-reading detectors miss exactly the defects that only exist once
 * the cascade has run.
 */

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const PORT = 4173; // matches .claude/launch.json

/* ---- Policy ------------------------------------------------------------- */

// Pages that are SUPPOSED to carry noindex even in production. Read out of
// build.py rather than restated here: two copies of the policy the guard exists
// to enforce is the same defect this suite is meant to catch.
let ALWAYS_NOINDEX = new Set();

// WCAG 2.5.5 Target Size (Enhanced). The site's own bar.
const TAP_MIN = 44;

// Targets held below TAP_MIN on purpose. A finding removed from the report has
// to be removed on the record, with the reason attached — an exemption nobody
// can see is indistinguishable from a detector that missed something.
const TAP_EXEMPT = [
  {
    selector: ".brand",
    reason:
      "The brand lockup draws at 42px and the floating pill's height is part " +
      "of a locked design. It is the home link, and the menu carries its own " +
      "Home entry, so the destination is not reachable only here.",
  },
];

// How long to wait on any third-party request (photos, webfonts) before giving
// up on it. Without a bound, a network that black-holes a host instead of
// refusing it turns a two-minute run into nine minutes of idle waiting — nearly
// all of this suite's wall time, and none of its work.
const EXTERNAL_TIMEOUT = 4000;

// Google Fonts is blocked for the measuring pass, always — not because it is
// unreachable, but so that the answer does not depend on whether it is.
//
// Bebas Neue is condensed: with it loaded a journal title fits one 26px line;
// without it the same title wraps to two and measures 52px. That flipped a
// tap-target finding between runs on different networks, which makes a green
// result meaningless. The fallback face is the deterministic choice and a state
// the site explicitly supports — main.js only adds .display-face-ready once
// Bebas is confirmed present, and the stylesheet carries a whole phone headline
// curve scoped to the stand-in.
//
// Pass B leaves fonts alone: it is checking images, and there the real page is
// what matters.
const WEBFONT_HOSTS = /(^|\.)(fonts\.googleapis\.com|fonts\.gstatic\.com)$/;

// Two test widths. 390px is the phone the 26 original findings came from; 768px
// is a touch device sitting in a band nothing else checks — above the phone
// breakpoints, below the 1000px nav collapse.
const TAP_WIDTHS = [390, 768];

// Custom properties may share a value only when the duplication is deliberate
// and the roles are genuinely distinct. Each group needs a reason here, so a
// duplicate can never appear by accident and go unnoticed.
const INTENTIONAL_DUPLICATES = [
  {
    names: ["--brand", "--focus-ring", "--link"],
    reason:
      "Brand ground/headings, interactive text and the keyboard focus ring " +
      "are the same purple today. Separate names so any of them can move " +
      "without dragging the others with it — and --focus-ring in particular " +
      "has to be free to move, because it is the one of the three that also " +
      "has a value to hold on a dark ground (--focus-ring-on-dark).",
  },
];

// Colour words that a token name may contain, and the hue range each promises.
// A name outside its range is a name that lies.
const HUE_WORDS = {
  navy: [200, 260], blue: [190, 260], teal: [160, 200], aqua: [160, 200],
  lagoon: [160, 210], sea: [170, 240], cyan: [170, 195],
  green: [90, 160], lime: [70, 100],
  gold: [35, 60], amber: [30, 55], sand: [25, 55], cream: [25, 60],
  orange: [15, 45], yellow: [45, 65],
  red: [345, 15], rose: [320, 355], pink: [300, 355], magenta: [290, 330],
  purple: [255, 295], violet: [255, 290], indigo: [240, 275],
  blush: [280, 355],
};

/* ---- Static server ------------------------------------------------------ */

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".xml": "application/xml", ".txt": "text/plain; charset=utf-8",
};

/** Route every off-origin request through a timeout, recording what each one
 *  actually answered.
 *
 *  The status matters more than the failure: an egress proxy that denies a host
 *  answers 403 as an ordinary HTTP response rather than throwing, so "the
 *  request failed" cannot tell a withdrawn photo from one this network simply
 *  refused to fetch. Getting that backwards is worse than not checking — it
 *  sends someone hunting for replacements for photos that are perfectly fine.
 *
 *    404 / 410            the photo is genuinely gone
 *    403 / 407 / 5xx      a gateway refused; we learned nothing about the photo
 *    thrown / timed out   same
 */
function boundExternal(ctx, seen) {
  return ctx.route((url) => url.host !== `127.0.0.1:${PORT}`, async (route) => {
    const url = route.request().url();
    try {
      const res = await route.fetch({ timeout: EXTERNAL_TIMEOUT });
      seen.set(url, res.status());
      return await route.fulfill({ response: res });
    } catch {
      seen.set(url, "unreachable");
      return route.abort();
    }
  });
}

/** Did we actually learn anything about this URL? */
const GONE = new Set([404, 410]);
function externalVerdict(seen, url) {
  const status = seen.get(url);
  if (status === undefined) return { known: false, why: "no response recorded" };
  if (status === "unreachable") return { known: false, why: "the request timed out or was refused" };
  if (GONE.has(status)) return { known: true, why: `the host answered ${status}` };
  if (status >= 400) return { known: false, why: `a gateway answered ${status}` };
  return { known: true, why: `the host answered ${status}` };
}

function serve() {
  const server = createServer(async (req, res) => {
    let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        "content-type": MIME[path.extname(file)] || "application/octet-stream",
      });
      res.end(body);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
    }
  });
  return new Promise((ok) => server.listen(PORT, "127.0.0.1", () => ok(server)));
}

/* ---- What to test ------------------------------------------------------- */

/** The page list comes from build.py's own PAGES table, so a new page is
 *  audited automatically rather than needing a second list kept in sync. */
async function pageList() {
  const src = await readFile(path.join(ROOT, "tools/build.py"), "utf-8");
  const pages = [...src.matchAll(/^ {4}"([^"]+\.html)": dict\(/gm)].map((m) => m[1]);
  const posts = [...src.matchAll(/^\s+slug="([^"]+)"/gm)].map((m) => `journal/${m[1]}.html`);
  if (!pages.length) throw new Error("could not read PAGES from tools/build.py");
  return [...pages, ...posts];
}

async function deliberateNoindex() {
  const src = await readFile(path.join(ROOT, "tools/build.py"), "utf-8");
  const m = src.match(/^DELIBERATE_NOINDEX = \{([^}]*)\}/m);
  if (!m) throw new Error("could not read DELIBERATE_NOINDEX from tools/build.py");
  return new Set([...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
}

async function stagingFlag() {
  const src = await readFile(path.join(ROOT, "tools/build.py"), "utf-8");
  return /^STAGING = True$/m.test(src);
}

/* ---- Results ------------------------------------------------------------ */

const results = [];
const record = (detector, status, where, detail) =>
  results.push({ detector, status, where, detail });
const pass = (d, w, x) => record(d, "PASS", w, x);
const fail = (d, w, x) => record(d, "FAIL", w, x);
const unver = (d, w, x) => record(d, "UNVERIFIED", w, x);

/* ---- Detectors ---------------------------------------------------------- */

/** #1 — the staging noindex must match the STAGING flag, both directions. */
async function detectStagingLeak(page, url, staging) {
  const robots = await page.getAttribute('meta[name="robots"]', "content");
  const name = url.replace(/^\//, "") || "index.html";
  const has = /noindex/i.test(robots || "");
  if (staging) {
    if (has) pass("staging-leak", name, robots);
    else fail("staging-leak", name,
      `STAGING=True but robots is "${robots}" — page is indexable`);
  } else if (ALWAYS_NOINDEX.has(name)) {
    if (has) pass("staging-leak", name, `${robots} (deliberate)`);
    else fail("staging-leak", name,
      `expected a deliberate noindex, got "${robots}"`);
  } else if (has) {
    fail("staging-leak", name, `PRODUCTION BUILD STILL CARRIES "${robots}"`);
  } else {
    pass("staging-leak", name, robots);
  }
}

/** #2 — an <img> that did not decode. Cross-origin images that never reached
 *  the network are reported UNVERIFIED, never PASS: a detector that goes green
 *  because it could not reach the host is worse than no detector at all. */
async function detectBrokenImages(page, url, externalSeen) {
  const name = url.replace(/^\//, "") || "index.html";
  const imgs = await page.$$eval("img", (els) =>
    els.map((el) => ({
      src: el.currentSrc || el.src,
      ok: el.complete && el.naturalWidth > 0,
      // main.js moves alt to title when an image fails, so read both — the
      // description is what identifies which photo died.
      alt: el.getAttribute("alt") || el.getAttribute("title") || "",
      handled: el.classList.contains("img-missing"),
    })));
  for (const img of imgs) {
    let host = "";
    try { host = new URL(img.src).host; } catch { /* data: or empty */ }
    const external = host && host !== `127.0.0.1:${PORT}`;
    if (img.ok) { pass("broken-images", name, img.src); continue; }
    const verdict = external ? externalVerdict(externalSeen, img.src) : null;
    if (external && !verdict.known) {
      unver("broken-images", name,
        `${img.src} — not checked: ${verdict.why}. This says nothing about ` +
        `whether the photo is still there. Re-run somewhere ${host} resolves.`);
    } else if (external) {
      // A photo a third party withdrew. Reported loudly, but it must not fail
      // the build: blocking an unrelated merge on a stranger's decision gets
      // the check disabled, not the photo replaced. tools/audit's caller
      // decides what to do with these — see ROTTED below.
      record("broken-images", "ROTTED", name,
        `${img.src} did not decode. ${verdict.why}, so this photo is gone ` +
        `upstream. The page shows ${img.handled ? "the fallback tile" : "its alt text"} ` +
        `where "${img.alt}" should be. Repoint the slot in the IMAGES table ` +
        `in tools/build.py.`);
    } else {
      fail("broken-images", name,
        `${img.src} did not decode. The page shows ` +
        `${img.handled ? "the fallback tile" : "its alt text"} where ` +
        `"${img.alt}" should be.`);
    }
  }
}

/** #3 — a token name that states a hue must resolve to that hue, and no two
 *  alias tokens may share a value without a documented reason. */
async function detectTokenTruth(page) {
  const tokens = await page.evaluate(() => {
    const probe = document.createElement("span");
    document.body.appendChild(probe);
    const seen = new Map(); // name -> declared value
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      for (const rule of rules) {
        if (!rule.style || !rule.selectorText) continue;
        if (!/(^|,)\s*:root\b/.test(rule.selectorText)) continue;
        for (const prop of rule.style) {
          if (prop.startsWith("--")) {
            seen.set(prop, rule.style.getPropertyValue(prop).trim());
          }
        }
      }
    }
    const out = [];
    for (const [name, declared] of seen) {
      probe.style.color = "";
      probe.style.color = `var(${name})`;
      out.push({ name, declared, resolved: getComputedStyle(probe).color });
    }
    probe.remove();
    return out;
  });

  const rgbToHue = (rgb) => {
    const m = String(rgb).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
    if (!m) return null;
    const [r, g, b] = m.slice(1, 4).map((n) => Number(n) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d < 0.02) return null; // greyscale — no hue to lie about
    let h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return (Math.round(h * 60) + 360) % 360;
  };
  const inRange = (h, [lo, hi]) => (lo <= hi ? h >= lo && h <= hi : h >= lo || h <= hi);

  // Naming truth.
  for (const t of tokens) {
    const hue = rgbToHue(t.resolved);
    if (hue === null) continue;
    for (const [word, range] of Object.entries(HUE_WORDS)) {
      if (!new RegExp(`(^|-)${word}(-|$)`).test(t.name)) continue;
      if (inRange(hue, range)) {
        pass("token-truth", t.name, `${t.resolved} — hue ${hue}deg reads as ${word}`);
      } else {
        fail("token-truth", t.name,
          `name says "${word}" (${range[0]}-${range[1]}deg) but it resolves to ` +
          `${t.resolved}, hue ${hue}deg. Declared as "${t.declared}".`);
      }
    }
  }

  // Alias tokens sharing one value.
  const aliases = tokens.filter((t) =>
    /^\s*var\(--[\w-]+\)\s*$/.test(t.declared) && rgbToHue(t.resolved) !== null);
  const groups = new Map();
  for (const a of aliases) {
    if (!groups.has(a.resolved)) groups.set(a.resolved, []);
    groups.get(a.resolved).push(a.name);
  }
  for (const [value, names] of groups) {
    if (names.length < 2) continue;
    const sorted = [...names].sort();
    const allowed = INTENTIONAL_DUPLICATES.find(
      (d) => [...d.names].sort().join() === sorted.join());
    if (allowed) {
      pass("token-truth", sorted.join(" + "), `both ${value} — ${allowed.reason}`);
    } else {
      fail("token-truth", sorted.join(" + "),
        `${names.length} alias tokens resolve to the same ${value} with no ` +
        `documented reason. Collapse them, or add the group to ` +
        `INTENTIONAL_DUPLICATES with why.`);
    }
  }
}

/** #4 — the mobile menu must be operable and announced. */
async function detectMenuA11y(page, url) {
  const name = url.replace(/^\//, "") || "index.html";
  const toggle = await page.$(".nav-toggle");
  if (!toggle) { fail("menu-a11y", name, "no .nav-toggle found"); return; }

  const controls = await toggle.getAttribute("aria-controls");
  if (!controls) {
    fail("menu-a11y", name,
      "the toggle has no aria-controls, so nothing links it to the panel it opens");
  } else {
    const target = await page.$(`[id="${controls}"]`);
    if (target) pass("menu-a11y", name, `aria-controls="${controls}" resolves`);
    else fail("menu-a11y", name,
      `aria-controls="${controls}" points at an id that does not exist`);
  }

  // Closed panel must be out of the tab order.
  const reachableClosed = await page.$$eval(".nav-links a", (els) =>
    els.filter((el) => el.getBoundingClientRect().width > 0 &&
      getComputedStyle(el).visibility !== "hidden").length);
  if (reachableClosed === 0) {
    pass("menu-a11y", name, "closed panel is out of the tab order");
  } else {
    fail("menu-a11y", name,
      `${reachableClosed} links are still focusable while the menu is closed`);
  }

  const expandedBefore = await toggle.getAttribute("aria-expanded");
  await toggle.click();
  await page.waitForTimeout(350);

  const expandedAfter = await toggle.getAttribute("aria-expanded");
  if (expandedBefore === "false" && expandedAfter === "true") {
    pass("menu-a11y", name, "aria-expanded toggles false -> true");
  } else {
    fail("menu-a11y", name,
      `aria-expanded went "${expandedBefore}" -> "${expandedAfter}"`);
  }

  // Focus must land inside the panel.
  const focusInPanel = await page.evaluate((id) => {
    const panel = id ? document.getElementById(id) : document.querySelector(".nav-links");
    return !!(panel && document.activeElement && panel.contains(document.activeElement));
  }, controls);
  if (focusInPanel) pass("menu-a11y", name, "focus moved into the open panel");
  else fail("menu-a11y", name,
    "focus never entered the panel — the menu opens behind the user");

  // The page must not scroll behind the open menu — tested with a real wheel
  // event, not window.scrollTo. overflow: hidden blocks USER scrolling and
  // leaves programmatic scrolling working, so a scrollTo probe reports movement
  // on a page that is correctly locked and fails a passing fix.
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.move(200, 500);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(250);
  const scrolled = await page.evaluate((y) => Math.round(window.scrollY - y), before);
  if (scrolled === 0) {
    pass("menu-a11y", name, "body scroll is locked while the menu is open");
  } else {
    fail("menu-a11y", name, `the page scrolled ${scrolled}px behind the open menu`);
  }

  // The symptom check above passes on overflow: hidden alone, which iOS Safari
  // often ignores — and this runs in Chromium, so it cannot see that. Assert the
  // mechanism as well: only the position: fixed lock holds on the browser most
  // at risk, and the browser most at risk is not the one under test.
  const lock = await page.evaluate(() => {
    const cs = getComputedStyle(document.body);
    return { position: cs.position, top: cs.top };
  });
  if (lock.position === "fixed" && /^-?\d/.test(lock.top)) {
    pass("menu-a11y", name,
      `body is position: fixed at ${lock.top} — the lock iOS Safari honours`);
  } else {
    fail("menu-a11y", name,
      `body is position: ${lock.position} (top: ${lock.top}) while open. ` +
      `overflow: hidden alone is unreliable on iOS Safari, where the page ` +
      `keeps scrolling behind the panel.`);
  }

  // Escape closes and hands focus back.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(350);
  const returned = await page.evaluate(() =>
    document.activeElement === document.querySelector(".nav-toggle"));
  const closed = (await toggle.getAttribute("aria-expanded")) === "false";
  if (closed && returned) {
    pass("menu-a11y", name, "Escape closes the menu and returns focus to the toggle");
  } else {
    fail("menu-a11y", name,
      `Escape left expanded=${!closed}, focus-returned=${returned}`);
  }
}

/** #5 — every focusable target must offer a 44x44 hit area.
 *
 *  Measured by hit-testing four corners of a 44x44 box on the element's centre,
 *  not by reading getBoundingClientRect. A transparent ::before that enlarges
 *  the hit area is a real fix and this sees it; a rect-reading detector would
 *  not. It also catches the opposite case — a target whose own box is big
 *  enough but whose corners are covered by a neighbour. */
async function detectTapTargets(page, url, label, scope) {
  const name = (url.replace(/^\//, "") || "index.html") + label;
  const small = await page.evaluate(({ MIN, scope, exempt }) => {
    const sel = 'a[href], button, input:not([type="hidden"]), select, textarea,' +
      ' [tabindex]:not([tabindex="-1"])';
    const root = scope ? document.querySelector(scope) : document;
    if (!root) return [];

    // Scroll-reveal blocks start at opacity 0, which makes everything inside
    // them untouchable by elementFromPoint. The site's own observer adds .in
    // when they enter view; do the same up front so the whole page is
    // measurable in one pass rather than only what happens to be revealed.
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in"));

    const out = [];
    for (const el of root.querySelectorAll(sel)) {
      let r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      if (Number(cs.opacity) === 0) continue;
      // Inside a closed <details>: not rendered, so not a target until the
      // disclosure is opened. Chromium still lays the contents out, so a rect
      // check cannot tell, and elementFromPoint lands on whatever is drawn
      // there instead. The runner measures these in a separate pass with the
      // folds open, the way it re-measures the mobile menu.
      if (el.closest("details:not([open])")) continue;
      // Parked outside the viewport on purpose (a skip link) — not a tap target.
      if (r.right < 0 || r.left > document.documentElement.clientWidth) continue;

      // elementFromPoint only sees the viewport, so bring the candidate into it
      // before hit-testing. Without this every below-the-fold target reports a
      // null hit and the detector invents failures.
      if (r.top < MIN || r.bottom > innerHeight - MIN) {
        el.scrollIntoView({ block: "center", behavior: "instant" });
        r = el.getBoundingClientRect();
      }
      if (r.bottom < 0 || r.top > innerHeight) continue;

      const cx = Math.min(Math.max(r.left + r.width / 2, MIN / 2), innerWidth - MIN / 2);
      const cy = Math.min(Math.max(r.top + r.height / 2, MIN / 2), innerHeight - MIN / 2);
      const h = MIN / 2 - 0.5;
      const corners = [
        [cx - h, cy - h], [cx + h, cy - h], [cx - h, cy + h], [cx + h, cy + h],
      ];
      // A corner counts as owned when it hit-tests to this element, to one of
      // its descendants, or to a different control that activates the same
      // destination (a card's image link sitting behind its title link).
      //
      // Deliberately NOT counting an ancestor: a small link inside a wide <p>
      // hit-tests to that <p> at 44px out, and treating that as ownership would
      // pass every inline link on the site. That hole is what makes a
      // rect-reading detector and a naive hit-test detector both useless here.
      const owns = corners.every(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        if (!hit) return false;
        if (hit === el || el.contains(hit)) return true;
        const other = hit.closest("a[href], button");
        return !!(other && el.href && other.href === el.href);
      });
      if (owns) continue;

      // WCAG 2.5.5 and 2.5.8 both exempt a target "in a sentence, or whose size
      // is otherwise constrained by the line-height of non-target text".
      // Enlarging a link that sits mid-paragraph would open up the leading
      // around it, so the standard does not ask for it. Reported separately
      // rather than dropped: an exemption nobody can see is indistinguishable
      // from a detector that missed something.
      const inline = getComputedStyle(el).display === "inline" &&
        [...(el.parentElement?.childNodes || [])].some(
          (n) => n.nodeType === 3 && n.textContent.trim().length > 0);

      // Held below the bar on purpose, with a reason recorded in TAP_EXEMPT.
      const held = exempt.find((x) => el.matches(x.selector));

      const cls = typeof el.className === "string" && el.className.trim()
        ? `.${el.className.trim().split(/\s+/).join(".")}` : "";
      out.push({
        tag: el.tagName.toLowerCase(),
        cls,
        inline,
        exemptReason: held ? held.reason : null,
        text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 40),
        w: Math.round(r.width), h: Math.round(r.height),
      });
    }
    window.scrollTo({ top: 0, behavior: "instant" });
    return out;
  }, { MIN: TAP_MIN, scope, exempt: TAP_EXEMPT });

  const real = small.filter((s) => !s.inline && !s.exemptReason);
  const exempt = small.filter((s) => s.inline || s.exemptReason);

  if (!real.length) {
    pass("tap-targets", name,
      `every target offers ${TAP_MIN}x${TAP_MIN}` +
      (exempt.length ? ` (${exempt.length} exempt)` : ""));
  }
  for (const s of real) {
    fail("tap-targets", name,
      `${s.tag}${s.cls} "${s.text}" — ${s.w}x${s.h}, under ${TAP_MIN}x${TAP_MIN}`);
  }
  for (const s of exempt) {
    const why = s.exemptReason
      ? s.exemptReason
      : "inside a sentence (WCAG 2.5.5 inline exception)";
    record("tap-targets", "EXEMPT", name,
      `${s.tag}${s.cls} "${s.text}" — ${s.w}x${s.h}, ${why}`);
  }
}

/** #6 — heading levels must start at h1 and never skip a level. */
async function detectHeadingOrder(page, url) {
  const name = url.replace(/^\//, "") || "index.html";
  const levels = await page.$$eval("h1,h2,h3,h4,h5,h6", (els) =>
    els.map((el) => ({
      level: Number(el.tagName[1]),
      text: el.textContent.trim().slice(0, 48),
    })));
  if (!levels.length) { fail("heading-order", name, "no headings at all"); return; }
  if (levels[0].level !== 1) {
    fail("heading-order", name,
      `first heading is an h${levels[0].level} ("${levels[0].text}"), not an h1`);
  }
  let bad = 0;
  for (let i = 1; i < levels.length; i++) {
    if (levels[i].level - levels[i - 1].level > 1) {
      bad++;
      fail("heading-order", name,
        `h${levels[i - 1].level} -> h${levels[i].level} skips a level ` +
        `at "${levels[i].text}"`);
    }
  }
  if (!bad && levels[0].level === 1) {
    pass("heading-order", name, `${levels.length} headings, no skipped levels`);
  }
}

/* ---- Runner ------------------------------------------------------------- */

// A 1x1 transparent PNG. Stands in for images this environment cannot fetch so
// layout measurements stay faithful; the <img> tags carry width/height, so the
// boxes are the same size they would be with the real photo.
const STUB_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64");

/** Some sandboxes ship a Chromium that does not match the npm package's pinned
 *  build. Prefer whatever is already on disk over downloading another copy. */
function launchOptions() {
  const opts = {};
  const candidates = [
    process.env.CHROMIUM_PATH,
    process.env.PLAYWRIGHT_BROWSERS_PATH
      ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, "chromium")
      : null,
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(c)) { opts.executablePath = c; break; }
  }
  return opts;
}

async function main() {
  const wantShots = process.argv.includes("--screenshots");
  const shotsIdx = process.argv.indexOf("--shots-dir");
  const shotsDir = path.resolve(HERE,
    shotsIdx > -1 ? process.argv[shotsIdx + 1] : ".shots");

  const staging = await stagingFlag();
  ALWAYS_NOINDEX = await deliberateNoindex();
  const pages = await pageList();
  const server = await serve();
  const browser = await chromium.launch(launchOptions());
  const externalSeen = new Map();

  try {
    /* Pass A — layout and semantics, with external images stubbed so the boxes
       are the right size even though the host is unreachable here. */
    for (const width of TAP_WIDTHS) {
      const ctxA = await browser.newContext({ viewport: { width, height: 844 } });
      // Photos are stubbed here so boxes are the right size regardless of
      // reachability; the stub must be registered before the general handler.
      await ctxA.route("**unsplash.com/**", (route) =>
        route.fulfill({ status: 200, contentType: "image/png", body: STUB_PNG }));
      await ctxA.route((url) => WEBFONT_HOSTS.test(url.host), (route) => route.abort());
      await boundExternal(ctxA, externalSeen);
      const a = await ctxA.newPage();

      for (const file of pages) {
        const url = `http://127.0.0.1:${PORT}/${file === "index.html" ? "" : file}`;
        await a.goto(url, { waitUntil: "load" });
        // Page-level semantics do not vary by viewport; run them once.
        if (width === TAP_WIDTHS[0]) {
          await detectStagingLeak(a, `/${file}`, staging);
          await detectHeadingOrder(a, `/${file}`);
          await detectMenuA11y(a, `/${file}`);
        }
        await detectTapTargets(a, `/${file}`, ` [${width}px, menu closed]`, null);
        // Re-open so the menu's own links get measured too.
        const t = await a.$(".nav-toggle");
        if (t) {
          await t.click();
          await a.waitForTimeout(350);
          // Scope to the header: the open dropdown covers page content, and a
          // target hidden behind it is not a tap-target defect.
          await detectTapTargets(a, `/${file}`, ` [${width}px, menu open]`, ".site-header");
          await a.keyboard.press("Escape");
          await a.waitForTimeout(200);
        }
        // The footer's folded columns. main.js closes them on a phone, so
        // their links are not targets until a tap opens them -- measure them
        // open, then close them again so the next check sees the page as it
        // loads. Scoped to the footer: the open folds push nothing else about.
        const folded = await a.$$("details.footer-col__fold:not([open])");
        if (folded.length) {
          await a.evaluate(() => document.querySelectorAll("details.footer-col__fold")
            .forEach((d) => { d.open = true; }));
          await a.waitForTimeout(100);
          await detectTapTargets(a, `/${file}`, ` [${width}px, footer open]`, ".site-footer");
          await a.evaluate(() => document.querySelectorAll("details.footer-col__fold")
            .forEach((d) => { d.open = false; }));
        }
        if (file === "index.html" && width === TAP_WIDTHS[0]) await detectTokenTruth(a);
      }
      await ctxA.close();
    }

    /* Pass B — images, unstubbed, so a genuinely dead URL is visible. */
    const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await boundExternal(ctxB, externalSeen);
    const b = await ctxB.newPage();
    for (const file of pages) {
      const url = `http://127.0.0.1:${PORT}/${file === "index.html" ? "" : file}`;
      await b.goto(url, { waitUntil: "load" });
      await b.evaluate(async () => {
        // loading="lazy" images below the fold never request otherwise.
        document.querySelectorAll('img[loading="lazy"]').forEach((i) => { i.loading = "eager"; });
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise((r) => setTimeout(r, 250));
      });
      // Wait for every image to settle before judging it. Lazy images only
      // start loading after the forced eager pass above, so a fixed 500ms wait
      // caught them mid-flight and reported still-pending photos as withdrawn.
      await b.waitForFunction(
        () => [...document.images].every((i) => i.complete),
        null, { timeout: EXTERNAL_TIMEOUT + 3000 },
      ).catch(() => { /* something never settled; judged on its merits below */ });
      await detectBrokenImages(b, `/${file}`, externalSeen);

      if (wantShots) {
        await mkdir(shotsDir, { recursive: true });
        await b.evaluate(() => window.scrollTo(0, 0));
        await b.waitForTimeout(200);
        const shot = file.split("/").join("_").replace(/\.html$/, "") + ".png";
        await b.screenshot({ path: path.join(shotsDir, shot), fullPage: true });
      }
    }
    await ctxB.close();
  } finally {
    await browser.close();
    server.close();
  }

  await report(staging, wantShots ? shotsDir : null, externalSeen);
}

async function report(staging, shotsDir, unreachable) {
  const detectors = [...new Set(results.map((r) => r.detector))].sort();
  const counts = (d, s) =>
    results.filter((r) => r.detector === d && r.status === s).length;

  console.log(`\nBora Bora Bound — detector suite   (STAGING=${staging})`);
  console.log(`Measured in the fallback face; the webfont is blocked so the ` +
    `result cannot vary\nwith whether Google Fonts is reachable.\n`);
  let failed = 0, rotted = 0;
  for (const d of detectors) {
    const f = counts(d, "FAIL"), u = counts(d, "UNVERIFIED"),
      p = counts(d, "PASS"), e = counts(d, "EXEMPT"), r = counts(d, "ROTTED");
    failed += f;
    rotted += r;
    const mark = f ? "FAIL" : (u || r) ? "WARN" : "PASS";
    console.log(`${mark.padEnd(5)} ${d.padEnd(16)} ${p} pass  ${f} fail  ` +
      `${u} unverified${e ? `  ${e} exempt` : ""}${r ? `  ${r} rotted` : ""}`);
  }

  for (const status of ["FAIL", "ROTTED", "UNVERIFIED", "EXEMPT"]) {
    const rows = results.filter((r) => r.status === status);
    if (!rows.length) continue;
    console.log(`\n--- ${status} (${rows.length}) ---`);
    // Identical findings repeat across twenty pages; say so once with a count.
    const seen = new Map();
    for (const r of rows) {
      const key = `${r.detector} ${r.detail}`;
      if (!seen.has(key)) seen.set(key, { ...r, where: [r.where] });
      else seen.get(key).where.push(r.where);
    }
    for (const r of seen.values()) {
      const where = r.where.length > 3
        ? `${r.where.slice(0, 3).join(", ")} +${r.where.length - 3} more`
        : r.where.join(", ");
      console.log(`  [${r.detector}] ${where}\n      ${r.detail}`);
    }
  }

  if (shotsDir) console.log(`\nScreenshots: ${shotsDir}`);

  const unreached = new Set();
  for (const [url, status] of unreachable) {
    if (status === "unreachable" || (typeof status === "number" && status >= 400 && !GONE.has(status))) {
      try { unreached.add(new URL(url).host); } catch { /* ignore */ }
    }
  }
  if (unreached.size) {
    console.log(`\nNot reachable from this network: ${[...unreached].sort().join(", ")}` +
      `\n  Nothing served by those hosts was checked, and a green run above does` +
      `\n  not cover them. Re-run somewhere they resolve.`);
  }

  if (rotted) {
    console.log(
      `\n${"=".repeat(70)}\n` +
      `${rotted} hotlinked photo${rotted === 1 ? " has" : "s have"} been ` +
      `withdrawn upstream and ${rotted === 1 ? "is" : "are"} rendering alt ` +
      `text on the live site.\nFix by repointing the slot in the IMAGES table ` +
      `in tools/build.py. This does NOT fail the\nbuild — a third party's ` +
      `decision should not block an unrelated merge — but it is\nnot optional ` +
      `either.\n${"=".repeat(70)}`);
  }
  console.log(failed ? `\n${failed} findings.\n` : "\nAll detectors green.\n");

  // Machine-readable tail, so CI can comment on rot without re-parsing the log.
  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import("node:fs");
    const lines = results.filter((r) => r.status === "ROTTED")
      .map((r) => `- \`${r.where}\` — ${r.detail}`).join("\n");
    appendFileSync(process.env.GITHUB_OUTPUT,
      `rotted=${rotted}\nrotted_body<<EOF\n${lines}\nEOF\n`);
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
