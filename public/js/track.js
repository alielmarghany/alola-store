// Anonymous store analytics for the dashboard's Analytics tab.
// A visitor is a random id kept in this browser; a visit (session) ends after 30 idle minutes or when a new ad link is opened.
// Nothing personal is sent: no names, emails, phone numbers or IP addresses are stored.
window.AlolaTrack = (function () {
  const cfg = window.ALOLA_CONFIG || {};
  const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const off = !cfg.url || get('alola_notrack') === '1' || /bot|crawl|spider|headless|lighthouse/i.test(navigator.userAgent);
  const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), b => (b % 36).toString(36)).join('');

  let visitor = get('alola_vid');
  if (!/^[a-z0-9]{8,40}$/.test(visitor || '')) { visitor = rid(); set('alola_vid', visitor); }

  // Where this visit came from: an ad link's utm_ tags, or the site that linked here.
  const qp = new URLSearchParams(location.search);
  const utm = { source: qp.get('utm_source') || '', medium: qp.get('utm_medium') || '', campaign: qp.get('utm_campaign') || '' };
  let referrer = '';
  try { const r = document.referrer && new URL(document.referrer); if (r && r.hostname !== location.hostname) referrer = r.hostname.replace(/^www\./, ''); } catch {}

  let s = null;
  try { s = JSON.parse(get('alola_session')); } catch {}
  const now = Date.now();
  const newCampaign = utm.source && (utm.source !== s?.source || utm.campaign !== s?.campaign);
  if (!s || !/^[a-z0-9]{8,40}$/.test(s.id || '') || now - (s.last || 0) > 30 * 60 * 1000 || newCampaign) {
    s = { id: rid(), source: utm.source, medium: utm.medium, campaign: utm.campaign, referrer };
  }
  s.last = now;
  set('alola_session', JSON.stringify(s));

  const coarse = matchMedia('(pointer: coarse)').matches, w = Math.min(screen.width, innerWidth || screen.width);
  const device = coarse ? (w >= 768 ? 'tablet' : 'mobile') : 'desktop';
  const page = location.pathname.split('/').pop() || 'index.html';

  function send(type, extra = {}) {
    if (off) return;
    const body = JSON.stringify({ p: {
      type, visitor, session: s.id, path: page, device, lang: window.T && T.ar ? 'ar' : 'en',
      source: s.source, medium: s.medium, campaign: s.campaign, referrer: s.referrer, ...extra,
    } });
    try {
      fetch(`${cfg.url}/rest/v1/rpc/track`, {
        method: 'POST', keepalive: true, body,
        headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}`, 'Content-Type': 'application/json' },
      }).catch(() => {});
    } catch {}
    // Keep the visit alive while the visitor is active.
    s.last = Date.now(); set('alola_session', JSON.stringify(s));
  }

  if (!off) send('page_view');
  return { send, off };
})();
