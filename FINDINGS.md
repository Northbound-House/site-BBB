# Findings from the archive of https://boraborabound.com

Captured 2026-08-31T22:59:54.742Z by `tools/archive/archive.mjs`.

## Analytics IDs

These stop being obtainable the moment the site is gone. Reusing them in
`tools/build.py` is what keeps reporting continuous across the migration —
a new property would restart history at zero and make the launch unmeasurable.

| What | Found | Goes in |
| --- | --- | --- |
| GA4 measurement ID | `G-9Z8GSNE92E` | `GA4_ID` |
| Meta Pixel ID | _none found_ | `META_PIXEL_ID` |
| Google Tag Manager | `GTM-K9ZZ8MZZ` | — see note |
| Universal Analytics | _none found_ | — see note |

If a **GTM** container is present, the GA4 and Pixel tags are probably
configured inside it rather than in the page, and the IDs above may be empty.
Open that container to read them. **Universal Analytics** stopped processing
data in 2023; if that is all there is, there is no history to preserve and a
fresh GA4 property is the right answer.

## Aliased URLs

**4 page(s) are each served at more than one URL.** Every
alias needs its own redirect row pointing at the same destination — miss one and
that URL 404s even though its twin works.

- `https://boraborabound.com/`
- `https://boraborabound.com/get-page/ywtar32qeeycrq2`

- `https://boraborabound.com/get-page/ywtar32qdq4kzq2`
- `https://boraborabound.com/about`

- `https://boraborabound.com/get-page/ywtar32qdq4w2q2`
- `https://boraborabound.com/testimonials`

- `https://boraborabound.com/get-page/ywtar32qdq4x2q2`
- `https://boraborabound.com/refer`

## URL inventory

`urls.txt` lists every page that returned a success status — the complete set
of what must keep working after the cutover. Map each one into
`LEGACY_REDIRECTS` in `tools/build.py`. Anything with no natural equivalent
goes to its closest parent page, never the homepage: Google reads a homepage
redirect as a soft 404 and drops the URL anyway.

`MANIFEST.json` records every URL with its status, content type, size and a
checksum, including the ones that failed — a 404 on the old site is worth
knowing about too, since it is one less redirect to write.
