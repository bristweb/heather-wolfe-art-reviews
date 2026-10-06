#!/usr/bin/env python3
"""Normalize raw scraper output into one JSON file per review under data/reviews/.

Usage:
  python3 scripts/import_reviews.py --google google.json --yelp yelp.json \
      --facebook fb.json --zola zola_reviews.json

Raw inputs (see README "Re-pulling reviews"):
  google   : Apify compass/Google-Maps-Reviews-Scraper dataset items (JSON array)
  yelp     : Apify web_wanderer/yelp-reviews-scraper dataset items
  facebook : Apify apify/facebook-reviews-scraper dataset items
  zola     : review objects extracted from the Zola storefront __NEXT_DATA__

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
SOURCES = {
    'google': 'https://g.page/r/CUdS9bBcbapvEAE/review',
    'yelp': 'https://www.yelp.com/biz/heather-wolfe-art-knoxville',
    'facebook': 'https://www.facebook.com/HeatherWolfeArt/reviews',
    'zola': 'https://www.zola.com/wedding-vendors/wedding-extras/heather-wolfe-art-live-painting',
}
GOOGLE_PLACE_REVIEWS = 'https://search.google.com/local/reviews?placeid=ChIJ2V86YMkXXIgRR1L1sFxtqm8'
# Home-page "Testimonials" on heatherwolfeart.com are excerpts of these Google reviews.
FEATURED = {  # Google review ids of the three home-page testimonials (Brendan C., Haley R., Ciera S.)
    'ChZDSUhNMG9nS0VJQ0FnSURuNEw3MUNREAE',
    'ChZDSUhNMG9nS0VJQ0FnSUM4bS1LNWJBEAE',
    'ChZDSUhNMG9nS0VJQ0FnSUNHaklMaFVREAE',
}
# initials-avatar colors from the heatherwolfeart.com palette (#204a60 / #3c4e58 / #85a0ad family)
PALETTE = ['#204A60', '#3C4E58', '#85A0AD', '#2F6680', '#5B7685', '#4A6B7C']


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
    fix = lambda w: w.capitalize() if w.isupper() or w.islower() else w
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
           f'font-size="46" font-weight="600" fill="#fff">{html.escape(ini)}</text></svg>')
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


def reply(text, date):
    return {'text': text, 'date': iso(date) if date else None} if text else None


def from_google(x):
    photo = x.get('reviewerPhotoUrl')
    return dict(platform='google', pid=x['reviewId'], name=x.get('name'), photo=photo,
                photo_dl=re.sub(r'=s\d+.*$', '=s160-c', photo) if photo else None,
                profile=x.get('reviewerUrl'), rating=x.get('stars'),
                text=x.get('text') or '', date=iso(x['publishedAtDate']),
                url=x.get('reviewUrl') or GOOGLE_PLACE_REVIEWS,
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
                url=x.get('reviewUrl') or SOURCES['yelp'],
                reply=reply(pr.get('text'), pr.get('created_at')),
                extra={'reviewer_review_count': a.get('review_count'),
                       'review_image_urls': [ph.get('url') for ph in x.get('photos') or [] if ph.get('url')] or None,
                       'language': x.get('language')})


def from_facebook(x):
    u = x.get('user') or {}
    return dict(platform='facebook', pid=x['id'], name=u.get('name'), photo=u.get('profilePic'),
                profile=u.get('profileUrl'), rating=None, text=x.get('text') or '', date=iso(x['date']),
                url=x.get('url') or SOURCES['facebook'], reply=None,
                extra={'recommended': bool(x.get('isRecommended')), 'tags': x.get('tags') or None})


def from_zola(x):
    resp = next(iter(x.get('responses') or []), {}) or {}
    return dict(platform='zola', pid=x['reviewUuid'], name=x.get('reviewerName'), photo=x.get('reviewerPhotoUrl'),
                profile=None, rating=x.get('overallRating'), text=x.get('reviewText') or '', date=iso(x['createdAt']),
                url=SOURCES['zola'] + '#reviews',
                reply=reply(resp.get('responseText') or x.get('responseText'), resp.get('createdAt') or x.get('respondedAt')),
                extra={'title': x.get('title'),
                       'review_image_ids': [ph.get('imageUuid') for ph in x.get('reviewPhotos') or []] or None})


def main():
    ap = argparse.ArgumentParser()
    for p in ('google', 'yelp', 'facebook', 'zola'):
        ap.add_argument('--' + p)
    ap.add_argument('--source', default='direct', help="value for the `source` field (elfsight|direct)")
    ap.add_argument('--update', action='store_true',
                    help='also refresh reviews that already exist (default: add new reviews only)')
    a = ap.parse_args()
    os.makedirs(REV_DIR, exist_ok=True)
    os.makedirs(IMG_DIR, exist_ok=True)
    existing = {}
    for fn in os.listdir(REV_DIR):
        if fn.endswith('.json') and fn != 'index.json':
            with open(os.path.join(REV_DIR, fn)) as f:
                existing[json.load(f)['id']] = fn
    conv = {'google': from_google, 'yelp': from_yelp, 'facebook': from_facebook, 'zola': from_zola}
    n = 0
    for plat, fn in conv.items():
        path = getattr(a, plat)
        if not path:
            continue
        with open(path) as f:
            items = json.load(f)
        for x in items:
            r = fn(x)
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
            rec.update({k: v for k, v in r['extra'].items() if v not in (None, False, '', [])})
            with open(os.path.join(REV_DIR, fname), 'w') as f:
                json.dump(rec, f, indent=2, ensure_ascii=False)
                f.write('\n')
            n += 1
            print('  +', fname)
    print(f'wrote {n} review files ({"add+update" if a.update else "new only"})')


if __name__ == '__main__':
    main()
