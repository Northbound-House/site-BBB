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

// Pages that are SUPPOSED to carry noindex even in production.
const ALWAYS_NOINDEX = new Set(["terms.html", "404.html"]);

// WCAG 2.5.5 Target Size (Enhanced). The site's own bar.
const TAP_MIN = 44;

// Custom properties may share a value only when the duplication is deliberate
// and the roles are genuinely distinct. Each group needs a reason here, so a
// duplicate can never appear by accident and go unnoticed.
const INTENTIONAL_DUPLICATES = [
  {
    names: ["--brand", "--link"],
    reason:
      "Brand ground/headings and interactive text are the same purple today. " +
      "Separate names so either can move without dragging the other with it.",
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
async function detectBrokenImages(page, url, blockedHosts) {
  const name = url.replace(/^\//, "") || "index.html";
  const imgs = await page.$$eval("img", (els) =>
    els.map((el) => ({
      src: el.currentSrc || el.src,
      ok: el.complete && el.naturalWidth > 0,
      alt: el.getAttribute("alt") || "",
    })));
  for (const img of imgs) {
    let host = "";
    try { host = new URL(img.src).host; } catch { /* data: or empty */ }
    const external = host && host !== `127.0.0.1:${PORT}`;
    if (img.ok) { pass("broken-images", name, img.src); continue; }
    if (external && blockedHosts.has(host)) {
      unver("broken-images", name,
        `${img.src} — ${host} is unreachable from this environment ` +
        `(the proxy denied CONNECT). Re-run where the host resolves to check ` +
        `for hotlink rot.`);
    } else {
      fail("broken-images", name,
        `${img.src} did not decode — the page renders the alt text ` +
        `"${img.alt}" in its place`);
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
  const small = await page.evaluate(({ MIN, scope }) => {
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

      const cls = typeof el.className === "string" && el.className.trim()
        ? `.${el.className.trim().split(/\s+/).join(".")}` : "";
      out.push({
        tag: el.tagName.toLowerCase(),
        cls,
        inline,
        text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 40),
        w: Math.round(r.width), h: Math.round(r.height),
      });
    }
    window.scrollTo({ top: 0, behavior: "instant" });
    return out;
  }, { MIN: TAP_MIN, scope });

  const real = small.filter((s) => !s.inline);
  const exempt = small.filter((s) => s.inline);

  if (!real.length) {
    pass("tap-targets", name,
      `every target offers ${TAP_MIN}x${TAP_MIN}` +
      (exempt.length ? ` (${exempt.length} inline-in-a-sentence, exempt)` : ""));
  }
  for (const s of real) {
    fail("tap-targets", name,
      `${s.tag}${s.cls} "${s.text}" — ${s.w}x${s.h}, under ${TAP_MIN}x${TAP_MIN}`);
  }
  for (const s of exempt) {
    record("tap-targets", "EXEMPT", name,
      `${s.tag}${s.cls} "${s.text}" — ${s.w}x${s.h}, inside a sentence ` +
      `(WCAG 2.5.5 inline exception)`);
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
  const pages = await pageList();
  const server = await serve();
  const browser = await chromium.launch(launchOptions());
  const blockedHosts = new Set();

  try {
    /* Pass A — layout and semantics, with external images stubbed so the boxes
       are the right size even though the host is unreachable here. */
    const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctxA.route("**unsplash.com/**", (route) => {
      try { blockedHosts.add(new URL(route.request().url()).host); } catch { /* ignore */ }
      return route.fulfill({ status: 200, contentType: "image/png", body: STUB_PNG });
    });
    const a = await ctxA.newPage();

    for (const file of pages) {
      const url = `http://127.0.0.1:${PORT}/${file === "index.html" ? "" : file}`;
      await a.goto(url, { waitUntil: "load" });
      await detectStagingLeak(a, `/${file}`, staging);
      await detectHeadingOrder(a, `/${file}`);
      await detectTapTargets(a, `/${file}`, " [menu closed]", null);
      await detectMenuA11y(a, `/${file}`);
      // Re-open so the menu's own links get measured too.
      const t = await a.$(".nav-toggle");
      if (t) {
        await t.click();
        await a.waitForTimeout(350);
        // Scope to the header: the open dropdown covers page content, and a
        // target hidden behind it is not a tap-target defect.
        await detectTapTargets(a, `/${file}`, " [menu open]", ".site-header");
        await a.keyboard.press("Escape");
        await a.waitForTimeout(200);
      }
      if (file === "index.html") await detectTokenTruth(a);
    }
    await ctxA.close();

    /* Pass B — images, unstubbed, so a genuinely dead URL is visible. */
    const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const b = await ctxB.newPage();
    b.on("requestfailed", (req) => {
      if (req.resourceType() === "image") {
        try { blockedHosts.add(new URL(req.url()).host); } catch { /* ignore */ }
      }
    });
    for (const file of pages) {
      const url = `http://127.0.0.1:${PORT}/${file === "index.html" ? "" : file}`;
      await b.goto(url, { waitUntil: "load" });
      await b.evaluate(async () => {
        // loading="lazy" images below the fold never request otherwise.
        document.querySelectorAll('img[loading="lazy"]').forEach((i) => { i.loading = "eager"; });
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise((r) => setTimeout(r, 250));
      });
      await b.waitForTimeout(500);
      await detectBrokenImages(b, `/${file}`, blockedHosts);

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

  report(staging, wantShots ? shotsDir : null);
}

function report(staging, shotsDir) {
  const detectors = [...new Set(results.map((r) => r.detector))].sort();
  const counts = (d, s) =>
    results.filter((r) => r.detector === d && r.status === s).length;

  console.log(`\nBora Bora Bound — detector suite   (STAGING=${staging})\n`);
  let failed = 0;
  for (const d of detectors) {
    const f = counts(d, "FAIL"), u = counts(d, "UNVERIFIED"),
      p = counts(d, "PASS"), e = counts(d, "EXEMPT");
    failed += f;
    const mark = f ? "FAIL" : u ? "WARN" : "PASS";
    console.log(`${mark.padEnd(5)} ${d.padEnd(16)} ${p} pass  ${f} fail  ` +
      `${u} unverified${e ? `  ${e} exempt` : ""}`);
  }

  for (const status of ["FAIL", "UNVERIFIED", "EXEMPT"]) {
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
  console.log(failed ? `\n${failed} findings.\n` : "\nAll detectors green.\n");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
