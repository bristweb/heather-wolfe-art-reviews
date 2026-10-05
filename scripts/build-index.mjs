#!/usr/bin/env node
// Builds reviews/index.json from every reviews/*.json file (static manifest for the widget).
// The manifest is deliberately minimal: display name (first name + last initial) and the
// ~160-char snippet only. Per-review files must not contain full text, owner replies,
// avatar source URLs, or reviewer profile URLs either (the repo is public); this script fails if they do.
// Usage: node scripts/build-index.mjs   (no dependencies)
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'reviews');
const required = ['id', 'platform', 'reviewer_display_name', 'reviewer_image', 'snippet', 'date', 'review_url', 'source'];
// Fields copied into the public manifest (everything else stays in the per-review file).
const PUBLIC = ['id', 'platform', 'reviewer_display_name', 'reviewer_image', 'rating', 'recommended',
  'snippet', 'date', 'review_url', 'featured_on_website'];
const NAME_RE = /^[^\s]+( & [^\s]+)?( [A-Z]\.)?$/;

const files = (await readdir(dir)).filter(f => f.endsWith('.json') && f !== 'index.json').sort();
const reviews = [];
const errors = [];
const ids = new Set();
for (const f of files) {
  let r;
  try { r = JSON.parse(await readFile(path.join(dir, f), 'utf8')); }
  catch (e) { errors.push(`${f}: invalid JSON (${e.message})`); continue; }
  for (const k of required) if (r[k] === undefined) errors.push(`${f}: missing "${k}"`);
  if (r.rating !== null && r.rating !== undefined && !(r.rating >= 1 && r.rating <= 5)) errors.push(`${f}: rating must be 1-5 or null`);
  for (const k of ['text', 'owner_response', 'reviewer_image_source_url'])
    if (k in r) errors.push(`${f}: "${k}" must not be stored (snippet only, no identifying data)`);
  if ((r.snippet || '').length > 170) errors.push(`${f}: snippet longer than 170 chars`);
  if (/facebook\.com\/(?!HeatherWolfeArt)/i.test(r.review_url || '')) errors.push(`${f}: Facebook review_url must be the page's reviews tab, not a profile/post URL`);
  if ('reviewer_name' in r) errors.push(`${f}: has "reviewer_name"; store only "reviewer_display_name" (first name + last initial)`);
  if (r.reviewer_display_name && !NAME_RE.test(r.reviewer_display_name)) errors.push(`${f}: reviewer_display_name "${r.reviewer_display_name}" must look like "Kylee M."`);
  if (ids.has(r.id)) errors.push(`${f}: duplicate id ${r.id}`);
  ids.add(r.id);
  const pub = { file: `reviews/${f}` };
  for (const k of PUBLIC) if (r[k] !== undefined) pub[k] = r[k];
  pub.has_text = Boolean((r.snippet || '').trim());
  reviews.push(pub);
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }

reviews.sort((a, b) => b.date.localeCompare(a.date));
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
console.log(`reviews/index.json: ${reviews.length} reviews`, JSON.stringify(summary.platforms));
