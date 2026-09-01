#!/usr/bin/env node
/* Bora Bora Bound — lightbox detector.
 *
 * Dev tooling only. Nothing here ships.
 *
 *   cd tools/audit && node lightbox.mjs
 *
 * The review cards open full size. That is interactive behaviour, so it is not
 * something audit.mjs can see — its detectors measure a rendered page, and this
 * only exists after a click. It is also the kind of thing that breaks silently:
 * a renamed class or a stray error in main.js leaves the cards looking correct
 * and doing nothing, and nobody clicks their own testimonials.
 *
 * Everything below is driven through the browser rather than read out of the
 * markup, for the same reason the rest of the suite is.
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
const PORT = 4174; // audit.mjs holds 4173

/* Pages carrying review cards. Both, because they were wired separately and a
   fix applied to one has been forgotten on the other before. */
const PAGES = ["index.html", "reviews.html"];

/* The smallest touch target, matching --tap-min in the stylesheet. The close
   button sits over artwork and is the only control in the lightbox, so it has
   to be findable by a thumb. */
const TAP_MIN = 44;

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".png": "image/png",
  ".jpg": "image/jpeg", ".ico": "image/x-icon", ".svg": "image/svg+xml",
};

function serve(port) {
  const s = createServer(async (req, res) => {
    let r = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (r.endsWith("/")) r += "index.html";
    try {
      const b = await readFile(path.join(ROOT, r));
      res.writeHead(200, { "content-type": MIME[path.extname(r)] || "application/octet-stream" });
      res.end(b);
    } catch { res.writeHead(404); res.end(); }
  });
  return new Promise((k) => s.listen(port, "127.0.0.1", () => k(s)));
}

const chromePath = process.env.PLAYWRIGHT_BROWSERS_PATH
  ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, "chromium") : null;
const launch = chromePath && existsSync(chromePath) ? { executablePath: chromePath } : {};

const srv = await serve(PORT);
const browser = await chromium.launch(launch);
let failures = 0;

const check = (cond, msg) => {
  if (!cond) failures++;
  console.log(`  ${cond ? "pass" : "FAIL"}  ${msg}`);
};

for (const page of PAGES) {
  console.log(`\n${page}`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));

  await p.goto(`http://127.0.0.1:${PORT}/${page === "index.html" ? "" : page}`,
    { waitUntil: "load" });
  await p.evaluate(() => document.querySelectorAll("img").forEach((i) => { i.loading = "eager"; }));

  const links = await p.$$("a[data-zoom]");
  check(links.length === 3, `three review cards are zoomable (found ${links.length})`);

  /* Without JavaScript the link is all there is, so it has to point at a real
     file rather than "#" or javascript:. */
  const href = await p.evaluate(() => document.querySelector("a[data-zoom]").getAttribute("href"));
  const headOk = await p.evaluate(async (h) => (await fetch(h, { method: "GET" })).ok, href);
  check(/^\/assets\/img\/.+\.(png|jpe?g)$/.test(href), `no-JS fallback is a real image path (${href})`);
  check(headOk, "that file actually resolves");

  await p.click("a[data-zoom]:first-of-type");
  await p.waitForTimeout(200);

  const opened = await p.evaluate(() => {
    const d = document.querySelector("dialog.lightbox");
    const i = d && d.querySelector("img");
    return {
      open: !!d && d.open,
      src: i ? i.getAttribute("src") : null,
      alt: (i && i.getAttribute("alt")) || "",
      focusInside: !!d && d.contains(document.activeElement),
    };
  });
  check(opened.open, "clicking a card opens the dialog");
  check((opened.src || "").includes("review-michael-c"), "it opens the card that was clicked");
  check(opened.alt.length > 40, "the opened copy carries the review text for a screen reader");
  check(opened.focusInside, "focus moves into the dialog");

  /* The opened card must be bigger than the one in the grid, or the feature has
     no reason to exist -- and must not overflow the window, or the bottom of
     the review is unreachable. Both have to hold at once. */
  const size = await p.evaluate(() => {
    const g = document.querySelector("a[data-zoom] img").getBoundingClientRect();
    const o = document.querySelector("dialog.lightbox img").getBoundingClientRect();
    return {
      grid: Math.round(g.width), open: Math.round(o.width),
      fits: o.top >= -1 && o.left >= -1 && o.bottom <= innerHeight + 1 && o.right <= innerWidth + 1,
    };
  });
  check(size.open > size.grid, `opened larger than in the grid (${size.grid}px to ${size.open}px)`);
  check(size.fits, "the opened card fits on screen");

  const closeBox = await p.evaluate(() => {
    const r = document.querySelector(".lightbox__close").getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  check(closeBox.w >= TAP_MIN && closeBox.h >= TAP_MIN,
    `close button is finger-sized (${closeBox.w}x${closeBox.h}, needs ${TAP_MIN})`);

  await p.keyboard.press("Escape");
  await p.waitForTimeout(200);
  check(await p.evaluate(() => !document.querySelector("dialog.lightbox").open),
    "Escape closes it");

  /* Keyboard-only path: the card has to be operable without a mouse, and focus
     has to come back to where it left or the reader is dropped at the top. */
  await p.evaluate(() => document.querySelector("a[data-zoom]").focus());
  await p.keyboard.press("Enter");
  await p.waitForTimeout(200);
  check(await p.evaluate(() => document.querySelector("dialog.lightbox").open),
    "Enter on a focused card opens it");

  await p.click(".lightbox__close");
  await p.waitForTimeout(200);
  check(await p.evaluate(() => !document.querySelector("dialog.lightbox").open),
    "the close button closes it");
  check(await p.evaluate(() => document.activeElement === document.querySelector("a[data-zoom]")),
    "focus returns to the card that opened it");

  await p.click("a[data-zoom]:first-of-type");
  await p.waitForTimeout(200);
  const corner = await p.evaluate(() => {
    const r = document.querySelector("dialog.lightbox").getBoundingClientRect();
    return { x: r.x + 4, y: r.y + 4 };
  });
  await p.mouse.click(corner.x, corner.y);
  await p.waitForTimeout(200);
  check(await p.evaluate(() => !document.querySelector("dialog.lightbox").open),
    "clicking outside the picture closes it");

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors[0]}` : ""}`);
  await ctx.close();
}

await browser.close();
srv.close();

console.log(failures
  ? `\n${failures} lightbox check(s) failed.`
  : "\nLightbox OK.");
process.exit(failures ? 1 : 0);
