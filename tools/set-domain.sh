#!/usr/bin/env bash
#
# Switch the site between the staging subdomain and the production domain.
#
#   ./tools/set-domain.sh staging      # test.boraborabound.com, noindex, robots Disallow
#   ./tools/set-domain.sh production   # boraborabound.com, indexable, robots Allow + Sitemap
#
# This rewrites CNAME and the two flags at the top of tools/build-head.py, then
# regenerates every page's canonical/Open Graph URLs, sitemap.xml, robots.txt,
# and the legacy redirect stubs. Do not hand-edit the domain in the HTML files —
# it appears in roughly forty places and they must stay in sync.

set -euo pipefail

MODE="${1:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="$ROOT/tools/build-head.py"

case "$MODE" in
  staging)
    DOMAIN="https://test.boraborabound.com"
    HOST="test.boraborabound.com"
    STAGING="True"
    ;;
  production)
    DOMAIN="https://boraborabound.com"
    HOST="boraborabound.com"
    STAGING="False"
    ;;
  *)
    echo "usage: $0 {staging|production}" >&2
    exit 64
    ;;
esac

python3 - "$BUILD" "$DOMAIN" "$STAGING" <<'PY'
import re, sys
path, domain, staging = sys.argv[1], sys.argv[2], sys.argv[3]
src = open(path, encoding="utf-8").read()
src, n1 = re.subn(r'^SITE_URL = ".*"$', f'SITE_URL = "{domain}"', src, count=1, flags=re.M)
src, n2 = re.subn(r'^STAGING = (?:True|False)$', f'STAGING = {staging}', src, count=1, flags=re.M)
if n1 != 1 or n2 != 1:
    sys.exit("could not rewrite SITE_URL/STAGING in build-head.py")
open(path, "w", encoding="utf-8").write(src)
PY

printf '%s\n' "$HOST" > "$ROOT/CNAME"
python3 "$BUILD"

echo
echo "Domain set to $DOMAIN (staging=$STAGING)."
if [ "$MODE" = "production" ]; then
  cat <<'EOF'

Cutover checklist — the parts this script cannot do:
  1. Point the apex DNS at GitHub Pages (A records or ALIAS) and CNAME www.
  2. Settings -> Pages: set the custom domain to boraborabound.com, tick Enforce HTTPS.
  3. Verify boraborabound.com/robots.txt no longer says "Disallow: /".
  4. Google Search Console: add + verify the property, submit sitemap.xml,
     and file a Change of Address from the old Travefy property.
  5. Bing Webmaster Tools: same.
  6. Spot-check the legacy URLs land correctly:
     /about /promise /ourpromise /testimonials /refer
  7. Re-run the Facebook Sharing Debugger so the new Open Graph tags are cached.
EOF
fi
