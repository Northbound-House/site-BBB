#!/usr/bin/env node
/* Bora Bora Bound — contrast detector.
 *
 * Dev tooling only. Nothing here ships.
 *
 *   cd tools/audit && node contrast.mjs
 *   node contrast.mjs --light        # only the light appearance
 *   node contrast.mjs --dark         # only the dark appearance
 *   node contrast.mjs --verbose      # list what passed, too
 *
 * README and STATE have both claimed "every text/ground pair passes WCAG AA"
 * since the site was built. Nothing checked it, and by the time this was
 * written the footer blurb was sitting at 2.5:1 on every page. A guarantee
 * nothing enforces is a guarantee that decays quietly, so this measures it.
 *
 * WHAT IT MEASURES
 *
 * Every element that owns visible text, on every page, at two widths, in both
 * appearances. Two ways of arriving at the ground behind the text:
 *
 *   solid  The nearest ancestor with an opaque background wins, with any
 *          translucent layers between composited onto it. Arithmetic, exact.
 *
 *   media  There is a photograph or a frosted material between the text and
 *          the nearest opaque colour. Arithmetic cannot answer this, so the
 *          pixels are read out of a screenshot.
 *
 * WHY SOME PHOTO CASES ARE MEASURED AGAINST BLACK AND WHITE
 *
 * It depends on who owns the photograph, and the split is the whole point:
 *
 *   HOTLINKED  A photo served from someone else's domain can be swapped, or
 *              withdrawn, without a single commit here — so a green result
 *              against today's picture says nothing about tomorrow's. What has
 *              to hold is the LAYER between the photo and the text. Each of
 *              these is replaced with flat white and then flat black, and the
 *              worse answer is reported. Text that passes both passes over any
 *              photograph that could ever land there.
 *
 *   REPO ASSET A photo in assets/img/ cannot change without a commit, and a
 *              commit runs this detector. So it is measured exactly as it
 *              renders. That is not a weaker test — it is the same test, with
 *              a guarantee behind it that a hotlink does not have. It also
 *              stops the worst case of a photo nobody chose from dictating the
 *              scrim over a photo somebody did.
 *
 * The floating nav pill is always measured against both extremes whatever is
 * beneath it, because it is position:fixed: it passes over every part of every
 * page, so no single backdrop is its worst case.
 *
 * WHY THE PIXELS ARE MASKED TO THE GLYPHS
 *
 * A first cut sampled every pixel of the element's box and reported the worst.
 * That flagged the ghost buttons, whose own white border sits inside that box
 * and has nothing to do with legibility. Each region is therefore shot twice,
 * once with the text painted and once with it transparent, and only the pixels
 * that changed — the glyphs themselves, and any underline — are read out of
 * the second shot. What is measured is the ground each letter actually sits on.
 *
 * Exit 1 on any failure.
 */

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const PORT = 4175; // audit.mjs holds 4173, lightbox.mjs 4174

/* ---- Policy ------------------------------------------------------------- */

/* WCAG 2.2 1.4.3 Contrast (Minimum), level AA. Large text is 24px, or 18.66px
   at weight 700 and up — the display face here is a single 400 weight, so in
   practice only the 24px rule ever applies to it. */
const AA_NORMAL = 4.5;
const AA_LARGE = 3.0;
const LARGE_PX = 24;
const LARGE_BOLD_PX = 18.66;

/* Widths: a phone, and a desktop window. Both, because the type scale is fluid
   — the same paragraph is 15.2px on a phone and 17.2px on a desktop, and only
   one of those sizes is anywhere near the 24px line where the bar changes. */
const WIDTHS = [1280, 390];

/* Components that put a photograph or a frosted material between text and the
   nearest opaque colour. Text inside one of these is measured from pixels
   rather than arithmetic. */
const MEDIA_GROUNDS = ".hero, .page-hero, .cta-band, .media-card, .site-header";

/* Grounds measured against both extremes no matter who owns the photograph
   underneath. The nav pill is position:fixed and passes over every part of
   every page, so no single backdrop is its worst case. */
const ALWAYS_EXTREME = ".site-header";

/* Custom properties that carry a photograph into a background layer. Forced to
   flat white and flat black in turn, so the scrim over them is what is being
   judged. Only ever forced on an element that actually sets one. */
const PHOTO_VARS = ["--hero-img", "--page-img", "--cta-img", "--media-img"];

/* Text held below the bar on purpose. Empty, and meant to stay that way: an
   entry here is a promise that a human looked at the thing and decided, not a
   place to put findings that are inconvenient. Same rule as TAP_EXEMPT in
   audit.mjs — anything held below the bar is held on the record. */
const EXEMPT = [];

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".png": "image/png",
  ".jpg": "image/jpeg", ".ico": "image/x-icon", ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json", ".xml": "application/xml",
};

function serve(port) {
  const s = createServer(async (req, res) => {
    let r = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (r.endsWith("/")) r += "index.html";
    const file = path.join(ROOT, r);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    try {
      const b = await readFile(file);
      res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
      res.end(b);
    } catch { res.writeHead(404); res.end(); }
  });
  return new Promise((k) => s.listen(port, "127.0.0.1", () => k(s)));
}

/** The page list comes from build.py's own PAGES table, so a new page is
 *  measured automatically rather than needing a second list kept in sync.
 *  Same source as audit.mjs. */
async function pageList() {
  const src = await readFile(path.join(ROOT, "tools/build.py"), "utf-8");
  const pages = [...src.matchAll(/^ {4}"([^"]+\.html)": dict\(/gm)].map((m) => m[1]);
  const posts = [...src.matchAll(/^\s+slug="([^"]+)"/gm)].map((m) => `journal/${m[1]}.html`);
  if (!pages.length) throw new Error("could not read PAGES from tools/build.py");
  // The journal can be hidden, in which case build.py generates none of it and
  // there is nothing at those URLs to measure. Read the same switch it does
  // rather than keeping a second list of what is published.
  const hidden = /^JOURNAL_HIDDEN = True$/m.test(src);
  const all = [...pages, ...posts];
  return hidden ? all.filter((f) => f !== "journal.html" && !f.startsWith("journal/")) : all;
}

/* ---- The page-side measuring kit ---------------------------------------- */

/* Everything in this string runs inside the browser. It is here rather than in
   half a dozen page.evaluate calls so the colour maths exists once. */
const KIT = `
window.__cx = (() => {
  const parse = (s) => {
    const m = String(s).match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (top, under) => {
    const a = top.a + under.a * (1 - top.a);
    if (!a) return { r: 0, g: 0, b: 0, a: 0 };
    const ch = (c) => (top[c] * top.a + under[c] * under.a * (1 - top.a)) / a;
    return { r: ch("r"), g: ch("g"), b: ch("b"), a };
  };
  const chan = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (c) => 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b);
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const hex = (c) => "#" + [c.r, c.g, c.b]
    .map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  const label = (el) => {
    const bits = [];
    for (let p = el; p && p !== document.body && bits.length < 3; p = p.parentElement) {
      let s = p.tagName.toLowerCase();
      if (p.id) s += "#" + p.id;
      else if (p.classList.length) s += "." + [...p.classList].slice(0, 2).join(".");
      bits.unshift(s);
    }
    return bits.join(" > ");
  };
  return { parse, over, lum, ratio, hex, label, chan };
})();
`;

/** Find every element that owns visible text and work out what is behind it.
 *  Runs in the browser: Playwright ships the source across, so it can only use
 *  what is in the page — window.__cx above, and its own argument. */
function collect({ mediaSel, photoVars, alwaysExtremeSel }) {
  const { parse, over, ratio, hex, label } = window.__cx;
  const rootBg = parse(getComputedStyle(document.documentElement).backgroundColor);
  const CANVAS = rootBg && rootBg.a > 0
    ? rootBg
    : parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  let node;
  while ((node = walker.nextNode())) {
    if (!node.textContent.trim()) continue;
    const el = node.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    if (el.closest("script, style, noscript, template, [hidden], .visually-hidden, .skip-link")) continue;
    const dlg = el.closest("dialog");
    if (dlg && !dlg.open) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    if (!el.checkVisibility({ visibilityProperty: true })) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;

    // The text colour, dimmed by every opacity between it and the root.
    let opacity = 1;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      opacity *= parseFloat(getComputedStyle(p).opacity);
    }
    if (opacity < 0.05) continue; // effectively invisible in this state
    const raw = parse(cs.color);
    if (!raw) continue;

    // Walk up compositing translucent backgrounds. Whichever comes first wins:
    // an opaque colour (arithmetic settles it) or a media ground (pixels do).
    const layers = [];
    let ground = null, media = null;
    for (let p = el; p; p = p.parentElement) {
      if (p.matches && p.matches(mediaSel)) { media = p; break; }
      const c = parse(getComputedStyle(p).backgroundColor);
      if (c && c.a > 0) {
        if (c.a >= 1) { ground = c; break; }
        layers.push(c);
      }
    }
    let bg = ground || CANVAS;
    for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);

    const size = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight, 10) || 400;
    let fixed = false;
    for (let p = el; p; p = p.parentElement) {
      if (getComputedStyle(p).position === "fixed") { fixed = true; break; }
    }

    // Who owns the photograph behind this text? A repo asset is measured as it
    // renders; a hotlink is measured against both extremes. The floating pill
    // is always extremes -- it passes over every part of the page.
    let remotePhoto = false;
    if (media) {
      if (media.matches(alwaysExtremeSel)) {
        remotePhoto = true;
      } else {
        const urls = [];
        for (const node of [media, ...media.querySelectorAll("*")]) {
          for (const v of photoVars) {
            const val = node.style && node.style.getPropertyValue(v);
            const m = val && val.match(/url\(\s*["']?([^"')]+)/);
            if (m) urls.push(m[1]);
          }
          if (node.tagName === "IMG" && node.currentSrc) urls.push(node.currentSrc);
        }
        remotePhoto = urls.some((u) => {
          try { return new URL(u, location.href).origin !== location.origin; }
          catch { return true; } // unparseable is not a guarantee of anything
        });
      }
    }

    // Over a photo neither side of the pair is known here: a glyph at 92%
    // opacity takes its final colour from the ground it lands on. The pixel
    // pass reads BOTH out of the screenshots, so nothing is assumed. Only the
    // arithmetic path needs a colour computed at this point.
    const spec = { ...raw, a: +(raw.a * opacity).toFixed(4) };
    const flat = media ? null : over(spec, bg);

    el.dataset.cx = String(out.length);
    out.push({
      i: out.length,
      sel: label(el),
      text: node.textContent.trim().replace(/\s+/g, " ").slice(0, 44),
      size: +size.toFixed(1),
      weight,
      fixed,
      media: !!media,
      remotePhoto,
      spec,
      // A glyph never lands on its own border. The ghost buttons draw a white
      // hairline inside their box, and sampling it reported the button as
      // failing against itself.
      border: {
        t: parseFloat(cs.borderTopWidth) || 0,
        r: parseFloat(cs.borderRightWidth) || 0,
        b: parseFloat(cs.borderBottomWidth) || 0,
        l: parseFloat(cs.borderLeftWidth) || 0,
      },
      fg: flat ? hex(flat) : null,
      bg: flat ? hex(bg) : null,
      ratio: flat ? +ratio(flat, bg).toFixed(2) : null,
      rect: { x: rect.x + scrollX, y: rect.y + scrollY, w: rect.width, h: rect.height },
    });
  }
  return out;
}

/* ---- Reporting ---------------------------------------------------------- */

const results = [];
const record = (status, where, detail) => results.push({ status, where, detail });

const bar = (size, weight) =>
  (size >= LARGE_PX || (size >= LARGE_BOLD_PX && weight >= 700)) ? AA_LARGE : AA_NORMAL;

const exemptReason = (row) => {
  const hit = EXEMPT.find((e) => row.sel.includes(e.selector));
  return hit ? hit.reason : null;
};

/* ---- Runner ------------------------------------------------------------- */

const chromePath = process.env.PLAYWRIGHT_BROWSERS_PATH
  ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, "chromium") : null;
const launch = {
  ...(chromePath && existsSync(chromePath) ? { executablePath: chromePath } : {}),
  /* Subpixel (LCD) antialiasing paints coloured fringes along every stroke,
     which are neither the text colour nor the ground. Grayscale AA keeps the
     glyph mask clean and makes the run reproducible off this machine. */
  args: ["--disable-lcd-text", "--force-color-profile=srgb"],
};

const argv = process.argv.slice(2);
const VERBOSE = argv.includes("--verbose");
const SCHEMES = argv.includes("--light") ? ["light"]
  : argv.includes("--dark") ? ["dark"]
  : ["light", "dark"];

/* Freeze everything that would otherwise make two runs of the same build
   disagree: scroll-reveal mid-fade, the card focus effect mid-scroll, the
   scroll-cue animation. Reveals are forced to their finished state — text that
   is mid-fade is not what a reader sees. */
const FREEZE = `
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
  }
  html { scroll-behavior: auto !important; }
  .reveal { opacity: 1 !important; transform: none !important; }
  .media-card { --focus: 1 !important; }
  /* The closing band's photo is slid against the scroll by main.js, from a
     requestAnimationFrame. The two screenshots that make the glyph mask are
     taken moments apart, and a frame landing between them shifted the photo a
     pixel — which put every high-contrast edge in the band into the mask,
     including the pill buttons' own white border arcs. The finding then moved
     from page to page between runs, which is the tell. An !important here
     beats the inline transform main.js writes. */
  .cta-band__bg { transform: none !important; }
`;

const srv = await serve(PORT);
const browser = await chromium.launch(launch);
const pages = await pageList();

for (const scheme of SCHEMES) {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
      colorScheme: scheme,
      reducedMotion: "reduce",
      deviceScaleFactor: 1,
    });
    /* The webfont is blocked for the same reason audit.mjs blocks it: Bebas is
       condensed, the fallback is not, and text that wraps differently between
       runs changes which elements are large enough for the 3:1 bar. The
       fallback is the deterministic choice and a state the site supports. */
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    /* Photos are replaced with flat white and flat black below, so a remote
       one is dead weight — and waiting on a host that may not answer would put
       minutes of idle into every run. */
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());

    const page = await ctx.newPage();

    for (const file of pages) {
      const url = `http://127.0.0.1:${PORT}/${file === "index.html" ? "" : file}`;
      await page.goto(url, { waitUntil: "load" });
      await page.addStyleTag({ content: FREEZE });
      await page.addScriptTag({ content: KIT });
      await page.evaluate(() => window.scrollTo(0, 0));

      // Make sure every photograph has actually decoded before anything is
      // measured against it. Background images carried by a custom property do
      // not show up in document.images, so they are fetched explicitly.
      await page.evaluate(async (vars) => {
        const urls = [];
        document.querySelectorAll("[style]").forEach((el) => {
          for (const v of vars) {
            const val = el.style.getPropertyValue(v);
            const m = val && val.match(/url\(\s*["']?([^"')]+)/);
            if (m) urls.push(m[1]);
          }
        });
        document.querySelectorAll('img[loading="lazy"]').forEach((i) => { i.loading = "eager"; });
        const wait = (el) => new Promise((done) => { el.onload = el.onerror = done; });
        await Promise.all([
          ...urls.map((u) => { const i = new Image(); const w = wait(i); i.src = u; return w; }),
          ...[...document.images].filter((i) => !i.complete).map(wait),
        ]);
      }, PHOTO_VARS);

      const rows = await page.evaluate(collect,
        { mediaSel: MEDIA_GROUNDS, photoVars: PHOTO_VARS, alwaysExtremeSel: ALWAYS_EXTREME });
      const where = `${file} [${scheme}, ${width}px]`;

      // The arithmetic cases are done already.
      for (const row of rows.filter((r) => !r.media)) judge(row, where);

      // The rest need pixels. Text over a repo photograph is measured once, as
      // it renders; text over a hotlink, or under the floating pill, is
      // measured against both extremes and judged on the worse answer.
      const asRendered = rows.filter((r) => r.media && !r.remotePhoto);
      const worstCase = rows.filter((r) => r.media && r.remotePhoto);

      if (asRendered.length) {
        const measured = await measureOverExtreme(page, asRendered, null, width);
        settleRows(asRendered, measured, where);
      }
      if (worstCase.length) {
        const worst = new Map();
        for (const extreme of ["#ffffff", "#000000"]) {
          const measured = await measureOverExtreme(page, worstCase, extreme, width);
          for (const [i, m] of measured) {
            const prev = worst.get(i);
            if (!prev || m.ratio < prev.ratio) worst.set(i, m);
          }
        }
        settleRows(worstCase, worst, where);
      }
    }
    await ctx.close();
  }
}

await browser.close();
srv.close();
report();

/* ---- The measuring passes ----------------------------------------------- */

/** Turn a map of measurements into findings, or say so when a row produced no
 *  glyph pixels at all — which is never quietly a pass. */
function settleRows(rows, measured, where) {
  for (const row of rows) {
    const m = measured.get(row.i);
    if (!m) {
      record("UNVERIFIED", where, `${row.sel} "${row.text}" — no glyph pixels found`);
      continue;
    }
    judge({ ...row, ratio: m.ratio, bg: m.bg, fg: m.fg, over: m.extreme,
            at: m.at, box: m.box }, where);
  }
}

function judge(row, where) {
  const need = bar(row.size, row.weight);
  const what = `${row.sel} "${row.text}" — ${row.ratio}:1, needs ${need}:1 ` +
    `(${row.fg} on ${row.bg}` +
    `${row.over ? ` over ${row.over}` : row.media ? " over its own photo" : ""}, ` +
    `${row.size}px/${row.weight}` +
    `${row.at ? `, worst pixel at ${row.at} of ${row.box}` : ""})`;
  if (row.ratio >= need) { if (VERBOSE) record("PASS", where, what); return; }
  const why = exemptReason(row);
  if (why) record("EXEMPT", where, `${what} — ${why}`);
  else record("FAIL", where, what);
}

/**
 * Screenshot the bands that hold media-ground text twice — glyphs painted,
 * then glyphs transparent — and read the ground out from under the glyphs.
 *
 * The header is measured on its own because it is position:fixed: it does not
 * move with the page, and it floats over whatever is beneath it. Everything
 * else is measured with the header hidden, so a pill overlapping a headline
 * cannot be mistaken for that headline's ground.
 */
async function measureOverExtreme(page, rows, extreme, width) {
  const out = new Map();
  if (extreme) await page.evaluate(({ extreme, vars }) => {
    // Only force a photo variable on an element that actually sets one, so a
    // component with no photograph is left exactly as it renders.
    document.querySelectorAll("[style]").forEach((el) => {
      for (const v of vars) {
        // Read the shipped value back from the store first: this runs once per
        // extreme on the same loaded page, and the second pass would otherwise
        // find only what the first one wrote.
        const kept = el.dataset[`cxPhoto${v.replace(/-/g, "")}`];
        const now = kept ?? el.style.getPropertyValue(v);
        if (!now) continue;
        el.dataset[`cxPhoto${v.replace(/-/g, "")}`] = now;
        el.style.setProperty(v, `linear-gradient(${extreme}, ${extreme})`, "important");
      }
    });
    // Artwork inside the review and promise cards is an <img>, not a variable.
    document.querySelectorAll(".media-card img").forEach((img) => {
      img.style.setProperty("filter",
        extreme === "#ffffff" ? "brightness(0) invert(1)" : "brightness(0)", "important");
    });
  }, { extreme, vars: PHOTO_VARS });

  for (const bucket of [true, false]) {
    const mine = rows.filter((r) => r.fixed === bucket);
    if (!mine.length) continue;
    for (const band of bands(mine, 900)) {
      const inBand = mine.filter((r) => r.rect.y >= band.top - 1 && r.rect.y + r.rect.h <= band.bottom + 1);
      if (!inBand.length) continue;

      // Scroll, then re-read every rect from the DOM rather than adjusting the
      // collected ones by the scroll offset. A position:fixed header does not
      // move with the page at all, and it shifts by a few pixels of its own
      // when .is-scrolled lands — arithmetic on a stale rect misses it by
      // exactly enough to sample the wrong strip.
      await page.evaluate(({ top, fixedBucket }) => {
        // Hide the floating pill while measuring anything else: it overlaps
        // page content and is not that content's ground.
        const h = document.querySelector(".site-header");
        if (h) h.style.visibility = fixedBucket ? "" : "hidden";
        window.scrollTo(0, fixedBucket ? 0 : top);
      }, { top: band.top, fixedBucket: bucket });

      await settle(page);
      const painted = await page.screenshot({ animations: "disabled" });
      await page.evaluate((ids) => {
        for (const i of ids) {
          const el = document.querySelector(`[data-cx="${i}"]`);
          if (!el) continue;
          for (const d of [el, ...el.querySelectorAll("*")]) {
            d.style.setProperty("color", "transparent", "important");
            d.style.setProperty("text-shadow", "none", "important");
            d.style.setProperty("-webkit-text-fill-color", "transparent", "important");
          }
        }
      }, inBand.map((r) => r.i));
      await settle(page);
      const bare = await page.screenshot({ animations: "disabled" });
      await page.evaluate((ids) => {
        for (const i of ids) {
          const el = document.querySelector(`[data-cx="${i}"]`);
          if (!el) continue;
          for (const d of [el, ...el.querySelectorAll("*")]) {
            d.style.removeProperty("color");
            d.style.removeProperty("text-shadow");
            d.style.removeProperty("-webkit-text-fill-color");
          }
        }
      }, inBand.map((r) => r.i));

      const live = await page.evaluate((ids) => ids.map((i) => {
        const el = document.querySelector(`[data-cx="${i}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { i, rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
      }).filter(Boolean), inBand.map((r) => r.i));
      const byId = new Map(live.map((l) => [l.i, l.rect]));

      const measured = await page.evaluate(async ({ a, b, items }) => {
        const { chan, hex } = window.__cx;
        const load = async (b64) => {
          const img = new Image();
          img.src = "data:image/png;base64," + b64;
          await img.decode();
          const c = new OffscreenCanvas(img.width, img.height);
          c.getContext("2d").drawImage(img, 0, 0);
          return c.getContext("2d").getImageData(0, 0, img.width, img.height);
        };
        const A = await load(a), B = await load(b);
        const lum = (r, g, bl) => 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(bl);
        const res = [];
        for (const it of items) {
          // Inset past the element's own border, plus a pixel for the
          // border's antialiased edge.
          const bd = it.border || { t: 0, r: 0, b: 0, l: 0 };
          const pad = (w) => (w > 0 ? w + 1 : 0);
          const x0 = Math.max(0, Math.floor(it.rect.x + pad(bd.l)));
          const y0 = Math.max(0, Math.floor(it.rect.y + pad(bd.t)));
          const x1 = Math.min(A.width, Math.ceil(it.rect.x + it.rect.w - pad(bd.r)));
          const y1 = Math.min(A.height, Math.ceil(it.rect.y + it.rect.h - pad(bd.b)));
          if (x1 <= x0 || y1 <= y0) continue;

          // A pixel that changed when the glyphs were turned off is a pixel a
          // glyph was painted on. How MUCH it changed says how much of the
          // letter covers it. Only the fully covered pixels are the text —
          // an antialiased edge is a blend of letter and ground, and WCAG has
          // nothing to say about a half-covered pixel. So: find the strongest
          // change in the box, then read only the pixels within 20% of it.
          const diff = (k) =>
            Math.abs(A.data[k] - B.data[k])
            + Math.abs(A.data[k + 1] - B.data[k + 1])
            + Math.abs(A.data[k + 2] - B.data[k + 2]);
          let peak = 0;
          for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
              const d = diff((y * A.width + x) * 4);
              if (d > peak) peak = d;
            }
          }
          if (peak < 12) continue; // nothing painted here in this state
          const floor = Math.max(12, peak * 0.25);

          // The letter's colour is the SPECIFIED one, not the painted pixel.
          // Poppins Light at 15px draws strokes about a pixel wide, so almost
          // every pixel of it is an antialiased blend of letter and ground —
          // reading colour back out of those pixels measures the renderer's
          // edge handling, not the design. WCAG compares the colours as
          // specified, so that is what goes in. Translucent text is composited
          // onto the ground actually found underneath it, which is the one
          // thing only the pixels can say.
          let worst = Infinity, worstBg = null, worstFg = null, worstAt = null, hits = 0;
          for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
              const k = (y * A.width + x) * 4;
              if (diff(k) < floor) continue;
              hits++;
              const ground = { r: B.data[k], g: B.data[k + 1], b: B.data[k + 2], a: 1 };
              const letter = window.__cx.over(it.spec, ground);
              const lf = lum(letter.r, letter.g, letter.b);
              const lb = lum(ground.r, ground.g, ground.b);
              const [hi, lo] = lf > lb ? [lf, lb] : [lb, lf];
              const r = (hi + 0.05) / (lo + 0.05);
              if (r < worst) {
                worst = r;
                worstBg = hex(ground);
                worstFg = hex(letter);
                worstAt = `${x - x0},${y - y0}`;
              }
            }
          }
          if (hits < 1) continue;
          res.push([it.i, {
            ratio: +worst.toFixed(2), bg: worstBg, fg: worstFg,
            at: worstAt, box: `${Math.round(x1 - x0)}x${Math.round(y1 - y0)}`, hits,
          }]);
        }
        return res;
      }, {
        a: painted.toString("base64"),
        b: bare.toString("base64"),
        items: inBand.filter((r) => byId.has(r.i))
          .map((r) => ({ i: r.i, spec: r.spec, border: r.border, rect: byId.get(r.i) })),
      });

      for (const [i, m] of measured) out.set(i, { ...m, extreme });
    }
  }

  await page.evaluate(({ vars }) => {
    document.querySelectorAll("[style]").forEach((el) => {
      for (const v of vars) {
        const kept = el.dataset[`cxPhoto${v.replace(/-/g, "")}`];
        if (kept !== undefined) el.style.setProperty(v, kept);
      }
    });
    document.querySelectorAll(".media-card img").forEach((i) => i.style.removeProperty("filter"));
    const h = document.querySelector(".site-header");
    if (h) h.style.visibility = "";
  }, { vars: PHOTO_VARS });

  return out;
}

/** Let any queued frame run and paint before the shutter opens. Cheap, and it
 *  is the difference between a mask that holds the glyphs and one that holds
 *  every edge that moved. */
async function settle(page) {
  await page.evaluate(() => new Promise((done) =>
    requestAnimationFrame(() => requestAnimationFrame(done))));
}

/** Group rects into viewport-sized bands so one screenshot serves many. */
function bands(rows, height) {
  const sorted = [...rows].sort((a, b) => a.rect.y - b.rect.y);
  const out = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.rect.y + r.rect.h <= last.top + height) {
      last.bottom = Math.max(last.bottom, r.rect.y + r.rect.h);
    } else {
      out.push({ top: Math.max(0, r.rect.y), bottom: r.rect.y + r.rect.h });
    }
  }
  return out;
}

/* ---- Report ------------------------------------------------------------- */

function report() {
  const count = (s) => results.filter((r) => r.status === s).length;
  const failed = count("FAIL");

  console.log(`\nBora Bora Bound — contrast   (WCAG 2.2 AA: ` +
    `${AA_NORMAL}:1 normal, ${AA_LARGE}:1 at ${LARGE_PX}px+)`);
  console.log(`Appearances: ${SCHEMES.join(", ")}.  Widths: ${WIDTHS.join("px, ")}px.`);
  console.log(`Repo photographs are measured as they render. Hotlinked ones, and ` +
    `anything under\nthe floating pill, are measured against flat white AND flat ` +
    `black with the worse\nanswer reported — a photo that can change without a ` +
    `commit does not get to be\njudged on the one that happens to be there today.\n`);
  console.log(`${failed ? "FAIL " : "PASS "} ${count("PASS")} pass  ${failed} fail  ` +
    `${count("EXEMPT")} exempt  ${count("UNVERIFIED")} unverified`);

  for (const status of ["FAIL", "UNVERIFIED", "EXEMPT", ...(VERBOSE ? ["PASS"] : [])]) {
    const rows = results.filter((r) => r.status === status);
    if (!rows.length) continue;
    console.log(`\n--- ${status} (${rows.length}) ---`);
    // The nav and footer are on every page; say a finding once, with a count.
    const seen = new Map();
    for (const r of rows) {
      if (!seen.has(r.detail)) seen.set(r.detail, { ...r, where: [r.where] });
      else seen.get(r.detail).where.push(r.where);
    }
    for (const r of [...seen.values()].sort((a, b) =>
      (parseFloat(a.detail.match(/— ([\d.]+):1/)?.[1] ?? 99))
      - (parseFloat(b.detail.match(/— ([\d.]+):1/)?.[1] ?? 99)))) {
      const w = r.where.length > 3
        ? `${r.where.slice(0, 3).join(", ")} +${r.where.length - 3} more`
        : r.where.join(", ");
      console.log(`  ${r.detail}\n      ${w}`);
    }
  }

  console.log(failed ? `\n${failed} findings.\n` : "\nContrast OK.\n");
  process.exit(failed ? 1 : 0);
}
