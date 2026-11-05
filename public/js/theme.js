// Applies the store theme the admin picked. Loaded in <head> so the saved theme shows before first paint.
// Add ?theme=halloween (or newyear, ramadan, eid, default) to a URL to preview a theme on that page without changing the live site.
(function () {
  const FONTS = {
    newyear: 'family=Mountains+of+Christmas:wght@400;700&family=Cormorant+Garamond:wght@500;600;700',
    halloween: 'family=Creepster&family=IM+Fell+English',
    ramadan: 'family=Cinzel+Decorative:wght@400;700;900&family=Amiri:wght@400;700',
    eid: 'family=El+Messiri:wght@500;700&family=Cairo:wght@400;600;700',
  };
  const KEY = 'alola_theme';
  const cached = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const remember = t => { try { localStorage.setItem(KEY, t); } catch {} };

  function apply(theme) {
    const root = document.documentElement;
    if (FONTS[theme]) {
      if (!document.querySelector(`link[data-theme-font="${theme}"]`)) {
        const l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = `https://fonts.googleapis.com/css2?${FONTS[theme]}&display=swap`;
        l.dataset.themeFont = theme;
        document.head.append(l);
      }
      root.dataset.theme = theme;
    } else {
      delete root.dataset.theme;
    }
  }

  const preview = new URLSearchParams(location.search).get('theme');
  if (preview === 'default' || FONTS[preview]) { apply(preview); return; } // a preview never touches the live choice

  apply(cached());

  const cfg = window.ALOLA_CONFIG || {};
  async function sync() {
    if (!cfg.url) return;
    try {
      // The database decides, so a scheduled theme starts and ends on time without anyone being logged in.
      const res = await fetch(`${cfg.url}/rest/v1/rpc/current_theme`, { method: 'POST', headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}`, 'Content-Type': 'application/json' }, body: '{}' });
      if (!res.ok) return;
      const theme = (await res.json()) || 'default';
      if (theme !== cached()) { remember(theme); apply(theme); }
    } catch {} // offline or unreachable: keep the last known theme
  }
  sync();
  // Pages left open pick up the admin's change when the visitor comes back, or within a few minutes.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  setInterval(() => { if (!document.hidden) sync(); }, 300000);
})();
