/* Heather Wolfe Art reviews widget — static, no dependencies.
 * Shows reviewer display names (first name + last initial) and ~160-char snippets only;
 * every card links to the original review on its platform.
 * Usage: <div class="hwa-reviews" data-layout="carousel|grid" data-platform="all|google|yelp|zola|facebook"
 *             data-limit="0" data-base="./"></div>
 * The widget fetches <base>data/reviews/index.json (built by scripts/build-index.mjs).
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

  // Card order: deterministic, newest first, with gentle platform diversity (same on every load).
  const MAX_SAME_RUN = 2;          // after this many consecutive cards from one platform...
  const DIVERSITY_WINDOW_DAYS = 548; // ...prefer another platform if its newest review is <= ~18 months older
  const byNewest = (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id);

  function diverseOrder(list) {
    const rest = list.slice().sort(byNewest), out = [];
    while (rest.length) {
      let i = 0;
      const run = out.slice(-MAX_SAME_RUN);
      if (run.length === MAX_SAME_RUN && run.every(r => r.platform === rest[0].platform)) {
        const j = rest.findIndex(r => r.platform !== rest[0].platform);
        const gapDays = j < 0 ? Infinity : (new Date(rest[0].date) - new Date(rest[j].date)) / 864e5;
        if (gapDays <= DIVERSITY_WINDOW_DAYS) i = j;
      }
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
    // Stay invisible (opacity 0, see CSS) until the webfont is ready AND the first render is laid out,
    // then fade in once, so there's no font swap or re-fit flash. Header steps are pure CSS container queries.
    const reveal = () => requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.add('hwa-ready'); notifyHeight(); }));
    let data;
    try {
      const [res] = await Promise.all([fetch(base + 'data/reviews/index.json', { cache: 'no-cache' }), fontsReady()]);
      data = await res.json();
    } catch (e) {
      el.innerHTML = '<div class="hwa-loading">Reviews are unavailable right now.</div>';
      reveal();
      return;
    }
    const all = data.reviews;
    const withText = all.filter(r => r.has_text && r.snippet);  // rating-only reviews never become cards
    const newest = withText.slice().sort(byNewest);
    const allOrder = diverseOrder(withText);
    const present = Object.keys(PLATFORMS).filter(p => all.some(r => r.platform === p));
    let active = cfg.platform;

    function render() {
      const pool = active === 'all' ? all : all.filter(r => r.platform === active);
      const rated = pool.filter(r => typeof r.rating === 'number');
      const avg = rated.length ? rated.reduce((s, r) => s + r.rating, 0) / rated.length : 5;
      // snippet only; full text is never shown. "All": newest first + gentle diversity; one platform: newest first.
      let shown = active === 'all' ? allOrder : newest.filter(r => r.platform === active);
      if (cfg.limit) shown = shown.slice(0, cfg.limit);
      const write = PLATFORMS[active === 'all' ? 'google' : active].write;

      const tabs = present.length > 1 ? `<div class="hwa-tabs" role="tablist" aria-label="Filter reviews by platform">
        ${['all', ...present].map(p => {
          const n = p === 'all' ? all.length : all.filter(r => r.platform === p).length;
          const name = p === 'all' ? 'All reviews' : PLATFORMS[p].name;
          return `<button role="tab" class="hwa-tab ${p === active ? 'is-active' : ''}" data-p="${p}" aria-selected="${p === active}"
            title="${name}: ${n} reviews" aria-label="${name}, ${n} reviews">
            ${p === 'all' ? '<span class="hwa-tab-name">All<span class="hwa-tab-long"> reviews</span></span>' : `<img src="${base}assets/icons/${p}.svg" alt=""><span class="hwa-tab-name">${name}</span>`}
            <em>${n}</em></button>`;
        }).join('')}</div>` : '';

      const header = `<header class="hwa-header">
        <div class="hwa-summary">
          <div class="hwa-score">${avg.toFixed(1)}</div>
          <div>
            <div class="hwa-label">${label(avg)}</div>
            ${stars(avg, 'hwa-stars-lg')}
            <div class="hwa-based"><span class="hwa-based-pre">Based on </span><strong>${pool.length}</strong> review${pool.length === 1 ? '' : 's'}<span class="hwa-based-pre">${active === 'all' ? '' : ' on ' + PLATFORMS[active].name}</span></div>
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
            <img class="hwa-platform" src="${base}assets/icons/${esc(r.platform)}.svg" alt="">
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
    reveal();
    new ResizeObserver(notifyHeight).observe(el);
  }

  // Resolves when the widget's Inter faces are loaded, or after 1.2 s (then the metric-matched fallback shows).
  function fontsReady() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    const faces = ['400 15px "HWA Inter"', '700 15px "HWA Inter"', 'italic 300 15px "HWA Inter"'];
    return Promise.race([
      Promise.all(faces.map(f => document.fonts.load(f))).catch(() => {}),
      new Promise(r => setTimeout(r, 1200)),
    ]);
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
