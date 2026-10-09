# Vendored scripts

Third-party libraries, copied in so the browser still downloads nothing but the
site's own files. Each is the package's own minified build, unmodified apart from
the `sourceMappingURL` comment being removed. The maps are not shipped, and a
comment pointing at a missing file only adds a 404 to every devtools session.

| File | Package | Version | Licence | Loaded on |
| --- | --- | --- | --- | --- |
| `lenis.min.js` | [`lenis`](https://github.com/darkroomengineering/lenis) | 1.3.26 | MIT, `LICENSE-lenis.txt` | Every page |
| `gsap.min.js` | [`gsap`](https://github.com/greensock/GSAP) | 3.15.0 | [GSAP standard licence](https://gsap.com/standard-license) (no charge), header in the file | Pages with the full-screen hero |
| `SplitText.min.js` | `gsap` (plugin) | 3.15.0 | Same | Same |

`tools/build.py` decides which pages load which (`VENDOR_EVERYWHERE`,
`VENDOR_HERO`). `assets/js/main.js` checks for each library before using it,
and does nothing with any of them when the visitor has asked for reduced motion.

To upgrade, `npm pack <package>@<version>` and copy the same file out of `dist/`,
then remove the `sourceMappingURL` line again.
