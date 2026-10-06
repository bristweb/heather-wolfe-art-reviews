#!/usr/bin/env node
// Builds data/reviews/index.json from every data/reviews/*.json file (static manifest for the widget).
// The manifest carries the full review records (full name, full text, owner reply, URLs, ...) plus
// `file` and `has_text`; the widget abbreviates last names and clips text at render time.
// Usage: node scripts/build-index.mjs   (no dependencies)
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'data', 'reviews');
const required = ['id', 'platform', 'reviewer_name', 'reviewer_image', 'text', 'date', 'review_url', 'source'];

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
