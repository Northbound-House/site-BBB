# PLAN

What's left, in the order it's worth doing. Current position is in
[STATE.md](STATE.md).

---

## 0. Eyeball the test site

Nothing else should happen until someone has actually looked at
**https://test.boraborabound.com** in a browser. The build environment couldn't
reach it, so the rendered page is unverified.

Worth checking specifically:

- [ ] **Fonts.** Bebas Neue, Poppins and Sacramento load from Google Fonts,
      which was blocked during the build. This is their first real render. Wrong
      headings almost certainly means a font-loading problem.
- [ ] **Scenery images.** The 33 hotlinked Unsplash URLs, also blocked locally.
- [ ] **Mobile menu.** Open it on a real phone. It was rebuilt from scratch
      after a containing-block bug; it works in Chromium at 390px but a real
      device is the real test.
- [ ] **Legacy redirects:** `/about` `/promise` `/ourpromise` `/testimonials`
      `/refer` should all land correctly.
- [ ] **Contact routes.** Click the phone number and the email link on a phone.
- [ ] Read the five journal posts for anything that doesn't sound like you.

---

## 1. Blocked on Zac

Each is a one-line change once the value exists. Nothing is broken while they
wait — the analytics tags stay inert and every CTA falls back to the working
Tern trip-request form.

| What's needed | Where it goes | Why it matters |
| --- | --- | --- |
| **GA4 measurement ID** | `GA4_ID` in `tools/build.py` | 30 tagged CTAs are wired and firing nothing. Take it from the live Travefy site so history stays continuous. |
| **Meta Pixel ID** | `META_PIXEL_ID` | Same. |
| **Tern scheduling URL** | `TERN_SCHEDULING` | "Book a free consultation" currently falls back to the trip-request form. Works, but it isn't a booking page. |
| **Tern referral form URL** | `TERN_REFERRAL_FORM` | Same fallback. A dedicated form would capture referrer and friend separately. |
| **8–10 attributed reviews** | `pages/reviews.html` + `REVIEWS` in build.py | Name, what they booked, month and year. "Becky G. — Royal Caribbean Alaska, June 2025" is worth ten anonymous quotes. |
| **Off-site review URLs** | `pages/reviews.html` | Trustpilot, The Knot, WeddingWire, Google Business Profile. |
| **More of your own photos** | `assets/img/` + `IMAGES` in build.py | **The highest-value item on this table.** Clean, unbranded, **landscape**. Ships, resort grounds, you and Chad on the road. Two photos are doing the work of thirty-three, and the rest are hotlinked to Unsplash — where one had already been withdrawn, leaving three places on the site rendering a caption where a photo should have been. A hotlink is a photo someone else can delete. [ASSETS.md](ASSETS.md) lists every slot and what it needs; `IMG_CARD_HONEYMOON` is the most urgent, since it currently reuses `bermuda.jpg` from elsewhere on the site. |

After setting any of these: `python3 tools/build.py`, commit, push.

---

## 2. Cutover to boraborabound.com

**Do not do this until section 0 is signed off.** This is a platform migration
off Travefy, not a fresh launch — the old URLs and the analytics history both
need to survive it.

```bash
./tools/set-domain.sh production
python3 tools/build.py    # (set-domain runs this for you)
git commit -am "Cut over to boraborabound.com"
git push
```

That flips `CNAME`, all ~40 absolute URLs, `robots.txt` and every `noindex` in
one command, then prints the checklist below.

Then, in order:

1. [ ] **DNS.** Apex `ALIAS`/`ANAME`/flattened-`CNAME` → `<you>.github.io`, or
       four `A` records: `185.199.108.153`, `185.199.109.153`,
       `185.199.110.153`, `185.199.111.153`. Add `CNAME` for `www`.
2. [ ] **Settings → Pages** → custom domain `boraborabound.com`, tick
       **Enforce HTTPS** once the cert issues.
3. [ ] **Verify `boraborabound.com/robots.txt` no longer says `Disallow: /`.**
4. [ ] **Verify no page still carries `noindex`.** Of the three staging locks
       this is the one with no visible symptom — the site looks perfect and
       simply never appears in search, and nothing surfaces it until the
       traffic does not arrive. `set-domain.sh` flips it and `build.py` now
       refuses to write a production build that gets it wrong, so this is a
       confirmation rather than a hope:

       ```bash
       grep -l noindex *.html journal/*.html
       # must list terms.html and 404.html, and nothing else
       curl -s https://boraborabound.com/ | grep -i 'name="robots"'
       # must say index, follow
       ```

       Together with step 3 this is the most important check on the list.
5. [ ] **Re-run the detectors against the live domain**, which checks the same
       invariant end to end plus the other five:

       ```bash
       cd tools/audit && npm install && node audit.mjs
       ```

       Run it from a network that can reach `images.unsplash.com`, so the
       hotlinked placeholders are actually checked instead of reported
       UNVERIFIED. One of them had already been withdrawn upstream.
6. [ ] Spot-check every legacy URL redirects correctly.
7. [ ] **Google Search Console:** add and verify the property, submit
       `sitemap.xml`, then file a **Change of Address** from the old Travefy
       property. Don't skip the Change of Address — it's what moves the ranking
       signal.
8. [ ] **Bing Webmaster Tools:** same.
9. [ ] Re-run the **Facebook Sharing Debugger** so the new Open Graph tags cache.
10. [ ] Confirm GA4 is receiving `generate_lead` events, and **mark it a key
       event** in the GA4 admin panel so it counts as a conversion.

**If the cutover slips more than a couple of weeks,** re-date the five journal
posts in `POSTS` — they all carry `2026-08-11` and will otherwise launch stale.

---

## 3. Off-repo — cheapest wins on the whole audit

No code change can touch any of these, and a few take minutes.

- [ ] **Instagram name field.** Currently `Bᴏʀᴀ Bᴏʀᴀ Bᴏᴜɴᴅ` in small-caps
      Unicode, which Instagram's search does not match against. Someone who
      meets you and searches "Bora Bora Bound" may not find you. Change to
      **Bora Bora Bound | Honeymoons & Cruises**. *Two minutes, and probably the
      highest-ROI item remaining.*
- [ ] **Instagram bio** — retype in real characters, say what you sell, add a CTA.
- [ ] **Instagram highlight covers** — one palette, plain names, reorder to
      Start Here · Cruises · All-Inclusives · Reviews · Just Booked.
- [ ] **Facebook page name** → just "Bora Bora Bound"; move the advisor detail
      to Intro.
- [ ] **Facebook location** — currently six cities. Pick one (Tampa, matching
      Yelp and The Knot) and set up as a service-area business.
- [ ] **Google Business Profile** — claim it. It's what surfaces you for
      "travel agent near me", and it's also where review stars actually come
      from. (Not from the site's `Review` schema — Google ignores self-serving
      review markup. See the README.)
- [ ] **The Knot** — add your website link; push a few clients to review there.
- [ ] Make name, phone and URL byte-identical across every directory.

---

## 4. Content, ongoing

- [ ] **Two journal posts a month.** The queue that didn't make the first five:
      river cruising vs ocean for a first-timer · what a Signature amenity
      actually looks like on a booking · the honeymoon timeline · which
      all-inclusive brands suit which travellers.
- [ ] **Add one first-hand line to each existing post.** The five posts are
      deliberately advisory rather than trip reports — no invented experiences.
      A single real detail per post ("the aft cabins on X are worth it, I've
      slept in one") would turn good content into content only you could write.
      **Add these as your own; don't let a placeholder become a claim.**
- [ ] **Lead magnet.** Deliberately not built — an email capture needs a real
      endpoint, and shipping another form that says "not connected yet" would
      repeat the exact problem this rebuild fixed. Give me an endpoint and it's
      quick. Audit item 15.
- [ ] **45-second intro video** on the homepage. Audit item 20.
- [ ] **Per-page share images.** All pages currently share one OG card.

---

## 5. Open questions

- **Destination Weddings.** The audit recommended a standalone page. It was
  deliberately dropped — it's the most custom-heavy work there is, which cuts
  against the pivot to cruises, all-inclusives and small group tours. It lives
  as an honest section on the Honeymoons page instead. Easy to reverse if the
  enquiries say otherwise.
- **The homepage H1** is the one H1 without a target keyword. A keyword version
  was written and measured, and it pushed the primary CTA below the fold at
  1280×800 and on mobile. CTA position won. Revisit if the homepage
  underperforms on non-brand search.
- **Voice.** Americanized, tightened to 14.0 words per sentence, honesty lines
  reframed positively, and hero/intros lifted to the brand's "modern, upbeat,
  relatable". The detailed body copy is deliberately still measured — it's where
  the credibility lives. Push further if it reads too dry to you.
- **Evolve Sans and Jonathan Signature.** If either gets licensed, self-host
  into `assets/fonts/`, add a `@font-face`, and the substitute drops out
  automatically — they're already behind the real faces in the stack.
