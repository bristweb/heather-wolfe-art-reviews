#!/usr/bin/env python3
"""Normalize raw scraper output into one JSON file per review under data/reviews/.

Usage:
  python3 scripts/import_reviews.py --google google.json --yelp yelp.json \
      --facebook fb.json --zola zola_reviews.json --etsy etsy.json --amazon amazon.json

Raw inputs (see README "Weekly pull"):
  google   : Apify compass/Google-Maps-Reviews-Scraper dataset items (JSON array)
  yelp     : Apify web_wanderer/yelp-reviews-scraper dataset items
  facebook : Apify apify/facebook-reviews-scraper dataset items
  zola     : review objects extracted from the Zola storefront __NEXT_DATA__
  etsy     : Apify astravalabs/etsy-reviews-scraper dataset items (etsy.com itself is behind DataDome)
  amazon   : Apify junglee/amazon-reviews-scraper dataset items (Amazon review pages need a login)

By default only NEW reviews are written (matched by stable `id`); pass --update
to also refresh existing ones (they keep their file names and avatars). EVERYTHING is
stored: full reviewer name, full text, owner reply (text + date), reviewer profile URL,
avatar source URL, individual review URL (incl. Facebook post URLs), plus extras.
Abbreviating names and clipping text is done only at render time by the widget.
File names use the abbreviated name slug. Avatars are downloaded to
data/images/reviewers/ (never hotlinked); an initials SVG is generated when the
platform has no photo. Run scripts/build-index.mjs afterwards (CI does it too).
"""
import argparse, datetime, hashlib, html, json, os, re, sys, unicodedata, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REV_DIR = os.path.join(ROOT, 'data', 'reviews')
IMG_DIR = os.path.join(ROOT, 'data', 'images', 'reviewers')
NOW = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')
# Everything site-specific comes from data/: review-page URLs and featured review ids from data/sources.json,
# the initials-avatar palette from data/config.json.
with open(os.path.join(ROOT, 'data', 'sources.json')) as _f:
    _SRC = {p['platform']: p for p in json.load(_f)['platforms']}
with open(os.path.join(ROOT, 'data', 'config.json')) as _f:
    _AV = json.load(_f).get('avatars', {})
REVIEW_PAGE = {k: v.get('review_page_url') for k, v in _SRC.items()}  # fallback link when a review has no own URL
FEATURED = set(_SRC.get('google', {}).get('featured_on_website_review_ids', []))
PALETTE = _AV.get('initials_palette') or ['#555555']
INITIALS_TEXT = _AV.get('initials_text_color', '#fff')


def slugify(s):
    s = unicodedata.normalize('NFKD', s or 'anonymous').encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')[:40] or 'anonymous'


def display_name(name):
    """Used for file-name slugs and initials avatars only. 'Jane Doe' -> 'Jane D.'; 'Mary Smith (Smith Studio)' -> 'Mary S.';
    'Ann And Bob C.' -> 'Ann & Bob C.'; 'Ashley' -> 'Ashley'; 'JANE D.' -> 'Jane D.'. """
    n = re.sub(r'\(.*?\)', ' ', name or '').strip()
    words = [w for w in re.split(r'\s+', n) if w]
    if not words:
        return 'Anonymous'
    fix = lambda w: w if w.isupper() and len(w) <= 2 else w.capitalize() if w.isupper() or w.islower() else w  # 'AA' stays
    if len(words) == 1:
        return fix(words[0])
    first, last = words[:-1], words[-1]
    # keep couples like "Ann And Bob C."; otherwise only the first given name
    if not (len(first) >= 3 and first[1].lower() in ('and', '&')):
        first = first[:1]
    first = ['&' if w.lower() in ('and', '&') else fix(w) for w in first]
    return ' '.join(first) + ' ' + last[0].upper() + '.'


def initials_svg(name, path):
    parts = [p for p in re.split(r'[\s.]+', re.sub(r'\(.*?\)', '', name or '')) if p and p[0].isalpha()]
    ini = (''.join(p[0] for p in parts[:2]) or '?').upper()
    color = PALETTE[int(hashlib.md5((name or '').encode()).hexdigest(), 16) % len(PALETTE)]
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-label="{html.escape(name or "")}">'
           f'<rect width="120" height="120" rx="60" fill="{color}"/>'
           f'<text x="60" y="60" dy=".35em" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" '
           f'font-size="46" font-weight="600" fill="{INITIALS_TEXT}">{html.escape(ini)}</text></svg>')
    with open(path, 'w') as f:
        f.write(svg)


def fetch_avatar(url, base):
    """Download avatar -> repo-relative path, or None."""
    if not url:
        return None
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=30) as r:
            data, ctype = r.read(), r.headers.get('Content-Type', '')
        ext = '.png' if 'png' in ctype else '.webp' if 'webp' in ctype else '.jpg'
        rel = f'data/images/reviewers/{base}{ext}'
        with open(os.path.join(ROOT, rel), 'wb') as f:
            f.write(data)
        return rel
    except Exception as e:  # expired/blocked URL -> initials
        print('avatar failed', base, e, file=sys.stderr)
        return None


def iso(d):
    if isinstance(d, (int, float)):
        return datetime.datetime.fromtimestamp(d / 1000, datetime.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')
    dt = datetime.datetime.fromisoformat(d.replace('Z', '+00:00'))
    return dt.astimezone(datetime.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def etsy_date(d):
    """Etsy gives a calendar day ('Oct 21, 2025'); stored at 12:00 UTC so it shows as that day in US time zones."""
    if not d:
        return None
    try:
        return iso(d)
    except ValueError:
        return datetime.datetime.strptime(d.strip(), '%b %d, %Y').strftime('%Y-%m-%dT12:00:00Z')


def reply(text, date):
    return {'text': text, 'date': iso(date) if date else None} if text else None


def from_google(x):
    photo = x.get('reviewerPhotoUrl')
    return dict(platform='google', pid=x['reviewId'], name=x.get('name'), photo=photo,
                photo_dl=re.sub(r'=s\d+.*$', '=s160-c', photo) if photo else None,
                profile=x.get('reviewerUrl'), rating=x.get('stars'),
                text=x.get('text') or '', date=iso(x['publishedAtDate']),
                url=x.get('reviewUrl') or REVIEW_PAGE['google'],
                reply=reply(x.get('responseFromOwnerText'), x.get('responseFromOwnerDate')),
                extra={'featured_on_website': x['reviewId'] in FEATURED,
                       'reviewer_review_count': x.get('reviewerNumberOfReviews'),
                       'reviewer_is_local_guide': x.get('isLocalGuide'),
                       'review_image_urls': x.get('reviewImageUrls') or None,
                       'language': x.get('originalLanguage')})


def from_yelp(x):
    a = x.get('author') or {}
    pr = x.get('publicReply') or {}
    return dict(platform='yelp', pid=x['reviewEncid'], name=a.get('name'), photo=a.get('profile_photo'),
                profile=None, rating=x.get('rating'), text=x.get('text') or '', date=iso(x['reviewDate']),
                url=x.get('reviewUrl') or REVIEW_PAGE['yelp'],
                reply=reply(pr.get('text'), pr.get('created_at')),
                extra={'reviewer_review_count': a.get('review_count'),
                       'review_image_urls': [ph.get('url') for ph in x.get('photos') or [] if ph.get('url')] or None,
                       'language': x.get('language')})


def fb_star_tag(tags):
    """Facebook reviews are recommend / don't recommend. A star value is stored only when Facebook itself shows one,
    i.e. a recommendation tag like '5 stars' on the review. Never inferred from 'recommends'."""
    for t in tags or []:
        m = re.fullmatch(r'\s*([1-5])\s*stars?\s*', str(t), re.I)
        if m:
            return int(m.group(1)), t
    return None, None


def from_facebook(x):
    u = x.get('user') or {}
    stars, tag = fb_star_tag(x.get('tags'))
    return dict(platform='facebook', pid=x['id'], name=u.get('name'), photo=u.get('profilePic'),
                profile=u.get('profileUrl'), rating=stars, text=x.get('text') or '', date=iso(x['date']),
                url=x.get('url') or REVIEW_PAGE['facebook'], reply=None,
                extra={'recommended': bool(x.get('isRecommended')), 'tags': x.get('tags') or None,
                       'rating_source': f'facebook recommendation tag "{tag}"' if tag else None})


def from_zola(x):
    resp = next(iter(x.get('responses') or []), {}) or {}
    return dict(platform='zola', pid=x['reviewUuid'], name=x.get('reviewerName'), photo=x.get('reviewerPhotoUrl'),
                profile=None, rating=x.get('overallRating'), text=x.get('reviewText') or '', date=iso(x['createdAt']),
                url=REVIEW_PAGE['zola'],
                reply=reply(resp.get('responseText') or x.get('responseText'), resp.get('createdAt') or x.get('respondedAt')),
                extra={'title': x.get('title'),
                       'review_image_ids': [ph.get('imageUuid') for ph in x.get('reviewPhotos') or []] or None})


ETSY_LISTINGS = {str(i) for i in _SRC.get('etsy', {}).get('listing_ids') or []}  # optional: only these listings
AMAZON_ASINS = {str(i) for i in _SRC.get('amazon', {}).get('asins') or []}       # optional: only these ASINs


def from_etsy(x):
    """Apify astravalabs/etsy-reviews-scraper item. The actor returns every review in the shop; when
    data/sources.json lists etsy `listing_ids`, reviews of other listings are skipped. Etsy only lets buyers review,
    so each review is tied to an order (`review_id` is Etsy's transaction id). The actor has no avatar field; an
    optional `buyer_avatar_url` / `buyer_profile_url` (read from the listing page's review markup) is used when present."""
    lid = str(x.get('listing_id') or '') or None
    if ETSY_LISTINGS and lid not in ETSY_LISTINGS:
        return None
    name = x.get('buyer')
    photos = [p if isinstance(p, str) else (p or {}).get('url') for p in x.get('photos') or []]
    return dict(platform='etsy', pid=str(x['review_id']), name=None if name == 'Anonymous' else name,
                photo=x.get('buyer_avatar_url'), profile=x.get('buyer_profile_url'), rating=x.get('rating'),
                text=x.get('text') or '', date=etsy_date(x['review_date']),
                url=f'https://www.etsy.com/listing/{lid}#reviews' if lid else REVIEW_PAGE['etsy'],
                reply={'text': x['seller_response'], 'date': etsy_date(x.get('seller_response_date'))} if x.get('seller_response') else None,
                extra={'item_reviewed': {'title': x.get('listing_title'), 'listing_id': lid,
                                         'url': f'https://www.etsy.com/listing/{lid}' if lid else None} if (lid or x.get('listing_title')) else None,
                       'verified_purchase': True,
                       'verified_purchase_source': f'Etsy reviews can only be left by buyers; tied to Etsy transaction {x["review_id"]}',
                       'review_image_urls': [p for p in photos if p] or None,
                       'etsy_shop': x.get('shop'),
                       'etsy_shop_id': x.get('shop_id')})


def from_amazon(x):
    """Apify junglee/amazon-reviews-scraper item (run with includeGdprSensitive: true). Error / category-only rows
    (no reviewId) are skipped, as are ASINs not listed in data/sources.json `asins` (when that list is set).
    Amazon shows no seller replies on reviews, so owner_reply is always null. The actor returns `avatar: null` when
    Amazon shows its default silhouette; an initials avatar is generated then."""
    if not x.get('reviewId'):
        return None
    asin = x.get('productAsin') or x.get('variantAsin')
    if AMAZON_ASINS and asin not in AMAZON_ASINS and x.get('productOriginalAsin') not in AMAZON_ASINS:
        return None
    try:
        helpful = int(str(x.get('reviewReaction') or '').split()[0].replace(',', ''))
    except (ValueError, IndexError):
        helpful = 1 if str(x.get('reviewReaction') or '').lower().startswith('one') else None
    prof = (x.get('userProfileLink') or '').split('/ref=')[0] or None
    return dict(platform='amazon', pid=x['reviewId'], name=x.get('username'), photo=x.get('avatar'),
                profile=prof, rating=x.get('ratingScore'), text=x.get('reviewDescription') or '',
                date=f"{x['date'][:10]}T12:00:00Z" if re.fullmatch(r'\d{4}-\d{2}-\d{2}', str(x.get('date') or '')) else iso(x['date']),
                url=x.get('reviewUrl') or REVIEW_PAGE['amazon'], reply=None,
                extra={'title': x.get('reviewTitle'),
                       'item_reviewed': {'title': _SRC.get('amazon', {}).get('product_title'), 'asin': asin,
                                         'variant_asin': x.get('variantAsin'),
                                         'variant': x.get('variant') or None,
                                         'url': f'https://www.amazon.com/dp/{asin}' if asin else None},
                       'verified_purchase': bool(x.get('isVerified')),
                       'amazon_vine': bool(x.get('isAmazonVine')) or None,
                       'helpful_votes': helpful,
                       'reviewed_in': x.get('reviewedIn'),
                       'country': x.get('country'),
                       'amazon_user_id': x.get('userId'),
                       'review_image_urls': x.get('reviewImages') or None})


def main():
    ap = argparse.ArgumentParser()
    for p in ('google', 'yelp', 'facebook', 'zola', 'etsy', 'amazon'):
        ap.add_argument('--' + p)
    ap.add_argument('--source', default='direct', help="value for the `source` field (direct|apify|elfsight)")
    ap.add_argument('--update', action='store_true',
                    help='also refresh reviews that already exist (default: add new reviews only)')
    a = ap.parse_args()
    os.makedirs(REV_DIR, exist_ok=True)
    os.makedirs(IMG_DIR, exist_ok=True)
    existing = {}
    for fn in os.listdir(REV_DIR):
        if fn.endswith('.json') and fn not in ('index.json', 'schema.json'):
            with open(os.path.join(REV_DIR, fn)) as f:
                existing[json.load(f)['id']] = fn
    conv = {'google': from_google, 'yelp': from_yelp, 'facebook': from_facebook, 'zola': from_zola, 'etsy': from_etsy,
            'amazon': from_amazon}
    n = 0
    for plat, fn in conv.items():
        path = getattr(a, plat)
        if not path:
            continue
        with open(path) as f:
            items = json.load(f)
        for x in items:
            r = fn(x)
            if r is None:  # not a review of this business (other listing/ASIN, error row)
                continue
            rid = f"{plat}-{hashlib.sha1(r['pid'].encode()).hexdigest()[:12]}"
            day = r['date'][:10]
            base = f"{plat}-{day}-{slugify(display_name(r['name']))}"
            fname = existing.get(rid)
            if fname and not a.update:
                continue
            old = {}
            if fname:
                with open(os.path.join(REV_DIR, fname)) as f:
                    old = json.load(f)
            else:
                fname, k = base + '.json', 2
                while os.path.exists(os.path.join(REV_DIR, fname)):
                    fname, k = f'{base}-{k}.json', k + 1
            stem = fname[:-5]
            img = old.get('reviewer_image')
            if not (img and os.path.exists(os.path.join(ROOT, img))):  # keep an already-downloaded avatar
                img = fetch_avatar(r.get('photo_dl') or r['photo'], stem)
                if not img:
                    img = f'data/images/reviewers/{stem}.svg'
                    initials_svg(display_name(r['name']), os.path.join(ROOT, img))
            rec = {
                'id': rid,
                'platform': plat,
                'platform_review_id': r['pid'],
                'reviewer_name': r['name'],
                'reviewer_profile_url': r['profile'],
                'reviewer_image': img,
                'reviewer_image_source_url': r['photo'],
                'rating': r['rating'],
                'text': r['text'],
                'date': r['date'],
                'review_url': r['url'],
                'owner_reply': r['reply'],
                'collected_at': old.get('collected_at') or NOW,
                'source': old.get('source') or a.source,
            }
            if old:
                rec['updated_at'] = NOW
            rec.update({k: v for k, v in r['extra'].items() if v not in (None, '', []) and not (v is False and k != 'verified_purchase')})
            with open(os.path.join(REV_DIR, fname), 'w') as f:
                json.dump(rec, f, indent=2, ensure_ascii=False)
                f.write('\n')
            n += 1
            print('  +', fname)
    print(f'wrote {n} review files ({"add+update" if a.update else "new only"})')


if __name__ == '__main__':
    main()
