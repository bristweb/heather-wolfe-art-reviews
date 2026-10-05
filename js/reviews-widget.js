/* Heather Wolfe Art reviews widget — static, no dependencies.
 * Shows reviewer display names (first name + last initial) and ~160-char snippets only;
 * every card links to the original review on its platform.
 * Usage: <div class="hwa-reviews" data-layout="carousel|grid" data-platform="all|google|yelp|zola|facebook"
 *             data-limit="0" data-base="./"></div>
 * The widget fetches <base>reviews/index.json (built by scripts/build-index.mjs).
 * URL params on the host page (?layout=grid&platform=google&limit=12) override data attributes.
 */
(function () {
  const PLATFORMS = {
    google:   { name: 'Google',   write: 'https://g.page/r/CUdS9bBcbapvEAE/review', page: 'https://search.google.com/local/reviews?placeid=ChIJ2V86YMkXXIgRR1L1sFxtqm8' },
    yelp:     { name: 'Yelp',     write: 'https://www.yelp.com/writeareview/biz/heather-wolfe-art-knoxville', page: 'https://www.yelp.com/biz/heather-wolfe-art-knoxville' },
    zola:     { name: 'Zola',     write: 'https://www.zola.com/wedding-vendors/wedding-extras/heather-wolfe-art-live-painting#reviews', page: 'https://www.zola.com/wedding-vendors/wedding-extras/heather-wolfe-art-live-painting#reviews' },
    facebook: { name: 'Facebook', write: 'https://www.facebook.com/HeatherWolfeArt/reviews', page: 'https://www.facebook.com/HeatherWolfeArt/reviews' },
  };
  const STAR = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9z"/></svg>';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const stars = (n, cls = '') => `<span class="hwa-stars ${cls}" role="img" aria-label="${n} out of 5 stars">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= Math.round(n) ? 'on' : ''}">${STAR}</i>`).join('')}</span>`;
  const fmtDate = d => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const label = avg => avg >= 4.75 ? 'Excellent' : avg >= 4.25 ? 'Great' : avg >= 3.5 ? 'Good' : 'Reviews';

  // Recency-weighted random order, recomputed on every page load.
  // weight = 0.5^(age / 1 year); key = u^(1/weight) (Efraimidis–Spirakis weighted sampling),
  // so newer reviews tend to come first but the order varies each load.
  const HALF_LIFE_DAYS = 365;
  function weightedShuffle(list) {
    const now = Date.now();
    return list
      .map(r => {
        const ageDays = Math.max(0, (now - new Date(r.date).getTime()) / 864e5);
        const w = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
        return { r, k: Math.pow(Math.random(), 1 / Math.max(w, 1e-6)) };
      })
      .sort((a, b) => b.k - a.k)
      .map(x => x.r);
  }
  // Greedy platform interleave: next card = highest-ranked remaining review from a different
  // platform than the previous card (falls back to the same platform when nothing else is left).
  function interleave(ordered) {
    const rest = ordered.slice(), out = [];
    while (rest.length) {
      const prev = out.length ? out[out.length - 1].platform : null;
      let i = rest.findIndex(r => r.platform !== prev);
      if (i < 0) i = 0;
      out.push(rest.splice(i, 1)[0]);
    }
    return out;
  }

  async function mount(el) {
    const q = new URLSearchParams(location.search);
    const base = el.dataset.base || './';
    const cfg = {
      layout: q.get('layout') || el.dataset.layout || 'carousel',
      platform: q.get('platform') || el.dataset.platform || 'all',
      limit: +(q.get('limit') || el.dataset.limit || 0),
    };
    el.classList.add('hwa-root', 'hwa-layout-' + cfg.layout);
    el.innerHTML = '<div class="hwa-loading">Loading reviews…</div>';
    let data;
    try {
      const res = await fetch(base + 'reviews/index.json', { cache: 'no-cache' });
      data = await res.json();
    } catch (e) {
      el.innerHTML = '<div class="hwa-loading">Reviews are unavailable right now.</div>';
      return;
    }
    const all = data.reviews;
    const ranked = weightedShuffle(all.filter(r => r.has_text && r.snippet));  // rating-only reviews never become cards
    const allOrder = interleave(ranked);
    const present = Object.keys(PLATFORMS).filter(p => all.some(r => r.platform === p));
    let active = cfg.platform;

    function render() {
      const pool = active === 'all' ? all : all.filter(r => r.platform === active);
      const rated = pool.filter(r => typeof r.rating === 'number');
      const avg = rated.length ? rated.reduce((s, r) => s + r.rating, 0) / rated.length : 5;
      // snippet only; full text is never shown. "All": shuffled + interleaved; one platform: shuffled.
      let shown = active === 'all' ? allOrder : ranked.filter(r => r.platform === active);
      if (cfg.limit) shown = shown.slice(0, cfg.limit);
      const write = PLATFORMS[active === 'all' ? 'google' : active].write;

      const tabs = present.length > 1 ? `<div class="hwa-tabs" role="tablist" aria-label="Filter reviews by platform">
        ${['all', ...present].map(p => {
          const n = p === 'all' ? all.length : all.filter(r => r.platform === p).length;
          return `<button role="tab" class="hwa-tab ${p === active ? 'is-active' : ''}" data-p="${p}" aria-selected="${p === active}">
            ${p === 'all' ? '<span>All reviews</span>' : `<img src="${base}icons/${p}.svg" alt=""><span>${PLATFORMS[p].name}</span>`}
            <em>${n}</em></button>`;
        }).join('')}</div>` : '';

      const header = `<header class="hwa-header">
        <div class="hwa-summary">
          <div class="hwa-score">${avg.toFixed(1)}</div>
          <div>
            <div class="hwa-label">${label(avg)}</div>
            ${stars(avg, 'hwa-stars-lg')}
            <div class="hwa-based">Based on <strong>${pool.length}</strong> review${pool.length === 1 ? '' : 's'}${active === 'all' ? '' : ' on ' + PLATFORMS[active].name}</div>
          </div>
        </div>
        <a class="hwa-write" href="${write}" target="_blank" rel="noopener">Write a review</a>
        ${tabs}
      </header>`;

      const cards = shown.map(r => {
        const P = PLATFORMS[r.platform] || { name: r.platform };
        const rating = typeof r.rating === 'number' ? stars(r.rating)
          : `<span class="hwa-rec"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 9h3v9H2zM7 18h7.6a2 2 0 0 0 2-1.6l1.2-6A2 2 0 0 0 15.8 8H12V4.5A2.5 2.5 0 0 0 9.5 2L7 8z"/></svg>Recommends</span>`;
        const aria = `Read ${r.reviewer_display_name}'s review on ${P.name} (opens in a new tab)`;
        // The whole card is one link; nothing inside it is interactive (no nested links).
        return `<a class="hwa-card" data-platform="${esc(r.platform)}" href="${esc(r.review_url)}" target="_blank" rel="noopener" aria-label="${esc(aria)}">
          <div class="hwa-card-top">
            <img class="hwa-avatar" src="${base}${esc(r.reviewer_image)}" alt="" loading="lazy" width="44" height="44">
            <div class="hwa-who">
              <div class="hwa-name">${esc(r.reviewer_display_name)}</div>
              <time datetime="${esc(r.date)}">${fmtDate(r.date)}</time>
            </div>
            <img class="hwa-platform" src="${base}icons/${esc(r.platform)}.svg" alt="">
          </div>
          ${rating}
          <p class="hwa-text">${esc(r.snippet)}</p>
          <span class="hwa-link" aria-hidden="true">View on ${esc(P.name)} <span class="hwa-arrow">→</span></span>
        </a>`;
      }).join('');

      el.innerHTML = `${header}
        <div class="hwa-viewport">
          ${cfg.layout === 'carousel' ? '<button class="hwa-nav hwa-prev" aria-label="Previous reviews">‹</button>' : ''}
          <div class="hwa-track">${cards}</div>
          ${cfg.layout === 'carousel' ? '<button class="hwa-nav hwa-next" aria-label="Next reviews">›</button>' : ''}
        </div>`;

      el.querySelectorAll('.hwa-tab').forEach(b => b.addEventListener('click', () => { active = b.dataset.p; render(); }));
      const track = el.querySelector('.hwa-track');
      const step = dir => track.scrollBy({ left: dir * track.clientWidth * 0.9, behavior: 'smooth' });
      el.querySelector('.hwa-prev')?.addEventListener('click', () => step(-1));
      el.querySelector('.hwa-next')?.addEventListener('click', () => step(1));
      const upd = () => {
        const p = el.querySelector('.hwa-prev'), n = el.querySelector('.hwa-next');
        if (!p) return;
        p.disabled = track.scrollLeft < 4;
        n.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
      };
      track.addEventListener('scroll', upd, { passive: true });
      upd();
      notifyHeight();
    }
    render();
    new ResizeObserver(notifyHeight).observe(el);
  }

  // When rendered inside an iframe (embed.html), tell the parent page our height.
  function notifyHeight() {
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'hwa-reviews-height', height: document.documentElement.scrollHeight }, '*');
    }
  }

  const start = () => document.querySelectorAll('.hwa-reviews').forEach(mount);
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
})();
