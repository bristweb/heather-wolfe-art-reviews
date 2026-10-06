# Heather Wolfe Art — reviews (social proof)

A static, database-free record of every public review of **[Heather Wolfe Art](https://heatherwolfeart.com/)** (live wedding & event painting, Knoxville TN), plus an embeddable reviews widget modeled on the Elfsight-style widgets.

- **Live widget:** https://bristweb.github.io/heather-wolfe-art-reviews/
- **Embeddable version:** https://bristweb.github.io/heather-wolfe-art-reviews/embed.html (same bare widget; both pages have no page chrome)
- **Manifest (all reviews merged):** https://bristweb.github.io/heather-wolfe-art-reviews/data/reviews/index.json

| Platform | Reviews stored | Platform-reported | Source page |
|---|---|---|---|
| Google | 57 | 5.0 ★ · 57 reviews | https://g.page/r/CUdS9bBcbapvEAE/review |
| Yelp | 5 | 5.0 ★ · 5 reviews | https://www.yelp.com/biz/heather-wolfe-art-knoxville |
| Zola | 5 | 5.0 ★ · 5 reviews | https://www.zola.com/wedding-vendors/wedding-extras/heather-wolfe-art-live-painting |
| Facebook | 9 | 100% recommend · 16 reviews (only 9 public without login) | https://www.facebook.com/HeatherWolfeArt/reviews |

The full list of platforms linked from heatherwolfeart.com (including social profiles with no review system) is in [`data/sources.json`](data/sources.json).

## Privacy rules (public repo)

- **Names:** only `reviewer_display_name` (first name + last initial, e.g. "Kylee M.") is stored. Full names are never written: `import_reviews.py` abbreviates on import, and `build-index.mjs` fails if a file has a `reviewer_name` field or a display name that isn't abbreviated.
- **Text:** only a ~160-character `snippet` is stored anywhere (any surname in it is reduced to an initial). Full review text is never stored; the card links to the original review.
- **No identifying extras:** owner replies, avatar source URLs, and Facebook profile/post URLs are never stored. Facebook cards link to the page's reviews tab.
- `build-index.mjs` enforces all of this: CI fails if a file has `reviewer_name`, `text`, `owner_response`, `reviewer_image_source_url`, a snippet over 170 characters, or a Facebook profile URL.

## Layout

Content (review data) lives under `data/`. Code and UI assets live everywhere else.

```
data/                          CONTENT
  reviews/                     one JSON file per review -> <platform>-<yyyy-mm-dd>-<first-name>-<last-initial>.json
  reviews/index.json           GENERATED public manifest (minimal fields + summary). Do not edit by hand.
  images/reviewers/            downloaded reviewer avatars (or generated initials SVGs)
  sources.json                 monitored platforms and their review-page URLs
assets/                        UI ASSETS (part of the widget code)
  css/reviews-widget.css       widget styles (brand colors/fonts from heatherwolfeart.com)
  js/reviews-widget.js         widget script (fetches data/reviews/index.json and renders)
  icons/                       platform logos (Simple Icons, CC0; zola.svg is the exact mark used on heatherwolfeart.com)
  fonts/                       self-hosted Inter (OFL, see fonts/OFL.txt)
index.html, embed.html         bare widget pages (no page chrome, transparent background): both are safe to iframe
scripts/build-index.mjs        validates data/reviews/*.json and writes data/reviews/index.json (Node, no deps)
scripts/import_reviews.py      raw scraper output -> review files (new only by default) + avatar download
scripts/pull_reviews.py        monitor helper: Zola direct, Apify inputs/imports for Google/Yelp/Facebook, then build
.github/workflows/build-index.yml  rebuilds and commits data/reviews/index.json whenever data/reviews/ changes
```

Platform icons are treated as UI assets, not content: they're fixed brand marks the widget's code refers to by platform key (`assets/icons/<platform>.svg`), and adding reviews never changes them.

Everything is static files served by GitHub Pages. Because a static site can't list a directory, the widget reads the generated manifest `data/reviews/index.json` instead of the folder.

## Review file schema

```jsonc
{
  "id": "google-7ef4eeba2dbb",            // stable: <platform>-<sha1(platform_review_id)[:12]>
  "platform": "google",                    // google | yelp | zola | facebook | (any assets/icons/<platform>.svg)
  "platform_review_id": "Ci9DQUlRQUNv…",  // the platform's own review id
  "reviewer_display_name": "Kylee M.",     // first name + last initial ONLY
  "reviewer_image": "data/images/reviewers/google-2026-10-05-kylee-m.jpg",  // repo path
  "rating": 5,                             // 1-5, or null for Facebook (recommend/not, no stars)
  "snippet": "first ~160 chars…",          // the ONLY review text stored; "" for rating-only reviews
  "date": "2026-10-05T20:19:50Z",          // ISO 8601, UTC
  "review_url": "https://www.google.com/maps/reviews/data=…",  // link to the original review (Facebook: page reviews tab)
  "collected_at": "2026-10-05T22:00:27Z",
  "source": "direct",                      // 'elfsight' or 'direct'
  // optional:
  "recommended": true,                     // Facebook only
  "title": "…",                            // Zola review title
  "featured_on_website": true              // quoted in the heatherwolfeart.com home-page Testimonials
}
```

`data/reviews/index.json` holds, per review: `file, id, platform, reviewer_display_name, reviewer_image, rating, recommended, snippet, date, review_url, featured_on_website, has_text`, plus a `summary` with counts and average ratings per platform.

`review_url` points at the individual review where the platform provides one (Google review links, Yelp `?hrid=` links). Facebook post URLs contain the reviewer's profile handle, so Facebook cards link to https://www.facebook.com/HeatherWolfeArt/reviews. Zola has no per-review URL, so those link to the storefront's reviews section.

## Adding or updating a review

**By hand:** create `data/reviews/<platform>-<yyyy-mm-dd>-<first>-<initial>.json` following the schema (copy an existing file), put the avatar in `data/images/reviewers/` with the same stem (and set `reviewer_image` to that path), and commit to `main`. The *Build reviews index* Action validates all files and commits a refreshed `reviews/index.json`, and Pages redeploys. To check locally, run `node scripts/build-index.mjs`.

## Monitoring / re-pulling

Free, direct methods are used wherever they work. Apify is used only where they don't:

| Platform | Method | Actor / source | Input (date window added automatically) |
|---|---|---|---|
| Zola | **direct**, free | `curl` storefront, parse `<script id="__NEXT_DATA__">` | n/a |
| Google | Apify | `compass/Google-Maps-Reviews-Scraper` | `{"startUrls":[{"url":"https://www.google.com/maps?cid=8046363929124098631"}],"maxReviews":500,"reviewsSort":"newest","language":"en","reviewsOrigin":"all","personalData":true,"reviewsStartDate":"<YYYY-MM-DD>"}` |
| Yelp | Apify | `web_wanderer/yelp-reviews-scraper` | `{"biz_urls":["https://www.yelp.com/biz/heather-wolfe-art-knoxville"],"reviews_limit":200,"reviews_sort":"newest","include_personal_data":true,"date_from":"<YYYY-MM-DD>"}` |
| Facebook | Apify | `apify/facebook-reviews-scraper` | `{"startUrls":[{"url":"https://www.facebook.com/HeatherWolfeArt/reviews"}],"resultsLimit":100,"onlyReviewsNewerThan":"<YYYY-MM-DD>"}` |

Why Apify is needed for those three: logged-out Google Maps shows a "limited view" with no reviews, yelp.com returns 403, and Facebook lists only a few recommendations without a login. `personalData` / `include_personal_data` are needed to get names and avatars; names are abbreviated before storage. The date is the newest stored review on that platform minus 30 days, so a weekly run only pays for a few reviews (Google ≈ $0.0006/review, Yelp ≈ $0.0003, Facebook ≈ $0.0025). Each run is capped with `maxTotalChargeUsd`.

**Weekly run.** Monitoring isn't a GitHub Actions job. It's a scheduled run on the Bristlecone box that uses the Apify connector:

```bash
cd heather-wolfe-art-reviews && git pull
python3 scripts/pull_reviews.py --print-inputs
#   -> for each platform: actor id + input (date window = newest stored review - 30 days) + cost cap
#   run each actor with that input (Apify connector call-actor, maxTotalChargeUsd 0.25),
#   save the dataset items as .pull/google.json, .pull/yelp.json, .pull/facebook.json
python3 scripts/pull_reviews.py --from-raw   # pulls Zola directly, imports NEW reviews only, rebuilds index
git add data/reviews data/images/reviewers && git commit -m "reviews: add new reviews $(date +%F)" && git push
```

With an Apify API token instead of the connector, `APIFY_TOKEN=… python3 scripts/pull_reviews.py` runs the actors through the REST API itself. `.pull/` holds raw scraper output (full names and text). It's git-ignored and must never be committed. `--all` drops the date window (it still adds only reviews whose `id` isn't stored yet). `scripts/import_reviews.py --update` refreshes existing reviews.

**About Elfsight:** the only Elfsight widget on heatherwolfeart.com is an **Instagram feed** (InstaShow, widget id `1677b7d0-6774-4670-903d-ffb3b4c9ed6c`, share link `https://1677b7d067744670903dffb3b4c9ed6c.elf.site`), not a reviews widget, so no review data comes from Elfsight. Its config is at `https://core.service.elfsight.com/p/boot/?page=https%3A%2F%2Fheatherwolfeart.com%2F&w=1677b7d0-6774-4670-903d-ffb3b4c9ed6c`. The home page's "Testimonials" (Brendan C, Haley R, Ciera S) are excerpts of Google reviews and are flagged `featured_on_website: true`.

## Card order

The order is deterministic, so it's the same on every load:

- **"All reviews": newest first, with gentle platform diversity.** For each slot, the widget takes the newest remaining review. If that review's platform matches the previous **2** cards, it takes the newest remaining review from a *different* platform instead, but only if that review is at most **~18 months (548 days)** older than the newest candidate. Otherwise it takes the newest review anyway.
- **Single-platform filter** (e.g. Yelp): newest first.
- Ties are broken by `id`. Rating-only reviews (empty snippet) never become cards, but they still count in the header.

Constants `MAX_SAME_RUN` (2) and `DIVERSITY_WINDOW_DAYS` (548) are at the top of `assets/js/reviews-widget.js`.

## Header layout

One compact row: rating on the left, platform filter tabs in the middle, **Write a review** on the right. The header responds to the widget's own width through CSS container queries (`container: hwa / inline-size` on `.hwa-root`), so it follows the iframe or embed width, not the browser window:

- wider than ~1020px: tabs show icon, name, and count
- ~1020px or less: tabs collapse to icon and count (the name stays in `title` / `aria-label`)
- ~720px or less: tighter spacing, and the rating shows score, stars, and "76 reviews"
- ~575px or less: tabs wrap onto a second line (last resort); ~320px or less: the button goes full width

## Embedding on the website

`index.html` and `embed.html` carry `<meta name="robots" content="noindex, nofollow, noarchive">` so search engines don't list them. This doesn't affect iframe embedding: the widget still works inside heatherwolfeart.com.

**Option A, iframe (simplest, works in Framer's Embed component):**

```html
<iframe id="hwa-reviews" src="https://bristweb.github.io/heather-wolfe-art-reviews/embed.html"
        style="width:100%;border:0;min-height:520px" loading="lazy" title="Heather Wolfe Art reviews"></iframe>
<script>
  // auto-resize to the widget's height
  addEventListener('message', e => {
    if (e.data && e.data.type === 'hwa-reviews-height')
      document.getElementById('hwa-reviews').style.height = e.data.height + 'px';
  });
</script>
```

Options via query string: `embed.html?layout=grid`, `?platform=google`, `?limit=12` (they can be combined).

**Option B, inline script (no iframe):**

```html
<link rel="stylesheet" href="https://bristweb.github.io/heather-wolfe-art-reviews/assets/css/reviews-widget.css">
<div class="hwa-reviews" data-base="https://bristweb.github.io/heather-wolfe-art-reviews/" data-layout="carousel"></div>
<script src="https://bristweb.github.io/heather-wolfe-art-reviews/assets/js/reviews-widget.js" defer></script>
```

`data-layout` = `carousel` | `grid`, `data-platform` = `all` | `google` | `yelp` | `zola` | `facebook`, `data-limit` = number.

## Credits

Platform logos from [Simple Icons](https://simpleicons.org/) (CC0 1.0); the Zola mark is the one heatherwolfeart.com uses. Brand colors (#204a60, #3c4e58, #85a0ad, #bfcdd4, #e2edf2, #999) and the Inter typeface come from heatherwolfeart.com. Review content belongs to its authors and is shown with a link back to the original.
