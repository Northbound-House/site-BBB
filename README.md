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
| `--paper` | `--off-white` | Card, panel and control surfaces — the raised plane |
| `--ground` | `--off-white` | The page itself — the plane everything sits on |
| `--heading` | `--brand` | Heading text |
| `--link-contrast` | `#ffffff` | Text and glyphs *on* a `--link` fill |
| `--ink-on-brand` | `--blush` | Text on the brand purple, dark in both appearances |
| `--glass-tint` | `#ffffff` | What the floating nav pill's material is made of |

`--ground` and `--paper` hold one colour on paper and two in the dark
appearance, and `--brand` and `--heading` are separate for the same reason:
`--brand` is a *ground* and stays purple, while heading text that borrowed the
same purple has to go light when the ground goes dark. One token could not do
both, which is what forced the split.

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

**Contrast:** every text/ground pair used in the design passes WCAG AA, and
`tools/audit/contrast.mjs` fails the build if one stops. That sentence was in
this README from the first commit with nothing behind it, and by the time the
detector was written the footer blurb was at 2.5:1 on all twenty pages.

Four roles exist because a colour that works on paper does not work on the
footer's purple, and reusing one for the other is how the drift started:
`--muted-on-dark`, `--ink-on-dark`, `--ink-on-dark-soft` and `--line-on-dark`.
`--field-border` is separate from `--line` for the same reason in the other
direction: a card outline may be faint, but a form control's edge is what says
the control is there, and WCAG 1.4.11 asks 3:1 of it.

Three things carry more of the site's contrast than any colour token:

- **The nav pill's glass** (`--header-glass`). The pill floats over a
  photograph, so its dark text is only as legible as the white behind it. At
  the original 0.42 the links measured 3.6:1 over a dark photo and the 9.3px
  wordmark sub-line 2.2:1.
- **The hero and page-hero scrims** (`--hero-scrim-*`, `--page-hero-scrim-*`).
  Same argument: the text is only as legible as the layer between it and the
  picture.
- **The active nav link.** It takes `--link`, not a rose. Rose was chosen as AA
  against white, but the pill is never white — it is glass over a photo, where
  rose measured 2.1:1 and cannot be rescued at 13px. The aqua underline is what
  actually marks the active item, so the state never rests on colour alone.

### Dark appearance

The site follows the reader's system setting and offers no toggle of its own.
That is Apple's guidance and the reason is practical: an app-specific
appearance switch makes people set the same preference twice, and a site that
ignores the one they already set reads as broken.

The whole re-theme is one `@media (prefers-color-scheme: dark)` block at the
top of `assets/css/styles.css`, overriding the semantic layer and nothing else
— which is what the role naming above was for. Three palette derivations were
added to serve it: `--purple-raised` (the elevated surface), `--purple-veil`
(the tinted section ground) and `--purple-light` (the brand purple lifted until
it can be read as text on a dark ground — the original measures 1.7:1 there).

Two things deliberately do **not** flip:

- **The scrims over photographs, and the dark section bands.** They are dark in
  both appearances already and their text is white in both. Flipping them would
  mean re-solving contrast that is already solved.
- **`--brand` and `--cta`.** The purple stays the purple and the rose stays the
  rose. A dark appearance is not a licence to restate the palette.

Surfaces follow the base-and-elevated split Apple uses in dark palettes, so a
card reads as sitting above the page rather than merging into it. On paper a
single off-white does that job by itself, which is why `--ground` and `--paper`
are one colour there and two here.

Two things outside the stylesheet change with the appearance, both in
`build.py` and both without JavaScript: the header serves the white monogram
through a `<picture>` with a `prefers-color-scheme` source (the colour mark is
brand purple and disappears into the dark pill), and there are two
`theme-color` metas so the browser chrome follows too.

Body text measures 15.7:1 on the page ground and secondary text 7.6:1 on a
card, which clears the 7:1 Apple asks for on small text rather than only the
4.5:1 WCAG floor. `contrast.mjs` measures this appearance on every push
alongside the light one.

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

`assets/img/zac-headshot.jpg` is the 2026 brand headshot: an opaque square
photograph with the BB mark in the corner. Because it is opaque it takes the
card treatment — `.split__media.is-square` (`object-fit: cover`, rounded,
shadowed), the same as every other photo on the site.

The rule it replaced is still in the stylesheet as `.split__media.is-portrait`,
for the older hexagon headshot with transparent corners. That one must not be
put in a cropped frame — the transparency reads as a chipped rectangle. Nothing
live uses it; the pages parked in `pages/_full/` still reference it.

The BOUND promise cards (`promise-*.png`) and testimonial cards (`review-*.png`)
are Zac's own Canva artwork, exported 1080×1080. They carry their wording inside
the artwork, so changing that copy means re-exporting from Canva — and the alt
text in the `IMAGES` table has to change in the same edit, or it will describe a
card that no longer exists.

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
against the source. Contrast is a seventh, in its own file — see below. Hit areas are measured by hit-testing and colours by
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

### `tools/audit/contrast.mjs`

```bash
cd tools/audit && node contrast.mjs
node contrast.mjs --light      # one appearance only
node contrast.mjs --verbose    # list what passed, too
```

Every element that owns visible text, on every page, at 390px and 1280px, in
both the light and dark appearances, against WCAG 2.2 AA. It is separate from
`audit.mjs` because it needs passes the others do not — two appearances, and a
screenshot pass — the same reason `lightbox.mjs` is separate.

Three things it took a wrong answer to learn:

- **Text over a photo is measured against white and black, not against the
  photo.** Checking today's picture answers the wrong question: most of these
  are hotlinked from a third party who can swap them. What has to hold is the
  scrim. So each photo is replaced with flat white and then flat black, and the
  worse answer is the one reported. Text that clears both clears any photo that
  could ever land there — which is why the scrim numbers look heavier than the
  current pictures need.
- **Only the pixels a glyph actually covers count.** A first cut read the whole
  element box and reported its worst pixel, which failed the ghost buttons
  against their own white border. Each region is shot twice, once with the text
  painted and once with it transparent, and only the pixels that changed are
  read.
- **The colour compared is the specified one, not the painted pixel.** Poppins
  Light at 15px draws strokes about a pixel wide, so nearly every pixel of it is
  an antialiased blend of letter and ground. Reading colour back out of those
  measures the renderer, not the design. The ground comes from the pixels; the
  letter's colour comes from the stylesheet, composited onto it.

It also freezes the closing band's parallax before measuring. The two
screenshots are taken moments apart, and a frame landing between them shifted
the photo by a pixel — which put every high-contrast edge in the band into the
glyph mask. The finding then moved from page to page between runs, which is the
tell that a detector is measuring its own timing.

Runs at 390px and 768px — phone, and the touch band between the phone
breakpoints and the 1000px nav collapse.

**It blocks Google Fonts while measuring, on purpose.** Bebas is condensed: with
it loaded a journal title fits one 26px line, without it the same title wraps to
two and measures 52px. That flipped a tap-target finding between runs on
different networks, which makes a green result worth nothing. The fallback face
is the deterministic choice and a state the site explicitly supports — see
`.display-face-ready` in `main.js` and the phone headline curve scoped to the
stand-in.

Three behaviours worth knowing:

- **A result you could not check is never a pass.** An image is judged by what
  the host actually answered: 404 or 410 means the photo is gone, but 403, 407
  or a 5xx means a gateway refused and we learned nothing, so it is reported
  **UNVERIFIED**. This distinction is not cosmetic — an egress proxy answers 403
  as an ordinary HTTP response rather than failing, so "the request didn't work"
  cannot tell a withdrawn photo from one this network declined to fetch. Getting
  it backwards sends someone hunting for replacements for photos that are fine.
- **A withdrawn remote photo warns; it does not fail.** Reported as **ROTTED**
  with a non-fatal exit. Blocking an unrelated merge on a stranger's decision
  gets the check disabled, not the photo replaced. The weekly `hotlink-watch`
  workflow chases them instead. A broken image in `assets/img/` does fail — that
  one is ours.
- **Anything held below the bar is held on the record.** `tap-targets` reports
  **EXEMPT** rather than quietly passing: links inside a sentence (WCAG excludes
  targets constrained by the line-height around them) and anything listed in
  `TAP_EXEMPT` with a written reason. An exemption nobody can see is
  indistinguishable from a detector that missed something.

### `tools/audit/compare.mjs`

Answers one question: did this change move anything it was not supposed to?

```bash
git worktree add --detach /tmp/before HEAD~1
node compare.mjs /tmp/before "$PWD/../.." 1280 index.html contact.html
```

It compares the box, colour and type of every laid-out element between two
checkouts, so an intended image swap does not drown out an accidental
two-pixel shift elsewhere. Two details it took a wrong answer to learn:

- **It freezes transitions before measuring.** Scroll-reveal blocks fade and
  translate into place, so measuring mid-transition reports positions that
  differ by a pixel or two between two runs of the *same* build. That noise
  buries the signal completely.
- **Check the baseline is the branch's actual parent.** A stale local `main` ref
  once made it report a header regression that did not exist. `git log` the
  worktree before trusting a diff.

### `.github/workflows/`

`checks.yml` runs on every pull request and every push to `main`: the build
(which fails on a robots/`STAGING` mismatch), a check that the committed HTML
matches what `build.py` generates, then the full detector sweep. No reduced
mode for PRs — the shared nav and footer mean a `build.py` change touches all
twenty pages, so "changed pages only" is misleading for exactly the edits most
likely to break something.

`hotlink-watch.yml` runs weekly and opens (or closes) an issue when a hotlinked
photo stops resolving. It exists because PR checks only run when someone opens
a PR, and rot on a launched site is precisely what nobody notices in a quiet
month. It becomes unnecessary the day the placeholders are replaced with real
photography.

### `tools/archive`

A one-shot crawler that preserves a live site before it stops existing. Written
for the Travefy site at `boraborabound.com`, which the DNS cutover destroys.

Run it from **Actions → archive-old-site**, not locally — it needs to reach the
site being archived, and it commits to an orphan branch that Pages never serves.

It saves the HTML exactly as the server sent it, but collects asset URLs from
the *rendered* page, so anything JavaScript injected is captured too. It also
extracts the analytics IDs, which is the part with a deadline: once the old site
is gone, the GA4 and Meta Pixel IDs cannot be recovered, and reusing them is
what keeps reporting continuous across the migration.

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
