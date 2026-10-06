# Heather Wolfe Art — reviews widget

A static, database-free collection of every public review of **[Heather Wolfe Art](https://heatherwolfeart.com/)** (live wedding & event painting, Knoxville TN), plus an embeddable reviews widget in the style of Elfsight. Everything is plain files served by GitHub Pages: no server, no database, no third-party widget service.

- **Live widget:** https://bristweb.github.io/heather-wolfe-art-reviews/
- **Iframe page:** https://bristweb.github.io/heather-wolfe-art-reviews/embed.html
- **All reviews as JSON:** https://bristweb.github.io/heather-wolfe-art-reviews/data/reviews/index.json
- **schema.org JSON-LD:** https://bristweb.github.io/heather-wolfe-art-reviews/data/reviews/schema.json

The code is generic. Everything specific to this business (reviews, platforms, links, colors, fonts, icons, text) lives in `data/`, so the repo can be [reused for another site](#reuse-for-another-site) by swapping that one folder.

## Contents

1. [Embed on your site](#embed-on-your-site)
   - [JavaScript embed (preferred)](#javascript-embed-preferred)
   - [Iframe embed (alternative)](#iframe-embed-alternative)
2. [Options and customization](#options-and-customization)
3. [Reuse for another site](#reuse-for-another-site)
4. [Folder layout](#folder-layout)
5. [Review data and schema](#review-data-and-schema)
6. [Adding and updating reviews](#adding-and-updating-reviews)
7. [Weekly pull (monitoring)](#weekly-pull-monitoring)
8. [Card order](#card-order)
9. [AI summary card](#ai-summary-card)
10. [Structured data (JSON-LD)](#structured-data-json-ld)
11. [Header behavior](#header-behavior)
12. [Privacy and presentation](#privacy-and-presentation)
13. [Technical details](#technical-details)
14. [Credits](#credits)

---

## Embed on your site

### JavaScript embed (preferred)

Paste this one tag where the widget should appear:

```html
<script src="https://bristweb.github.io/heather-wolfe-art-reviews/assets/js/reviews-widget.js" defer></script>
```

The widget renders right where the tag is. The script works out the repo address from its own URL. It then loads the stylesheets (`assets/css/reviews-widget.css` and `data/theme/theme.css`), the settings (`data/config.json`) and the reviews (`data/reviews/index.json`), and inserts the widget immediately before the `<script>` element. `defer`, `async`, or neither all work.

Options go on the script tag:

```html
<script src="https://bristweb.github.io/heather-wolfe-art-reviews/assets/js/reviews-widget.js" defer
        data-layout="grid" data-platform="google" data-limit="12"></script>
```

- The widget renders directly in your page, so it sizes itself naturally and needs no resize script.
- It stays invisible until its font and first layout are ready, then fades in once, with no font swap or layout jump.
- **Several widgets on one page:** use one script tag per widget, each in its own spot with its own options (for example a grid of Zola reviews and a carousel of the latest six). The data and CSS are downloaded only once.
- **It fills the width it's given, up to 1200px, inside any page builder.** That includes containers that shrink their content to fit: Framer/Squarespace code blocks, centered flex columns, `text-align:center` blocks, inline-block, `fit-content`, floated, and absolutely positioned parents. It never causes horizontal scrolling.
- The widget's internal classes all start with `rw-`, its font has its own family name, and a small reset keeps common host styles (line height, image borders, text alignment) from leaking in.

**Rendering somewhere other than the script's position** (optional), for example when the script has to go in `<head>` or a site-wide footer:

```html
<!-- a) point the script at an element -->
<script src="https://bristweb.github.io/heather-wolfe-art-reviews/assets/js/reviews-widget.js" defer data-target="#reviews"></script>
<div id="reviews"></div>

<!-- b) or mark one or more elements; each can carry its own options -->
<script src="https://bristweb.github.io/heather-wolfe-art-reviews/assets/js/reviews-widget.js" defer></script>
<div data-reviews-widget data-layout="grid" data-platform="zola"></div>
<div data-reviews-widget data-limit="6"></div>
```

How the script decides where to render:

1. If it has `data-target`, it renders into that element (any CSS selector). The element's own `data-` options override the script's.
2. Otherwise, if the page has `[data-reviews-widget]` elements that no script has filled yet, it fills all of them. Their own `data-` options override the script's.
3. Otherwise, it renders in place, just before its own tag. A script placed in `<head>` with no target renders at the end of `<body>`.

Mount points are chosen only by position, `data-target`, or the `data-reviews-widget` attribute, never by class name. Don't mix in-place tags and `data-reviews-widget` elements on one page; if you need both, give each script a `data-target`.

If your site builder loads scripts in a way that hides the script's own URL (rare, e.g. as an ES module), add `data-base="https://bristweb.github.io/heather-wolfe-art-reviews/"` to the script tag.

### Iframe embed (alternative)

Use this when your site builder only accepts iframes, or when you want the widget fully isolated from your page's CSS:

```html
<iframe id="reviews-widget" src="https://bristweb.github.io/heather-wolfe-art-reviews/embed.html"
        title="Reviews" loading="lazy" scrolling="no" style="width:100%;border:0;height:420px"></iframe>
<script>
  // auto-resize the iframe to the widget's height
  addEventListener('message', function (e) {
    if (e.data && e.data.type === 'reviews-widget-height')
      document.getElementById('reviews-widget').style.height = e.data.height + 'px';
  });
</script>
```

Options go in the query string: `embed.html?layout=grid&platform=google&limit=12`. Without the resize script, set a fixed height. The carousel is about 410px tall at desktop widths.

`index.html` and `embed.html` are the same bare page, with no page chrome and a transparent background.

---

## Options and customization

### Per-embed options

| Attribute (JS embed: script tag or target element) | Query param (iframe / host page) | Values | Default |
|---|---|---|---|
| `data-layout` | `layout` | `carousel` (one scrolling row with arrows) or `grid` (all cards, wrapping) | `display.layout` in `data/config.json` (`carousel`) |
| `data-platform` | `platform` | `all`, or a platform key from `data/config.json` (`google`, `yelp`, `zola`, `facebook`) | `all` |
| `data-limit` | `limit` | maximum number of cards (`0` = no limit) | `0` |
| `data-base` | n/a | repo root URL, ending in `/` | worked out from the script URL |
| `data-overflow` | n/a | `visible` lets the carousel arrows overhang the widget edge by 8px (the bare pages use this). By default the overhang is clipped so it can't cause horizontal page scroll | clipped |
| `data-summary` | `summary` | `off` hides the [AI summary card](#ai-summary-card) | shown (`display.show_summary`) |
| `data-schema` | n/a | `off` skips injecting the [JSON-LD](#structured-data-json-ld) into the page | injected (`schema.enabled`) |

Query parameters on the page that hosts the widget override the `data-` attributes (this applies to every widget on that page).

The platform tabs still let visitors switch filters. The header's rating and review count always follow the selected tab.

### Site-wide settings: `data/config.json`

| Key | What it controls |
|---|---|
| `business.name`, `business.website` | the business this repo is for (reference) |
| `platforms` | one entry per platform, in tab order: `name`, `icon` (repo path), `write_url` (the "Write a review" link when that tab is active), `page_url`, `card_link` (`"review"` = link each card to its individual review; `"page"` = link to `page_url`), optional `invert_icon_when_active` (makes a dark icon white on the active tab) |
| `default_write_platform` | which platform's `write_url` the button uses on the "All" tab |
| `display.layout` | default layout |
| `display.snippet_chars` | snippet length in characters (`0` = full text) |
| `display.abbreviate_last_names` | `true`: "Kylee M." and surnames in the snippet shown as initials; `false`: full names |
| `display.max_same_platform_run`, `display.diversity_window_days` | card-order diversity (see [Card order](#card-order)) |
| `display.date_locale`, `display.date_options` | date formatting (`Intl.DateTimeFormat` locale and options) |
| `display.font_timeout_ms` | how long to wait for the webfont before showing the fallback face |
| `display.show_rating_only_reviews` | `false` (default): reviews with no text are counted in the header but get no card. `true`: they get a card with no text element |
| `display.show_summary` | `true` (default): show `data/summary.json` as the first card in "All reviews"; `false`: never |
| `schema.enabled`, `schema.type`, `schema.max_reviews`, `schema.extra` | JSON-LD built into `data/reviews/schema.json` and injected into the page: on/off, the `@type` (`LocalBusiness`; `Product` is what Elfsight uses), how many Review items (`0` = all, the default), and extra properties merged into the entity (e.g. `address`, `telephone`, `image`) |
| `rating_labels` | words shown next to the score (`min` average → label) |
| `strings` | every piece of visible or screen-reader text ("Write a review", "Based on", "View on {platform}", aria labels, …), with `{placeholders}` |
| `avatars.initials_palette`, `avatars.initials_text_color` | colors of the generated initials avatars (used by the import script) |

### Look and feel: `data/theme/theme.css`

This file holds the `@font-face` rules (fonts in `data/theme/fonts/`) and CSS custom properties on `.rw-host` (inherited by the widget), which the generic stylesheet reads:

| Variable | Used for | Heather Wolfe Art |
|---|---|---|
| `--rw-font` | font stack (the first family is the one the widget waits for) | `"HWA Inter"`, metric-matched Arial fallback, system fonts |
| `--rw-letter-spacing` | body letter spacing | `-.01em` |
| `--rw-ink` / `--rw-body` / `--rw-muted` | names and score / review text / dates and "Based on" | `#000` / `#444` / `#999` |
| `--rw-line` / `--rw-line-strong` | borders / tab hover border | `#dfe7eb` / `#bfcdd4` |
| `--rw-card` | card, header, tab, and arrow background | `#fff` |
| `--rw-tint` | count chips, avatar placeholder | `#e2edf2` |
| `--rw-accent` / `--rw-accent-2` | active tab, button, links, focus ring, card hover border / hover shade | `#204a60` / `#3c4e58` |
| `--rw-on-accent` / `--rw-on-accent-soft` | text on the accent / count chip on the active tab | `#fff` / `rgba(255,255,255,.18)` |
| `--rw-star` / `--rw-star-off` | filled / empty stars | `#f5b301` / `#d5dee3` |
| `--rw-nav-shadow` | carousel arrow shadow | `0 2px 10px rgba(32,74,96,.12)` |
| `--rw-radius` | card and header corner radius | `14px` |
| `--rw-max-width` | widget max width (centered) | `1200px` |

On a page that already uses the JS embed you can also override any of these in your own CSS, e.g. `html .rw-root{--rw-accent:#8a2be2}` (the `html` prefix makes it win over the theme file, which is loaded after your CSS).

---

## Reuse for another site

The widget code (`assets/`, `index.html`, `embed.html`, `scripts/`, the workflow) contains nothing specific to Heather Wolfe Art. To run it for another business:

1. **Duplicate the repo** (use it as a template or copy it) and enable GitHub Pages (branch `main`, root).
2. **Replace `data/`:**

   | Path | Replace with |
   |---|---|
   | `data/config.json` | the business name and site, each platform's name, icon, write-a-review URL, and page URL, strings (any language), display options, and the initials-avatar palette |
   | `data/theme/theme.css` + `data/theme/fonts/` | the site's fonts (`@font-face`) and colors (`--rw-*` variables). Any family name works; list it first in `--rw-font` |
   | `data/icons/` | one SVG per platform key (current set: Google, Yelp, Zola, Facebook, plus social icons) |
   | `data/sources.json` | the platforms the business is listed on: `scrape_url` (what the pull script scrapes) and `review_page_url` (fallback link) per review platform, plus optional `featured_on_website_review_ids` |
   | `data/reviews/` | empty it (keep the folder) |
   | `data/summary.json` | delete it (no summary card) or write one for the new reviews |
   | `data/images/reviewers/` | empty it (keep the folder) |

3. **Collect reviews:** run the [weekly pull](#weekly-pull-monitoring) with the `--all` flag, or add review files by hand. Then commit. The workflow rebuilds `data/reviews/index.json`.
4. **Update the URLs** in this README (embed snippets, links).

The importer understands Google, Yelp, Facebook, and Zola scraper output (plus an unused `--etsy` converter for `astravalabs/etsy-reviews-scraper`). Any other platform works in the widget if it has an entry in `config.json`, an icon, and review files (added by hand, or with a small converter added to `scripts/import_reviews.py`).

---

## Folder layout

```
data/                              EVERYTHING SITE-SPECIFIC (swap this folder to reuse the repo)
  config.json                      business, platforms (names, icons, write/page URLs, card links), strings, display options
  theme/theme.css                  @font-face + CSS custom properties (colors, radius, font stack)
  theme/fonts/                     self-hosted Inter (OFL, see OFL.txt)
  icons/                           platform logos (see Credits)
  sources.json                     where reviews come from: scrape URLs, review-page URLs, reported counts, social profiles
  reviews/                         one JSON file per review: <platform>-<yyyy-mm-dd>-<first-name>-<last-initial>.json
  reviews/index.json               GENERATED: every review merged + summary (do not edit by hand)
  reviews/schema.json              GENERATED: schema.org JSON-LD (LocalBusiness + AggregateRating + Review items)
  summary.json                     AI-generated summary shown as the first card in "All reviews"
  images/reviewers/                downloaded reviewer avatars (or generated initials SVGs)
assets/                            GENERIC WIDGET CODE
  js/reviews-widget.js             loads data/config.json + data/reviews/index.json + summary + CSS, renders the widget, injects the JSON-LD
  css/reviews-widget.css           layout and behavior; reads the --rw-* variables from the theme
index.html, embed.html             bare widget pages (no chrome, transparent, noindex): both safe to iframe
scripts/build-index.mjs            validates data/reviews/*.json, writes data/reviews/index.json + schema.json (Node, no dependencies)
scripts/import_reviews.py          raw scraper output -> review files (new only by default) + avatar download
scripts/pull_reviews.py            pull helper: Zola direct, Apify inputs/imports for Google/Yelp/Facebook, build, summary check
.github/workflows/build-index.yml  rebuilds and commits index.json + schema.json when data/reviews/, config.json or the build script change
```

A static site can't list a folder, so the widget reads the generated `data/reviews/index.json` instead.

---

## Review data and schema

| Platform | Reviews stored | Platform-reported | Source page |
|---|---|---|---|
| Google | 57 | 5.0 ★ · 57 reviews | https://g.page/r/CUdS9bBcbapvEAE/review |
| Yelp | 5 | 5.0 ★ · 5 reviews | https://www.yelp.com/biz/heather-wolfe-art-knoxville |
| Zola | 5 | 5.0 ★ · 5 reviews | https://www.zola.com/wedding-vendors/wedding-extras/heather-wolfe-art-live-painting |
| Facebook | 9 | 100% recommend · 16 reviews (only 9 public without login) | https://www.facebook.com/HeatherWolfeArt/reviews |

Every platform linked from heatherwolfeart.com, including social profiles with no review system, is listed in [`data/sources.json`](data/sources.json).

One file per review in `data/reviews/`:

```jsonc
{
  "id": "google-7ef4eeba2dbb",            // stable: <platform>-<sha1(platform_review_id)[:12]>
  "platform": "google",                    // a platform key from data/config.json
  "platform_review_id": "Ci9DQUlRQUNv…",  // the platform's own review id
  "reviewer_name": "Kylee Morris",         // full name as shown on the platform (widget shows "Kylee M.")
  "reviewer_profile_url": "https://www.google.com/maps/contrib/…",  // Google / Facebook; null otherwise
  "reviewer_image": "data/images/reviewers/google-2026-10-05-kylee-m.jpg",  // downloaded copy (repo path)
  "reviewer_image_source_url": "https://lh3.googleusercontent.com/…",       // where it came from (may expire), or null
  "rating": 5,                             // 1-5; null for Facebook unless Facebook shows a star value (see below)
  "rating_source": "…",                    // only when the rating isn't a native star field (Facebook "5 stars" tag)
  "text": "full review text",              // complete; "" for rating-only reviews
  "date": "2026-10-05T20:19:50Z",          // ISO 8601, UTC
  "review_url": "https://www.google.com/maps/reviews/data=…",  // individual review link (Facebook: post URL)
  "owner_reply": { "text": "…", "date": "2026-10-05T21:47:17Z" },  // the owner's public reply, or null
  "collected_at": "2026-10-05T22:00:27Z",
  "updated_at": "2026-10-06T00:09:42Z",   // set when an existing review is refreshed (--update)
  "source": "direct",                      // 'elfsight' or 'direct'
  // optional, platform-specific:
  "recommended": true,                     // Facebook
  "title": "…",                            // Zola review title
  "review_image_ids": ["…"],               // Zola photo ids
  "review_image_urls": ["…"],              // Google / Yelp review photos
  "reviewer_review_count": 3,              // Google / Yelp
  "reviewer_is_local_guide": true,         // Google
  "language": "en",
  "tags": ["…"],                           // Facebook
  "featured_on_website": true              // quoted in the website's home-page Testimonials
}
```

`review_url` is the individual review link where the platform provides one: Google review links, Yelp `?hrid=` links, and Facebook post URLs. Zola has no per-review URL, so it stores the storefront's reviews section.

**Facebook ratings:** Facebook replaced star ratings with recommend / don't recommend in 2018, and today it renders every one of these reviews, including the 2016-2017 ones, as "<name> recommends Heather Wolfe Art", with no star value in the page data, the public post pages, or any scraper output checked (`apify/facebook-reviews-scraper`, `patient_discovery/facebook-page-reviews`; others in the Apify store return the same `recommend` flag). A rating is stored only when Facebook itself shows one: Jessica V.'s review (2018-01-23) carries the recommendation tag **"5 stars"**, so it has `rating: 5` and `rating_source`. The importer does this automatically for a tag of the form "N stars". A rating is never inferred from "recommends". Old star values, if Facebook still keeps them, are visible only to the page owner (Graph API `/{page-id}/ratings` with a Page access token).

`data/reviews/index.json` holds every full record plus `file` (source path) and `has_text`, sorted newest first. It also has a `summary` with counts and average ratings per platform.

---

## Adding and updating reviews

**By hand:**

1. Create `data/reviews/<platform>-<yyyy-mm-dd>-<first>-<initial>.json` following the schema (copy an existing file).
2. Put the avatar in `data/images/reviewers/` with the same stem, and set `reviewer_image` to that path.
3. Commit to `main`.

The *Build reviews index* Action then validates every file, commits a refreshed `data/reviews/index.json`, and Pages redeploys (about a minute). To check locally, run `node scripts/build-index.mjs`.

**From scraper output:** `python3 scripts/import_reviews.py --google g.json --yelp y.json --facebook f.json --zola z.json` writes files for **new** reviews only. Add `--update` to also refresh existing ones; they keep their file names, avatars, and `collected_at`. Avatars are downloaded (never hotlinked). If a platform has no photo, an initials SVG is generated in the `config.json` palette.

---

## Weekly pull (monitoring)

Free, direct methods are used wherever they work. Apify is used only where they don't. What to scrape comes from `scrape_url` in `data/sources.json`.

| Platform | Method | Actor / source | Input (date window added automatically) |
|---|---|---|---|
| Zola | **direct**, free | fetch the storefront, parse `<script id="__NEXT_DATA__">` | n/a |
| Google | Apify | `compass/Google-Maps-Reviews-Scraper` | `{"startUrls":[{"url":"https://www.google.com/maps?cid=8046363929124098631"}],"maxReviews":500,"reviewsSort":"newest","language":"en","reviewsOrigin":"all","personalData":true,"reviewsStartDate":"<YYYY-MM-DD>"}` |
| Yelp | Apify | `web_wanderer/yelp-reviews-scraper` | `{"biz_urls":["https://www.yelp.com/biz/heather-wolfe-art-knoxville"],"reviews_limit":200,"reviews_sort":"newest","include_personal_data":true,"date_from":"<YYYY-MM-DD>"}` |
| Facebook | Apify | `apify/facebook-reviews-scraper` | `{"startUrls":[{"url":"https://www.facebook.com/HeatherWolfeArt/reviews"}],"resultsLimit":100,"onlyReviewsNewerThan":"<YYYY-MM-DD>"}` |

Why Apify is needed for those three:

- Logged-out Google Maps shows a "limited view" with no reviews.
- yelp.com returns 403.
- Facebook lists only a few recommendations without a login.

`personalData` / `include_personal_data` are needed to get names, avatars, and profile links.

The date window starts 30 days before the newest stored review on that platform, so a weekly run pays for only a few reviews (Google ≈ $0.0006/review, Yelp ≈ $0.0003, Facebook ≈ $0.0025). Each run is capped with `maxTotalChargeUsd`.

**Weekly run.** Monitoring isn't a GitHub Actions job. It's a scheduled run on the Bristlecone box that uses the Apify connector:

```bash
cd heather-wolfe-art-reviews && git pull
python3 scripts/pull_reviews.py --print-inputs
#   -> for each platform: actor id + input (date window = newest stored review - 30 days) + cost cap
#   run each actor with that input (Apify connector call-actor, maxTotalChargeUsd 0.25),
#   save the dataset items as .pull/google.json, .pull/yelp.json, .pull/facebook.json
python3 scripts/pull_reviews.py --from-raw   # pulls Zola directly, imports NEW reviews only, rebuilds index + schema
#   if it prints "SUMMARY STALE": rewrite data/summary.json from .pull/summary_input.txt (see "AI summary card")
git add data/reviews data/images/reviewers data/summary.json && git commit -m "reviews: add new reviews $(date +%F)" && git push
```

Other ways to run it:

- **API token instead of the connector:** `APIFY_TOKEN=… python3 scripts/pull_reviews.py` runs the actors through the Apify REST API itself.
- **Full re-pull:** `--all` drops the date window. It still adds only reviews whose `id` isn't stored yet.
- **Refresh existing reviews:** `scripts/import_reviews.py --update`.

`.pull/` holds raw scraper output. It's git-ignored; the imported review files are the record.

**About Elfsight:** the only Elfsight widget on heatherwolfeart.com is an **Instagram feed** (InstaShow, widget id `1677b7d0-6774-4670-903d-ffb3b4c9ed6c`, share link `https://1677b7d067744670903dffb3b4c9ed6c.elf.site`), not a reviews widget, so no review data comes from Elfsight. Its config is at `https://core.service.elfsight.com/p/boot/?page=https%3A%2F%2Fheatherwolfeart.com%2F&w=1677b7d0-6774-4670-903d-ffb3b4c9ed6c`. The home page's "Testimonials" (Brendan C, Haley R, Ciera S) are excerpts of Google reviews. Their ids are in `data/sources.json`, and those reviews are flagged `featured_on_website: true`.

---

## Card order

The order is deterministic, so it's the same on every load:

- **"All reviews": newest first, with gentle platform diversity.**
  - For each slot, the widget takes the newest remaining review.
  - If that review's platform matches the previous **2** cards, it takes the newest remaining review from a *different* platform instead.
  - It only does that if the other review is at most **~18 months (548 days)** older than the newest candidate. Otherwise it takes the newest review anyway.
  - Today the first 10 review cards run Google, Google, Zola, repeated.
- In "All reviews" the [AI summary card](#ai-summary-card) comes first; it isn't a review and isn't counted (`data-limit` counts review cards only).
- **Single-platform filter** (e.g. Yelp): newest first.
- Ties are broken by `id`.
- Rating-only reviews (empty or whitespace-only text) never become cards, but they still count in the header (76 reviews, 71 review cards). With `display.show_rating_only_reviews: true` they get cards with no text element.

Both numbers are settings: `display.max_same_platform_run` and `display.diversity_window_days` in `data/config.json`.

---

## AI summary card

The first card in "All reviews" (carousel and grid) is a short summary of what reviewers say, written by AI from the stored review texts and labeled as such: a sparkle icon and **AI summary** (`strings.ai_summary`), with `role="note"` and the aria label "AI-generated summary of N reviews". It is not a link, has no stars or platform icon, is not counted in any total or rating, does not count against `data-limit`, and is never part of the JSON-LD. It doesn't appear on single-platform tabs.

It lives in `data/summary.json`:

```jsonc
{
  "text": "2-4 sentences",
  "generated_at": "2026-10-06T01:40:00Z",
  "review_count": 76,          // reviews in index.json when it was written (staleness check)
  "reviews_with_text": 73,
  "generated_by": "…",
  "notes": "…"
}
```

Rules for the text: only themes that actually appear in the reviews, no invented facts, no quotes attributed to anyone, no star claims. The card has the same height as the review cards; if the text is longer than fits, it scrolls inside the card with a fade at the bottom, so keep it to about 300 characters.

**Refresh:** `scripts/pull_reviews.py` compares `review_count` with the current number of reviews after each import. If they differ it prints `SUMMARY STALE` and writes all review texts to `.pull/summary_input.txt`; the weekly run then rewrites `text`, `generated_at`, `review_count` and `reviews_with_text` and commits `data/summary.json` with the new reviews.

**Hide it:** `display.show_summary: false` in `config.json` (everywhere), `data-summary="off"` on one embed, or `?summary=off` on the host page. Deleting `data/summary.json` also removes it.

---

## Structured data (JSON-LD)

`scripts/build-index.mjs` writes `data/reviews/schema.json` (and CI commits it), and the widget injects it once per page as `<script type="application/ld+json" id="reviews-widget-schema">` in `<head>`, however many widgets the page has. Turn it off with `schema.enabled: false` or `data-schema="off"` on the script tag (on any one tag, before it runs). If the page already has a script with that id, nothing is added.

What's in it:

- One entity, `@type` from `schema.type` (default `LocalBusiness`), with `@id` `<website>#business`, `name` and `url` from `config.business`, plus anything in `schema.extra` (e.g. `address`, `telephone`, `image`, `priceRange`).
- `aggregateRating`: `ratingValue` (one decimal), `bestRating` 5, `worstRating` 1, `ratingCount` and `reviewCount` = every review **with a 1-5 rating** on every platform, rating-only reviews included (today 68: 5.0).
- `review`: **every** review (`schema.max_reviews: 0`; a number caps it), today 76: the text reviews in the same order as the "All reviews" cards, then the rating-only / empty ones newest first. Each has `author` (`Person`, the displayed name, e.g. "Kylee M."), `datePublished`, `publisher` (`Organization`, the platform name), plus `reviewRating` (`Rating` 1-5) when the review has a rating and `reviewBody` (the same snippet the card shows) when it has text.

**Unrated reviews** (8 Facebook recommendations) are listed as `Review`s without `reviewRating` and are **left out of the AggregateRating** count and average: they have no 1-5 value, and counting a "recommends" as 5 stars would invent ratings and inflate the score. That's why the widget header says 76 reviews and the AggregateRating says 68. 5 reviews have no text (3 Google rating-only, 2 empty Facebook recommendations) and so no `reviewBody`. schema.org accepts all of these; Google's review-snippet rules want `reviewRating` on each Review, so its Rich Results Test may warn about the unrated ones (another reason not to expect stars, below). The AI summary is never included.

**How this compares to Elfsight:** Elfsight's review widgets inject one combined JSON-LD snippet per widget with `@type: Product` + `aggregateRating` (+ reviews), because Product is the type Google still shows review stars for. They also note Google ignores review snippets on home pages. Set `schema.type` to `Product` to copy that exactly.

**Google caveat:** Google doesn't show review rich results for *self-serving* reviews: markup on a business's own site about the business itself (`LocalBusiness` / `Organization`), even when the reviews come from third-party sites. Marking the business up as a `Product` to get stars is against Google's guidelines. So expect no stars in search from this markup; it still describes the business and its reviews accurately to search engines and AI crawlers. Use one aggregate per page: if the site already has its own `LocalBusiness` markup, either turn this off or use the same `@id` so the two merge.

---

## Header behavior

One compact row: rating on the left, platform filter tabs in the middle, **Write a review** on the right, all vertically centered. The header responds to the widget's own width through CSS container queries (`container: rw / inline-size` on `.rw-root`), so it follows the embed or iframe width, not the browser window:

| Widget width | Header |
|---|---|
| > 1020px | one row: score, "Excellent", stars, "Based on N reviews" · tabs with icon, name, and count · button |
| ≤ 1020px | tabs collapse to icon and count (the name stays in `title` / `aria-label`) |
| ≤ 720px | compact: "Excellent" and "Based on" hidden (shows score, stars, "N reviews"), tighter tabs and button |
| ≤ 575px | two-row grid: rating above tabs on the left, button spanning both rows on the right |
| ≤ 450px | the button text wraps onto two lines |
| ≤ 380px | fully stacked, full-width button |

The carousel shows 4 cards above 1024px, 3 at ≤ 1024px, 2 at ≤ 760px, and one card (88% wide, swipeable, no arrows) at ≤ 520px.

The "Write a review" button goes to the active platform's `write_url`; on the "All" tab it uses `default_write_platform` (Google).

---

## Privacy and presentation

- **Storage is complete.** Each review file stores everything collected:
  - the reviewer's full name, profile URL, and avatar source URL
  - the full review text and the owner's reply (text and date)
  - the individual review URL (Facebook post URLs included), dates, and platform extras

  `data/reviews/index.json` carries the same full records. The repo is public, so all of this is publicly readable.
- **Presentation is abbreviated.** The widget computes everything visible at render time:
  - Names show as **first name + last initial** (e.g. "Kylee M."). Couples like "Ann & Bob C." are kept.
  - Text is clipped to a **~160-character snippet** at a word boundary.
  - The reviewer's own surname inside the snippet is shown as an initial.
  - Screen-reader labels use the abbreviated name too.
  - Each card links to the original review on its platform.
- **Facebook links:** for now, Facebook cards link to the page's reviews tab (`card_link: "page"` in `config.json`). The individual post URLs are stored in `review_url`; switching to them is a one-word config change (`"review"`).
- File names use the abbreviated name: `<platform>-<yyyy-mm-dd>-<first>-<initial>.json`.
- **Search engines:** `index.html` and `embed.html` carry `<meta name="robots" content="noindex, nofollow, noarchive">`. This doesn't affect embedding. The repo itself has no description, topics, or homepage link, but it's still public and findable through GitHub search.

---

## Technical details

- **Mounting:** each copy of the script captures its own `document.currentScript` when it runs, then picks `data-target`, unfilled `[data-reviews-widget]` elements, or a new `<div>` inserted before its own tag (see [the rules above](#javascript-embed-preferred)). A script that runs while the page is still parsing (plain or `async`) waits for `DOMContentLoaded`, so targets further down the page exist. Each element is filled only once.
- **DOM and sizing:** the mount element (the inserted `<div>` or your target) becomes `.rw-host`. It contains a zero-height `.rw-sizer` and the widget itself, `.rw-root`.
  - **Why it collapsed:** `.rw-root` has `container-type: inline-size` so the header and carousel can use container queries. That size containment gives it an intrinsic width of 0.
  - **Where it collapsed:** any parent that sizes children to their content (a Framer Embed or Squarespace code block wrapper, which is a centered flex column; inline-block, `fit-content`, float or absolute parents). There the old widget shrank to its 12px of padding and the container queries picked the narrowest layout.
  - **How the host fixes it:** the host is a full-width block (`width:100%; min-width:0; flex:1 1 100%; align-self:stretch; justify-self:stretch; text-align:left`, with a doubled class so page-builder rules can't override it).
  - **What the sizer adds:** a row of 24 inline blocks gives the host an intrinsic max-content width of `--rw-max-width` and a min-content width of 1/24 of it. Shrink-to-fit parents therefore size the widget to the available width without ever forcing overflow.
  - **Clipping:** `.rw-clip` (`overflow-x: clip`) trims the arrows' overhang.
- **Empty text:** a review whose text is empty or only whitespace / zero-width characters never gets a text element (no empty paragraph, quote, spacer, or placeholder). The card's "View on …" link is pinned to the bottom with `margin-top: auto`, so a card without text still lays out cleanly.
- **Loading:** the script works out the repo root as `new URL('../../', document.currentScript.src)`, or uses `data-base`. In parallel it fetches `data/config.json`, `data/reviews/index.json` and (optional) `data/summary.json` (`cache: no-cache`); `data/reviews/schema.json` is fetched after the config says it's enabled and adds `<link>`s for `assets/css/reviews-widget.css` and `data/theme/theme.css`, unless the page already has them. `index.html` / `embed.html` include them in `<head>` and use the same single script tag. Everything is fetched once per page, however many widgets or script tags there are (shared through `window.__reviewsWidget`).
- **No flash:** the root starts at `opacity: 0`. The widget waits for the stylesheets, then for weights 400, 700, and italic 300 of the first family in `--rw-font`. That wait has a timeout of `display.font_timeout_ms`; after it, the theme's metric-matched fallback face is used. After the first layout the widget fades in over 0.18s (instantly with reduced motion). The fonts use `font-display: block`.
- **Icons:** the site's own SVG (`icon` in `config.json`, else `data/icons/<platform>.svg`) is always used. Only if that file fails to load does the `<img>` switch to the [Simple Icons CDN](https://simpleicons.org/) (`https://cdn.simpleicons.org/<simple_icon or platform key>`).
- **Accessibility:** each card is a single `<a>` (new tab, `rel="noopener"`) with an aria label like "Read Kylee M.'s review on Google (opens in a new tab)". Nothing inside a card is interactive. The tabs are `role="tab"` buttons with counts in their labels, star ratings have text labels, and focus rings are visible. Cards have no shadows: hover lifts them 2px with an accent border, and focus shows a 3px accent outline.
- **Iframe height:** inside an iframe the widget posts `{type: 'reviews-widget-height', height}` to the parent on render, resize, and tab change.
- **Validation (`scripts/build-index.mjs`):** checks the required fields (`id`, `platform`, `reviewer_name`, `reviewer_image`, `text`, `date`, `review_url`, `source`), rating 1-5 or null, ISO dates, unique ids, and that each `reviewer_image` exists under `data/images/reviewers/`. A failure stops the workflow without committing.
- **Workflow:** `.github/workflows/build-index.yml` runs on pushes that touch `data/reviews/**` (other than the generated `index.json` / `schema.json`), `data/config.json`, `data/images/reviewers/**` or `scripts/build-index.mjs`, and on manual dispatch. It commits `index.json` and `schema.json` only if they changed. GitHub Pages deploys the branch as-is (`.nojekyll`).
- **Local preview:** run `python3 -m http.server` in the repo root and open http://localhost:8000/. To try the JS embed against a local copy, point the script `src` at it. The fonts and JSON need CORS when served from a different origin; GitHub Pages sends `Access-Control-Allow-Origin: *`.

---

## Credits

Platform logos: **Google** is Google's multi-color Maps pin (the 2020 Google Maps icon, via Wikimedia Commons); **Zola** is Zola's double-heart mark in their "marine" #183b54, from zola.com's own asset CDN (turned white on the active tab); **Yelp** and **Facebook** are from [Simple Icons](https://simpleicons.org/) (CC0 1.0). All marks belong to their owners and are used only to identify where each review was posted. The brand colors (#204a60, #3c4e58, #85a0ad, #bfcdd4, #e2edf2, #999) and the Inter typeface ([OFL](data/theme/fonts/OFL.txt)) come from heatherwolfeart.com. Review content belongs to its authors and is shown with a link back to the original.
