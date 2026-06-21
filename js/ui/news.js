// ------------------------------------------------------------
//  Country news lightbox
//
//  Click a country on the globe → a lightbox of its top-10 headlines.
//  `openNews(country)` is the public entry (called from the globe raycast
//  and the dashboard "Headlines" actions); `initNews()` wires the close /
//  backdrop / Escape handlers once on load.
// ------------------------------------------------------------
const $ = (id) => document.getElementById(id);

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

function renderNews(country, articles, state) {
  const lb = $('news-lb'); if (!lb) return;
  lb.removeAttribute('hidden');
  $('lb-country').textContent = country.toUpperCase();
  const body = $('lb-body');
  if (state === 'loading') { body.innerHTML = '<div class="lb-msg">ACQUIRING FEED…</div>'; return; }
  if (state === 'error')   { body.innerHTML = '<div class="lb-msg warn">FEED UNREACHABLE · NEWS REQUEST FAILED</div>'; return; }
  if (state === 'empty')   { body.innerHTML = '<div class="lb-msg warn">NO RECENT ARTICLES FOUND</div>'; return; }
  body.innerHTML = articles.map((a, i) => {
    const d = (a.seendate || '').replace(/^(\d{4})(\d{2})(\d{2}).*/, '$1-$2-$3');
    return `<a class="lb-item" href="${encodeURI(a.url || '#')}" target="_blank" rel="noopener noreferrer">
      <span class="lb-num">${String(i + 1).padStart(2, '0')}</span>
      <span class="lb-text"><span class="lb-ttl">${escapeHtml(a.title || '(untitled)')}</span>
      <span class="lb-meta">${escapeHtml(a.domain || '')} · ${d}</span></span></a>`;
  }).join('');
}

// Country headlines come from Google News RSS via rss2json. GDELT was unusable
// from the browser: it sends no CORS headers AND rate-limits to 1 request / 5s
// per IP, so shared public CORS proxies are permanently throttled (HTTP 429).
// rss2json fetches the RSS server-side and returns CORS-friendly JSON, keyless —
// reliable for a static site.
// Monotonic token: each openNews() call claims the next id; only the call whose
// id is still the latest is allowed to write results into the lightbox. This
// stops a slow earlier fetch from clobbering the lightbox opened by a later click.
let newsReq = 0;
export async function openNews(country) {
  const myReq = ++newsReq;
  renderNews(country, null, 'loading');   // 'loading' always reflects the latest click
  try {
    const rss = `https://news.google.com/rss/search?q=${encodeURIComponent(country)}&hl=en-US&gl=US&ceid=US:en`;
    const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rss)}&count=10`;
    const data = await fetch(url).then(r => r.json());
    if (myReq !== newsReq) return;        // a later click superseded this one — drop the stale result
    if (data.status !== 'ok') throw new Error(data.message || 'feed error');
    // Google News titles read "Headline - Source"; split off the source for the
    // meta line and normalize to the shape renderNews already expects.
    const articles = (data.items || []).slice(0, 10).map((it) => {
      const m = /^(.*?) - ([^-]+)$/.exec(it.title || '');
      return {
        title: m ? m[1] : (it.title || ''),
        url: it.link || '#',
        domain: (m ? m[2] : (it.author || '')).trim(),
        seendate: (it.pubDate || '').slice(0, 10),   // YYYY-MM-DD; renderNews passes it through
      };
    });
    renderNews(country, articles, articles.length ? 'ok' : 'empty');
  } catch (e) {
    if (myReq !== newsReq) return;        // stale failure — a later click owns the lightbox now
    renderNews(country, null, 'error');
  }
}

function closeNews() { $('news-lb')?.setAttribute('hidden', ''); }

export function initNews() {
  $('lb-close')?.addEventListener('click', closeNews);
  $('lb-backdrop')?.addEventListener('click', closeNews);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNews(); });
}
