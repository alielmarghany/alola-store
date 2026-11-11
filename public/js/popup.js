// Store pop-ups, set up in the dashboard's Pop-ups tab.
// At most one pop-up per page view: the first live one (by priority) whose page, device, visitor and
// "how often" rules match. Never on checkout. ?popup=preview shows the dashboard's unsaved preview.
(function () {
  const cfg = window.ALOLA_CONFIG || {};
  const get = (k, store = localStorage) => { try { return store.getItem(k); } catch { return null; } };
  const set = (k, v, store = localStorage) => { try { store.setItem(k, v); } catch {} };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeLink = v => (/^https:\/\/[^\s"'<>\\]+$/.test(v) || (/^[A-Za-z0-9_#?./][A-Za-z0-9_./?=&%#+-]*$/.test(v) && !v.startsWith('//'))) ? v : '';
  const safeImage = v => /^https:\/\/[^\s"'<>()\\]+$/.test(v || '') ? v : '';
  const ar = () => !!(window.T && T.ar);
  const say = (p, k) => (ar() && (p[k + '_ar'] || '').trim()) || p[k] || '';

  const file = location.pathname.split('/').pop() || 'index.html';
  const page = { 'index.html': 'home', '': 'home', 'shop.html': 'shop', 'product.html': 'product', 'account.html': 'account' }[file];
  const previewing = new URLSearchParams(location.search).get('popup') === 'preview';
  if (!page && !previewing) return;

  // First visit date, to tell first-time visitors from returning ones.
  if (!get('alola_first_visit')) set('alola_first_visit', String(Date.now()));
  const returning = Date.now() - Number(get('alola_first_visit')) > 12 * 3600 * 1000; // first came more than 12 hours ago
  const mobile = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, innerWidth) < 768;
  const shown = (() => { try { return JSON.parse(get('alola_popups')) || {}; } catch { return {}; } })();

  function eligible(p) {
    if (!p.pages.includes(page)) return false;
    if (p.device === 'mobile' && !mobile) return false;
    if (p.device === 'desktop' && mobile) return false;
    if (p.audience === 'new' && returning) return false;
    if (p.audience === 'returning' && !returning) return false;
    const last = shown[p.id];
    if (p.frequency === 'once' && last) return false;
    if (p.frequency === 'session' && get('alola_popup_' + p.id, sessionStorage)) return false;
    if (p.frequency === 'days' && last && Date.now() - last < p.frequency_days * 864e5) return false;
    return true;
  }

  // Waits for the pop-up's trigger: some seconds, some scrolling, or the visitor heading for the close button / back.
  function arm(p, show) {
    let done = false;
    const go = () => { if (done) return; done = true; cleanup(); show(); };
    const cleanup = () => { clearTimeout(timer); removeEventListener('scroll', onScroll); document.removeEventListener('mouseout', onOut); };
    let timer;
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - innerHeight;
      if (h <= 0 || scrollY / h * 100 >= p.trigger_value) go();
    };
    const onOut = e => { if (!e.relatedTarget && e.clientY <= 8) go(); };
    if (p.trigger === 'scroll') { addEventListener('scroll', onScroll, { passive: true }); onScroll(); }
    else if (p.trigger === 'exit') {
      if (mobile) timer = setTimeout(go, 25000); // phones have no mouse to leave with: show after a while instead
      else { document.addEventListener('mouseout', onOut); timer = setTimeout(go, 90000); }
    } else timer = setTimeout(go, Math.max(0, p.trigger_value) * 1000);
  }

  function show(p, isPreview) {
    if (document.querySelector('.pp-root')) return;
    const track = (type) => { if (!isPreview && p.id) window.AlolaTrack?.send(type, { popup_id: p.id }); };
    if (!isPreview && p.id) {
      shown[p.id] = Date.now(); set('alola_popups', JSON.stringify(shown));
      set('alola_popup_' + p.id, '1', sessionStorage);
    }
    const img = safeImage((ar() && p.image_ar) || p.image), link = safeLink(p.button_link || ''), label = say(p, 'button_label');
    const title = say(p, 'title'), body = say(p, 'body'), modal = p.layout !== 'corner';
    const root = document.createElement('div');
    root.className = `pp-root ${modal ? 'pp-center' : 'pp-corner'}`;
    root.innerHTML = `${modal ? '<div class="pp-ov"></div>' : ''}
      <div class="ppw" role="dialog" ${modal ? 'aria-modal="true"' : ''} aria-labelledby="ppTitle"${body ? ' aria-describedby="ppBody"' : ''}>
        <button class="pp-x" type="button" aria-label="${ar() ? 'إغلاق' : 'Close'}">×</button>
        ${img ? `<div class="pp-img"><img src="${esc(img)}" alt=""></div>` : ''}
        <div class="pp-c"><h2 id="ppTitle">${esc(title)}</h2>${body ? `<p id="ppBody">${esc(body)}</p>` : ''}
          ${p.code ? `<div class="pp-code"><span>${ar() ? 'الكود' : 'Code'}</span><b translate="no">${esc(p.code)}</b><button type="button" class="pp-copy">${ar() ? 'نسخ' : 'Copy'}</button></div>` : ''}
          ${p.kind === 'newsletter' ? `<form class="pp-form"><label class="sr" for="ppEmail">${ar() ? 'البريد الإلكتروني' : 'Email address'}</label><input class="in" id="ppEmail" type="email" required autocomplete="email" placeholder="you@example.com"><button class="btn ro">${esc(label || (ar() ? 'اشتراك' : 'Subscribe'))}</button></form>`
            : label && link ? `<a class="btn ro pp-btn" href="${esc(link)}">${esc(label)}</a>` : ''}
        </div></div>`;
    document.body.append(root);
    const box = root.querySelector('.ppw'), last = document.activeElement;
    requestAnimationFrame(() => root.classList.add('on'));
    track('popup_view');
    const close = () => {
      root.classList.remove('on');
      removeEventListener('keydown', onKey);
      setTimeout(() => root.remove(), 300);
      if (modal && last && last.focus) last.focus();
    };
    const onKey = e => {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab' && modal) { // keep the keyboard inside the window
        const f = [...box.querySelectorAll('a[href],button,input')];
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    addEventListener('keydown', onKey);
    root.querySelector('.pp-x').onclick = close;
    root.querySelector('.pp-ov')?.addEventListener('click', close);
    if (modal) setTimeout(() => (box.querySelector('.pp-btn,.pp-form input,.pp-copy') || box.querySelector('.pp-x')).focus(), 60);
    root.querySelector('.pp-btn')?.addEventListener('click', () => track('popup_click'));
    const copy = root.querySelector('.pp-copy');
    if (copy) copy.onclick = async () => {
      track('popup_click');
      try { await navigator.clipboard.writeText(p.code); copy.textContent = ar() ? 'تم النسخ' : 'Copied'; }
      catch { const r = document.createRange(); r.selectNodeContents(root.querySelector('.pp-code b')); getSelection().removeAllRanges(); getSelection().addRange(r); }
    };
    const form = root.querySelector('.pp-form');
    if (form) form.onsubmit = async e => {
      e.preventDefault();
      if (isPreview) { A.toast(ar() ? 'معاينة: لم يتم الاشتراك' : 'Preview: no sign-up was saved'); return; }
      try { await A.subscribe(form.querySelector('input').value); track('popup_click'); close(); A.toast(ar() ? 'تم اشتراكك' : 'You’re on the glow list'); }
      catch (err) { A.toast(err.message); }
    };
  }

  if (previewing) {
    let p = null;
    try { p = JSON.parse(get('alola_popup_preview')); } catch {}
    if (p) setTimeout(() => show(p, true), 600);
    return;
  }
  if (!cfg.url || get('alola_nopopups') === '1') return;
  fetch(`${cfg.url}/rest/v1/popups?select=*&order=priority.desc,id.desc`, { headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}` } })
    .then(r => r.ok ? r.json() : [])
    .then(list => { const p = list.find(eligible); if (p) arm(p, () => show(p)); })
    .catch(() => {});
})();
