# Bora Bora Bound

A static site for [boraborabound.com](https://boraborabound.com), hosted on **GitHub Pages**.
Hand-coded HTML/CSS/JS with a small Python generator — no framework, and nothing
the browser downloads but the site's own files. The one npm dependency is
`tools/audit`, a dev-only detector suite that never ships: Pages serves the repo
root, and that folder's `node_modules` is gitignored.

> **Status: staging.** `CNAME` points at `test.boraborabound.com`, every page carries
> `noindex, nofollow`, and `robots.txt` disallows everything. This is deliberate — an
> indexable copy of the site on a second domain competes with the real one in search.
> Run `./tools/set-domain.sh production` to flip all of it at cutover.
>
> **The `noindex` is the lock with no visible symptom.** Ship it to production and
> the site looks perfect and never appears in search. `tools/build.py` therefore
> refuses to write a production build that still carries it — see
> `verify_indexability()` — and it is an explicit line on the cutover checklist in
> [PLAN.md](PLAN.md). Do not remove either guard.

**Deployed to https://test.boraborabound.com** — see **[STATE.md](STATE.md)** for
where everything stands and **[PLAN.md](PLAN.md)** for what's next, including the
cutover checklist. This README covers how to work on the site.

## Brand system

Everything below comes from the official brand guide (Drive: *BBB Brand Guidelines.pdf*
and *Brand Colors HEX Codes*, cross-checked against the Canva brand kit
"Bora Bora Bound"). All of it lives in the `:root` block at the top of
`assets/css/styles.css` — change it there, nowhere else.

### Colour

| Token | Hex | Role |
| --- | --- | --- |
| `--purple` | `#4622a2` | Primary. Dark grounds, links, headings. |
| `--rose` | `#d0356a` | Secondary. Every primary CTA. |
| `--orange` | `#f09839` | Accent (the flight path in the logo). |
| `--teal` | `#4aa4a6` | Supporting. |
| `--pink` | `#f6cfee` | Soft. |
| `--aqua` | `#76efe1` | Bright accent — nav underline, script word, trust strip. |
| `--ink` | `#2b2b2b` | Body text. |
| `--off-white` | `#fdfefb` | Page ground. |
| `--grey` / `--grey-light` | `#ababab` / `#d9d9d9` | Borders, dividers. |

Tints from the Canva palette row are available as `--purple-soft` `#6a4fb3`,
`--rose-soft` `#e07a95`, `--aqua-soft` `#8edad3`, `--pink-soft` `#ead4e2`.
`--purple-deep`, `--purple-ink`, `--rose-deep` and `--blush` are darker/lighter
derivations of brand hues for depth and section grounds — not new colours.

The rest of the sheet is written against a thin **semantic layer**, so a
re-theme is an edit to six lines rather than to six hundred:

| Alias | Maps to | Role |
| --- | --- | --- |
| `--ground-deep` | `--purple-deep` | Dark section grounds and the footer |
| `--brand` | `--purple` | Brand grounds and heading text |
| `--link` | `--purple` | Links, focus rings, interactive text |
| `--accent-bright` | `--aqua` | Bright accent on dark grounds |
| `--cta` | `--rose` | The primary call to action |
| `--surface-tint` | `--blush` | The tinted section ground |
| `--paper` | `--off-white` | Card and page surfaces |

**Name these for the role, never for the colour.** The layer was previously
nautical — `--navy`, `--gold`, `--sand`, `--lagoon`, `--deep-sea` — mapped onto
a purple and rose palette, so `--gold` painted pink and `--navy` painted purple.
The class names lied the same way: `.btn--gold` drew a rose button. A name that
states a hue goes stale the moment the palette moves, and it misleads whoever
edits the sheet next, human or agent. The matching class names are
`.btn--primary`, `.section--tint` and `.section--deep`.

`--brand` and `--link` hold the same purple today and stay two names on purpose,
so either can move without dragging the other with it. The `token-truth`
detector in `tools/audit` fails if a name starts lying again, or if two aliases
collapse onto one value without a documented reason.

**Contrast:** every text/ground pair used in the design passes WCAG AA. The two
that needed care: white on `--rose` is 4.77:1 (fine), and the active nav link
uses `--rose-deep` rather than `--rose` because `--rose` on the frosted header
was only 3.83:1 at the nav's 0.82rem.

### Typography

The guide specifies **Bebas Neue** for display and **Evolve Sans** for body.

- **Bebas Neue** is on Google Fonts and is loaded. It is caps-only, single-weight
  and condensed, so headings carry extra size, tighter leading and a little
  tracking. `h1`/`h2` also set `text-transform: uppercase` explicitly so the
  all-caps intent survives if the webfont fails to load.
- **Evolve Sans is a commercial face, is not on Google Fonts, and is not in the
  Drive Fonts folder** — so it cannot be self-hosted from what is available.
  **Poppins** is loaded as the closest geometric substitute. If Evolve Sans gets
  licensed, drop the files in `assets/fonts/`, add a `@font-face`, and change
  `--sans` — that one line is the whole swap.
- The signature script in the guide is "Jonathan Signature", also commercial.
  **Sacramento** stands in for it via `--script`, used only for the accent word
  in the hero.

### Logo

| File | Use |
| --- | --- |
| `assets/img/logo-mark.png` | Colour BB monogram — header on light grounds. |
| `assets/img/logo-mark-white.png` | White monogram — footer on purple. |
| `brand/logo-full-color.png`, `brand/logo-full-white.png` | Full-resolution originals (1350×1350). |

Favicons, `apple-touch-icon`, the PWA icons and `og-image.png` are all generated
from the brand mark on `--purple`. The wordmark next to the mark is live text in
Bebas Neue rather than an image, so it stays crisp and selectable.

`assets/img/zac-headshot.png` is the hexagon-cropped brand headshot. It has
transparent corners, so it is rendered with `.split__media.is-portrait`
(`object-fit: contain`, no card, no shadow) — do not put it in a cropped frame.

## Tuning the layout

Every measurement the homepage renders — spacing, padding, gaps, widths, type sizes,
line heights, radii, shadow offsets, animation timings — is declared once in the
**control block** at the top of `assets/css/styles.css`, each with a one-line comment
saying what it moves. Nothing below that block carries a raw measurement for anything
the homepage draws.

To tune: change a number in the block, save, reload the page. Start with
`--maxw` (content width), `--section-pad-*` (air between sections) and
`--hero-title-size-*` (headline size) — they move the most pixels per keystroke.

Three details worth knowing:

- **Fluid type** reads as `clamp(MIN, BASE + VW, MAX)`. `MIN` is the phone size, `MAX`
  the size it stops growing at, `BASE + VW` the rate in between.
- **Breakpoints** are the one place a number is repeated: `@media` cannot read a custom
  property, so `--bp-mobile` and friends document the value and the media query below
  restates it. Change both.
- **Three JS values** (`--header-scrolled-at`, `--reveal-trigger`, `--reveal-margin`)
  are also knobs; `assets/js/main.js` reads them out of the block at load.
- **The nav switches to the dropdown at `--bp-nav-menu` (1000px), not at
  `--bp-mobile`.** Six links, a wordmark and a pinned CTA need about 970px of pill
  to sit in a row — measured in the stand-in sans, the widest the nav ever gets —
  so the nav runs out of room long before the content columns do. `--bp-mobile`
  (720px) still governs where columns stack.
- **Card rows carry an explicit column count**, not an auto-fit pixel floor.
  Auto-fit lets the available space pick the column count, and at mid widths that
  left a row holding one card — three trip cards came out two-and-one. `--*-cols`
  knobs set the count, and step down at `--bp-process` / `--bp-contact` (four
  across go two by two) and `--bp-cards` (everything stacks). The rule: a row
  never holds a single card. Adding a card to a grid means checking its count
  against those knobs.
- **One knob sets every card title.** Trip cards, feature cards and process steps
  share `--card-title-size` / `--card-title-tracking`, in the CARD SURFACES group.
  Give a component its own knob if you ever want its titles to differ.
- **The values are locked** as of 24 August 2026. Tune them freely, but treat what
  is in the file as the current design: new work adds a new knob rather than
  retuning a locked one, and a new element gets its own knob even when an existing
  value looks close. The `TAP TARGETS` group (`--tap-min`, `--bp-tap`) went in
  under that rule rather than by widening `--social-size` and friends: it grows
  the area a finger can hit without moving a drawn pixel, so the desktop design
  renders exactly as it did before.
- **Headlines follow a second curve below `--bp-phone`.** Bebas is a condensed caps
  face, so one long word — CONGRATULATIONS, HONEYMOONS — is wider than a phone column
  at the size the desktop curve asks for. The phone curve is lower and steeper, and
  meets the desktop one exactly at 480px so nothing jumps at the breakpoint. That is
  why `--h2-size-base` is negative inside that block: the width term carries the size
  there. `overflow-wrap: break-word` on headings is the backstop if a word ever grows
  past what the curve can absorb.
- **That phone curve is scoped to the stand-in face.** Bebas is condensed; the sans
  that stands in while the webfont loads — or forever, if Google Fonts is blocked —
  is about a third wider, and that is the face the overflow happens in. `main.js`
  adds `.display-face-ready` to `<html>` once Bebas is confirmed loaded, and the
  phone sizes drop away, so a visitor with the webfont sees the headlines at their
  designed size. Note `document.fonts.check()` cannot be used for this: it answers
  true for a family that was never loaded. `document.fonts.load()` resolves with the
  faces that actually matched, so an empty array means the face is genuinely absent.

Inner-page-only components — forms, FAQ, contact cards, legal prose, journal cards,
the modal, stats and badges — still carry literal values further down the sheet. They
can be lifted into the block the same way when the inner pages get their tuning pass.

## How the site is built

Content lives in `pages/*.html` as bare fragments. Everything shared — `<head>` metadata,
nav, footer, analytics tags, JSON-LD — is generated by `tools/build.py` and written into
the root `*.html` files that GitHub Pages serves.

```bash
python3 tools/build.py
```

**Never hand-edit the generated `*.html` in the repo root.** Every one starts with a
`GENERATED by tools/build.py` comment. Edit `pages/*.html` for content, or the tables in
`tools/build.py` for anything shared, and rebuild.

This exists because fifteen hand-maintained `<head>` blocks drift. That's precisely how the
original site ended up serving a competitor's meta description on its Testimonials page.

### `tools/build.py`

Single source of truth for:

- Per-page title, description, `robots`, `rel=canonical`, Open Graph and Twitter tags
- JSON-LD (`TravelAgency`, `Person`, `Service`, `FAQPage`, `Review`, `BreadcrumbList`, `ItemList`)
- Nav and footer markup
- GA4 and Meta Pixel loaders
- `sitemap.xml`, `robots.txt`, and the legacy redirect stubs
- Every photo the site renders, via the `IMAGES` table
- `verify_indexability()`, which fails the build if the `robots` meta disagrees
  with `STAGING`

Content fragments can reference config values as `{{TOKEN}}` — `{{EMAIL}}`,
`{{PHONE_DISPLAY}}`, `{{PHONE_E164}}`, `{{TERN_SCHEDULING}}`, `{{TERN_TRIP_FORM}}`,
`{{TERN_REFERRAL_FORM}}`, `{{FACEBOOK}}`, `{{INSTAGRAM}}`, `{{LINKEDIN}}`, `{{ADVISOR}}`,
`{{BUSINESS_NAME}}`. An unknown token fails the build rather than shipping silently.

#### Swapping a photo

Photos live in the `IMAGES` table, keyed by the **slot** they fill rather than by
what the picture shows — `IMG_CARD_HONEYMOON`, `IMG_PAGEHERO_ABOUT`. Each entry
carries its URL and its alt text as a pair, and fragments reference them as
`{{IMG_CARD_HONEYMOON}}` and `{{IMG_CARD_HONEYMOON_ALT}}`. So dropping in one of
Zac's own photos is one edit in one place, and the description cannot drift away
from the picture it describes. See [ASSETS.md](ASSETS.md) for what to supply.

Most entries are still Unsplash hotlinks, which rot without warning — one had
already been withdrawn upstream, and three places on the site were rendering its
alt text where the photo should have been. Run the detectors from a network that
can reach `images.unsplash.com` to catch the next one.

### `tools/audit`

Six detectors, run against the rendered page in headless Chromium rather than
against the source. Hit areas are measured by hit-testing and colours by
resolving them in the browser, because the defects worth catching only exist
once the cascade has run.

```bash
cd tools/audit && npm install
node audit.mjs                 # all six detectors
node audit.mjs --screenshots   # plus 1280x800 stills, for before/after diffs
```

| Detector | Asserts |
| --- | --- |
| `staging-leak` | The `robots` meta matches the `STAGING` flag, both directions |
| `broken-images` | No `<img>` fails to decode |
| `token-truth` | No token name states a hue it does not hold; no two aliases share a value undocumented |
| `menu-a11y` | `aria-controls` resolves, focus enters the panel, the body does not scroll behind it, Escape returns focus |
| `tap-targets` | Every control offers 44x44, per WCAG 2.5.5 |
| `heading-order` | Every page starts at `h1` and skips no level |

Two behaviours worth knowing. Images on a host the current network cannot reach
are reported **UNVERIFIED**, never PASS — a detector that goes green because it
could not check is worse than no detector. And `tap-targets` reports links that
sit inside a sentence as **EXEMPT** rather than failing them: WCAG excludes
targets whose size is constrained by the line-height of the text around them,
and enlarging one would open up the leading of the paragraph it sits in.

### `tools/set-domain.sh`

Switches staging ↔ production in one command. The domain appears in ~40 places
(canonicals, `og:url`, `og:image`, sitemap, redirect stubs, schema `@id`s).

```bash
./tools/set-domain.sh staging      # test.boraborabound.com, noindex, robots Disallow
./tools/set-domain.sh production   # boraborabound.com, indexable, robots Allow + Sitemap
```

Running `production` prints the cutover checklist for the steps a script can't do
(DNS, Search Console, Change of Address).

## Pages

| File | Page | Sitemap |
| --- | --- | --- |
| `index.html` | Home | ✓ |
| `ways-to-travel.html` | Ways to Travel (hub) | ✓ |
| `cruises.html` | Cruises | ✓ |
| `all-inclusive-resorts.html` | All-Inclusive Resorts | ✓ |
| `small-group-tours.html` | Small Group Tours | ✓ |
| `honeymoons.html` | Honeymoons & Romance | ✓ |
| `lgbtq-travel.html` | LGBTQ+ Travel | ✓ |
| `how-i-work.html` | How I Work — process, fees, FAQ | ✓ |
| `about.html` | About Zac | ✓ |
| `reviews.html` | Reviews | ✓ |
| `contact.html` | Contact | ✓ |
| `refer.html` | Refer & Earn | ✓ |
| `journal.html` | Journal | ✓ |
| `terms.html` | Terms & Conditions | — (`noindex, follow`) |
| `404.html` | Not found | — |

The offer is organised by **how** you travel rather than where, matching the shift in
focus to cruises, all-inclusive resorts, and small group tours.

## Journal

Posts live in `pages/journal/<slug>.html` with a matching row in the `POSTS`
table in `tools/build.py`. That row drives the index card, the `BlogPosting`
schema, the sitemap entry and the page registration — adding a post is one
fragment plus one row.

`journal.html` renders its card list from `{{POST_LIST}}`, so the index never
needs hand-editing.

**Dates.** All five launch posts carry `2026-08-11`. If the cutover slips,
re-date them in `POSTS` rather than shipping stale ones.

**On what these posts are.** They are advisory pieces grounded in product facts
and industry practice — how all-inclusive tiers work, what changes between
Alaska's shoulder months, how to read a tour inclusion list. They deliberately
contain **no invented first-hand anecdotes**: no specific sailings, dates,
resorts stayed at, or trips taken. The only personal claims are ones already
established elsewhere on the site (the full-time RV, having sailed the ships).
If you add a personal detail to a post, add it as your own — don't let a
placeholder become a claim.

## Legacy URL redirects

The old Travefy site served extensionless URLs, and two pages were renamed in this
rebuild. Each old path gets a redirect stub — canonical plus instant meta refresh, which
Google treats as a permanent redirect, since GitHub Pages can't issue 301s.

| Old URL | Goes to |
| --- | --- |
| `/about` | `/about.html` |
| `/promise`, `/promise.html` | `/how-i-work.html` |
| `/ourpromise` | `/how-i-work.html` — indexed but dead since the original rename |
| `/testimonials`, `/testimonials.html` | `/reviews.html` |
| `/refer` | `/refer.html` |

Generated from `LEGACY_REDIRECTS` in `tools/build.py`. Add a row if another old URL turns
up in Search Console.

## Conversion tracking

Every CTA carries `data-cta="<location>"`. A click fires a GA4 `generate_lead` event and a
Meta Pixel `Lead` event, tagged with where on the site it came from — so it's possible to
tell which page actually produces consultations. Wiring is in `assets/js/main.js` and
no-ops safely when the tags are absent.

**To switch it on:** set `GA4_ID` and `META_PIXEL_ID` in `tools/build.py` and rebuild.
Then mark `generate_lead` as a key event in the GA4 admin panel so it counts as a
conversion.

## ⚠️ Open TODOs

Each of these is a one-line change in `tools/build.py` CONFIG unless noted.

| What | Where | Notes |
| --- | --- | --- |
| **GA4 measurement ID** | `GA4_ID` | Copy from the live Travefy site so historical data stays continuous. Tags are inert until set. |
| **Meta Pixel ID** | `META_PIXEL_ID` | Same. |
| **Tern scheduling link** | `TERN_SCHEDULING` | Currently falls back to the trip-request form, so no CTA is broken — but "Book a free consultation" should point at a real booking page. |
| **Tern referral form** | `TERN_REFERRAL_FORM` | Same fallback. A dedicated form would capture the referrer and friend separately. |
| **Attributed reviews** | `pages/reviews.html`, `REVIEWS` in build.py | Still the same three unattributed quotes. Target is 8–10 with name, what they booked, and month/year. |
| **Off-site review links** | `pages/reviews.html` | Trustpilot, The Knot, WeddingWire, Google Business Profile URLs. |
| **More of your own photography** | `pages/*.html` | Two of your own photos are now in use and self-hosted: `stkitts-coastline.jpg` (the shot the brand guide uses as its own header) and `bermuda.jpg`. Everything else is still hotlinked Unsplash. The `JustBooked` folder in Drive can't be used — those are 1080×1080 social graphics with "JUST BOOKED" and the URL baked in. What's needed is more clean, unbranded, landscape-orientation photos: ships, resort grounds, and you and Chad on the road. |
| **Per-page share images** | `og-image.png` | One brand-built 1200×630 card is shared by all pages. |
| **Brand voice pass** | `pages/*.html` | The guide calls for "modern, upbeat, relatable". The current copy is accurate and honest but reads more measured and dry than that. Worth a deliberate pass. |
| **Intro video** | `pages/index.html` | Needs recording. |
| **Lead magnet** | — | Deliberately not built: an email-capture form needs a real endpoint, and shipping another dead form would repeat the problem this rebuild just fixed. |

## Deploying to GitHub Pages

1. Push to the default branch.
2. **Settings → Pages → Source: Deploy from a branch**, branch `main`, folder `/ (root)`.
3. **DNS.** `ALIAS`/`ANAME`/flattened-`CNAME` on the apex → `<you>.github.io`, **or** four
   `A` records: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.
   Add a `CNAME` for `www` → `<you>.github.io`.
4. **Settings → Pages**, confirm the custom domain and tick **Enforce HTTPS**.

`.nojekyll` is included so GitHub serves the files as-is.

## A note on Review structured data

`reviews.html` carries `Review` JSON-LD, but **it will not produce star ratings in search
results** — Google ignores self-serving review markup on an organisation's own site. It's
included because it still helps Google resolve the business as an entity, which supports
the Google Business Profile work. Deliberately no `aggregateRating`: there's no verifiable
rating data behind it. Stars in search come from a Google Business Profile, not from here.

## Local preview

```bash
python3 -m http.server 8765
# then open http://localhost:8765/
```
