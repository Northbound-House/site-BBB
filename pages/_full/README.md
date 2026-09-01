# Fuller page versions, kept for later

The richer versions of these pages as they stood on 1 September 2026, before
the "less is more" pass stripped them back.

They are kept because the material in them is good and may be wanted again once
Zac's own photography is in place — the credentials bar, the personal framing
in the hero and the "what I plan" narrative, and the RV/first-hand detail. This
is a parking space, not a deleted file recovered from history: put a section
back by copying it out of here into the live fragment in `pages/`.

**Nothing here is built or served.** `tools/build.py` renders only the files
named in its `PAGES` table, and every one of those is a direct child of
`pages/`. These are never read by the build.

They are, however, still *files in a repository that GitHub Pages publishes
verbatim* — the repo carries a `.nojekyll`, so an underscore prefix excludes
nothing. `robots.txt` therefore disallows `/pages/` in production. That rule
covers the live fragments too, which have always been reachable at
`/pages/index.html` and carry no `<head>`, so no canonical and no robots meta
of their own.
