# Fuller page versions, kept for later

The richer versions of these pages as they stood before the "less is more" pass
of 1 September 2026, which cut the site back to a minimal lovable product for
launch.

Nothing here was deleted because it was bad. Most of it is good writing that a
launch does not need, and several pieces should come back once there is traffic
to justify the length. **To restore a section, copy it out of the file here into
the live fragment in `pages/`** — they are the same shape.

**Nothing in this directory is built or served.** `tools/build.py` renders only
the files named in its `PAGES` table, and every one of those is a direct child
of `pages/`. These are never read by the build.

They are, however, still files in a repository that GitHub Pages publishes
verbatim — the repo carries a `.nojekyll`, so an underscore prefix excludes
nothing. `robots.txt` therefore disallows `/pages/` in production. That rule
covers the live fragments too, which have always been reachable at
`/pages/index.html` and carry no `<head>`, so no canonical and no robots meta
of their own.

## What was cut, and why

The rule applied: **cut what is said better somewhere else, and cut what asks
the reader for something the page was not built to ask.** Nothing was cut for
being long on its own.

| Page | Cut | Why |
| --- | --- | --- |
| Home | Credentials bar (CLIA · Signature · ASTA · NGLCC) | Four acronyms under the hero — proof offered before the reader had been told what was on offer. Still on `how-i-work.html` and in the footer. |
| Home | "How it works", four steps | `how-i-work.html` has the same four plus a fifth, in detail. Its button moved up into the section above so the page is still reachable. |
| Home | Referral banner | Asks a second thing of a reader just asked to book, and speaks to past travelers on the page that converts new ones. |
| Home | First-person hero lede | Replaced with a description of the offer rather than an introduction. |
| About | Three of six credentials (Sandals/Hyatt, ASTA, Family & Disney) | Six long entries made a credentials section into a reading task. The three kept are the three that change what a traveler gets. |
| About | "Licensed & registered" section | Third copy — `how-i-work.html` answers "Are you licensed?" with the same numbers, and `terms.html` has them in full. Reduced to one line. |
| Cruises, All-inclusive, Small group, Honeymoons | "On price" callout | The same box on four pages, plus two FAQ answers saying it again. Five copies of one reassurance is not reassuring. |
| Cruises, All-inclusive, Small group, Honeymoons | "When should you book?" | The FAQ answers it for all three verticals in one place. |
| Honeymoons | "Destination weddings" | A section about work Zac does not take on, on the page selling the work he does. |
| Ways to travel | Opening lede | Spent the top of the page on competitors rather than the reader. The paragraph below makes the point positively. |
| LGBTQ+ travel | "What does NGLCC certification mean?" | `about.html` explains the same certification at greater length. |
| Contact | "What's useful to have ready?" | Set homework in front of someone who had already decided to make contact. The consultation asks these anyway. |
| Contact | "Or just follow along" + social icons | Same three links are in every footer; a page whose job is to start a conversation should not end by offering to postpone it. |
| Journal | "Anything you'd rather I wrote about?" | Promised a cadence the launch cannot keep, and competed with the CTA one section below. |
| How I work | 2 of 8 FAQs | "Do you only book…" is answered by ways-to-travel; "What happens after I get in touch?" restated the process at the top of the same page. |
| Refer | "Unlock an exclusive experience" | A tier-two reward with no mechanism behind it. Put it back when it is a real thing that can be honoured. |

Net effect: **7,397 → 6,115 words** of reading content across thirteen pages,
about 18% less, with every page touched except `reviews.html` — which is a hero
and three cards and had nothing to give.

## One thing that is not recoverable from here

`how-i-work.html` previously carried five commitments written as prose —
"Matched, not sold", "Perks, where they exist", "Straight answers", "A real
network behind me", "Reachable while you're away". Those were replaced by Zac's
own BOUND artwork, which says something different and spells the acronym. The
old wording is in `_full/how-i-work.html` if it is ever wanted, but the two are
alternatives, not versions of each other.
