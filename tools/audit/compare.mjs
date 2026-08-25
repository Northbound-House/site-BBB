#!/usr/bin/env node
/* Geometry diff between two checkouts of the site.
 *
 *   node compare.mjs <dirA> <dirB> <width> <page.html> [more pages...]
 *
 * Answers one question: did this change move anything it was not supposed to?
 * Compares the box, colour and type of every laid-out element rather than
 * comparing pixels, so a deliberate photo swap does not drown out an accidental
 * two-pixel shift somewhere else on the page.
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const A = process.argv[2], B = process.argv[3];
const WIDTH = Number(process.argv[4] || 1280);
const PAGES = process.argv.slice(5);
// How many differing boxes to print per page. Raise it when triaging: the
// default hides the tail, and a newly-inserted wrapper sorts to the top and
// can fill the whole list on its own.
const SHOW = Number(process.env.COMPARE_SHOW || 8);
if (!A || !B || !PAGES.length) {
  console.error("usage: node compare.mjs <dirA> <dirB> <width> <page.html> ...");
  process.exit(64);
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".png": "image/png",
  ".jpg": "image/jpeg", ".ico": "image/x-icon", ".svg": "image/svg+xml",
};
function serve(root, port) {
  const s = createServer(async (req, res) => {
    let r = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (r.endsWith("/")) r += "index.html";
    try {
      const b = await readFile(path.join(root, r));
      res.writeHead(200, { "content-type": MIME[path.extname(r)] || "application/octet-stream" });
      res.end(b);
    } catch { res.writeHead(404); res.end(); }
  });
  return new Promise((k) => s.listen(port, "127.0.0.1", () => k(s)));
}

const MEASURE = () => {
  /* Freeze motion first. Scroll-reveal blocks fade and translate into place, so
     measuring mid-transition reports positions that differ by a pixel or two
     between two runs of the SAME build — noise that buries the real signal. */
  const stop = document.createElement("style");
  stop.textContent = "*,*::before,*::after{transition:none!important;animation:none!important}";
  document.head.appendChild(stop);
  document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in"));
  void document.body.offsetHeight;

  /* Key on position in the tree, not on tag name alone, so a box can be matched
     across builds. A tag rename still shows up as a removal plus an addition —
     compare the two lines to confirm the geometry is untouched. */
  const key = (el) => {
    const parts = [];
    for (let n = el; n && n.tagName && parts.length < 6; n = n.parentElement) {
      const i = n.parentElement ? [...n.parentElement.children].indexOf(n) : 0;
      parts.unshift(`${n.tagName.toLowerCase()}[${i}]`);
    }
    return parts.join(">");
  };
  const out = {};
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const cs = getComputedStyle(el);
    out[key(el)] = [
      Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height),
      cs.color, cs.backgroundColor, cs.fontSize, cs.fontFamily.split(",")[0],
    ].join("|");
  }
  return { boxes: out, height: Math.round(document.body.scrollHeight) };
};

const STUB = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64");

const chromePath = process.env.PLAYWRIGHT_BROWSERS_PATH
  ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, "chromium") : null;
const launch = chromePath && existsSync(chromePath) ? { executablePath: chromePath } : {};

const sa = await serve(A, 4301), sb = await serve(B, 4302);
const br = await chromium.launch(launch);

let total = 0;
for (const file of PAGES) {
  const runs = [];
  for (const port of [4301, 4302]) {
    const ctx = await br.newContext({ viewport: { width: WIDTH, height: 900 } });
    // Stub remote photos so a deliberate image swap cannot masquerade as a move.
    await ctx.route("**unsplash.com/**", (r) =>
      r.fulfill({ status: 200, contentType: "image/png", body: STUB }));
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${port}/${file === "index.html" ? "" : file}`,
      { waitUntil: "load" });
    await p.waitForTimeout(300);
    runs.push(await p.evaluate(MEASURE));
    await ctx.close();
  }
  const [x, y] = runs;
  const moved = [...new Set([...Object.keys(x.boxes), ...Object.keys(y.boxes)])]
    .filter((k) => x.boxes[k] !== y.boxes[k])
    .map((k) => [k, x.boxes[k], y.boxes[k]])
    .sort((m, n) => Number((x.boxes[m[0]] || "0|0").split("|")[1]) -
                    Number((x.boxes[n[0]] || "0|0").split("|")[1]));
  total += moved.length;
  const dh = y.height - x.height;
  console.log(`${file.padEnd(52)} ${String(moved.length).padStart(4)} changed  ` +
    `height ${x.height} -> ${y.height} (${dh >= 0 ? "+" : ""}${dh})`);
  for (const [k, a, b] of moved.slice(0, SHOW)) {
    console.log(`    ${k}\n      A ${a}\n      B ${b}`);
  }
  if (moved.length > SHOW) console.log(`    ... and ${moved.length - SHOW} more`);
}
console.log(`\n${total} boxes changed across ${PAGES.length} pages at ${WIDTH}px.`);
await br.close(); sa.close(); sb.close();
