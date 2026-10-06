# Heather Wolfe Art — reviews data

Every public review of **[Heather Wolfe Art](https://heatherwolfeart.com/)** (live wedding & event painting, Knoxville TN), plus the settings and theme for its reviews widget. This repo is **data only**: the widget code, the import/sync scripts and the full documentation live in **[bristweb/reviews-widget](https://github.com/bristweb/reviews-widget)**. GitHub Pages serves these files at `https://bristweb.github.io/heather-wolfe-art-reviews/`.

- **Live widget:** https://bristweb.github.io/reviews-widget/?source=https://bristweb.github.io/heather-wolfe-art-reviews/
- **Settings:** [`config.json`](config.json) · **Reviews:** [`reviews/`](reviews/) (one file per year)

## Contents

1. [Embed](#embed)
2. [What's here](#whats-here)
3. [Reviews and platforms](#reviews-and-platforms)
4. [Weekly sync](#weekly-sync)
5. [Look and feel](#look-and-feel)
6. [Structured data](#structured-data)
7. [Credits](#credits)

## Embed

JavaScript (preferred), where the widget should appear:

```html
<script src="https://bristweb.github.io/reviews-widget/assets/js/reviews-widget.js"
        data-source="https://bristweb.github.io/heather-wolfe-art-reviews/" defer></script>
```

Google Sites or any other fixed-height box (*Insert → Embed → Embed code*, then drag the box to about 420px tall):

```html
<script src="https://bristweb.github.io/reviews-widget/assets/js/reviews-widget.js"
        data-source="https://bristweb.github.io/heather-wolfe-art-reviews/"
        data-fixed-height="true" data-arrows="inside" data-overflow="hidden"
        data-hover-lift="false" data-focus-ring="inside"></script>
```

Iframe:

```html
<iframe id="reviews-widget" src="https://bristweb.github.io/reviews-widget/embed.html?source=https://bristweb.github.io/heather-wolfe-art-reviews/"
        title="Reviews" loading="lazy" scrolling="no" style="width:100%;border:0;height:420px"></iframe>
<script>
  addEventListener('message', function (e) {
    if (e.data && e.data.type === 'reviews-widget-height')
      document.getElementById('reviews-widget').style.height = e.data.height + 'px';
  });
</script>
```

All options (layout, platform filter, limit, fitting options): see the [reviews-widget README](https://github.com/bristweb/reviews-widget#options).

## What's here

```
config.json           business, platforms (tab order, links, scrape URLs, reported counts), links, display,
                      strings, schema, avatar palette, AI summary, reviews.years
reviews/<year>.json   the reviews dated in that year, newest first (2016-2026)
images/reviewers/     avatars: <platform>-<platform_review_id>.<ext> (filesystem-safe)
icons/                platform logos (google, yelp, zola, facebook) + social icons
theme/                theme.css (colors, radius, font) + self-hosted Inter
.github/workflows/    validate.yml: runs the shared validator on every push
```

The record format is documented in [reviews-widget: Data repo format](https://github.com/bristweb/reviews-widget#data-repo-format). Records store everything collected (full names, full text, owner replies, profile and avatar URLs); the widget abbreviates names and clips text when it renders.

## Reviews and platforms

| Platform | Reviews stored | Platform-reported | Source page |
|---|---|---|---|
| Google | 57 | 5.0 ★ · 57 reviews | https://g.page/r/CUdS9bBcbapvEAE/review |
| Yelp | 5 | 5.0 ★ · 5 reviews | https://www.yelp.com/biz/heather-wolfe-art-knoxville |
| Zola | 5 | 5.0 ★ · 5 reviews | https://www.zola.com/wedding-vendors/wedding-extras/heather-wolfe-art-live-painting |
| Facebook | 9 | 100% recommend · 16 reviews (only 9 public without login) | https://www.facebook.com/HeatherWolfeArt/reviews |

76 reviews (55 with an owner reply). Every platform linked from heatherwolfeart.com, including social profiles with no review system (`links`), is listed in `config.json` with what was checked.

- **Review links:** `review_url` is the individual review where the platform has one: Google review links, Yelp `?hrid=` links, Facebook post URLs. Zola has no per-review URL, so it stores the storefront's reviews section.
- **Facebook ratings:** Facebook replaced stars with recommend / don't recommend in 2018 and renders every one of these reviews as "<name> recommends Heather Wolfe Art", with no star value in the page data, the public post pages, or any scraper output checked (`apify/facebook-reviews-scraper`, `patient_discovery/facebook-page-reviews`). A rating is stored only when Facebook itself shows one: Jessica V.'s review (2018-01-23) carries the tag **"5 stars"**, so it has `rating: 5` and `rating_source`. A rating is never inferred from "recommends". The other 8 have `rating: null`.
- **Facebook card links:** cards link to the page's reviews tab (`card_link: "page"`); the post URLs are stored in `review_url`, and switching is a one-word change (`"review"`).
- **Featured reviews:** the home page's "Testimonials" (Brendan C, Haley R, Ciera S) are excerpts of Google reviews; those records have `featured_on_website: true` (kept when records are refreshed).
- **Rating-only reviews:** 5 reviews have no text (3 Google rating-only, 2 empty Facebook recommendations). They count in the header (76 reviews) but get no card (71 review cards).
- **About Elfsight:** the only Elfsight widget on heatherwolfeart.com is an **Instagram feed** (InstaShow, widget id `1677b7d0-6774-4670-903d-ffb3b4c9ed6c`), not a reviews widget, so no review data comes from Elfsight.
- **`source`:** reviews imported before October 2026 say `direct`, including ones that came through Apify.

## Weekly sync

A scheduled run (`weekly-hwa-review-sync`) pulls new reviews with the shared scripts: Zola directly (free), Google, Yelp and Facebook through Apify, each asking only for reviews newer than the newest stored one minus 30 days and capped at $0.50 per run (typical cost: a few cents). See [reviews-widget: Weekly sync](https://github.com/bristweb/reviews-widget#weekly-sync).

```bash
python3 reviews-widget/scripts/pull_reviews.py --data heather-wolfe-art-reviews --print-inputs
# run the Google / Yelp / Facebook actors, save items to heather-wolfe-art-reviews/.pull/<platform>.json
python3 reviews-widget/scripts/pull_reviews.py --data heather-wolfe-art-reviews --from-raw
```

## Look and feel

[`theme/theme.css`](theme/theme.css), from heatherwolfeart.com:

| Variable | Value |
|---|---|
| `--rw-font` | `"HWA Inter"`, metric-matched Arial fallback, system fonts |
| `--rw-letter-spacing` | `-.01em` |
| `--rw-ink` / `--rw-body` / `--rw-muted` | `#000` / `#444` / `#999` |
| `--rw-line` / `--rw-line-strong` | `#dfe7eb` / `#bfcdd4` |
| `--rw-card` / `--rw-tint` | `#fff` / `#e2edf2` |
| `--rw-accent` / `--rw-accent-2` | `#204a60` / `#3c4e58` |
| `--rw-star` / `--rw-star-off` | `#f5b301` / `#d5dee3` |
| `--rw-radius` / `--rw-max-width` | `14px` / `1200px` |

## Structured data

`schema.type` is `LocalBusiness` (a service business). The widget's JSON-LD has every review (76); the `aggregateRating` counts only the 68 with a 1-5 rating (5.0), leaving out the 8 unrated Facebook recommendations rather than counting them as 5 stars. Google shows no stars for self-serving `LocalBusiness` reviews, so don't expect stars in search; the markup still describes the business accurately. Elfsight's review widgets use `Product` instead; set `schema.type` to copy that.

## Credits

Platform logos: **Google** is Google's multi-color Maps pin (the 2020 Google Maps icon, via Wikimedia Commons); **Zola** is Zola's double-heart mark in their "marine" #183b54, from zola.com's own asset CDN (turned white on the active tab); **Yelp** and **Facebook** are from [Simple Icons](https://simpleicons.org/) (CC0 1.0). All marks belong to their owners and are used only to identify where each review was posted. The brand colors (#204a60, #3c4e58, #85a0ad, #bfcdd4, #e2edf2, #999) and the Inter typeface ([OFL](theme/fonts/OFL.txt)) come from heatherwolfeart.com. Review content belongs to its authors and is shown with a link back to the original.
