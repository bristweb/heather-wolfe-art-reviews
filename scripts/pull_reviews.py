#!/usr/bin/env python3
"""Weekly monitor: fetch recent reviews from every platform, add only NEW ones, rebuild the manifest.

  python3 scripts/pull_reviews.py --print-inputs        # Apify actor inputs with date windows (JSON)
  python3 scripts/pull_reviews.py --from-raw            # Zola direct + import .pull/{google,yelp,facebook,etsy}.json
  APIFY_TOKEN=... python3 scripts/pull_reviews.py       # Zola direct + run the actors via the Apify REST API

* Zola     -> direct & free: storefront HTML, reviews read from the embedded __NEXT_DATA__ JSON.
* Google   -> Apify `compass/Google-Maps-Reviews-Scraper` (logged-out Google Maps shows no reviews).
* Yelp     -> Apify `web_wanderer/yelp-reviews-scraper`   (yelp.com answers 403 to direct fetches).
* Facebook -> Apify `apify/facebook-reviews-scraper`      (reviews need a login to list directly).
* Etsy     -> Apify `astravalabs/etsy-reviews-scraper`    (etsy.com answers DataDome 403s to direct fetches;
              no date filter, so it asks for the newest 25 reviews, or the full history with --all).
Apify is used only where the free/direct method fails. Without APIFY_TOKEN only Zola is pulled.
Each Apify run asks only for reviews newer than (latest stored review on that platform - since-days),
and is capped with maxTotalChargeUsd. --all ignores the date window (full re-pull).
Raw results live in .pull/ (git-ignored). Then runs import_reviews.py (new reviews only; full records
stored) and build-index.mjs.
Finally checks data/summary.json (the AI summary card): if the number of reviews changed since it was written,
prints SUMMARY STALE and writes .pull/summary_input.txt (all review texts) so the weekly run can regenerate it.
Committing/pushing is left to the caller (see README).
"""
import argparse, datetime, json, os, re, subprocess, sys, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, '.pull')
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'
# What to scrape comes from data/sources.json (`scrape_url` per platform); actor ids/options are generic.
with open(os.path.join(ROOT, 'data', 'sources.json')) as _f:
    SCRAPE = {p['platform']: p.get('scrape_url') for p in json.load(_f)['platforms'] if p.get('reviews')}
ZOLA_URL = SCRAPE.get('zola')

ACTORS = {
    'google': ('compass~Google-Maps-Reviews-Scraper', lambda since: {
        'startUrls': [{'url': SCRAPE['google']}],
        'maxReviews': 500, 'reviewsSort': 'newest', 'language': 'en', 'reviewsOrigin': 'all',
        'personalData': True, **({'reviewsStartDate': since} if since else {})}),
    'yelp': ('web_wanderer~yelp-reviews-scraper', lambda since: {
        'biz_urls': [SCRAPE['yelp']],
        'reviews_limit': 200, 'reviews_sort': 'newest', 'include_personal_data': True,
        **({'date_from': since} if since else {})}),
    'facebook': ('apify~facebook-reviews-scraper', lambda since: {
        'startUrls': [{'url': SCRAPE['facebook']}],
        'resultsLimit': 100, **({'onlyReviewsNewerThan': since} if since else {})}),
    'etsy': ('astravalabs~etsy-reviews-scraper', lambda since: {
        'shops': [SCRAPE['etsy']], 'reviewsSort': 'Recency',
        'maxReviews': 25 if since else 0, 'maxTotalResults': 25 if since else 500}),
}
ACTORS = {k: v for k, v in ACTORS.items() if SCRAPE.get(k)}  # only platforms this site lists in sources.json


def latest_dates():
    out = {}
    d = os.path.join(ROOT, 'data', 'reviews')
    for f in os.listdir(d):
        if f.endswith('.json') and f not in ('index.json', 'schema.json'):
            r = json.load(open(os.path.join(d, f)))
            out[r['platform']] = max(out.get(r['platform'], ''), r['date'])
    return out


def pull_zola(path):
    req = urllib.request.Request(ZOLA_URL, headers={'User-Agent': UA})
    t = urllib.request.urlopen(req, timeout=60).read().decode('utf-8', 'replace')
    data = json.loads(re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', t, re.S).group(1))
    found = {}
    def walk(o):
        if isinstance(o, dict):
            if 'reviewerName' in o and 'reviewText' in o and 'reviewUuid' in o:
                found[o['reviewUuid']] = o
                return
            for v in o.values(): walk(v)
        elif isinstance(o, list):
            for v in o: walk(v)
    walk(data)
    json.dump(list(found.values()), open(path, 'w'))
    return len(found)


def pull_apify(actor, inp, token, max_usd, path):
    qs = urllib.parse.urlencode({'token': token, 'format': 'json', 'clean': '1',
                                 'maxTotalChargeUsd': max_usd, 'timeout': 600})
    url = f'https://api.apify.com/v2/acts/{actor}/run-sync-get-dataset-items?{qs}'
    req = urllib.request.Request(url, data=json.dumps(inp).encode(), method='POST',
                                 headers={'Content-Type': 'application/json'})
    items = json.loads(urllib.request.urlopen(req, timeout=660).read())
    json.dump(items, open(path, 'w'))
    return len(items)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--since-days', type=int, default=30, help='overlap window before the newest stored review')
    ap.add_argument('--max-usd', type=float, default=0.25, help='Apify cost cap per actor run')
    ap.add_argument('--all', action='store_true', help='full re-pull (no date window)')
    ap.add_argument('--print-inputs', action='store_true', help='print {platform: {actor, input}} and exit')
    ap.add_argument('--from-raw', action='store_true',
                    help='do not call Apify; import .pull/<platform>.json files saved by another runner (e.g. the Apify connector)')
    a = ap.parse_args()
    os.makedirs(RAW, exist_ok=True)
    token = os.environ.get('APIFY_TOKEN')
    latest = latest_dates()

    def since_for(plat):
        if a.all or plat not in latest:
            return None
        dt = datetime.datetime.fromisoformat(latest[plat].replace('Z', '+00:00')) - datetime.timedelta(days=a.since_days)
        return dt.date().isoformat()

    if a.print_inputs:
        print(json.dumps({p: {'actor': act.replace('~', '/'), 'input': b(since_for(p)),
                              'maxTotalChargeUsd': a.max_usd, 'save_items_to': f'.pull/{p}.json'}
                          for p, (act, b) in ACTORS.items()}, indent=2))
        return
    args = []
    if ZOLA_URL:
        try:
            print('zola (direct):', pull_zola(os.path.join(RAW, 'zola.json')), 'reviews on page')
            args += ['--zola', os.path.join(RAW, 'zola.json')]
        except Exception as e:
            print('zola failed:', e, file=sys.stderr)
    for plat, (actor, build) in ACTORS.items():
        path = os.path.join(RAW, f'{plat}.json')
        if a.from_raw:
            if os.path.exists(path):
                print(f'{plat}: importing {path}')
                args += [f'--{plat}', path]
            else:
                print(f'{plat}: no {path}, skipped')
            continue
        if not token:
            print(f'{plat}: skipped (no APIFY_TOKEN)')
            continue
        since = since_for(plat)
        try:
            print(f'{plat} (apify {actor}, since {since or "all"}):', pull_apify(actor, build(since), token, a.max_usd, path), 'items')
            args += [f'--{plat}', path]
        except Exception as e:
            print(f'{plat} failed:', e, file=sys.stderr)
    if not args:
        sys.exit('nothing pulled')
    subprocess.run([sys.executable, os.path.join(ROOT, 'scripts', 'import_reviews.py'), *args], check=True)
    subprocess.run(['node', os.path.join(ROOT, 'scripts', 'build-index.mjs')], check=True)
    check_summary()


def check_summary():
    """The AI summary card (data/summary.json) is written by a person/agent from the stored reviews. Flag it when
    the review count no longer matches, and dump the review texts for regenerating it."""
    idx = json.load(open(os.path.join(ROOT, 'data', 'reviews', 'index.json')))
    revs = idx['reviews']
    try:
        summ = json.load(open(os.path.join(ROOT, 'data', 'summary.json')))
    except FileNotFoundError:
        summ = {}
    if summ.get('review_count') == len(revs):
        print(f'summary: up to date ({len(revs)} reviews)')
        return
    path = os.path.join(RAW, 'summary_input.txt')
    with open(path, 'w') as f:
        for r in sorted(revs, key=lambda r: r['date'], reverse=True):
            if (r.get('text') or '').strip():
                f.write(f"[{r['platform']} {r['date'][:10]} rating={r.get('rating')}] {' '.join(r['text'].split())}\n")
    print(f"SUMMARY STALE: data/summary.json covers {summ.get('review_count')} reviews, now {len(revs)}. "
          f"Regenerate its text from {os.path.relpath(path, ROOT)} (see README 'AI summary card').")


if __name__ == '__main__':
    main()
