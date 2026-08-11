#!/usr/bin/env python3
"""Regenerate the <head> metadata block for every page.

The site has no build step, so head tags are duplicated across the HTML files.
This script is the single source of truth for titles, descriptions, canonicals,
Open Graph tags, and JSON-LD. Run it after editing PAGES below:

    python3 tools/build-head.py

It rewrites everything between <meta name="viewport"> and <link rel="preconnect">
in each page and leaves the rest of the file untouched.

Domain handling: canonical/og URLs are written against SITE_URL. To move from the
staging subdomain to production, use tools/set-domain.sh — do not hand-edit.
"""

import pathlib
import re

# --- Staging flag -----------------------------------------------------------
# While the site is served from the test subdomain it must not be indexed, or it
# becomes a duplicate of the brand competing with the real domain in search.
# tools/set-domain.sh flips both of these together.
SITE_URL = "https://test.boraborabound.com"
STAGING = True

ROOT = pathlib.Path(__file__).resolve().parent.parent

SOCIAL_PROFILES = [
    "https://www.facebook.com/boraborabound.go",
    "https://www.instagram.com/boraborabound.go",
    # TODO: add the LinkedIn company page URL here and in the footers.
]

OG_IMAGE_ALT = "Bora Bora Bound — luxury travel planning with Zac Sweet-Wright."

# --- Structured data --------------------------------------------------------
# Note: Google ignores self-serving Review markup on an Organization for rich
# results, so this will not produce star ratings. It is still worth including —
# it helps Google resolve the business as an entity, which supports the Google
# Business Profile work. No aggregateRating: there is no verifiable rating data.

AGENCY_ID = f"{SITE_URL}/#agency"
PERSON_ID = f"{SITE_URL}/#zac"


def agency_schema():
    return {
        "@type": "TravelAgency",
        "@id": AGENCY_ID,
        "name": "Bora Bora Bound",
        "legalName": "Bora Bora Bound, LLC",
        "url": f"{SITE_URL}/",
        "logo": f"{SITE_URL}/icon-512.png",
        "image": f"{SITE_URL}/og-image.png",
        "description": (
            "Bora Bora Bound is a luxury travel advisory led by Zac Sweet-Wright, "
            "planning honeymoons, destination weddings, cruises, and all-inclusive "
            "resort escapes for travelers across the United States."
        ),
        "founder": {"@id": PERSON_ID},
        "areaServed": {"@type": "Country", "name": "United States"},
        "priceRange": "$$-$$$$",
        "sameAs": SOCIAL_PROFILES,
        "knowsAbout": [
            "Honeymoon planning",
            "Destination weddings",
            "Cruise planning",
            "All-inclusive resorts",
            "LGBTQ+ travel",
        ],
        # Seller of Travel registrations — the compliance detail the audit
        # singled out as a genuine trust signal.
        "identifier": [
            {"@type": "PropertyValue", "name": "California Seller of Travel", "value": "CST #2063964-50"},
            {"@type": "PropertyValue", "name": "Florida Seller of Travel", "value": "ST17873"},
            {"@type": "PropertyValue", "name": "Washington Seller of Travel", "value": "602232785"},
        ],
    }


def person_schema():
    return {
        "@type": "Person",
        "@id": PERSON_ID,
        "name": "Zac Sweet-Wright",
        "jobTitle": "Travel Advisor & Travel Designer",
        "worksFor": {"@id": AGENCY_ID},
        "url": f"{SITE_URL}/about.html",
        "description": (
            "Certified Cruise Counsellor, Signature Travel Expert, and full-time RVer "
            "who plans honeymoons, destination weddings, and cruises."
        ),
        "knowsAbout": [
            "Cruise planning",
            "Honeymoon planning",
            "Destination weddings",
            "All-inclusive resorts",
            "Disney destinations",
        ],
        "memberOf": [
            {"@type": "Organization", "name": "National LGBT Chamber of Commerce (NGLCC)"},
            {"@type": "Organization", "name": "Cruise Lines International Association (CLIA)"},
            {"@type": "Organization", "name": "American Society of Travel Advisors (ASTA)"},
            {"@type": "Organization", "name": "Signature Travel Network"},
        ],
        "sameAs": SOCIAL_PROFILES,
    }


REVIEWS = [
    ("Michael C.", "Incredibly easy and stress-free."),
    ("Steven", "Personalized our trip by listening to our wants and needs."),
    ("Becky G.", "Helped to turn a dream into reality."),
]


def reviews_schema():
    # TODO (Phase 3): add datePublished and the destination to each review once
    # attributed reviews are collected.
    return [
        {
            "@type": "Review",
            "itemReviewed": {"@id": AGENCY_ID},
            "author": {"@type": "Person", "name": author},
            "reviewRating": {"@type": "Rating", "ratingValue": 5, "bestRating": 5},
            "reviewBody": body,
        }
        for author, body in REVIEWS
    ]


def breadcrumb(name, path):
    return {
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{SITE_URL}/"},
            {"@type": "ListItem", "position": 2, "name": name, "item": f"{SITE_URL}/{path}"},
        ],
    }


# --- Page table -------------------------------------------------------------
# title / description copy follows the recommendations in the August 2026 audit.

PAGES = {
    "index.html": {
        "path": "",
        "title": "Honeymoon &amp; Cruise Travel Advisor | Bora Bora Bound",
        "og_title": "Honeymoon & Cruise Travel Advisor | Bora Bora Bound",
        "description": (
            "Zac Sweet-Wright plans honeymoons, destination weddings, and cruises with "
            "insider access and none of the guesswork. Book a free consultation today."
        ),
        "sitemap": ("1.0", "monthly"),
        "schema": lambda: [agency_schema(), person_schema()],
    },
    "about.html": {
        "path": "about.html",
        "title": "Meet Zac Sweet-Wright, Travel Advisor | Bora Bora Bound",
        "description": (
            "Certified Cruise Counsellor, Signature Travel Expert, and full-time RVer. "
            "Meet the advisor behind Bora Bora Bound and see how he plans your trip."
        ),
        "sitemap": ("0.9", "monthly"),
        "schema": lambda: [person_schema(), breadcrumb("About", "about.html")],
    },
    "promise.html": {
        "path": "promise.html",
        "title": "The BOUND Promise: How I Work | Bora Bora Bound",
        "description": (
            "Bespoke itineraries, exclusive perks through Signature Travel Network, and a "
            "real person on call while you travel. Here's what you get when you book."
        ),
        "sitemap": ("0.8", "monthly"),
        "schema": lambda: [breadcrumb("The BOUND Promise", "promise.html")],
    },
    "testimonials.html": {
        "path": "testimonials.html",
        "title": "Client Reviews &amp; Testimonials | Bora Bora Bound",
        "og_title": "Client Reviews & Testimonials | Bora Bora Bound",
        "description": (
            "Read what travelers say about planning cruises, honeymoons, and destination "
            "weddings with Zac Sweet-Wright at Bora Bora Bound."
        ),
        "sitemap": ("0.8", "monthly"),
        "schema": lambda: reviews_schema() + [breadcrumb("Reviews", "testimonials.html")],
    },
    "refer.html": {
        "path": "refer.html",
        "title": "Refer a Friend, Earn $100 | Bora Bora Bound",
        "description": (
            "Earn $100 cash every time a friend books, plus an exclusive experience after "
            "three referrals. Your friends get perks too. Here's how it works."
        ),
        "sitemap": ("0.6", "yearly"),
        "schema": lambda: [breadcrumb("Refer & Earn", "refer.html")],
    },
    "terms.html": {
        "path": "terms.html",
        "title": "Terms &amp; Conditions | Bora Bora Bound",
        "og_title": "Terms & Conditions | Bora Bora Bound",
        "description": (
            "Terms & Conditions for Bora Bora Bound, LLC — our role, client "
            "responsibilities, payments, cancellations, liability, and Seller of Travel "
            "disclosures."
        ),
        # Deliberately kept out of the index, but "follow" so link equity still flows.
        "robots": "noindex, follow",
        "sitemap": None,
        "schema": lambda: [],
    },
    "404.html": {
        "path": "404.html",
        "title": "Page Not Found | Bora Bora Bound",
        "description": "This page has drifted off course. Head back to Bora Bora Bound to keep planning your trip.",
        "robots": "noindex, follow",
        "sitemap": None,
        "schema": lambda: [],
        "no_canonical": True,
    },
}


def json_ld(objects):
    """Render a JSON-LD block. Hand-rolled so the output diffs cleanly."""
    if not objects:
        return ""
    import json

    graph = {"@context": "https://schema.org", "@graph": objects}
    body = json.dumps(graph, indent=2, ensure_ascii=False)
    body = "\n".join("  " + line for line in body.splitlines())
    return '  <script type="application/ld+json">\n' + body + "\n  </script>\n"


def head_block(filename, cfg):
    url = f"{SITE_URL}/{cfg['path']}"
    og_title = cfg.get("og_title", cfg["title"])
    robots = cfg.get("robots", "index, follow")
    if STAGING:
        # Staging must never be indexed regardless of the per-page setting.
        robots = "noindex, nofollow"

    out = []
    out.append(f"  <title>{cfg['title']}</title>\n")
    out.append(f"  <meta name=\"description\" content=\"{cfg['description']}\" />\n")
    out.append(f'  <meta name="robots" content="{robots}" />\n')
    if not cfg.get("no_canonical"):
        out.append(f'  <link rel="canonical" href="{url}" />\n')
    out.append('  <meta name="theme-color" content="#0d3a42">\n')
    out.append('  <link rel="icon" href="/favicon.ico" sizes="any">\n')
    out.append('  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">\n')
    out.append('  <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">\n')
    out.append('  <link rel="apple-touch-icon" href="/apple-touch-icon.png">\n')
    out.append('  <link rel="manifest" href="/site.webmanifest">\n')
    out.append('  <meta property="og:type" content="website">\n')
    out.append('  <meta property="og:site_name" content="Bora Bora Bound">\n')
    out.append('  <meta property="og:locale" content="en_US">\n')
    out.append(f'  <meta property="og:url" content="{url}">\n')
    out.append(f'  <meta property="og:title" content="{og_title}">\n')
    out.append(f"  <meta property=\"og:description\" content=\"{cfg['description']}\">\n")
    out.append(f'  <meta property="og:image" content="{SITE_URL}/og-image.png">\n')
    out.append('  <meta property="og:image:width" content="1200">\n')
    out.append('  <meta property="og:image:height" content="630">\n')
    out.append(f'  <meta property="og:image:alt" content="{OG_IMAGE_ALT}">\n')
    out.append('  <meta name="twitter:card" content="summary_large_image">\n')
    out.append(f'  <meta name="twitter:title" content="{og_title}">\n')
    out.append(f"  <meta name=\"twitter:description\" content=\"{cfg['description']}\">\n")
    out.append(f'  <meta name="twitter:image" content="{SITE_URL}/og-image.png">\n')
    out.append(f'  <meta name="twitter:image:alt" content="{OG_IMAGE_ALT}">\n')
    out.append(json_ld(cfg["schema"]()))
    return "".join(out)


HEAD_RE = re.compile(
    r'(?P<before><meta name="viewport"[^>]*>\n)'
    r".*?"
    r'(?P<after>  <link rel="preconnect" href="https://fonts\.googleapis\.com")',
    re.DOTALL,
)


def main():
    for filename, cfg in PAGES.items():
        target = ROOT / filename
        original = target.read_text(encoding="utf-8")
        replacement = head_block(filename, cfg)

        new, count = HEAD_RE.subn(
            lambda m: m.group("before") + replacement + m.group("after"),
            original,
            count=1,
        )
        if count != 1:
            raise SystemExit(f"{filename}: could not locate the head block to replace")

        if new != original:
            target.write_text(new, encoding="utf-8")
            print(f"updated  {filename}")
        else:
            print(f"no change {filename}")

    write_sitemap()
    write_robots()
    write_redirects()


def write_sitemap():
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for cfg in PAGES.values():
        if not cfg.get("sitemap"):
            continue
        priority, freq = cfg["sitemap"]
        lines.append("  <url>")
        lines.append(f"    <loc>{SITE_URL}/{cfg['path']}</loc>")
        lines.append(f"    <changefreq>{freq}</changefreq>")
        lines.append(f"    <priority>{priority}</priority>")
        lines.append("  </url>")
    lines.append("</urlset>")
    (ROOT / "sitemap.xml").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("updated  sitemap.xml")


def write_robots():
    if STAGING:
        body = (
            "# Staging site — must not be indexed.\n"
            "# tools/set-domain.sh replaces this with the production robots.txt at cutover.\n"
            "User-agent: *\n"
            "Disallow: /\n"
        )
    else:
        body = (
            "User-agent: *\n"
            "Allow: /\n"
            "\n"
            f"Sitemap: {SITE_URL}/sitemap.xml\n"
        )
    (ROOT / "robots.txt").write_text(body, encoding="utf-8")
    print("updated  robots.txt")


# --- Legacy URL redirects ---------------------------------------------------
# The old Travefy site served extensionless URLs; this repo serves .html files.
# GitHub Pages cannot issue server-side 301s, so each old path gets a directory
# with an index.html that canonicals + meta-refreshes to the real page. Google
# treats an instant meta refresh as a permanent redirect and passes link equity
# through the canonical.
#
# These stubs are correct whether or not GitHub Pages resolves /about to
# about.html on its own — worst case a legacy visitor takes one extra hop.

LEGACY_REDIRECTS = {
    "about": "about.html",
    "promise": "promise.html",
    "ourpromise": "promise.html",   # audit item 8: indexed but dead since the rename
    "testimonials": "testimonials.html",
    "refer": "refer.html",
}

REDIRECT_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Redirecting to {title} — Bora Bora Bound</title>
  <link rel="canonical" href="{site}/{target}" />
  <meta http-equiv="refresh" content="0; url=/{target}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body>
  <p>This page has moved. <a href="/{target}">Continue to {title}</a>.</p>
  <script>window.location.replace("/{target}");</script>
</body>
</html>
"""


def write_redirects():
    for old_path, target in LEGACY_REDIRECTS.items():
        title = PAGES[target]["title"].split(" | ")[0].split(" — ")[0]
        directory = ROOT / old_path
        directory.mkdir(exist_ok=True)
        (directory / "index.html").write_text(
            REDIRECT_TEMPLATE.format(site=SITE_URL, target=target, title=title),
            encoding="utf-8",
        )
        print(f"updated  {old_path}/index.html -> /{target}")


if __name__ == "__main__":
    main()
