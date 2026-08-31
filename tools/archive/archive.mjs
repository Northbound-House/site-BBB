#!/usr/bin/env node
/* Archive a live site before it stops existing.
 *
 *   node archive.mjs https://boraborabound.com ./out
 *
 * Written for one job: preserving the Travefy site at boraborabound.com before
 * the DNS cutover destroys it. There is no second copy and no way to make one
 * afterwards, so this errs toward capturing more than it needs.
 *
 * It saves the HTML exactly as served rather than the rendered DOM — an archive
 * should record what the server sent, not what a 2026 browser made of it — but
 * it collects asset URLs from the RENDERED page, so anything injected by
 * JavaScript is still captured. wget would miss those.
 *
 * Three outputs, all useful beyond the archive itself:
 *
 *   pages/…            the HTML, one file per URL, byte-exact
 *   assets/<host>/…    images, CSS and JS, from any origin
 *   MANIFEST.json      every URL, status, content type, size, checksum
 *   urls.txt           plain list of pages — the redirect map's input
 *   FINDINGS.md        analytics IDs and anything else worth reading
 *
 * urls.txt and FINDINGS.md are the launch-critical parts: the first is the
 * complete old-URL inventory that LEGACY_REDIRECTS needs, the second carries
 * the GA4 and Meta Pixel IDs, which are unrecoverable once the site is gone.
 */

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const START = process.argv[2];
const OUT = path.resolve(process.argv[3] || "./out");
if (!START) {
  console.error("usage: node archive.mjs <start-url> [out-dir]");
  process.exit(64);
}
const ORIGIN = new URL(START).origin;
const HOST = new URL(START).host;

/* ---- Limits ------------------------------------------------------------- */

const MAX_PAGES = Number(process.env.MAX_PAGES || 500);
const MAX_ASSET_BYTES = Number(process.env.MAX_ASSET_BYTES || 25 * 1024 * 1024);
const DELAY_MS = Number(process.env.DELAY_MS || 250); // politeness between pages
const NAV_TIMEOUT = 45_000;

/* Query strings on a marketing site are almost always tracking parameters, and
   following them turns one page into hundreds of near-duplicates. Strip them,
   but keep any that genuinely select content. */
const MEANINGFUL_PARAMS = new Set(["page", "p", "id", "slug", "post"]);

function normalise(href, base) {
  let u;
  try { u = new URL(href, base); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  // /index.html and / are the same page. Left alone they are crawled twice,
  // written to the same file, and listed as two entries in the URL inventory —
  // which would then produce two redirect rules for one destination.
  u.pathname = u.pathname.replace(/(^|\/)index\.html?$/i, "$1");
  for (const key of [...u.searchParams.keys()]) {
    if (!MEANINGFUL_PARAMS.has(key.toLowerCase())) u.searchParams.delete(key);
  }
  return u.toString();
}

/* A URL becomes a file path. Directory-style URLs get index.html; anything
   without an extension gets .html so the archive is browsable. */
function pageFile(url) {
  const u = new URL(url);
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith("/")) p += "index.html";
  else if (!path.extname(p)) p += ".html";
  const q = u.search ? "__" + u.search.slice(1).replace(/[^\w=&-]/g, "_") : "";
  if (q) p = p.replace(/(\.html)$/, q + "$1");
  return path.join(OUT, "pages", p.replace(/^\/+/, ""));
}

function assetFile(url) {
  const u = new URL(url);
  let p = decodeURIComponent(u.pathname);
  if (!p || p.endsWith("/")) p += "index";
  // Some CDNs encode the whole transform in the query; keep it in the name so
  // two different renditions of one image do not collide.
  const q = u.search
    ? "__" + createHash("sha1").update(u.search).digest("hex").slice(0, 8)
    : "";
  const ext = path.extname(p);
  if (q) p = ext ? p.slice(0, -ext.length) + q + ext : p + q;
  return path.join(OUT, "assets", u.host, p.replace(/^\/+/, ""));
}

async function save(file, body) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}

/* ---- Crawl -------------------------------------------------------------- */

const pages = new Map();   // url -> record
const assets = new Map();  // url -> record
const queue = [];
const seen = new Set();

function enqueue(url) {
  if (!url || seen.has(url)) return;
  if (new URL(url).origin !== ORIGIN) return; // never crawl off-site
  seen.add(url);
  queue.push(url);
}

/** The sitemap is the site's own answer to "what pages exist" — worth asking
 *  before guessing from links, since it lists pages nothing links to. */
async function seedFromSitemap(ctx) {
  for (const name of ["/sitemap.xml", "/sitemap_index.xml"]) {
    try {
      const res = await ctx.request.get(ORIGIN + name, { timeout: 20_000 });
      if (!res.ok()) continue;
      const xml = await res.text();
      const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
      let added = 0;
      for (const loc of locs) {
        if (loc.endsWith(".xml")) continue; // nested index; links will find it
        const u = normalise(loc, ORIGIN);
        if (u && !seen.has(u)) { enqueue(u); added++; }
      }
      if (added) console.log(`  ${name}: seeded ${added} URLs`);
    } catch { /* no sitemap is normal */ }
  }
}

async function run() {
  const browser = await chromium.launch(launchOptions());
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: "Mozilla/5.0 (compatible; site-archive/1.0; +pre-migration snapshot)",
  });

  console.log(`Archiving ${ORIGIN}\n`);
  enqueue(normalise(START, ORIGIN));
  await seedFromSitemap(ctx);

  const page = await ctx.newPage();
  const assetUrls = new Set();

  while (queue.length && pages.size < MAX_PAGES) {
    const url = queue.shift();
    let record = { url, status: null, contentType: null, bytes: 0, error: null };

    try {
      // The response object gives the bytes the server actually sent; the page
      // object gives the DOM after scripts have run. The archive wants both.
      const res = await page.goto(url, {
        waitUntil: "networkidle", timeout: NAV_TIMEOUT,
      });
      if (!res) throw new Error("no response");

      record.status = res.status();
      record.contentType = (res.headers()["content-type"] || "").split(";")[0];

      if (record.status >= 400) {
        console.log(`  ${record.status} ${url}`);
        pages.set(url, record);
        continue;
      }

      // Lazy images only request once they approach the viewport.
      await page.evaluate(async () => {
        document.querySelectorAll('img[loading="lazy"]').forEach((i) => { i.loading = "eager"; });
        for (let y = 0; y < document.body.scrollHeight; y += 800) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 60));
        }
        window.scrollTo(0, 0);
      }).catch(() => { /* a page that will not scroll is still worth saving */ });
      await page.waitForTimeout(400);

      const body = await res.body();
      record.bytes = body.length;
      record.sha256 = createHash("sha256").update(body).digest("hex").slice(0, 16);
      await save(pageFile(url), body);

      // Links and assets come from the rendered DOM, so anything JavaScript
      // added is captured too.
      const found = await page.evaluate(() => {
        const abs = (v) => { try { return new URL(v, location.href).toString(); } catch { return null; } };
        const links = [...document.querySelectorAll("a[href]")].map((a) => abs(a.getAttribute("href")));
        const media = [];
        for (const el of document.querySelectorAll("img[src], img[srcset], source[srcset], link[rel=stylesheet], script[src], video[src], source[src]")) {
          for (const attr of ["src", "href"]) {
            const v = el.getAttribute(attr);
            if (v) media.push(abs(v));
          }
          const ss = el.getAttribute("srcset");
          if (ss) for (const part of ss.split(",")) media.push(abs(part.trim().split(/\s+/)[0]));
        }
        // Background images set in inline styles — the hero images on this site
        // are drawn this way, so missing them would lose the main photography.
        for (const el of document.querySelectorAll("[style*='url(']")) {
          for (const m of el.getAttribute("style").matchAll(/url\((['"]?)(.*?)\1\)/g)) {
            media.push(abs(m[2]));
          }
        }
        return { links: links.filter(Boolean), media: media.filter(Boolean) };
      });

      for (const l of found.links) enqueue(normalise(l, url));
      for (const m of found.media) {
        const n = normalise(m, url);
        if (n && !n.startsWith("data:")) assetUrls.add(n);
      }

      console.log(`  ${record.status} ${url}  (${record.bytes} B)`);
    } catch (e) {
      record.error = String(e.message || e).split("\n")[0].slice(0, 120);
      console.log(`  ERR ${url}  ${record.error}`);
    }

    pages.set(url, record);
    await page.waitForTimeout(DELAY_MS);
  }

  if (queue.length) {
    console.log(`\n! Stopped at MAX_PAGES=${MAX_PAGES}; ${queue.length} URLs still queued.`);
  }

  /* ---- Assets ----------------------------------------------------------- */

  console.log(`\nAssets: ${assetUrls.size} referenced`);
  let saved = 0, skipped = 0;
  for (const url of assetUrls) {
    try {
      const res = await ctx.request.get(url, { timeout: 30_000 });
      const rec = { url, status: res.status(), bytes: 0 };
      if (res.ok()) {
        const body = await res.body();
        if (body.length > MAX_ASSET_BYTES) {
          rec.skipped = `larger than MAX_ASSET_BYTES (${body.length} B)`;
          skipped++;
        } else {
          rec.bytes = body.length;
          rec.sha256 = createHash("sha256").update(body).digest("hex").slice(0, 16);
          await save(assetFile(url), body);
          saved++;
        }
      }
      assets.set(url, rec);
    } catch (e) {
      assets.set(url, { url, status: null, error: String(e.message || e).slice(0, 120) });
    }
  }
  console.log(`  saved ${saved}, skipped ${skipped}, failed ${assets.size - saved - skipped}`);

  /* ---- What the launch actually needs ----------------------------------- */

  const ok = [...pages.values()].filter((p) => p.status && p.status < 400);
  const findings = await extractFindings(ok.map((p) => p.url), ctx);

  await save(path.join(OUT, "MANIFEST.json"), JSON.stringify({
    source: ORIGIN,
    captured: new Date().toISOString(),
    tool: "tools/archive/archive.mjs",
    pages: [...pages.values()],
    assets: [...assets.values()],
  }, null, 2));

  await save(path.join(OUT, "urls.txt"),
    ok.map((p) => p.url).sort().join("\n") + "\n");

  await save(path.join(OUT, "FINDINGS.md"), findings);

  await browser.close();

  const bytes = [...pages.values(), ...assets.values()]
    .reduce((n, r) => n + (r.bytes || 0), 0);
  console.log(`\n${ok.length} pages, ${saved} assets, ${(bytes / 1e6).toFixed(1)} MB`);
  console.log(`Written to ${OUT}`);
}

/** Pull the values out of the archive that stop being obtainable the moment
 *  the site goes away. This is why the archive has to happen before cutover
 *  and not after. */
async function extractFindings(urls, ctx) {
  const ids = { ga4: new Set(), ua: new Set(), gtm: new Set(), pixel: new Set() };
  for (const url of urls.slice(0, 40)) {
    try {
      const res = await ctx.request.get(url, { timeout: 20_000 });
      if (!res.ok()) continue;
      const html = await res.text();
      for (const m of html.matchAll(/\bG-[A-Z0-9]{6,}\b/g)) ids.ga4.add(m[0]);
      for (const m of html.matchAll(/\bUA-\d{4,}-\d+\b/g)) ids.ua.add(m[0]);
      for (const m of html.matchAll(/\bGTM-[A-Z0-9]{4,}\b/g)) ids.gtm.add(m[0]);
      for (const m of html.matchAll(/fbq\(\s*['"]init['"]\s*,\s*['"](\d{10,})['"]/g)) ids.pixel.add(m[1]);
    } catch { /* a page that will not refetch is not worth failing over */ }
  }

  const list = (s) => (s.size ? [...s].map((v) => `\`${v}\``).join(", ") : "_none found_");
  return `# Findings from the archive of ${ORIGIN}

Captured ${new Date().toISOString()} by \`tools/archive/archive.mjs\`.

## Analytics IDs

These stop being obtainable the moment the site is gone. Reusing them in
\`tools/build.py\` is what keeps reporting continuous across the migration —
a new property would restart history at zero and make the launch unmeasurable.

| What | Found | Goes in |
| --- | --- | --- |
| GA4 measurement ID | ${list(ids.ga4)} | \`GA4_ID\` |
| Meta Pixel ID | ${list(ids.pixel)} | \`META_PIXEL_ID\` |
| Google Tag Manager | ${list(ids.gtm)} | — see note |
| Universal Analytics | ${list(ids.ua)} | — see note |

If a **GTM** container is present, the GA4 and Pixel tags are probably
configured inside it rather than in the page, and the IDs above may be empty.
Open that container to read them. **Universal Analytics** stopped processing
data in 2023; if that is all there is, there is no history to preserve and a
fresh GA4 property is the right answer.

## URL inventory

\`urls.txt\` lists every page that returned a success status — the complete set
of what must keep working after the cutover. Map each one into
\`LEGACY_REDIRECTS\` in \`tools/build.py\`. Anything with no natural equivalent
goes to its closest parent page, never the homepage: Google reads a homepage
redirect as a soft 404 and drops the URL anyway.

\`MANIFEST.json\` records every URL with its status, content type, size and a
checksum, including the ones that failed — a 404 on the old site is worth
knowing about too, since it is one less redirect to write.
`;
}

function launchOptions() {
  const p = process.env.PLAYWRIGHT_BROWSERS_PATH
    ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, "chromium") : null;
  return p && existsSync(p) ? { executablePath: p } : {};
}

run().catch((e) => { console.error(e); process.exit(1); });
