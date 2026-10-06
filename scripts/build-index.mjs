#!/usr/bin/env node
// Builds data/reviews/index.json from every data/reviews/*.json file (static manifest for the widget).
// The manifest carries the full review records (full name, full text, owner reply, URLs, ...) plus
// `file` and `has_text`; the widget abbreviates last names and clips text at render time.
// Also writes data/reviews/schema.json: schema.org JSON-LD (business + AggregateRating + recent Review items) that the
// widget injects into the host page. Review items use the same display name / snippet the widget shows.
// Usage: node scripts/build-index.mjs   (no dependencies)
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'data', 'reviews');
const required = ['id', 'platform', 'reviewer_name', 'reviewer_image', 'text', 'date', 'review_url', 'source'];

const GENERATED = new Set(['index.json', 'schema.json']);
const files = (await readdir(dir)).filter(f => f.endsWith('.json') && !GENERATED.has(f)).sort();
const reviews = [];
const errors = [];
const ids = new Set();
for (const f of files) {
  let r;
  try { r = JSON.parse(await readFile(path.join(dir, f), 'utf8')); }
  catch (e) { errors.push(`${f}: invalid JSON (${e.message})`); continue; }
  for (const k of required) if (r[k] === undefined) errors.push(`${f}: missing "${k}"`);
  if (r.rating !== null && r.rating !== undefined && !(r.rating >= 1 && r.rating <= 5)) errors.push(`${f}: rating must be 1-5 or null`);
  if (r.date && Number.isNaN(Date.parse(r.date))) errors.push(`${f}: date is not ISO 8601`);
  if (r.reviewer_image && !existsSync(path.join(root, r.reviewer_image))) errors.push(`${f}: reviewer_image ${r.reviewer_image} not found`);
  if (r.reviewer_image && !r.reviewer_image.startsWith('data/images/reviewers/')) errors.push(`${f}: reviewer_image must live under data/images/reviewers/`);
  if (ids.has(r.id)) errors.push(`${f}: duplicate id ${r.id}`);
  ids.add(r.id);
  reviews.push({ file: `data/reviews/${f}`, ...r, has_text: Boolean((r.text || '').replace(/[\s\u200b-\u200d\u2060\ufeff]+/g, '')) });
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }

reviews.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
const platforms = {};
for (const r of reviews) {
  const p = (platforms[r.platform] ??= { count: 0, rated: 0, sum: 0 });
  p.count++;
  if (typeof r.rating === 'number') { p.rated++; p.sum += r.rating; }
}
const rated = reviews.filter(r => typeof r.rating === 'number');
const summary = {
  total: reviews.length,
  rated: rated.length,
  average_rating: rated.length ? Math.round((rated.reduce((s, r) => s + r.rating, 0) / rated.length) * 100) / 100 : null,
  platforms: Object.fromEntries(Object.entries(platforms).map(([k, v]) => [k, {
    count: v.count, average_rating: v.rated ? Math.round((v.sum / v.rated) * 100) / 100 : null,
  }])),
};
const out = { generated_by: 'scripts/build-index.mjs', summary, files: reviews.map(r => r.file), reviews };
await writeFile(path.join(dir, 'index.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`data/reviews/index.json: ${reviews.length} reviews`, JSON.stringify(summary.platforms));

// ---------------- schema.org JSON-LD ----------------
// Mirrors the widget's presentation helpers (assets/js/reviews-widget.js displayName/snippet) so the markup
// matches what visitors see. Every review is listed (schema.max_reviews 0 = all): text reviews in the widget's
// "All reviews" card order, then rating-only / empty reviews newest first. A review without a 1-5 rating
// (Facebook "recommends") is a Review with no reviewRating and is left out of the AggregateRating; a review
// without text has no reviewBody. The AI summary (data/summary.json) is never included.
const config = JSON.parse(await readFile(path.join(root, 'data', 'config.json'), 'utf8'));
const D = { snippet_chars: 160, abbreviate_last_names: true, ...(config.display || {}) };
const SC = { enabled: true, type: 'LocalBusiness', max_reviews: 0, ...(config.schema || {}) };
const isUpper = w => w === w.toUpperCase() && w !== w.toLowerCase();
const isLower = w => w === w.toLowerCase() && w !== w.toUpperCase();
const cap = w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
function displayName(name) {
  if (!D.abbreviate_last_names) return (name || '').trim() || 'Anonymous';
  const words = (name || '').replace(/\(.*?\)/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'Anonymous';
  const fix = w => (isUpper(w) && w.length <= 2 ? w : isUpper(w) || isLower(w) ? cap(w) : w); // 'AA' (initials) stays
  if (words.length === 1) return fix(words[0]);
  let first = words.slice(0, -1);
  const last = words[words.length - 1];
  if (!(first.length >= 3 && ['and', '&'].includes(first[1].toLowerCase()))) first = first.slice(0, 1);
  first = first.map(w => (['and', '&'].includes(w.toLowerCase()) ? '&' : fix(w)));
  return first.join(' ') + ' ' + last.charAt(0).toUpperCase() + '.';
}
function snippet(text, fullName) {
  let t = (text || '').replace(/\s+/g, ' ').trim();
  if (D.abbreviate_last_names) {
    const words = (fullName || '').replace(/[()]/g, ' ').split(/\s+/).map(w => w.replace(/^[.,]+|[.,]+$/g, ''));
    for (const w of words.slice(1)) {
      if (w.length > 1 && !['and', '&'].includes(w.toLowerCase())) {
        t = t.replace(new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'), w.charAt(0).toUpperCase() + '.');
      }
    }
  }
  const cps = Array.from(t);
  if (!D.snippet_chars || cps.length <= D.snippet_chars) return t;
  let cut = cps.slice(0, D.snippet_chars).join('');
  if (cut.includes(' ')) cut = cut.slice(0, cut.lastIndexOf(' '));
  return cut.replace(/[,.;:!?-]+$/, '') + '…';
}
// Same order as the widget's "All reviews" cards: newest first with gentle platform diversity (widget diverseOrder).
const D2 = { max_same_platform_run: 2, diversity_window_days: 548, ...(config.display || {}) };
const byNewest = (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id);
function diverseOrder(list) {
  const rest = list.slice().sort(byNewest), out = [];
  const RUN = D2.max_same_platform_run, WINDOW = D2.diversity_window_days;
  while (rest.length) {
    let i = 0;
    const run = out.slice(-RUN);
    if (RUN > 0 && run.length === RUN && run.every(r => r.platform === rest[0].platform)) {
      const j = rest.findIndex(r => r.platform !== rest[0].platform);
      const gapDays = j < 0 ? Infinity : (new Date(rest[0].date) - new Date(rest[j].date)) / 864e5;
      if (gapDays <= WINDOW) i = j;
    }
    out.push(rest.splice(i, 1)[0]);
  }
  return out;
}
const withText = reviews.filter(r => r.has_text && snippet(r.text, r.reviewer_name));
const cardOrder = diverseOrder(withText);
const textIds = new Set(withText.map(r => r.id));
const allOrder = [...cardOrder, ...reviews.filter(r => !textIds.has(r.id)).sort(byNewest)];
const listed = SC.max_reviews > 0 ? allOrder.slice(0, SC.max_reviews) : allOrder;
const starred = reviews.filter(r => typeof r.rating === 'number');
const pname = p => (config.platforms?.[p]?.name) || p;
const biz = config.business || {};
const schema = SC.enabled && starred.length ? {
  '@context': 'https://schema.org',
  '@type': SC.type,
  ...(biz.website ? { '@id': biz.website.replace(/\/?$/, '/') + '#business' } : {}),
  name: biz.name,
  ...(biz.website ? { url: biz.website } : {}),
  ...(SC.extra || {}),
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: (starred.reduce((s, r) => s + r.rating, 0) / starred.length).toFixed(1),
    bestRating: 5,
    worstRating: 1,
    ratingCount: starred.length,
    reviewCount: starred.length,
  },
  review: listed.map(r => ({
    '@type': 'Review',
    author: { '@type': 'Person', name: displayName(r.reviewer_name) },
    datePublished: r.date.slice(0, 10),
    ...(typeof r.rating === 'number' ? { reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 } } : {}),
    ...(textIds.has(r.id) ? { reviewBody: snippet(r.text, r.reviewer_name) } : {}),
    publisher: { '@type': 'Organization', name: pname(r.platform) },
  })),
} : null;
await writeFile(path.join(dir, 'schema.json'), JSON.stringify(schema, null, 2) + '\n');
console.log(`data/reviews/schema.json: ${schema ? `${schema['@type']}, rating ${schema.aggregateRating.ratingValue} from ${schema.aggregateRating.ratingCount} star ratings, ${schema.review.length} Review items (${schema.review.filter(r => !r.reviewRating).length} without rating, ${schema.review.filter(r => !r.reviewBody).length} without text)` : 'disabled'}`);
