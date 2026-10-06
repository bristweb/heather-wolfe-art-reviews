/* Reviews widget — static, no dependencies, no site-specific code.
 * Everything about the site comes from the repo's data/ folder:
 *   data/config.json         platforms (names, icons, write/page URLs), strings, display options
 *   data/theme/theme.css     fonts + CSS custom properties (colors, radius)
 *   data/reviews/index.json  the reviews (built by scripts/build-index.mjs)
 * The data carries full records; presentation only: reviewer names are shown as first name + last initial and
 * review text is clipped to a short snippet (both computed here at render time).
 *
 * Usage (JS embed):
 *   <div class="reviews-widget" data-layout="carousel|grid" data-platform="all|<platform>" data-limit="0"></div>
 *   <script src="https://<host>/<repo>/assets/js/reviews-widget.js" defer></script>
 * The script finds the repo root from its own URL (override with data-base="https://.../"), loads the CSS
 * (assets/css/reviews-widget.css + data/theme/theme.css) if the page doesn't already have it, then renders.
 * URL params on the host page (?layout=grid&platform=google&limit=12) override data attributes.
 */
(function () {
  const SCRIPT = document.currentScript && document.currentScript.src;
  const DEFAULT_BASE = SCRIPT ? new URL('../../', SCRIPT).href : './';
  const STRINGS = {
    loading: 'Loading reviews…', unavailable: 'Reviews are unavailable right now.',
    tabs_aria: 'Filter reviews by platform', tab_all: 'All', tab_all_suffix: ' reviews',
    tab_title: '{name}: {count} reviews', tab_aria: '{name}, {count} reviews', write_review: 'Write a review',
    based_on: 'Based on ', review_one: 'review', review_many: 'reviews', on_platform: ' on {platform}',
    stars_aria: '{rating} out of 5 stars', recommends: 'Recommends', view_on: 'View on {platform}',
    card_aria: "Read {name}'s review on {platform} (opens in a new tab)", anonymous: 'Anonymous',
    previous: 'Previous reviews', next: 'Next reviews',
  };
  const DISPLAY = {
    layout: 'carousel', snippet_chars: 160, abbreviate_last_names: true, max_same_platform_run: 2,
    diversity_window_days: 548, date_locale: 'en-US', date_options: { year: 'numeric', month: 'short', day: 'numeric' },
    font_timeout_ms: 1200,
  };
  const RATING_LABELS = [{ min: 4.75, label: 'Excellent' }, { min: 4.25, label: 'Great' }, { min: 3.5, label: 'Good' }, { min: 0, label: 'Reviews' }];
  const STAR = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9z"/></svg>';
  const THUMB = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 9h3v9H2zM7 18h7.6a2 2 0 0 0 2-1.6l1.2-6A2 2 0 0 0 15.8 8H12V4.5A2.5 2.5 0 0 0 9.5 2L7 8z"/></svg>';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fill = (tpl, vars) => String(tpl).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  const byNewest = (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id);

  // ---- loading helpers ----
  const fetchJson = url => fetch(url, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(r.status + ' ' + url); return r.json(); });
  const cssLoads = {};
  // Adds <link rel=stylesheet> unless the page already has it; resolves once it's applied (or failed).
  function ensureCss(href) {
    if (cssLoads[href]) return cssLoads[href];
    let link = [...document.querySelectorAll('link[rel~="stylesheet"]')].find(l => l.href === href);
    if (!link) {
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    } else if (link.sheet) {
      return (cssLoads[href] = Promise.resolve());
    }
    return (cssLoads[href] = new Promise(res => {
      link.addEventListener('load', res, { once: true });
      link.addEventListener('error', res, { once: true });
    }));
  }
  const loads = {};
  // One fetch of config + reviews + CSS per base, shared by every widget on the page.
  function load(base) {
    return (loads[base] ??= Promise.all([
      fetchJson(base + 'data/config.json'),
      fetchJson(base + 'data/reviews/index.json'),
      ensureCss(base + 'assets/css/reviews-widget.css'),
      ensureCss(base + 'data/theme/theme.css'),
    ]));
  }
  // Resolves when the theme's webfont (first family in the computed font-family) is loaded, or after a timeout
  // (then the theme's fallback face shows).
  const GENERIC_FONTS = /^(serif|sans-serif|monospace|cursive|fantasy|math|emoji|system-ui|ui-[a-z-]+|-apple-system|BlinkMacSystemFont)$/i;
  function fontsReady(el, timeout) {
    const fam = getComputedStyle(el).fontFamily.split(',')[0].trim();
    if (!document.fonts || !document.fonts.load || !fam || GENERIC_FONTS.test(fam)) return Promise.resolve();
    const faces = ['400 15px ' + fam, '700 15px ' + fam, 'italic 300 15px ' + fam];
    return Promise.race([
      Promise.all(faces.map(f => document.fonts.load(f))).catch(() => {}),
      new Promise(r => setTimeout(r, timeout)),
    ]);
  }

  async function mount(el) {
    const q = new URLSearchParams(location.search);
    let base = el.dataset.base || DEFAULT_BASE;
    if (!base.endsWith('/')) base += '/';
    el.classList.add('rw-root');
    el.style.opacity = '0'; // hidden until CSS, fonts and the first layout are ready (CSS takes over afterwards)
    // Stay invisible until the webfont is ready AND the first render is laid out, then fade in once, so there's
    // no font swap or re-fit flash. Header steps are pure CSS container queries.
    const reveal = () => requestAnimationFrame(() => requestAnimationFrame(() => {
      el.classList.add('rw-ready');
      el.style.removeProperty('opacity');
      notifyHeight();
    }));
    let config, data;
    try {
      [config, data] = await load(base);
    } catch (e) {
      el.innerHTML = `<div class="rw-loading">${esc(STRINGS.unavailable)}</div>`;
      reveal();
      return;
    }
    const S = { ...STRINGS, ...(config.strings || {}) };
    const D = { ...DISPLAY, ...(config.display || {}) };
    const PLATFORMS = config.platforms || {};
    const RL = (config.rating_labels || RATING_LABELS).slice().sort((a, b) => b.min - a.min);
    const cfg = {
      layout: q.get('layout') || el.dataset.layout || D.layout,
      platform: q.get('platform') || el.dataset.platform || 'all',
      limit: +(q.get('limit') || el.dataset.limit || 0),
    };
    el.classList.add('rw-layout-' + cfg.layout);
    el.innerHTML = `<div class="rw-loading">${esc(S.loading)}</div>`;
    await fontsReady(el, D.font_timeout_ms);

    const url = p => (/^(https?:|data:|\/)/.test(p) ? p : base + p);
    const pname = p => (PLATFORMS[p] && PLATFORMS[p].name) || p;
    const label = avg => (RL.find(x => avg >= x.min) || { label: '' }).label;
    const fmtDate = d => new Date(d).toLocaleDateString(D.date_locale, D.date_options);
    const stars = (n, cls = '') => `<span class="rw-stars ${cls}" role="img" aria-label="${fill(S.stars_aria, { rating: n })}">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= Math.round(n) ? 'on' : ''}">${STAR}</i>`).join('')}</span>`;
    const icon = (p, cls) => {
      const P = PLATFORMS[p] || {};
      const c = [cls, P.invert_icon_when_active ? 'rw-icon-invert' : ''].filter(Boolean).join(' ');
      return `<img${c ? ` class="${c}"` : ''} src="${esc(url(P.icon || `data/icons/${p}.svg`))}" alt="">`;
    };

    // ---- presentation helpers (data stays complete; only the display is abbreviated/clipped) ----
    const isAllUpper = w => w === w.toUpperCase() && w !== w.toLowerCase();
    const isAllLower = w => w === w.toLowerCase() && w !== w.toUpperCase();
    const capitalize = w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    // 'Jane Doe' -> 'Jane D.'; 'Mary Smith (Smith Studio)' -> 'Mary S.'; 'Ann And Bob C.' -> 'Ann & Bob C.'; 'JANE D.' -> 'Jane D.'
    function displayName(name) {
      if (!D.abbreviate_last_names) return (name || '').trim() || S.anonymous;
      const words = (name || '').replace(/\(.*?\)/g, ' ').trim().split(/\s+/).filter(Boolean);
      if (!words.length) return S.anonymous;
      const fix = w => (isAllUpper(w) || isAllLower(w) ? capitalize(w) : w);
      if (words.length === 1) return fix(words[0]);
      let first = words.slice(0, -1);
      const last = words[words.length - 1];
      if (!(first.length >= 3 && ['and', '&'].includes(first[1].toLowerCase()))) first = first.slice(0, 1);
      first = first.map(w => (['and', '&'].includes(w.toLowerCase()) ? '&' : fix(w)));
      return first.join(' ') + ' ' + last.charAt(0).toUpperCase() + '.';
    }
    // First N characters at a word boundary; with abbreviation on, the reviewer's own surname(s) shown as an initial.
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
    // Card link: the individual review URL, or the platform page when the platform sets card_link: "page".
    const cardHref = r => ((PLATFORMS[r.platform] || {}).card_link === 'page' ? PLATFORMS[r.platform].page_url : r.review_url);

    // Card order: deterministic, newest first, with gentle platform diversity (same on every load).
    function diverseOrder(list) {
      const rest = list.slice().sort(byNewest), out = [];
      const RUN = D.max_same_platform_run, WINDOW = D.diversity_window_days;
      while (rest.length) {
        let i = 0;
        const run = out.slice(-RUN);
        // after RUN consecutive cards from one platform, prefer another platform if its newest review is <= WINDOW days older
        if (RUN > 0 && run.length === RUN && run.every(r => r.platform === rest[0].platform)) {
          const j = rest.findIndex(r => r.platform !== rest[0].platform);
          const gapDays = j < 0 ? Infinity : (new Date(rest[0].date) - new Date(rest[j].date)) / 864e5;
          if (gapDays <= WINDOW) i = j;
        }
        out.push(rest.splice(i, 1)[0]);
      }
      return out;
    }

    const all = data.reviews;
    for (const r of all) { r.display_name = displayName(r.reviewer_name); r.snippet_text = snippet(r.text, r.reviewer_name); }
    const withText = all.filter(r => r.snippet_text); // rating-only reviews never become cards
    const newest = withText.slice().sort(byNewest);
    const allOrder = diverseOrder(withText);
    const present = Object.keys(PLATFORMS).filter(p => all.some(r => r.platform === p));
    const writeDefault = config.default_write_platform || present[0];
    let active = cfg.platform;

    function render() {
      const pool = active === 'all' ? all : all.filter(r => r.platform === active);
      const rated = pool.filter(r => typeof r.rating === 'number');
      const avg = rated.length ? rated.reduce((s, r) => s + r.rating, 0) / rated.length : 5;
      // cards show the clipped snippet only. "All": newest first + gentle diversity; one platform: newest first.
      let shown = active === 'all' ? allOrder : newest.filter(r => r.platform === active);
      if (cfg.limit) shown = shown.slice(0, cfg.limit);
      const write = (PLATFORMS[active === 'all' ? writeDefault : active] || {}).write_url || '#';

      const tabs = present.length > 1 ? `<div class="rw-tabs" role="tablist" aria-label="${esc(S.tabs_aria)}">
        ${['all', ...present].map(p => {
          const n = p === 'all' ? all.length : all.filter(r => r.platform === p).length;
          const name = p === 'all' ? S.tab_all + S.tab_all_suffix : pname(p);
          return `<button role="tab" class="rw-tab ${p === active ? 'is-active' : ''}" data-p="${p}" aria-selected="${p === active}"
            title="${esc(fill(S.tab_title, { name, count: n }))}" aria-label="${esc(fill(S.tab_aria, { name, count: n }))}">
            ${p === 'all' ? `<span class="rw-tab-name">${esc(S.tab_all)}<span class="rw-tab-long">${esc(S.tab_all_suffix)}</span></span>` : `${icon(p)}<span class="rw-tab-name">${esc(name)}</span>`}
            <em>${n}</em></button>`;
        }).join('')}</div>` : '';

      const header = `<header class="rw-header">
        <div class="rw-summary">
          <div class="rw-score">${avg.toFixed(1)}</div>
          <div>
            <div class="rw-label">${esc(label(avg))}</div>
            ${stars(avg, 'rw-stars-lg')}
            <div class="rw-based"><span class="rw-based-pre">${esc(S.based_on)}</span><strong>${pool.length}</strong> ${esc(pool.length === 1 ? S.review_one : S.review_many)}<span class="rw-based-pre">${active === 'all' ? '' : esc(fill(S.on_platform, { platform: pname(active) }))}</span></div>
          </div>
        </div>
        <a class="rw-write" href="${esc(write)}" target="_blank" rel="noopener">${esc(S.write_review)}</a>
        ${tabs}
      </header>`;

      const cards = shown.map(r => {
        const name = pname(r.platform);
        const rating = typeof r.rating === 'number' ? stars(r.rating) : `<span class="rw-rec">${THUMB}${esc(S.recommends)}</span>`;
        const aria = fill(S.card_aria, { name: r.display_name, platform: name });
        // The whole card is one link; nothing inside it is interactive (no nested links).
        return `<a class="rw-card" data-platform="${esc(r.platform)}" href="${esc(cardHref(r))}" target="_blank" rel="noopener" aria-label="${esc(aria)}">
          <div class="rw-card-top">
            <img class="rw-avatar" src="${esc(url(r.reviewer_image))}" alt="" loading="lazy" width="44" height="44">
            <div class="rw-who">
              <div class="rw-name">${esc(r.display_name)}</div>
              <time datetime="${esc(r.date)}">${fmtDate(r.date)}</time>
            </div>
            ${icon(r.platform, 'rw-platform')}
          </div>
          ${rating}
          <p class="rw-text">${esc(r.snippet_text)}</p>
          <span class="rw-link" aria-hidden="true">${esc(fill(S.view_on, { platform: name }))} <span class="rw-arrow">→</span></span>
        </a>`;
      }).join('');

      el.innerHTML = `${header}
        <div class="rw-viewport">
          ${cfg.layout === 'carousel' ? `<button class="rw-nav rw-prev" aria-label="${esc(S.previous)}">‹</button>` : ''}
          <div class="rw-track">${cards}</div>
          ${cfg.layout === 'carousel' ? `<button class="rw-nav rw-next" aria-label="${esc(S.next)}">›</button>` : ''}
        </div>`;

      el.querySelectorAll('.rw-tab').forEach(b => b.addEventListener('click', () => { active = b.dataset.p; render(); }));
      const track = el.querySelector('.rw-track');
      const step = dir => track.scrollBy({ left: dir * track.clientWidth * 0.9, behavior: 'smooth' });
      el.querySelector('.rw-prev')?.addEventListener('click', () => step(-1));
      el.querySelector('.rw-next')?.addEventListener('click', () => step(1));
      const upd = () => {
        const p = el.querySelector('.rw-prev'), n = el.querySelector('.rw-next');
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

  // When rendered inside an iframe (embed.html), tell the parent page our height.
  function notifyHeight() {
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'reviews-widget-height', height: document.documentElement.scrollHeight }, '*');
    }
  }

  const start = () => document.querySelectorAll('.reviews-widget').forEach(mount);
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
})();
