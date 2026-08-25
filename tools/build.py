#!/usr/bin/env python3
"""Bora Bora Bound — static site generator.

The site has no build step in the browser sense: this script assembles the
committed HTML that GitHub Pages serves. Content lives in pages/*.html as bare
fragments; everything shared — head metadata, nav, footer, analytics, JSON-LD —
is generated here so it cannot drift across fifteen files.

    python3 tools/build.py

Never hand-edit the generated *.html in the repo root. Edit pages/*.html for
content, or the tables in this file for anything shared.

To move between the staging subdomain and production, use tools/set-domain.sh.
"""

import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGES_DIR = ROOT / "pages"

# =============================================================================
# CONFIG
# =============================================================================

SITE_URL = "https://test.boraborabound.com"
STAGING = True

BUSINESS_NAME = "Bora Bora Bound"
LEGAL_NAME = "Bora Bora Bound, LLC"
ADVISOR = "Zac Sweet-Wright"

EMAIL = "hello@boraborabound.com"
PHONE_DISPLAY = "(656) 201-5022"
PHONE_E164 = "+16562015022"

FACEBOOK = "https://www.facebook.com/boraborabound.go"
INSTAGRAM = "https://www.instagram.com/boraborabound.go"
LINKEDIN = "https://www.linkedin.com/company/boraboraboundgo"
SOCIAL_PROFILES = [FACEBOOK, INSTAGRAM, LINKEDIN]

# --- Tern ---------------------------------------------------------------
# The trip-request form is the one confirmed Tern URL. The scheduling and
# referral endpoints below fall back to it so no CTA is ever broken; replace
# them with the real Tern URLs when they exist.
TERN_TRIP_FORM = "https://app.tern.travel/public/forms/YSXCa_LTnTtBehDg0Kty1Q/responses/new"
TERN_SCHEDULING = TERN_TRIP_FORM   # TODO: swap for the Tern consultation booking link
TERN_REFERRAL_FORM = TERN_TRIP_FORM  # TODO: swap for a dedicated Tern referral form

# --- Imagery ------------------------------------------------------------
# Every photo the site renders, keyed by the SLOT it fills rather than by what
# the photo happens to show. Fragments reference these as {{IMG_CARD_HONEYMOON}},
# so swapping a placeholder for one of Zac's own shots is a one-line edit here
# instead of a hunt through fifteen files — and a slot name never goes stale
# when the photo behind it changes. See ASSETS.md for the filenames to drop in.
#
# The Unsplash entries are placeholders. They are hotlinks, so they rot without
# warning: IMG_CARD_HONEYMOON pointed at a photo that had been withdrawn, and
# three places on the site rendered its alt text instead. Run tools/audit from
# a network that can reach images.unsplash.com to catch the next one.

def unsplash(photo_id, w=800):
    return f"https://images.unsplash.com/photo-{photo_id}?auto=format&fit=crop&w={w}&q=80"


# Each slot carries its URL and its alt text together. Alt that lives in the
# fragment goes stale the moment the photo behind it changes — swapping the
# withdrawn honeymoon photo for one from the repo left two cards describing
# champagne glasses over a picture of a cove. Keeping the pair here means a
# swap is still one edit, and the description cannot drift from the picture.
# alt=None marks a slot used only as a CSS background, which has no alt.
IMAGES = {
    # Service cards -- home and ways-to-travel
    "IMG_CARD_CRUISES": (
        unsplash("1548574505-5e239809ee19"),
        "A cruise ship at anchor in calm turquoise water beside a green island"),
    "IMG_CARD_ALL_INCLUSIVE": (
        unsplash("1571003123894-1f0594d2b5d9"),
        "Palm-shaded infinity pool at a Caribbean all-inclusive resort at golden hour"),
    "IMG_CARD_SMALL_GROUP": (
        unsplash("1533105079780-92b9be482077"),
        "A small group of travelers walking a narrow cobbled street in a hilltop village"),
    # Was unsplash("1519741497674-611481863552") -- withdrawn upstream, so the
    # card rendered its alt text. Pointed at a photo in the repo, which cannot
    # rot. Swap for a real honeymoon shot when there is one, and rewrite the alt
    # in the same edit.
    "IMG_CARD_HONEYMOON": (
        "/assets/img/bermuda.jpg",
        "A sheltered turquoise cove in Bermuda, photographed by Zac Sweet-Wright"),
    # Was unsplash("1561612217-e5dbc7b4b1ab") -- withdrawn upstream, found by
    # tools/audit running in CI where the host actually resolves. Pointed at a
    # photo in the repo so the card is not blank, but this is the third use of
    # that coastline shot and it says nothing about LGBTQ+ travel. It is a
    # stopgap: replacing it is the most urgent item in ASSETS.md after
    # IMG_CARD_HONEYMOON. The alt text describes the photo that is actually
    # there, not the one that used to be.
    "IMG_CARD_LGBTQ": (
        "/assets/img/stkitts-coastline.jpg",
        "Caribbean coastline seen from a hillside above the water"),

    # Full-bleed page and hero backgrounds -- drawn in CSS, so no alt text
    "IMG_HERO_HOME":          (unsplash("1505228395891-9a51e7e86bf6", 1920), None),
    "IMG_HERO_404":           (unsplash("1473116763249-2faaef81ccda", 1920), None),
    "IMG_PAGEHERO_GENERIC":   (unsplash("1468413253725-0d5181091126", 1920), None),
    "IMG_PAGEHERO_ABOUT":     (unsplash("1488646953014-85cb44e25828", 1920), None),
    "IMG_PAGEHERO_CONTACT":   (unsplash("1507525428034-b723cf961d3e", 1920), None),
    "IMG_PAGEHERO_REVIEWS":   (unsplash("1559599189-fe84dea4eb79", 1920), None),
    "IMG_PAGEHERO_REFER":     (unsplash("1544644181-1484b3fdfc62", 1920), None),
    "IMG_PAGEHERO_HONEYMOON": ("/assets/img/bermuda.jpg", None),  # same withdrawn photo

    # Repo assets
    "IMG_ZAC_HEADSHOT": (
        "/assets/img/zac-headshot.png",
        f"{ADVISOR}, founder and travel advisor at {BUSINESS_NAME}"),
    "IMG_COASTLINE": (
        "/assets/img/stkitts-coastline.jpg",
        "Caribbean coastline seen from a hillside above the water"),
    "IMG_BERMUDA": (
        "/assets/img/bermuda.jpg",
        "Turquoise water and a sheltered cove in Bermuda"),
}


def image_url(slot):
    """The URL behind an IMAGES slot key."""
    if slot not in IMAGES:
        raise SystemExit(f"unknown image slot {slot}")
    return IMAGES[slot][0]


def absolute_image_url(slot):
    """Same, but absolute — structured data needs a full URL.

    A slot may hold either a repo-relative path or an already-absolute remote
    one, so prefixing SITE_URL unconditionally would emit a malformed URL the
    moment a post pointed at a hotlinked photo.
    """
    url = image_url(slot)
    return url if url.startswith(("http://", "https://")) else f"{SITE_URL}{url}"


def image_tokens():
    """{{IMG_X}} is the URL, {{IMG_X_ALT}} the description that goes with it."""
    out = {}
    for slot, (url, alt) in IMAGES.items():
        out[slot] = url
        if alt is not None:
            out[f"{slot}_ALT"] = attr_esc(alt)
    return out

# --- Analytics ----------------------------------------------------------
# TODO: copy these two values off the live Travefy site (view source, or read
# them from the GA4 and Meta Events Manager admin panels). Reusing the existing
# IDs keeps historical data continuous through the migration. Both tags stay
# inert while these are None, so the site is safe to ship without them.
GA4_ID = None          # e.g. "G-XXXXXXXXXX"
META_PIXEL_ID = None   # e.g. "123456789012345"

LICENSES = [
    ("California Seller of Travel", "CST #2063964-50"),
    ("Florida Seller of Travel", "ST17873"),
    ("Washington Seller of Travel", "602232785"),
]

OG_IMAGE_ALT = f"{BUSINESS_NAME} — cruises, all-inclusive resorts, and small group tours planned by {ADVISOR}."

AGENCY_ID = f"{SITE_URL}/#agency"
PERSON_ID = f"{SITE_URL}/#zac"

# =============================================================================
# NAVIGATION
# =============================================================================
# Order follows the audit's recommendation: the conversion action gets the
# pinned right-hand slot, and "Refer" no longer occupies it. "Ways to Travel"
# rather than "Destinations" because the offer is now organised by how you
# travel — cruise, all-inclusive, small group — not by where you go.

NAV = [
    ("Home", "index.html"),
    ("Ways to Travel", "ways-to-travel.html"),
    ("How I Work", "how-i-work.html"),
    ("About", "about.html"),
    ("Reviews", "reviews.html"),
    ("Refer", "refer.html"),
]

SERVICES = [
    ("cruises.html", "Cruises", "Ocean, river, and expedition sailings matched to how you actually like to travel."),
    ("all-inclusive-resorts.html", "All-Inclusive Resorts", "One price, no math, nothing to decide once you land."),
    ("small-group-tours.html", "Small Group Tours", "Guided itineraries capped small, with the logistics handled."),
    ("honeymoons.html", "Honeymoons & Romance", "The trip you will talk about for thirty years, booked without the stress."),
    ("lgbtq-travel.html", "LGBTQ+ Travel", "Ships, resorts, and destinations I can vouch for as genuinely welcoming."),
]

# =============================================================================
# JOURNAL POSTS
# =============================================================================
# Adding a post: drop a fragment in pages/journal/<slug>.html, add a row here,
# rebuild. The index listing, BlogPosting schema, sitemap entry and prev/next
# links are all generated from this table.
#
# `date` is ISO. These were written for launch, so they all carry the launch
# date — if the cutover slips, re-date them rather than shipping stale ones.

POSTS = [
    dict(
        slug="virgin-voyages-vs-royal-caribbean",
        title="Virgin Voyages vs. Royal Caribbean for a first cruise",
        description=(
            "Two very different answers to the same question. Which one you'll prefer "
            "comes down almost entirely to whether you want children on the ship."
        ),
        excerpt=(
            "Adults-only and tips-included, or the biggest ships afloat with a waterpark "
            "on the back. The honest comparison, and the one question that decides it."
        ),
        date="2026-08-11",
        minutes=6,
        image="IMG_COASTLINE",
    ),
    dict(
        slug="what-all-inclusive-actually-includes",
        title="What \u201call-inclusive\u201d actually includes",
        description=(
            "A category-by-category walk through what's covered at an all-inclusive resort, "
            "what quietly isn't, and where the gap between the brochure and the bill opens up."
        ),
        excerpt=(
            "Meals and drinks, obviously. But premium spirits, the good restaurants, the spa, "
            "the transfers and the wifi are where it gets interesting."
        ),
        date="2026-08-11",
        minutes=6,
        image="IMG_BERMUDA",
    ),
    dict(
        slug="alaska-may-july-september",
        title="Alaska: May vs. July vs. September",
        description=(
            "Three very different vacations sold under one name, at three very different "
            "prices. What actually changes between the shoulder months and peak season."
        ),
        excerpt=(
            "Drier and cheaper in May, warmest and busiest in July, gold and quiet in "
            "September. Picking the month matters more than picking the ship."
        ),
        date="2026-08-11",
        minutes=5,
        image="IMG_COASTLINE",
    ),
    dict(
        slug="reading-a-small-group-tour-inclusion-list",
        title="How to read a small group tour's inclusion list",
        description=(
            "Where the optional excursions are the actual highlights, the headline price is "
            "fiction. Eight things to check on an itinerary before you book it."
        ),
        excerpt=(
            "\u201cSmall group\u201d is unregulated, \u201cfirst-class hotel\u201d means nothing, and the "
            "single supplement is where the real money hides."
        ),
        date="2026-08-11",
        minutes=6,
        image="IMG_BERMUDA",
    ),
    dict(
        slug="cabin-categories-worth-paying-for",
        title="The cabin categories worth paying for \u2014 and the ones that aren't",
        description=(
            "When a balcony earns its money on a cruise and when it's a waste, why deck "
            "placement beats category, and what suite perks are actually worth having."
        ),
        excerpt=(
            "An honest accounting \u2014 including the times the cheaper cabin was the better "
            "call, and the upgrade that matters more than any of them."
        ),
        date="2026-08-11",
        minutes=6,
        image="IMG_COASTLINE",
    ),
]

MONTHS = ("January","February","March","April","May","June","July","August",
          "September","October","November","December")


def pretty_date(iso):
    y, m, d = iso.split("-")
    return f"{int(d)} {MONTHS[int(m) - 1]} {y}"


def post_url(post):
    return f"{SITE_URL}/journal/{post['slug']}.html"


def blogposting_schema(post):
    return {
        "@type": "BlogPosting",
        "@id": post_url(post) + "#post",
        "headline": post["title"],
        "description": post["description"],
        "datePublished": post["date"],
        "dateModified": post["date"],
        "author": {"@id": PERSON_ID},
        "publisher": {"@id": AGENCY_ID},
        "mainEntityOfPage": post_url(post),
        "image": absolute_image_url(post["image"]),
        "isPartOf": {"@id": f"{SITE_URL}/journal.html#blog"},
    }


def blog_schema():
    return {
        "@type": "Blog",
        "@id": f"{SITE_URL}/journal.html#blog",
        "name": "The Bora Bora Bound Journal",
        "url": f"{SITE_URL}/journal.html",
        "publisher": {"@id": AGENCY_ID},
        "blogPost": [blogposting_schema(p) for p in POSTS],
    }


def render_post_list():
    """The card list on journal.html, generated from POSTS."""
    out = []
    for post in POSTS:
        out.append(
            f'        <li class="post-card">\n'
            f'          <a class="post-card__media" href="/journal/{post["slug"]}.html" tabindex="-1" aria-hidden="true">'
            f'<img src="{image_url(post["image"])}" alt="" width="1400" height="788" loading="lazy" /></a>\n'
            f'          <div class="post-card__body">\n'
            f'            <p class="post-card__meta"><time datetime="{post["date"]}">'
            f'{pretty_date(post["date"])}</time> &middot; {post["minutes"]} min read</p>\n'
            f'            <h3><a href="/journal/{post["slug"]}.html">{post["title"]}</a></h3>\n'
            f'            <p>{post["excerpt"]}</p>\n'
            f'            <span class="arrow">Read it</span>\n'
            f'          </div>\n'
            f'        </li>\n'
        )
    return "".join(out)


# =============================================================================
# PAGE TABLE
# =============================================================================

BRAND_MARK = (
    '<span class="mark" aria-hidden="true">'
    '<img src="/assets/img/logo-mark.png" alt="" width="27" height="42" /></span>'
)
BRAND_MARK_WHITE = (
    '<span class="mark" aria-hidden="true">'
    '<img src="/assets/img/logo-mark-white.png" alt="" width="27" height="42" /></span>'
)


def esc(text):
    """Escape for HTML text content."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def attr_esc(text):
    """Escape for an HTML attribute value.

    esc() is not enough here: it leaves quotes alone, and alt text goes straight
    into alt="...". One ship name in quotes would close the attribute early and
    silently break the markup.
    """
    return esc(text).replace('"', "&quot;").replace("'", "&#39;")


PAGES = {
    "index.html": dict(
        path="",
        title="Cruise, All-Inclusive & Small Group Travel Advisor | Bora Bora Bound",
        description=(
            "Zac Sweet-Wright plans cruises, all-inclusive resorts, and small group tours — "
            "with perks you cannot book yourself and no planning fee on most trips. "
            "Book a free consultation."
        ),
        sitemap=("1.0", "monthly"),
        hero=True,
        schema=lambda: [agency_schema(), person_schema(), website_schema()],
    ),
    "ways-to-travel.html": dict(
        path="ways-to-travel.html",
        title="Ways to Travel: Cruises, All-Inclusives & Small Group Tours | Bora Bora Bound",
        description=(
            "Three ways I plan travel — cruise, all-inclusive resort, and small group tour — "
            "plus honeymoons and LGBTQ+ travel. Find the one that fits how you like to travel."
        ),
        sitemap=("0.9", "monthly"),
        schema=lambda: [breadcrumb("Ways to Travel", "ways-to-travel.html"), services_list_schema()],
    ),
    "cruises.html": dict(
        path="cruises.html",
        title="Cruise Planning with a Certified Cruise Counsellor | Bora Bora Bound",
        description=(
            "Ocean, river, and expedition cruise planning from a CLIA Certified Cruise "
            "Counsellor certified with Virgin Voyages, Royal Caribbean, and Carnival. "
            "Free consultation."
        ),
        sitemap=("0.9", "monthly"),
        schema=lambda: [breadcrumb("Cruises", "cruises.html"), service_schema("Cruise Planning", "cruises.html")],
    ),
    "all-inclusive-resorts.html": dict(
        path="all-inclusive-resorts.html",
        title="All-Inclusive Resort Planning | Bora Bora Bound",
        description=(
            "All-inclusive resort planning from a certified Sandals and Hyatt Inclusive "
            "Collection specialist. Room categories, resort fit, and perks — handled. "
            "Free consultation."
        ),
        sitemap=("0.9", "monthly"),
        schema=lambda: [breadcrumb("All-Inclusive Resorts", "all-inclusive-resorts.html"),
                        service_schema("All-Inclusive Resort Planning", "all-inclusive-resorts.html")],
    ),
    "small-group-tours.html": dict(
        path="small-group-tours.html",
        title="Small Group Tour Planning | Bora Bora Bound",
        description=(
            "Small group tours with the guides, transfers, and logistics already handled — "
            "matched to your pace and travel style by a Signature Travel Expert. "
            "Free consultation."
        ),
        sitemap=("0.9", "monthly"),
        schema=lambda: [breadcrumb("Small Group Tours", "small-group-tours.html"),
                        service_schema("Small Group Tour Planning", "small-group-tours.html")],
    ),
    "honeymoons.html": dict(
        path="honeymoons.html",
        title="Honeymoon Planning: Cruises & All-Inclusives | Bora Bora Bound",
        description=(
            "Honeymoons built on cruises and all-inclusive resorts, with room upgrades and "
            "romance perks arranged before you arrive. Planned by Zac Sweet-Wright."
        ),
        sitemap=("0.8", "monthly"),
        schema=lambda: [breadcrumb("Honeymoons & Romance", "honeymoons.html"),
                        service_schema("Honeymoon Planning", "honeymoons.html")],
    ),
    "lgbtq-travel.html": dict(
        path="lgbtq-travel.html",
        title="LGBTQ+ Travel Planning, NGLCC Certified | Bora Bora Bound",
        description=(
            "LGBTQ+ travel planned by an NGLCC-certified LGBT Business Enterprise. Ships, "
            "resorts, and destinations I can vouch for as genuinely welcoming — not just tolerant."
        ),
        sitemap=("0.8", "monthly"),
        schema=lambda: [breadcrumb("LGBTQ+ Travel", "lgbtq-travel.html"),
                        service_schema("LGBTQ+ Travel Planning", "lgbtq-travel.html")],
    ),
    "how-i-work.html": dict(
        path="how-i-work.html",
        title="How I Work: Process, Fees & FAQ | Bora Bora Bound",
        description=(
            "What happens after you get in touch, how I am paid, whether there is a planning "
            "fee, and what support looks like while you travel. The BOUND Promise, in plain terms."
        ),
        sitemap=("0.9", "monthly"),
        schema=lambda: [breadcrumb("How I Work", "how-i-work.html"), faq_schema()],
    ),
    "about.html": dict(
        path="about.html",
        title=f"Meet {ADVISOR}, Travel Advisor | Bora Bora Bound",
        description=(
            "Certified Cruise Counsellor, Signature Travel Expert, and full-time RVer. Meet the "
            "advisor behind Bora Bora Bound and what each credential actually gets you."
        ),
        sitemap=("0.8", "monthly"),
        schema=lambda: [person_schema(), breadcrumb("About", "about.html")],
    ),
    "reviews.html": dict(
        path="reviews.html",
        title="Client Reviews &amp; Testimonials | Bora Bora Bound",
        og_title="Client Reviews & Testimonials | Bora Bora Bound",
        description=(
            "Read what travelers say about planning cruises, all-inclusives, and small group "
            f"tours with {ADVISOR} at Bora Bora Bound."
        ),
        sitemap=("0.7", "monthly"),
        schema=lambda: reviews_schema() + [breadcrumb("Reviews", "reviews.html")],
    ),
    "contact.html": dict(
        path="contact.html",
        title="Contact Zac | Bora Bora Bound",
        description=(
            f"Email {EMAIL}, call or text {PHONE_DISPLAY}, book a free consultation, or send "
            "a trip request. However you want to start, here is how to reach me."
        ),
        sitemap=("0.9", "monthly"),
        schema=lambda: [contact_page_schema(), breadcrumb("Contact", "contact.html")],
    ),
    "refer.html": dict(
        path="refer.html",
        title="Refer a Friend, Earn $100 | Bora Bora Bound",
        description=(
            "Earn $100 cash every time a friend books, plus an exclusive experience after three "
            "referrals. Your friends get perks too. Here's how it works."
        ),
        sitemap=("0.6", "yearly"),
        schema=lambda: [breadcrumb("Refer & Earn", "refer.html")],
    ),
    "journal.html": dict(
        path="journal.html",
        title="Journal: Cruise & Resort Notes from the Road | Bora Bora Bound",
        description=(
            "Notes from the road — ship reviews, resort walkthroughs, and honest comparisons "
            "written from places Zac and Chad have actually been."
        ),
        sitemap=("0.6", "weekly"),
        schema=lambda: [breadcrumb("Journal", "journal.html"), blog_schema()],
    ),
    "terms.html": dict(
        path="terms.html",
        title="Terms &amp; Conditions | Bora Bora Bound",
        og_title="Terms & Conditions | Bora Bora Bound",
        description=(
            "Terms & Conditions for Bora Bora Bound, LLC — our role, client responsibilities, "
            "payments, cancellations, liability, and Seller of Travel disclosures."
        ),
        robots="noindex, follow",
        sitemap=None,
        schema=lambda: [],
    ),
    "404.html": dict(
        path="404.html",
        title="Page Not Found | Bora Bora Bound",
        description="This page has drifted off course. Head back to Bora Bora Bound to keep planning your trip.",
        robots="noindex, follow",
        sitemap=None,
        no_canonical=True,
        hero=True,
        schema=lambda: [],
    ),
}

# Post pages are registered from POSTS so a new row is the only edit needed.
for _post in POSTS:
    PAGES[f"journal/{_post['slug']}.html"] = dict(
        path=f"journal/{_post['slug']}.html",
        title=f"{_post['title']} | Bora Bora Bound",
        description=_post["description"],
        sitemap=("0.5", "yearly"),
        post=_post,
        schema=(lambda pst: (lambda: [blogposting_schema(pst),
                                      breadcrumb(pst["title"], f"journal/{pst['slug']}.html")]))(_post),
    )

# =============================================================================
# STRUCTURED DATA
# =============================================================================


def agency_schema():
    return {
        "@type": "TravelAgency",
        "@id": AGENCY_ID,
        "name": BUSINESS_NAME,
        "legalName": LEGAL_NAME,
        "url": f"{SITE_URL}/",
        "logo": f"{SITE_URL}/icon-512.png",
        "image": f"{SITE_URL}/og-image.png",
        "email": EMAIL,
        "telephone": PHONE_E164,
        "description": (
            f"{BUSINESS_NAME} is a travel advisory led by {ADVISOR}, specialising in cruises, "
            "all-inclusive resorts, and small group tours for travelers across the United States."
        ),
        "founder": {"@id": PERSON_ID},
        "areaServed": {"@type": "Country", "name": "United States"},
        "priceRange": "$$-$$$$",
        "sameAs": SOCIAL_PROFILES,
        "knowsAbout": [
            "Cruise planning", "All-inclusive resorts", "Small group tours",
            "Honeymoon planning", "LGBTQ+ travel",
        ],
        "identifier": [
            {"@type": "PropertyValue", "name": name, "value": value} for name, value in LICENSES
        ],
        "contactPoint": {
            "@type": "ContactPoint",
            "contactType": "Customer Service",
            "email": EMAIL,
            "telephone": PHONE_E164,
            "areaServed": "US",
            "availableLanguage": "English",
        },
    }


def person_schema():
    return {
        "@type": "Person",
        "@id": PERSON_ID,
        "name": ADVISOR,
        "jobTitle": "Travel Advisor",
        "worksFor": {"@id": AGENCY_ID},
        "url": f"{SITE_URL}/about.html",
        "email": EMAIL,
        "telephone": PHONE_E164,
        "description": (
            "Certified Cruise Counsellor, Signature Travel Expert, and full-time RVer "
            "specialising in cruises, all-inclusive resorts, and small group tours."
        ),
        "knowsAbout": [
            "Cruise planning", "All-inclusive resorts", "Small group tours",
            "Honeymoon planning", "LGBTQ+ travel", "Disney destinations",
        ],
        "memberOf": [
            {"@type": "Organization", "name": "National LGBT Chamber of Commerce (NGLCC)"},
            {"@type": "Organization", "name": "Cruise Lines International Association (CLIA)"},
            {"@type": "Organization", "name": "American Society of Travel Advisors (ASTA)"},
            {"@type": "Organization", "name": "Signature Travel Network"},
        ],
        "sameAs": SOCIAL_PROFILES,
    }


def website_schema():
    return {"@type": "WebSite", "@id": f"{SITE_URL}/#website",
            "url": f"{SITE_URL}/", "name": BUSINESS_NAME, "publisher": {"@id": AGENCY_ID}}


def contact_page_schema():
    return {"@type": "ContactPage", "@id": f"{SITE_URL}/contact.html#page",
            "url": f"{SITE_URL}/contact.html", "name": "Contact Bora Bora Bound",
            "about": {"@id": AGENCY_ID}}


def service_schema(name, path):
    return {
        "@type": "Service", "name": name, "serviceType": name,
        "provider": {"@id": AGENCY_ID},
        "areaServed": {"@type": "Country", "name": "United States"},
        "url": f"{SITE_URL}/{path}",
    }


def services_list_schema():
    return {
        "@type": "ItemList",
        "itemListElement": [
            {"@type": "ListItem", "position": i, "name": name, "url": f"{SITE_URL}/{path}"}
            for i, (path, name, _) in enumerate(SERVICES, start=1)
        ],
    }


# FAQ content is parsed straight out of pages/how-i-work.html rather than kept
# in a parallel list here. Google requires FAQPage markup to match the text a
# visitor actually sees, and a hand-synced copy had already drifted — six
# entries in the schema against eight on the page, with reworded answers.


def _faqs_from_page():
    src = (PAGES_DIR / "how-i-work.html").read_text(encoding="utf-8")
    out = []
    for q, body in re.findall(
        r"<summary>(.*?)</summary>\s*<div class=\"faq__body\">(.*?)</div>", src, re.S
    ):
        answer = " ".join(
            re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", para)).strip()
            for para in re.findall(r"<p>(.*?)</p>", body, re.S)
        )
        answer = substitute(re.sub(r"\s+", " ", answer).strip(), "how-i-work FAQ")
        out.append((re.sub(r"<[^>]+>", "", q).strip(), answer))
    if not out:
        raise SystemExit("no FAQs parsed from pages/how-i-work.html")
    return out


def faq_schema():
    return {
        "@type": "FAQPage",
        "mainEntity": [
            {"@type": "Question", "name": q,
             "acceptedAnswer": {"@type": "Answer", "text": a}}
            for q, a in _faqs_from_page()
        ],
    }


REVIEWS = [
    ("Michael C.", "Incredibly easy and stress-free."),
    ("Steven", "Personalized our trip by listening to our wants and needs."),
    ("Becky G.", "Helped to turn a dream into reality."),
]


def reviews_schema():
    # TODO (blocked on Zac): add datePublished, the destination, and the ship or
    # resort to each review once attributed reviews are collected.
    return [
        {"@type": "Review", "itemReviewed": {"@id": AGENCY_ID},
         "author": {"@type": "Person", "name": author},
         "reviewRating": {"@type": "Rating", "ratingValue": 5, "bestRating": 5},
         "reviewBody": body}
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


# =============================================================================
# SHELL
# =============================================================================


def json_ld(objects):
    if not objects:
        return ""
    graph = {"@context": "https://schema.org", "@graph": objects}
    body = json.dumps(graph, indent=2, ensure_ascii=False)
    body = "\n".join("  " + line for line in body.splitlines())
    return '  <script type="application/ld+json">\n' + body + "\n  </script>\n"


def analytics_head():
    """GA4 + Meta Pixel loaders. Inert until the IDs are filled in."""
    if not GA4_ID and not META_PIXEL_ID:
        return (
            "  <!-- Analytics: set GA4_ID and META_PIXEL_ID in tools/build.py and rebuild.\n"
            "       Copy both from the live Travefy site so historical data stays continuous. -->\n"
        )
    out = []
    if GA4_ID:
        out.append(
            f'  <script async src="https://www.googletagmanager.com/gtag/js?id={GA4_ID}"></script>\n'
            "  <script>\n"
            "    window.dataLayer = window.dataLayer || [];\n"
            "    function gtag(){dataLayer.push(arguments);}\n"
            "    gtag('js', new Date());\n"
            f"    gtag('config', '{GA4_ID}');\n"
            "  </script>\n"
        )
    if META_PIXEL_ID:
        out.append(
            "  <script>\n"
            "    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?\n"
            "    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;\n"
            "    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;\n"
            "    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,\n"
            "    document,'script','https://connect.facebook.net/en_US/fbevents.js');\n"
            f"    fbq('init', '{META_PIXEL_ID}');\n"
            "    fbq('track', 'PageView');\n"
            "  </script>\n"
            f'  <noscript><img height="1" width="1" style="display:none" alt=""\n'
            f'    src="https://www.facebook.com/tr?id={META_PIXEL_ID}&ev=PageView&noscript=1"/></noscript>\n'
        )
    return "".join(out)


def head_block(cfg):
    url = f"{SITE_URL}/{cfg['path']}"
    og_title = cfg.get("og_title", cfg["title"])
    robots = "noindex, nofollow" if STAGING else cfg.get("robots", "index, follow")

    o = [f"  <title>{cfg['title']}</title>\n",
         f"  <meta name=\"description\" content=\"{cfg['description']}\" />\n",
         f'  <meta name="robots" content="{robots}" />\n']
    if not cfg.get("no_canonical"):
        o.append(f'  <link rel="canonical" href="{url}" />\n')
    o += ['  <meta name="theme-color" content="#4622a2">\n',
          '  <link rel="icon" href="/favicon.ico" sizes="any">\n',
          '  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">\n',
          '  <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">\n',
          '  <link rel="apple-touch-icon" href="/apple-touch-icon.png">\n',
          '  <link rel="manifest" href="/site.webmanifest">\n',
          '  <meta property="og:type" content="website">\n',
          f'  <meta property="og:site_name" content="{BUSINESS_NAME}">\n',
          '  <meta property="og:locale" content="en_US">\n',
          f'  <meta property="og:url" content="{url}">\n',
          f'  <meta property="og:title" content="{og_title}">\n',
          f"  <meta property=\"og:description\" content=\"{cfg['description']}\">\n",
          f'  <meta property="og:image" content="{SITE_URL}/og-image.png">\n',
          '  <meta property="og:image:width" content="1200">\n',
          '  <meta property="og:image:height" content="630">\n',
          f'  <meta property="og:image:alt" content="{OG_IMAGE_ALT}">\n',
          '  <meta name="twitter:card" content="summary_large_image">\n',
          f'  <meta name="twitter:title" content="{og_title}">\n',
          f"  <meta name=\"twitter:description\" content=\"{cfg['description']}\">\n",
          f'  <meta name="twitter:image" content="{SITE_URL}/og-image.png">\n',
          f'  <meta name="twitter:image:alt" content="{OG_IMAGE_ALT}">\n',
          '  <link rel="preconnect" href="https://fonts.googleapis.com" />\n',
          '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n',
          '  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue'
          '&family=Poppins:wght@300;400;500;600&family=Sacramento&display=swap" rel="stylesheet" />\n',
          '  <link rel="stylesheet" href="/assets/css/styles.css" />\n',
          json_ld(cfg["schema"]()),
          analytics_head()]
    return "".join(o)


def nav_block(current, hero=False):
    def link(label, href):
        active = ' class="active"' if href == current else ""
        return f'          <li><a href="/{href}"{active}>{label}</a></li>\n'

    links = "".join(link(label, href) for label, href in NAV)
    return (
        '  <a class="skip-link" href="#main">Skip to content</a>\n'
        f'  <header class="site-header{"" if hero else " is-scrolled"}">\n'
        '    <nav class="nav shell" aria-label="Primary">\n'
        '      <a class="brand" href="/index.html">\n'
        f"        {BRAND_MARK}\n"
        f"        <span>{BUSINESS_NAME}<small>Cruises · All-Inclusives · Small Groups</small></span>\n"
        "      </a>\n"
        # The toggle names the panel it controls, so a screen reader can say
        # what just expanded. main.js also moves focus into it on open.
        '      <ul class="nav-links" id="primary-menu">\n'
        f"{links}"
        # The pinned header CTA is hidden below 720px, so the same action is
        # repeated inside the slide-in menu rather than lost on mobile.
        '        <li class="nav-cta-mobile">'
        f'<a href="{TERN_TRIP_FORM}" target="_blank" rel="noopener" class="btn btn--primary" '
        'data-cta="mobile-plan-your-trip">Plan Your Trip</a></li>\n'
        "      </ul>\n"
        '      <div class="nav-cta">\n'
        f'        <a href="{TERN_TRIP_FORM}" target="_blank" rel="noopener" class="btn btn--primary" '
        'data-cta="nav-plan-your-trip">Plan Your Trip</a>\n'
        '        <button class="nav-toggle" type="button" aria-label="Toggle menu" '
        'aria-controls="primary-menu" aria-expanded="false">'
        "<span></span><span></span><span></span></button>\n"
        "      </div>\n"
        "    </nav>\n"
        "  </header>\n"
    )


def footer_block():
    explore = "".join(
        f'            <li><a href="/{href}">{label}</a></li>\n' for label, href in NAV
    )
    plan = "".join(
        f'            <li><a href="/{path}">{name}</a></li>\n' for path, name, _ in SERVICES
    )
    licenses = " &nbsp;|&nbsp; ".join(
        f"{name.split()[0]}: {value}" for name, value in LICENSES
    )
    return f"""  <footer class="site-footer">
    <div class="shell">
      <div class="footer-grid">
        <div>
          <a class="brand" href="/index.html">
            {BRAND_MARK_WHITE}
            <span>{BUSINESS_NAME}<small>Cruises · All-Inclusives · Small Groups</small></span>
          </a>
          <p class="muted" style="max-width:34ch">{ADVISOR} (he/him) — cruises, all-inclusive resorts, and small group tours, planned properly.</p>
          <div class="socials">
            <a href="{FACEBOOK}" aria-label="Facebook" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 10-11.5 9.9v-7H8v-2.9h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6v1.8H16l-.4 2.9h-2.1v7A10 10 0 0022 12z"/></svg></a>
            <a href="{INSTAGRAM}" aria-label="Instagram" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg></a>
            <a href="{LINKEDIN}" aria-label="LinkedIn" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.98 3.5a2.5 2.5 0 11-.02 5 2.5 2.5 0 01.02-5zM3 9h4v12H3zM10 9h3.8v1.7h.05c.53-.95 1.83-1.95 3.77-1.95 4.03 0 4.78 2.5 4.78 5.76V21h-4v-5.6c0-1.34-.03-3.06-1.9-3.06-1.9 0-2.2 1.46-2.2 2.96V21h-4z"/></svg></a>
          </div>
        </div>
        <div>
          <h2 class="footer-col__title" id="footer-plan">What I plan</h2>
          <nav aria-labelledby="footer-plan">
          <ul class="footer-links">
{plan}          </ul>
          </nav>
        </div>
        <div>
          <h2 class="footer-col__title" id="footer-explore">Explore</h2>
          <nav aria-labelledby="footer-explore">
          <ul class="footer-links">
{explore}            <li><a href="/journal.html">Journal</a></li>
          </ul>
          </nav>
        </div>
        <div>
          <h2 class="footer-col__title" id="footer-touch">Get in touch</h2>
          <nav aria-labelledby="footer-touch">
          <ul class="footer-links">
            <li><a href="mailto:{EMAIL}">{EMAIL}</a></li>
            <li><a href="tel:{PHONE_E164}">{PHONE_DISPLAY}</a></li>
            <li><a href="{TERN_SCHEDULING}" target="_blank" rel="noopener" data-cta="footer-consult">Book a free consultation</a></li>
            <li><a href="/contact.html">All the ways to reach me</a></li>
          </ul>
          </nav>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© <span id="year">2026</span> {BUSINESS_NAME}. All rights reserved. &nbsp;·&nbsp; <a href="/terms.html">Terms &amp; Conditions</a></span>
        <span class="licenses">{licenses}</span>
      </div>
    </div>
  </footer>
"""


DOC = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
{head}</head>
<body{body_class}>
{nav}
{content}
{footer}
  <script src="/assets/js/main.js"></script>
</body>
</html>
"""

GENERATED_NOTE = "<!-- GENERATED by tools/build.py — edit pages/{src} or tools/build.py, not this file. -->\n"


def tokens():
    """Values that content fragments may reference as {{TOKEN}}.

    Keeps contact details and third-party URLs out of fifteen content files so
    a changed phone number or Tern endpoint is a one-line edit in CONFIG.
    """
    return {
        "TERN_TRIP_FORM": TERN_TRIP_FORM,
        "TERN_SCHEDULING": TERN_SCHEDULING,
        "TERN_REFERRAL_FORM": TERN_REFERRAL_FORM,
        "EMAIL": EMAIL,
        "PHONE_DISPLAY": PHONE_DISPLAY,
        "PHONE_E164": PHONE_E164,
        "ADVISOR": ADVISOR,
        "BUSINESS_NAME": BUSINESS_NAME,
        "FACEBOOK": FACEBOOK,
        "INSTAGRAM": INSTAGRAM,
        "LINKEDIN": LINKEDIN,
        "POST_LIST": render_post_list(),
        **image_tokens(),
    }


TOKEN_RE = re.compile(r"\{\{([A-Z0-9_]+)\}\}")


def substitute(text, where):
    table = tokens()

    def repl(m):
        key = m.group(1)
        if key not in table:
            raise SystemExit(f"{where}: unknown token {{{{{key}}}}}")
        return table[key]

    return TOKEN_RE.sub(repl, text)


def render(filename, cfg):
    src = PAGES_DIR / filename
    content = substitute(src.read_text(encoding="utf-8").rstrip("\n"), src)

    hero = cfg.get("hero", False)
    nav = nav_block(filename, hero=hero)
    footer = footer_block()
    body_class = "" if hero else ' class="inner-page"'

    doc = DOC.format(head=head_block(cfg), body_class=body_class,
                     nav=nav, content=content, footer=footer)
    return GENERATED_NOTE.format(src=filename) + doc


# =============================================================================
# OUTPUT
# =============================================================================

LEGACY_REDIRECTS = {
    # Old Travefy extensionless URLs.
    "about": "about.html",
    "promise": "how-i-work.html",
    "ourpromise": "how-i-work.html",
    "testimonials": "reviews.html",
    "refer": "refer.html",
    # Pages renamed during this rebuild — these .html paths were live on the
    # staging domain and are linked from the earlier draft.
    "promise.html": "how-i-work.html",
    "testimonials.html": "reviews.html",
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
    for old, target in LEGACY_REDIRECTS.items():
        # PAGES titles are already HTML-escaped where needed, but the ones built
        # from f-strings are not — escape defensively so a "&" in a page title
        # cannot emit invalid markup in the stub.
        raw = PAGES[target]["title"].split(" | ")[0]
        title = esc(raw.replace("&amp;", "&"))
        html = REDIRECT_TEMPLATE.format(site=SITE_URL, target=target, title=title)
        if old.endswith(".html"):
            (ROOT / old).write_text(html, encoding="utf-8")
            print(f"  redirect {old} -> /{target}")
        else:
            d = ROOT / old
            d.mkdir(exist_ok=True)
            (d / "index.html").write_text(html, encoding="utf-8")
            print(f"  redirect {old}/ -> /{target}")


def write_sitemap():
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for cfg in PAGES.values():
        if not cfg.get("sitemap"):
            continue
        priority, freq = cfg["sitemap"]
        lines += ["  <url>", f"    <loc>{SITE_URL}/{cfg['path']}</loc>",
                  f"    <changefreq>{freq}</changefreq>",
                  f"    <priority>{priority}</priority>", "  </url>"]
    lines.append("</urlset>")
    (ROOT / "sitemap.xml").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("  sitemap.xml")


def write_robots():
    body = (
        "# Staging site — must not be indexed.\n"
        "# tools/set-domain.sh replaces this with the production robots.txt at cutover.\n"
        "User-agent: *\nDisallow: /\n"
    ) if STAGING else (
        f"User-agent: *\nAllow: /\n\nSitemap: {SITE_URL}/sitemap.xml\n"
    )
    (ROOT / "robots.txt").write_text(body, encoding="utf-8")
    print("  robots.txt")


# Pages that carry noindex on purpose, in staging and in production alike.
DELIBERATE_NOINDEX = {"terms.html", "404.html"}


def verify_indexability():
    """Fail the build if the robots meta disagrees with STAGING.

    The staging posture is three locks — CNAME, robots.txt, and a per-page
    noindex — and set-domain.sh flips all three together. The failure that
    matters is asymmetric: shipping staging's `noindex, nofollow` to
    boraborabound.com would drop the site out of search entirely, and nothing
    would surface it until traffic vanished. A cutover checklist is a reminder;
    this is a stop. It reads back what was actually written rather than
    trusting the flag, so an edit to head_block() cannot quietly defeat it.
    """
    wrong = []
    for filename in PAGES:
        html = (ROOT / filename).read_text(encoding="utf-8")
        noindex = 'content="noindex' in html
        if STAGING:
            if not noindex:
                wrong.append(f"{filename}: staging build is missing noindex")
        elif noindex and filename not in DELIBERATE_NOINDEX:
            wrong.append(f"{filename}: PRODUCTION build still carries noindex")
        elif not noindex and filename in DELIBERATE_NOINDEX:
            wrong.append(f"{filename}: expected a deliberate noindex")
    if wrong:
        raise SystemExit(
            "\nrobots meta does not match STAGING=%s:\n  %s\n"
            % (STAGING, "\n  ".join(wrong))
        )
    where = "staging (every page noindex)" if STAGING else \
        "production (only %s noindex)" % ", ".join(sorted(DELIBERATE_NOINDEX))
    print(f"  indexability OK - {where}")


def main():
    print("pages:")
    for filename, cfg in PAGES.items():
        target = ROOT / filename
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(render(filename, cfg), encoding="utf-8")
        print(f"  {filename}")
    print("redirects:")
    write_redirects()
    print("other:")
    write_sitemap()
    write_robots()
    verify_indexability()
    print(f"\nStaging={STAGING}  Site={SITE_URL}")
    if not GA4_ID or not META_PIXEL_ID:
        print("WARNING: analytics IDs not set — GA4/Meta tags are inert. See CONFIG in this file.")


if __name__ == "__main__":
    main()
