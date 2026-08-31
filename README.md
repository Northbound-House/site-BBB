# Archive: https://boraborabound.com

Captured 2026-08-31 22:59 UTC by `tools/archive/archive.mjs`,
run from `.github/workflows/archive-old-site.yml`.

This is the Travefy site as it stood immediately before
`boraborabound.com` was pointed at GitHub Pages. It exists nowhere
else.

| Path | What |
| --- | --- |
| `pages/` | Every page's HTML, exactly as the server sent it |
| `assets/<host>/` | Images, CSS and JS, from any origin |
| `urls.txt` | Every URL that returned success |
| `MANIFEST.json` | Per-URL status, content type, size, checksum |
| `FINDINGS.md` | Analytics IDs recovered from the pages |

The HTML keeps its original absolute links, so this is a record rather
than a browsable offline copy — following a link leaves the archive.
That is deliberate: rewriting links would mean altering the bytes the
server sent, which is the one thing an archive should not do.

**This branch is never merged.** GitHub Pages serves `main`, and
these pages must not reappear as duplicates of the site that replaced
them.
