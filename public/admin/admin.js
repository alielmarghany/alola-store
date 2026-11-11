// Alola admin dashboard: overview analytics, orders, products, customers and live new-order notifications.
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const app = $('#app');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Number(n || 0).toLocaleString('en-US') + ' EGP';
  const TZ = 'Africa/Cairo';
  const dtFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const dFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
  const when = iso => iso ? dtFmt.format(new Date(iso)) : '–';
  const day = iso => iso ? dFmt.format(new Date(iso)) : '–';
  function ago(iso) {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return day(iso);
  }
  const STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
  const cap = s => s[0].toUpperCase() + s.slice(1);
  const badge = s => `<span class="st st-${s}">${cap(s)}</span>`;
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  const SVG = (d, extra = '') => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.900" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
  const I = {
    overview: SVG('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    orders: SVG('<path d="M6 7h12l1.500 13h-15zM9 7V5a3 3 0 0 1 6 0v2"/>'),
    products: SVG('<path d="M9 3h6v4H9zM7 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"/>'),
    customers: SVG('<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6M16 4a4 4 0 0 1 0 8M22 21c0-3-1.500-5-4-5.700"/>'),
    discounts: SVG('<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9zM8 8v.01M15.500 8.500l-7 7"/>'),
    analytics: SVG('<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>'),
    popups: SVG('<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="8" y="8" width="8" height="8" rx="1.500"/>'),
    home: SVG('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 13h5M8 16h8"/>'),
    themes: SVG('<path d="M12 3a9 9 0 1 0 0 18c1.500 0 2-1 2-2 0-1.500-1-2-1-3 0-1 1-2 2-2h2a4 4 0 0 0 4-4c0-4-4-7-9-7z"/><circle cx="7.500" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>'),
    store: SVG('<path d="M3 10v10h18V10M2 10l2-6h16l2 6zM9 20v-6h6v6"/>'),
    out: SVG('<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10"/>'),
    bell: SVG('<path d="M6 10a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 0 0 4 0"/>'),
    x: SVG('<path d="M6 6l12 12M18 6 6 18"/>'),
    plus: SVG('<path d="M12 5v14M5 12h14"/>'),
    sheet: SVG('<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M8 13h8M8 17h8M12 10v10"/>'),
  };

  // ------------------------------------------------------------ API
  const db = window.AdminDB;
  db.setUnauthorizedHandler(() => { stopLive(); renderLogin(); });
  const fail = e => { if (!e.handled) toast(e.message, 'err'); };

  function toast(msg, kind = '', action) {
    const el = document.createElement('div');
    el.className = `tst ${kind}`;
    el.setAttribute('role', 'status');
    el.innerHTML = `<div class="m">${msg}</div>`;
    if (action) { const b = document.createElement('button'); b.textContent = action.label; b.onclick = () => { action.fn(); el.remove(); }; el.append(b); }
    $('#toasts').prepend(el);
    setTimeout(() => el.remove(), kind === 'ord' ? 9000 : 3200);
  }

  // ------------------------------------------------------------ login
  function renderLogin() {
    document.title = 'Log in | Alola Dashboard';
    app.innerHTML = `<div class="login"><form id="lf">
      <img src="../assets/logo.png" alt="Alola" width="139" height="50"><h1>Store <em>dashboard</em></h1>
      <div class="form-err" id="le" role="alert" hidden></div>
      <div class="fld"><label for="u">Email</label><input class="in" id="u" type="email" autocomplete="username" required></div>
      <div class="fld"><label for="p">Password</label><input class="in" id="p" type="password" autocomplete="current-password" required></div>
      <button class="btn" style="width:100%;margin-top:6px">Log in</button>
      <p style="text-align:center;margin-top:14px"><a href="../" class="linkbtn">Back to store</a></p></form></div>`;
    if (matchMedia('(pointer: fine)').matches) $('#u').focus(); // on phones this would pop the keyboard up straight away
    $('#lf').onsubmit = async e => {
      e.preventDefault();
      const b = $('button', e.target); b.disabled = true;
      try { await db.signIn($('#u').value.trim(), $('#p').value); start(); }
      catch (err) { $('#le').textContent = err.message; $('#le').hidden = false; b.disabled = false; }
    };
  }

  // ------------------------------------------------------------ shell + routing
  const NAV = [['overview', 'Overview'], ['analytics', 'Analytics'], ['orders', 'Orders'], ['products', 'Products'], ['customers', 'Customers'], ['discounts', 'Discounts'], ['home', 'Home page'], ['popups', 'Pop-ups'], ['themes', 'Themes']];
  const notif = { unread: 0, rows: [], pop: false };

  function renderShell() {
    app.innerHTML = `<div class="shell">
      <aside class="nav"><a class="brand" href="#/overview"><img src="../assets/logo.png" alt="Alola" width="117" height="42"></a>
        ${NAV.map(([k, l]) => `<a class="it" href="#/${k}" data-nav="${k}">${I[k]}<span>${l}</span>${k === 'orders' ? '<span class="cnt" id="pendingCnt" hidden></span>' : ''}</a>`).join('')}
        <div class="sp"></div>
        <a class="it side-only" href="../" target="_blank" rel="noopener">${I.store}<span>View store</span></a>
        <button class="it side-only" id="logout">${I.out}<span>Log out</span></button>
      </aside>
      <main><div class="top"><div><h1 id="title"></h1><div class="sub" id="sub"></div></div>
          <div class="top-r"><button class="bell" id="bell" aria-label="Notifications" aria-expanded="false">${I.bell}<span class="dot" id="dot" hidden></span></button><button class="bell mob-only" id="logout2" aria-label="Log out">${I.out}</button><div class="pop" id="pop" hidden></div></div></div>
        <div id="view"></div></main></div><div id="drawerRoot"></div>`;
    $('#logout').onclick = $('#logout2').onclick = async () => { await db.signOut().catch(() => {}); stopLive(); renderLogin(); };
    $('#bell').onclick = e => { e.stopPropagation(); togglePop(); };
    document.addEventListener('click', e => { if (notif.pop && !e.target.closest('#pop')) togglePop(false); });
  }

  let current = null, viewToken = 0, lastHash = '';
  function route() {
    // Moving to another page would close a form with unsaved edits: ask first, and stay put if the admin says no.
    if (unsaved()) {
      const target = location.hash;
      history.replaceState(null, '', lastHash || '#/overview');
      confirmDiscard().then(ok => { if (ok) { drawer.dirty = false; page.dirty = false; location.hash = target; } });
      return;
    }
    lastHash = location.hash;
    page.dirty = false;
    const [, name, id] = location.hash.match(/^#\/(\w+)(?:\/(\d+))?/) || [];
    const key = VIEWS[name] ? name : 'overview';
    $$('[data-nav]').forEach(a => { const on = a.dataset.nav === key; a.classList.toggle('it', true); a.classList.toggle('cur', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
    const label = NAV.find(n => n[0] === key)[1];
    $('#title').textContent = label; $('#sub').textContent = '';
    updateTitle(label);
    closeDrawer();
    current = key;
    VIEWS[key]($('#view'), ++viewToken);
    if (id && key === 'orders') openOrder(Number(id));
    if (id && key === 'customers') openCustomer(Number(id));
  }
  let pageLabel = '';
  function updateTitle(label) {
    if (label) pageLabel = label;
    document.title = `${notif.unread ? `(${notif.unread}) ` : ''}${pageLabel} | Alola Dashboard`;
  }

  // ------------------------------------------------------------ notifications
  let stopListening = null, audioCtx = null;
  const prefs = () => load('alola_admin_prefs', { sound: true });

  // Browsers only allow audio after the admin has interacted with the page once.
  addEventListener('pointerdown', () => { if (!audioCtx && window.AudioContext) { try { audioCtx = new AudioContext(); } catch {} } else audioCtx?.resume?.(); });
  function chime() {
    if (!prefs().sound || !audioCtx || audioCtx.state !== 'running') return;
    const t = audioCtx.currentTime;
    [[659.25, 0], [880, .14], [1174.66, .28]].forEach(([f, d]) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(.16, t + d + .02); g.gain.exponentialRampToValueAtTime(.001, t + d + .5);
      o.connect(g).connect(audioCtx.destination); o.start(t + d); o.stop(t + d + .55);
    });
  }

  async function loadNotifs() {
    const n = await db.notifications();
    notif.unread = n.unread; notif.rows = n.rows;
    drawBell();
  }
  function drawBell() {
    const dot = $('#dot'); if (!dot) return;
    dot.hidden = !notif.unread; dot.textContent = notif.unread > 99 ? '99+' : notif.unread;
    $('#bell').setAttribute('aria-label', notif.unread ? `Notifications, ${notif.unread} unread` : 'Notifications');
    updateTitle();
    if (notif.pop) drawPop();
  }
  function drawPop() {
    const canDesktop = 'Notification' in window;
    const perm = canDesktop ? Notification.permission : 'denied';
    $('#pop').innerHTML = `<div class="pop-h"><b>Notifications</b>${notif.unread ? '<button class="linkbtn" id="readAll">Mark all read</button>' : ''}</div>
      <div class="pop-list">${notif.rows.length ? notif.rows.map(n => `<button class="nt${n.read ? '' : ' un'}" data-nid="${n.id}" data-oid="${n.order_id || ''}"><i></i><span><b>${esc(n.title)}</b><small>${esc(n.body)}</small><small>${ago(n.created_at)}</small></span></button>`).join('')
        : '<div class="empty"><b>Nothing yet</b>New orders will show up here the moment they’re placed.</div>'}</div>
      <div class="pop-f"><label><input type="checkbox" id="snd" ${prefs().sound ? 'checked' : ''}> Sound</label>
        ${canDesktop ? (perm === 'granted' ? '<span style="color:var(--mute)">Desktop alerts on</span>' : perm === 'denied' ? '<span style="color:var(--mute)">Desktop alerts blocked in browser</span>' : '<button class="linkbtn" id="deskOn">Enable desktop alerts</button>') : ''}</div>`;
    $('#readAll')?.addEventListener('click', async () => { const r = await db.markRead().catch(fail); if (r) { notif.unread = r.unread; notif.rows.forEach(n => n.read = 1); drawBell(); } });
    $('#snd').onchange = e => { save('alola_admin_prefs', { ...prefs(), sound: e.target.checked }); if (e.target.checked) chime(); };
    $('#deskOn')?.addEventListener('click', async () => { await Notification.requestPermission(); drawPop(); });
    $$('.nt').forEach(b => b.onclick = async () => {
      const n = notif.rows.find(x => x.id === Number(b.dataset.nid));
      togglePop(false);
      if (n && !n.read) { n.read = 1; const r = await db.markRead(n.id).catch(() => null); if (r) notif.unread = r.unread; drawBell(); }
      if (b.dataset.oid) openOrder(Number(b.dataset.oid));
    });
  }
  function togglePop(force) {
    notif.pop = force ?? !notif.pop;
    $('#pop').hidden = !notif.pop;
    $('#bell').setAttribute('aria-expanded', notif.pop);
    if (notif.pop) drawPop();
  }
  function startLive() {
    stopLive();
    stopListening = db.listen(n => {
      notif.rows.unshift(n); notif.rows = notif.rows.slice(0, 30); notif.unread++;
      drawBell();
      const bell = $('#bell'); bell.classList.remove('ring'); void bell.offsetWidth; bell.classList.add('ring');
      chime();
      toast(`<b>${esc(n.title)}</b>${esc(n.body)}`, 'ord', { label: 'View', fn: () => openOrder(n.order_id) });
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
        try { const dn = new Notification(n.title, { body: n.body, icon: '../assets/favicon.png', tag: `order-${n.order_id}` }); dn.onclick = () => { focus(); openOrder(n.order_id); dn.close(); }; } catch {}
      }
      refreshPending();
      if (current === 'overview') VIEWS.overview($('#view'), ++viewToken, true);
      if (current === 'orders' && ordersState.page === 1) VIEWS.orders($('#view'), ++viewToken, n.order_id);
      if (current === 'products') VIEWS.products($('#view'), ++viewToken); // stock changed
      if (current === 'customers') VIEWS.customers($('#view'), ++viewToken);
    }, () => { loadNotifs().catch(() => {}); refreshPending(); }); // catch up after a dropped connection
  }
  function stopLive() { stopListening?.(); stopListening = null; }
  async function refreshPending() {
    const d = await db.orders({ status: 'pending' }).catch(() => null); if (!d) return;
    const c = $('#pendingCnt'); if (!c) return;
    c.hidden = !d.total; c.textContent = d.total;
  }

  // ------------------------------------------------------------ drawer + confirm
  // A guarded drawer (a form) asks before throwing away edits the admin hasn't saved.
  const drawer = { guard: false, dirty: false };
  function openDrawer(html, { guard = false } = {}) {
    const root = $('#drawerRoot');
    root.innerHTML = `<div class="ov" id="ov"></div><aside class="dr" role="dialog" aria-modal="true" aria-labelledby="drTitle">${html}</aside>`;
    const title = $('.dr h2', root); if (title) title.id = 'drTitle';
    Object.assign(drawer, { guard, dirty: false });
    const markDirty = e => { if (drawer.guard && e.target.type !== 'file') drawer.dirty = true; };
    root.addEventListener('input', markDirty); root.addEventListener('change', markDirty);
    $('#ov').onclick = requestClose;
    $$('[data-close]', root).forEach(b => b.onclick = requestClose);
    $('.x', root)?.focus();
    return $('.dr', root);
  }
  // A page that is itself a form (the Home page tab) sets page.dirty while it has unsaved edits.
  const page = { dirty: false };
  const drawerUnsaved = () => drawer.guard && drawer.dirty && !!$('#drawerRoot .dr');
  const unsaved = () => drawerUnsaved() || page.dirty;
  const confirmDiscard = () => confirmDialog('Discard your changes?', 'You have edits in this form that haven’t been saved.', 'Discard changes', 'Keep editing');
  async function requestClose() {
    if (drawerUnsaved() && !(await confirmDiscard())) return;
    closeDrawer();
  }
  function closeDrawer() { const r = $('#drawerRoot'); if (r) r.innerHTML = ''; drawer.dirty = false; }
  addEventListener('beforeunload', e => { if (unsaved()) e.preventDefault(); });
  addEventListener('keydown', e => {
    if ($('dialog[open]')) return;
    if (e.key === 'Escape') { if (notif.pop) togglePop(false); else requestClose(); }
    const dr = $('#drawerRoot .dr');
    if (e.key === 'Tab' && dr) trapFocus(e, dr);
  });
  /** Keeps Tab and Shift+Tab inside an open drawer. */
  function trapFocus(e, box) {
    const items = $$('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])', box).filter(el => el.offsetParent !== null || el.closest('label'));
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (!box.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  function confirmDialog(title, text, okLabel, cancelLabel = 'Keep it') {
    return new Promise(res => {
      const d = document.createElement('dialog');
      d.innerHTML = `<h3>${esc(title)}</h3><p>${esc(text)}</p><div class="row"><button class="btn ln" value="n">${esc(cancelLabel)}</button><button class="btn dg" value="y">${esc(okLabel)}</button></div>`;
      document.body.append(d);
      let done = false;
      const finish = yes => { if (done) return; done = true; if (d.open) d.close(); d.remove(); res(yes); };
      d.addEventListener('close', () => finish(false)); // Esc
      $$('button', d).forEach(b => b.onclick = () => finish(b.value === 'y'));
      d.showModal();
    });
  }
  const closeBtn = `<button class="x" data-close aria-label="Close">${I.x}</button>`;

  function pager(state, total, size, onGo) {
    const pages = Math.max(1, Math.ceil(total / size));
    const box = document.createElement('div'); box.className = 'pager';
    const from = total ? (state.page - 1) * size + 1 : 0, to = Math.min(total, state.page * size);
    box.innerHTML = `<span class="num">${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}</span><div><button class="btn ln" data-g="-1" ${state.page <= 1 ? 'disabled' : ''}>Previous</button><button class="btn ln" data-g="1" ${state.page >= pages ? 'disabled' : ''}>Next</button></div>`;
    box.onclick = e => { const b = e.target.closest('[data-g]'); if (b && !b.disabled) { state.page += Number(b.dataset.g); onGo(); } };
    return box;
  }

  // ------------------------------------------------------------ overview
  const chartState = { range: load('alola_admin_range', '30'), table: false };
  async function viewOverview(el, token, quiet) {
    if (!quiet) el.innerHTML = '<div class="kpis"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div><div class="skeleton" style="height:340px"></div>';
    let a;
    try { a = await db.analytics(); } catch (e) { return fail(e); }
    if (token !== viewToken) return;
    const delta = a.month.lastMonthSamePeriod ? Math.round(((a.month.revenue - a.month.lastMonthSamePeriod) / a.month.lastMonthSamePeriod) * 100) : null;
    const anim = quiet ? 'style="animation:none"' : '';
    el.innerHTML = `<div class="kpis">
        <div class="kpi a" style="--d:0" ${quiet ? anim : ''}><div class="l">Revenue today</div><div class="v num">${fmt(a.today.revenue)}</div><div class="s">${a.today.orders} order${a.today.orders === 1 ? '' : 's'} · yesterday ${fmt(a.today.yesterdayRevenue)}</div></div>
        <div class="kpi" style="--d:1"><div class="l">Revenue this month</div><div class="v num">${fmt(a.month.revenue)}</div><div class="s">${delta === null ? 'No sales at this point last month' : `${delta >= 0 ? '▲ +' : '▼ '}${delta}% vs same point last month`}</div></div>
        <div class="kpi" style="--d:2"><div class="l">Orders this month</div><div class="v num">${a.month.orders.toLocaleString()}</div><div class="s">Average order ${fmt(a.month.aov)}</div></div>
        <div class="kpi" style="--d:3"><div class="l">Clients</div><div class="v num">${a.clients.total.toLocaleString()}</div><div class="s">${a.clients.newThisMonth} new this month</div></div>
      </div>
      <div class="ov-g">
        <div class="card"><div class="ch-h"><div><h2>Revenue</h2><div class="ch-total" id="chTotal"></div></div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><div class="seg" role="group" aria-label="Chart range">${[['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['12m', '12 months']].map(([k, l]) => `<button data-range="${k}" aria-pressed="${chartState.range === k}" class="${chartState.range === k ? 'on' : ''}">${l}</button>`).join('')}</div><button class="linkbtn" id="chView">${chartState.table ? 'View chart' : 'View table'}</button></div></div>
          <div id="chBody"></div></div>
        <div class="card"><h2>Orders by status</h2><div class="rows">${STATUSES.map(s => `<a class="rw" href="#/orders" data-st="${s}">${badge(s)}<b class="num">${a.statusCounts[s].toLocaleString()}</b></a>`).join('')}</div></div>
      </div>
      <div class="ov-g b">
        <div><div class="card" style="padding:20px 20px 8px"><h2>Latest orders</h2></div>
          <div class="tbl-wrap" style="border-top-left-radius:0;border-top-right-radius:0;border-top:0;margin-top:-14px"><table><thead><tr><th>Order</th><th>Client</th><th>Status</th><th class="r">Total</th></tr></thead><tbody>${a.recentOrders.map(o => `<tr class="click" data-oid="${o.id}"><td class="nowrap"><b>${o.number}</b><small>${ago(o.created_at)}</small></td><td>${esc(o.customer_name)}<small>${esc(o.city)}</small></td><td>${badge(o.status)}</td><td class="r num nowrap">${fmt(o.total)}</td></tr>`).join('')}</tbody></table></div></div>
        <div style="display:grid;gap:14px;align-content:start">
          <div class="card"><h2>Top products, 30 days</h2><div class="rows">${a.topProducts.map(p => `<div class="rw"><span>${esc(p.name)}<small>${esc(p.brand)} · ${p.qty} sold</small></span><b class="num nowrap">${fmt(p.revenue)}</b></div>`).join('') || '<div class="empty">No sales yet</div>'}</div></div>
          <div class="card"><h2>Low stock</h2><div class="rows">${a.lowStock.map(p => `<a class="rw" href="#/products"><span>${esc(p.name)}</span><span class="st st-${p.stock ? 'low' : 'out'}">${p.stock ? `${p.stock} left` : 'Sold out'}</span></a>`).join('') || '<div style="color:var(--mute)">All products are well stocked.</div>'}</div></div>
        </div>
      </div>`;
    const draw = () => drawChart($('#chBody'), $('#chTotal'), a);
    draw();
    $$('[data-range]', el).forEach(b => b.onclick = () => {
      chartState.range = b.dataset.range; save('alola_admin_range', chartState.range);
      $$('[data-range]', el).forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
      draw();
    });
    $('#chView').onclick = e => { chartState.table = !chartState.table; e.target.textContent = chartState.table ? 'View chart' : 'View table'; draw(); };
    $$('[data-oid]', el).forEach(r => r.onclick = () => openOrder(Number(r.dataset.oid)));
    $$('[data-st]', el).forEach(r => r.onclick = () => { ordersState.status = r.dataset.st; ordersState.page = 1; });
    const ro = new ResizeObserver(() => { if (!chartState.table && $('#chBody')) draw(); });
    ro.observe($('#chBody'));
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pointLabel = (key, long) => {
    const [y, m, d] = key.split('-');
    if (!d) return long ? `${MONTHS[m - 1]} ${y}` : MONTHS[m - 1];
    return long ? `${Number(d)} ${MONTHS[m - 1]} ${y}` : `${Number(d)} ${MONTHS[m - 1]}`;
  };
  const shortMoney = n => n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M' : n >= 1000 ? (n / 1000).toFixed(n % 1000 ? 1 : 0) + 'k' : String(n);
  /** Round axis scale: a tick step of 1, 2, 2.5 or 5 x 10^n, giving about four gridlines. */
  function niceScale(v) {
    if (v <= 0) return { max: 1000, step: 250 };
    const raw = v / 4, p = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= raw);
    return { max: Math.ceil(v / step) * step, step };
  }
  /** Single-series bar chart: one hue, thin rounded bars with a 2px gap, recessive grid, per-bar hover tooltip. */
  function drawChart(box, totalEl, a) {
    const r = chartState.range;
    const rows = r === '12m' ? a.monthly : a.daily.slice(-Number(r));
    const total = rows.reduce((s, x) => s + x.revenue, 0), orders = rows.reduce((s, x) => s + x.orders, 0);
    totalEl.innerHTML = `<span class="num">${fmt(total)}</span><small>${orders.toLocaleString()} orders · ${r === '12m' ? 'last 12 months' : `last ${r} days`}</small>`;
    if (chartState.table) {
      box.innerHTML = `<div class="ch-tbl"><table><thead><tr><th>${r === '12m' ? 'Month' : 'Day'}</th><th class="r">Orders</th><th class="r">Revenue</th></tr></thead><tbody>${[...rows].reverse().map(x => `<tr><td>${pointLabel(x.key, true)}</td><td class="r num">${x.orders}</td><td class="r num">${fmt(x.revenue)}</td></tr>`).join('')}</tbody></table></div>`;
      return;
    }
    const W = Math.max(280, box.clientWidth || 600), H = box.closest('.card') && innerWidth <= 820 ? 230 : 270;
    const L = 40, R = 4, T = 10, B = 24, iw = W - L - R, ih = H - T - B;
    const { max, step } = niceScale(Math.max(...rows.map(x => x.revenue)));
    const slot = iw / rows.length;
    const bw = Math.max(1.5, Math.min(slot - 2, 34));
    const y = v => T + ih - (v / max) * ih;
    const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
    const labelEvery = Math.max(1, Math.ceil(52 / slot));
    const bars = rows.map((x, i) => {
      const cx = L + slot * i + slot / 2, top = y(x.revenue), h = T + ih - top, rad = Math.min(4, bw / 2, h);
      const d = h > 0 ? `M${cx - bw / 2} ${T + ih}V${top + rad}Q${cx - bw / 2} ${top} ${cx - bw / 2 + rad} ${top}H${cx + bw / 2 - rad}Q${cx + bw / 2} ${top} ${cx + bw / 2} ${top + rad}V${T + ih}Z` : '';
      return `<g class="slot" data-i="${i}"><rect class="hl" x="${L + slot * i}" y="${T}" width="${slot}" height="${ih}" rx="4"/>${d ? `<path class="bar-m" d="${d}"/>` : ''}<rect x="${L + slot * i}" y="${T}" width="${slot}" height="${ih + B}" fill="transparent"/></g>`;
    }).join('');
    const xl = rows.map((x, i) => (rows.length - 1 - i) % labelEvery === 0 ? `<text x="${L + slot * i + slot / 2}" y="${H - 7}" text-anchor="middle">${pointLabel(x.key)}</text>` : '').join('');
    box.innerHTML = `<div class="chart" style="height:${H}px"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart of revenue, ${esc(fmt(total))} in total. Use View table for exact values.">
      ${ticks.map(t => `<line class="gl" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${shortMoney(t)}</text>`).join('')}${bars}${xl}</svg><div class="tip" hidden></div></div>`;
    const tip = $('.tip', box), chart = $('.chart', box);
    const show = g => {
      const i = Number(g.dataset.i), x = rows[i];
      tip.innerHTML = `<b class="num">${fmt(x.revenue)}</b>${pointLabel(x.key, true)} · ${x.orders} order${x.orders === 1 ? '' : 's'}`;
      tip.hidden = false;
      const cx = L + slot * i + slot / 2, half = tip.offsetWidth / 2;
      tip.style.left = Math.min(W - half, Math.max(half, cx)) + 'px';
      tip.style.top = Math.max(tip.offsetHeight + 2, y(x.revenue) - 8) + 'px';
    };
    $$('.slot', box).forEach(g => { g.onmouseenter = () => show(g); g.onclick = () => show(g); });
    chart.onmouseleave = () => { tip.hidden = true; };
  }

  // ------------------------------------------------------------ analytics (for ads and marketing decisions)
  const anState = { days: load('alola_admin_an_days', 30), metric: 'visitors', heat: 'heatOrders', table: false };
  const pct = (a, b) => b > 0 ? a / b * 100 : 0;
  const pctTxt = v => `${v >= 10 ? Math.round(v) : (Math.round(v * 10) / 10)}%`;
  /** Change vs the previous period, as text so it never relies on colour alone. */
  function delta(cur, prev, lowerIsBetter) {
    if (!prev) return cur ? '<span class="dl up">New</span>' : '<span class="dl">No change</span>';
    const d = (cur - prev) / prev * 100, good = lowerIsBetter ? d < 0 : d > 0;
    if (Math.abs(d) < .5) return '<span class="dl">No change</span>';
    return `<span class="dl ${good ? 'up' : 'down'}">${d > 0 ? '▲ +' : '▼ '}${pctTxt(Math.abs(d))}</span>`;
  }
  const DAYS_SAT = [5, 6, 0, 1, 2, 3, 4]; // Egypt's week starts on Saturday; data rows are Monday-first
  const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const hourName = h => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
  /** A CSV file the admin can open in Excel. The BOM keeps Arabic text readable there. */
  function downloadCsv(name, rows) {
    const cell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const blob = new Blob(['﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  /** Egyptian mobile numbers in the international form ad platforms ask for: 01xxxxxxxxx becomes +201xxxxxxxxx. */
  const intlPhone = p => { const d = String(p || '').replace(/[^\d+]/g, ''); return /^01\d{9}$/.test(d) ? '+2' + d : /^201\d{9}$/.test(d) ? '+' + d : d; };
  /** A ranked table with a share bar: one hue, magnitude only. */
  function shareTable(rows, cols, { empty = 'No data yet', key = 'sessions' } = {}) {
    if (!rows.length) return `<div class="empty" style="padding:26px 10px">${empty}</div>`;
    const max = Math.max(1, ...rows.map(r => r[key] || 0));
    return `<div class="tbl-wrap flat"><table><thead><tr>${cols.map(c => `<th${c.r ? ' class="r"' : ''}>${c.h}</th>`).join('')}</tr></thead><tbody>
      ${rows.map(r => `<tr>${cols.map((c, i) => `<td${c.r ? ' class="r num nowrap"' : ''}>${i === 0 ? `<div class="sh-name">${c.v(r)}</div><div class="sh-bar"><i style="width:${(r[key] || 0) / max * 100}%"></i></div>` : c.v(r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  async function viewAnalytics(el, token) {
    el.innerHTML = '<div class="kpis"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div><div class="skeleton" style="height:340px"></div>';
    let a;
    try { a = await db.marketing(anState.days); } catch (e) { return fail(e); }
    if (token !== viewToken) return;
    const c = a.current, p = a.previous;
    const conv = pct(c.purchaseSessions || c.orders, c.sessions), convPrev = pct(p.purchaseSessions || p.orders, p.sessions);
    const cartRate = pct(c.cartSessions, c.sessions), cartPrev = pct(p.cartSessions, p.sessions);
    const aband = c.checkoutSessions ? 100 - pct(c.purchaseSessions, c.checkoutSessions) : 0, abandPrev = p.checkoutSessions ? 100 - pct(p.purchaseSessions, p.checkoutSessions) : 0;
    const notrack = load('alola_notrack', null) === 1 || (() => { try { return localStorage.getItem('alola_notrack') === '1'; } catch { return false; } })();
    const since = a.trackingSince ? day(a.trackingSince) : null;
    const tile = (label, value, d, sub, cls = '') => `<div class="kpi ${cls}"><div class="l">${label}</div><div class="v num">${value}</div><div class="s">${d} ${sub ? `<span>· ${sub}</span>` : ''}</div></div>`;
    const prodRows = a.products.slice(0, 25);
    const avgRate = pct(a.products.reduce((s, x) => s + x.sold, 0), a.products.reduce((s, x) => s + x.views, 0));
    const heatMax = k => Math.max(1, ...a[k]);

    el.innerHTML = `<div class="bar an-bar">
        <div class="seg" role="group" aria-label="Period">${[[7, '7 days'], [30, '30 days'], [90, '90 days'], [365, '12 months']].map(([d, l]) => `<button data-days="${d}" aria-pressed="${anState.days === d}" class="${anState.days === d ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div style="flex:1"></div>
        <button class="btn ln" id="anExpCust">${I.customers} Customers for ads (CSV)</button>
        <button class="btn ln" id="anExpProd">${I.products} Products report (CSV)</button>
      </div>
      <p class="note an-note">${since ? `Visit tracking started on <b>${since}</b>. Orders and revenue include every order.` : 'No visits recorded yet. Visits are counted from now on; orders and revenue already include every order.'}
        Compared with the ${a.days} days before. <label class="tg" style="display:inline-flex;padding:0;margin-left:6px"><input type="checkbox" id="anNoTrack" ${notrack ? 'checked' : ''}> Don’t count my own visits on this browser</label></p>
      <div class="kpis an-kpis">
        ${tile('Visitors', c.visitors.toLocaleString(), delta(c.visitors, p.visitors), `${c.sessions.toLocaleString()} visits`, 'a')}
        ${tile('Conversion rate', pctTxt(conv), delta(conv, convPrev), 'visits that ordered')}
        ${tile('Orders', c.orders.toLocaleString(), delta(c.orders, p.orders), `revenue ${fmt(c.revenue)}`)}
        ${tile('Average order', fmt(c.aov), delta(c.aov, p.aov))}
        ${tile('Revenue per visit', fmt(c.sessions ? Math.round(c.revenue / c.sessions) : 0), delta(c.sessions ? c.revenue / c.sessions : 0, p.sessions ? p.revenue / p.sessions : 0), 'use as your max cost per click')}
        ${tile('Add-to-cart rate', pctTxt(cartRate), delta(cartRate, cartPrev), 'visits that added a product')}
        ${tile('Checkout drop-off', pctTxt(aband), delta(aband, abandPrev, true), 'started checkout, didn’t order')}
        ${tile('Product views', c.productViews.toLocaleString(), delta(c.productViews, p.productViews), `${c.pageViews.toLocaleString()} pages viewed`)}
      </div>

      <div class="card an-card"><div class="ch-h"><div><h2 id="anTitle"></h2><div class="ch-total" id="anTotal"></div></div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><div class="seg" role="group" aria-label="Measure">${[['visitors', 'Visitors'], ['orders', 'Orders'], ['revenue', 'Revenue']].map(([k, l]) => `<button data-metric="${k}" aria-pressed="${anState.metric === k}" class="${anState.metric === k ? 'on' : ''}">${l}</button>`).join('')}</div><button class="linkbtn" id="anView">${anState.table ? 'View chart' : 'View table'}</button></div></div>
        <div id="anChart"></div></div>

      <div class="an-g">
        <div class="card"><h2>Shopping funnel</h2><p class="note">How far visits get. The biggest drop is where to improve first.</p>
          <div class="funnel">${a.funnel.map((f, i) => { const prev = i ? a.funnel[i - 1].n : f.n, base = a.funnel[0].n;
            return `<div class="fn-row"><div class="fn-l"><b>${f.step}</b><span class="num">${f.n.toLocaleString()}</span></div>
              <div class="fn-bar"><i style="width:${pct(f.n, base)}%"></i></div>
              <div class="fn-r num">${i ? `${pctTxt(pct(f.n, prev))} of previous step` : '100%'}</div></div>`; }).join('')}</div></div>
        <div class="card"><h2>Where visitors come from</h2><p class="note">Ad links made with the link builder below show here by name, e.g. “Facebook Ads”.</p>
          ${shareTable(a.channels, [
            { h: 'Source', v: r => esc(r.name) }, { h: 'Visits', r: 1, v: r => r.sessions.toLocaleString() },
            { h: 'Orders', r: 1, v: r => r.orders }, { h: 'Conv.', r: 1, v: r => pctTxt(pct(r.orders, r.sessions)) }, { h: 'Revenue', r: 1, v: r => fmt(r.revenue) }],
            { empty: 'No visits recorded yet' })}</div>
      </div>

      <div class="an-g">
        <div class="card"><h2>Ad campaigns</h2><p class="note">Every link with a campaign name, and what it brought in.</p>
          ${shareTable(a.campaigns, [
            { h: 'Campaign', v: r => `${esc(r.name)}<small>${esc(r.channel)}</small>` }, { h: 'Visits', r: 1, v: r => r.sessions.toLocaleString() },
            { h: 'Orders', r: 1, v: r => r.orders }, { h: 'Revenue', r: 1, v: r => fmt(r.revenue) }, { h: 'Per visit', r: 1, v: r => fmt(r.sessions ? Math.round(r.revenue / r.sessions) : 0) }],
            { empty: 'No campaign links used yet. Build one with the ad link builder.' })}</div>
        <div class="card" id="utm"><h2>Ad link builder</h2><p class="note">Use these links in your ads and posts so every visit and order is credited to the right ad.</p>
          <div class="f2"><div class="fld"><label for="u_page">Page</label><select class="in" id="u_page">
              <option value="">Home page</option><option value="shop.html">All products</option>
              ${['Skincare', 'Hair', 'Makeup', 'Fragrance'].map(x => `<option value="shop.html?category=${x}">Category: ${x}</option>`).join('')}
              ${[...new Set(a.products.map(x => x.brand).concat(productsState.rows.map(x => x.brand)))].sort().map(b => `<option value="shop.html?brand=${encodeURIComponent(b)}">Brand: ${esc(b)}</option>`).join('')}
              <option value="custom">Another page (paste its link)…</option></select></div>
            <div class="fld"><label for="u_src">Where the ad runs</label><select class="in" id="u_src">${[['facebook', 'Facebook'], ['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['google', 'Google'], ['snapchat', 'Snapchat'], ['whatsapp', 'WhatsApp'], ['email', 'Email'], ['influencer', 'Influencer']].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div></div>
          <div class="fld" id="u_customRow" hidden><label for="u_custom">Page link</label><input class="in" id="u_custom" inputmode="url" spellcheck="false" placeholder="https://alielmarghany.github.io/alola-store/product.html?id=22"></div>
          <div class="f2"><div class="fld"><label for="u_med">Type</label><select class="in" id="u_med"><option value="cpc">Paid ad</option><option value="social">Free post or story</option><option value="message">Message or chat</option><option value="influencer">Influencer post</option></select></div>
            <div class="fld"><label for="u_camp">Campaign name</label><input class="in" id="u_camp" maxlength="60" autocomplete="off" spellcheck="false" placeholder="eid-sale-2026"></div></div>
          <div class="fld"><label for="u_out">Your link</label><div class="u-out"><input class="in" id="u_out" readonly><button class="btn" id="u_copy" type="button">Copy</button></div></div></div>
      </div>

      <div class="card an-card"><div class="ch-h"><div><h2>Products: interest vs sales</h2><p class="note" style="margin:2px 0 0">Many views but few sales usually means the price, photos or description need work. Many sales: a good product to advertise.</p></div></div>
        ${prodRows.length ? `<div class="tbl-wrap flat"><table><thead><tr><th>Product</th><th class="r">Views</th><th class="r">Added to cart</th><th class="r">Sold</th><th class="r">Revenue</th><th class="r hide-m">Views → sold</th><th class="hide-m">Note</th></tr></thead><tbody>
          ${prodRows.map(x => { const rate = pct(x.sold, x.views);
            // Judged against this store's own average, not a fixed number.
            const note = (x.views >= 10 && x.sold === 0) || (x.views >= 30 && rate < avgRate / 3) ? '<span class="st st-low">Many views, few sales</span>'
              : x.sold >= 3 && rate >= avgRate ? '<span class="st st-live">Good to advertise</span>' : '';
            return `<tr><td><b>${esc(x.name)}</b><small>${x.code ? `Code ${esc(x.code)} · ` : ''}${esc(x.brand)}</small></td><td class="r num">${x.views.toLocaleString()}</td><td class="r num">${x.carts.toLocaleString()}</td><td class="r num">${x.sold.toLocaleString()}</td><td class="r num nowrap">${fmt(x.revenue)}</td><td class="r num hide-m">${x.views ? pctTxt(rate) : '–'}</td><td class="hide-m">${note}</td></tr>`; }).join('')}</tbody></table></div>`
          : '<div class="empty" style="padding:26px 10px">No product views or sales in this period yet</div>'}</div>

      <div class="an-g">
        <div class="card"><h2>Governorates</h2><p class="note">Where orders go. Target ads at the strongest areas, or test the weak ones.</p>
          ${shareTable(a.cities, [{ h: 'Governorate', v: r => esc(r.name) }, { h: 'Orders', r: 1, v: r => r.orders }, { h: 'Clients', r: 1, v: r => r.customers }, { h: 'Revenue', r: 1, v: r => fmt(r.revenue) }],
            { key: 'revenue', empty: 'No orders in this period' })}</div>
        <div class="card"><h2>What people search for</h2><p class="note">“No results” means people want something you don’t stock or can’t find. Consider adding it.</p>
          ${shareTable(a.searches, [{ h: 'Search', v: r => `“${esc(r.query)}”` }, { h: 'Times', r: 1, v: r => r.n }, { h: 'Results', r: 1, v: r => r.max_results === 0 ? '<span class="st st-out">No results</span>' : r.max_results ?? '–' }],
            { key: 'n', empty: 'No searches yet' })}</div>
      </div>

      <div class="an-g">
        <div class="card"><div class="ch-h"><div><h2>Best times</h2><p class="note" style="margin:2px 0 0">Schedule ads and posts for the busiest hours (Cairo time).</p></div>
          <div class="seg" role="group" aria-label="Show">${[['heatOrders', 'Orders'], ['heatVisits', 'Visits']].map(([k, l]) => `<button data-heat="${k}" aria-pressed="${anState.heat === k}" class="${anState.heat === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
          <div id="anHeat"></div></div>
        <div style="display:grid;gap:14px;align-content:start">
          <div class="card"><h2>Devices</h2>${shareTable(a.devices, [{ h: 'Device', v: r => cap(r.name) }, { h: 'Visits', r: 1, v: r => r.sessions.toLocaleString() }, { h: 'Conv.', r: 1, v: r => pctTxt(pct(r.orders, r.sessions)) }], { empty: 'No visits yet' })}</div>
          <div class="card"><h2>Store language</h2>${shareTable(a.languages, [{ h: 'Language', v: r => r.name }, { h: 'Visits', r: 1, v: r => r.sessions.toLocaleString() }, { h: 'Orders', r: 1, v: r => r.orders }], { empty: 'No visits yet' })}</div>
        </div>
      </div>

      <div class="an-g">
        <div class="card"><h2>Customers</h2>
          <div class="mini-kpis"><div><b class="num">${a.customers.buyers}</b><span>bought in this period</span></div><div><b class="num">${a.customers.new}</b><span>first-time buyers</span></div>
            <div><b class="num">${a.customers.returning}</b><span>came back to buy again</span></div><div><b class="num">${a.customers.repeatRateAllTime}%</b><span>of all clients ordered twice or more</span></div></div>
          ${a.customers.top.length ? `<h3 class="an-h3">Top clients this period</h3><div class="rows">${a.customers.top.map(t => `<a class="rw" href="#/customers/${t.id}"><span>${esc(t.name)}<small>${esc(t.city)} · ${t.orders} order${t.orders === 1 ? '' : 's'}</small></span><b class="num nowrap">${fmt(t.spent)}</b></a>`).join('')}</div>` : ''}
          <p class="note" style="margin-top:12px">Tip: “Customers for ads” downloads every client’s phone and email. Upload it to Meta or TikTok Ads as a custom audience to reach them again or to find similar people (lookalike audience).</p></div>
        <div class="card"><h2>Discount codes</h2><p class="note">Which codes brought orders in this period.</p>
          ${shareTable(a.discounts, [{ h: 'Code', v: r => `<b>${esc(r.code)}</b>` }, { h: 'Orders', r: 1, v: r => r.orders }, { h: 'Revenue', r: 1, v: r => fmt(r.revenue) }, { h: 'Discount given', r: 1, v: r => fmt(r.discount) }],
            { key: 'orders', empty: 'No discount codes used in this period' })}</div>
      </div>`;
    $('#sub').textContent = `Last ${a.days === 365 ? '12 months' : `${a.days} days`}`;

    // Period, measure and table switches.
    $$('[data-days]', el).forEach(b => b.onclick = () => { anState.days = Number(b.dataset.days); save('alola_admin_an_days', anState.days); viewAnalytics(el, ++viewToken); });
    const drawDaily = () => {
      const m = anState.metric, rows = a.daily, total = rows.reduce((s, x) => s + x[m], 0);
      const names = { visitors: 'Visitors per day', orders: 'Orders per day', revenue: 'Revenue per day' };
      $('#anTitle').textContent = names[m];
      $('#anTotal').innerHTML = `<span class="num">${m === 'revenue' ? fmt(total) : total.toLocaleString()}</span><small>${m === 'visitors' ? 'visits by day, people counted once per day' : 'cancelled orders not counted'}</small>`;
      const box = $('#anChart');
      if (anState.table) {
        box.innerHTML = `<div class="ch-tbl"><table><thead><tr><th>Day</th><th class="r">Visitors</th><th class="r">Orders</th><th class="r">Revenue</th></tr></thead><tbody>${[...rows].reverse().map(x => `<tr><td>${pointLabel(x.key, true)}</td><td class="r num">${x.visitors}</td><td class="r num">${x.orders}</td><td class="r num">${fmt(x.revenue)}</td></tr>`).join('')}</tbody></table></div>`;
        return;
      }
      barSeries(box, rows, m, v => m === 'revenue' ? fmt(v) : v.toLocaleString(), x => `${pointLabel(x.key, true)} · ${x.visitors} visitor${x.visitors === 1 ? '' : 's'}, ${x.orders} order${x.orders === 1 ? '' : 's'}`);
    };
    drawDaily();
    $$('[data-metric]', el).forEach(b => b.onclick = () => {
      anState.metric = b.dataset.metric;
      $$('[data-metric]', el).forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
      drawDaily();
    });
    $('#anView').onclick = e => { anState.table = !anState.table; e.target.textContent = anState.table ? 'View chart' : 'View table'; drawDaily(); };
    new ResizeObserver(() => { if (!anState.table && $('#anChart')) drawDaily(); }).observe($('#anChart'));

    // Best times: a week of hours, darker = busier. One hue, light to dark.
    const drawHeat = () => {
      const k = anState.heat, max = heatMax(k), data = a[k], what = k === 'heatOrders' ? 'order' : 'visit';
      const step = v => v === 0 ? 0 : Math.min(5, Math.ceil(v / max * 5));
      $('#anHeat').innerHTML = `<div class="heat" role="table" aria-label="${what === 'order' ? 'Orders' : 'Visits'} by day and hour">
        <div class="hx" role="row"><span></span>${Array.from({ length: 24 }, (_, h) => `<span role="columnheader">${h % 3 === 0 ? hourName(h) : ''}</span>`).join('')}</div>
        ${DAYS_SAT.map(dw => `<div class="hr" role="row"><span role="rowheader">${DAY_NAMES[dw].slice(0, 3)}</span>${Array.from({ length: 24 }, (_, h) => { const v = data[dw * 24 + h];
          return `<i role="cell" class="h${step(v)}" tabindex="-1" data-tip="${DAY_NAMES[dw]} ${hourName(h)}–${hourName((h + 1) % 24)}: ${v} ${what}${v === 1 ? '' : 's'}"></i>`; }).join('')}</div>`).join('')}
        <div class="h-legend"><span>Fewer</span>${[0, 1, 2, 3, 4, 5].map(s => `<i class="h${s}"></i>`).join('')}<span>More</span></div></div><div class="tip" hidden></div>`;
      const tip = $('#anHeat .tip'), wrap = $('#anHeat');
      $$('#anHeat [data-tip]').forEach(cell => cell.onmouseenter = () => {
        tip.textContent = cell.dataset.tip; tip.hidden = false;
        const r = cell.getBoundingClientRect(), w = wrap.getBoundingClientRect();
        tip.style.left = Math.min(w.width - tip.offsetWidth / 2, Math.max(tip.offsetWidth / 2, r.left - w.left + r.width / 2)) + 'px';
        tip.style.top = (r.top - w.top - 4) + 'px';
      });
      wrap.onmouseleave = () => { tip.hidden = true; };
    };
    drawHeat();
    $$('[data-heat]', el).forEach(b => b.onclick = () => {
      anState.heat = b.dataset.heat;
      $$('[data-heat]', el).forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
      drawHeat();
    });

    // Ad link builder.
    const site = new URL('../', location.href).href;
    const buildLink = () => {
      const pageV = $('#u_page').value;
      $('#u_customRow').hidden = pageV !== 'custom';
      let base = pageV === 'custom' ? $('#u_custom').value.trim() : site + pageV;
      let url;
      try { url = new URL(base || site); } catch { $('#u_out').value = 'Paste a full page link that starts with https://'; return; }
      const camp = $('#u_camp').value.trim().toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '-').replace(/^-|-$/g, '');
      url.searchParams.set('utm_source', $('#u_src').value);
      url.searchParams.set('utm_medium', $('#u_med').value);
      if (camp) url.searchParams.set('utm_campaign', camp); else url.searchParams.delete('utm_campaign');
      $('#u_out').value = url.href;
    };
    ['u_page', 'u_src', 'u_med', 'u_camp', 'u_custom'].forEach(id => $(`#${id}`).addEventListener('input', buildLink));
    buildLink();
    $('#u_copy').onclick = async () => {
      try { await navigator.clipboard.writeText($('#u_out').value); toast('Link copied'); }
      catch { $('#u_out').select(); toast('Press Ctrl+C to copy the link'); }
    };

    // This browser is the admin's: leave it out of the numbers if they want.
    $('#anNoTrack').onchange = e => {
      try { e.target.checked ? localStorage.setItem('alola_notrack', '1') : localStorage.removeItem('alola_notrack'); } catch {}
      toast(e.target.checked ? 'Your visits on this browser won’t be counted' : 'Your visits on this browser will be counted');
    };

    // Exports.
    $('#anExpCust').onclick = async () => {
      try {
        const rows = await db.customersExport();
        downloadCsv(`alola-customers-${new Date().toISOString().slice(0, 10)}.csv`, [
          ['name', 'email', 'phone', 'city', 'country', 'orders', 'total_spent_egp', 'first_order', 'last_order'],
          ...rows.map(r => [r.name, r.email, intlPhone(r.phone), r.city, 'EG', r.orders, r.spent, r.first_order ? r.first_order.slice(0, 10) : '', r.last_order ? r.last_order.slice(0, 10) : ''])]);
        toast(`${rows.length} client${rows.length === 1 ? '' : 's'} downloaded`);
      } catch (e) { fail(e); }
    };
    $('#anExpProd').onclick = () => downloadCsv(`alola-products-${a.days}d-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['code', 'product', 'brand', 'views', 'added_to_cart', 'sold', 'revenue_egp', 'views_to_sold_pct'],
      ...a.products.map(x => [x.code || '', x.name, x.brand, x.views, x.carts, x.sold, x.revenue, x.views ? Math.round(pct(x.sold, x.views) * 10) / 10 : ''])]);
  }
  /** Single-series bar chart for the Analytics tab: same marks as the Overview chart. */
  function barSeries(box, rows, key, fmtV, tipLine) {
    const W = Math.max(280, box.clientWidth || 600), H = innerWidth <= 820 ? 220 : 250;
    const L = 44, R = 4, T = 10, B = 24, iw = W - L - R, ih = H - T - B;
    const { max, step } = niceScale(Math.max(...rows.map(x => x[key])));
    const slot = iw / rows.length, bw = Math.max(1.5, Math.min(slot - 2, 30));
    const y = v => T + ih - (v / max) * ih;
    const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
    const labelEvery = Math.max(1, Math.ceil(52 / slot));
    const bars = rows.map((x, i) => {
      const cx = L + slot * i + slot / 2, top = y(x[key]), h = T + ih - top, rad = Math.min(4, bw / 2, h);
      const d = h > 0 ? `M${cx - bw / 2} ${T + ih}V${top + rad}Q${cx - bw / 2} ${top} ${cx - bw / 2 + rad} ${top}H${cx + bw / 2 - rad}Q${cx + bw / 2} ${top} ${cx + bw / 2} ${top + rad}V${T + ih}Z` : '';
      return `<g class="slot" data-i="${i}"><rect class="hl" x="${L + slot * i}" y="${T}" width="${slot}" height="${ih}" rx="4"/>${d ? `<path class="bar-m" d="${d}"/>` : ''}<rect x="${L + slot * i}" y="${T}" width="${slot}" height="${ih + B}" fill="transparent"/></g>`;
    }).join('');
    const xl = rows.map((x, i) => (rows.length - 1 - i) % labelEvery === 0 ? `<text x="${L + slot * i + slot / 2}" y="${H - 7}" text-anchor="middle">${pointLabel(x.key)}</text>` : '').join('');
    box.innerHTML = `<div class="chart" style="height:${H}px"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart by day. Use View table for exact values.">
      ${ticks.map(t => `<line class="gl" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${key === 'revenue' ? shortMoney(t) : t}</text>`).join('')}${bars}${xl}</svg><div class="tip" hidden></div></div>`;
    const tip = $('.tip', box), chart = $('.chart', box);
    const show = g => {
      const i = Number(g.dataset.i), x = rows[i];
      tip.innerHTML = `<b class="num">${fmtV(x[key])}</b>${tipLine(x)}`;
      tip.hidden = false;
      const cx = L + slot * i + slot / 2, half = tip.offsetWidth / 2;
      tip.style.left = Math.min(W - half, Math.max(half, cx)) + 'px';
      tip.style.top = Math.max(tip.offsetHeight + 2, y(x[key]) - 8) + 'px';
    };
    $$('.slot', box).forEach(g => { g.onmouseenter = () => show(g); g.onclick = () => show(g); });
    chart.onmouseleave = () => { tip.hidden = true; };
  }

  // ------------------------------------------------------------ orders
  const ordersState = { page: 1, q: '', status: '' };
  async function viewOrders(el, token, freshId) {
    if (!$('#oq', el)) {
      el.innerHTML = `<div class="bar"><input class="in grow" id="oq" type="search" placeholder="Search name, email, phone or order number" aria-label="Search orders" value="${esc(ordersState.q)}">
        <select class="in" id="ost" aria-label="Filter by status"><option value="">All statuses</option>${STATUSES.map(s => `<option value="${s}" ${ordersState.status === s ? 'selected' : ''}>${cap(s)}</option>`).join('')}</select></div><div id="olist"><div class="skeleton" style="height:360px"></div></div>`;
      $('#oq').oninput = debounce(e => { ordersState.q = e.target.value; ordersState.page = 1; viewOrders(el, viewToken); });
      $('#ost').onchange = e => { ordersState.status = e.target.value; ordersState.page = 1; viewOrders(el, viewToken); };
    }
    let d;
    try { d = await db.orders(ordersState); } catch (e) { return fail(e); }
    if (token !== viewToken) return;
    $('#sub').textContent = `${d.total.toLocaleString()} order${d.total === 1 ? '' : 's'}`;
    const list = $('#olist');
    list.innerHTML = d.rows.length ? `<div class="tbl-wrap"><table><thead><tr><th>Order</th><th>Client</th><th class="hide-m">Date</th><th class="hide-m">Items</th><th>Status</th><th class="r">Total</th></tr></thead><tbody>
      ${d.rows.map(o => `<tr class="click${o.id === freshId ? ' fresh' : ''}" data-oid="${o.id}" tabindex="0"><td class="nowrap"><b>${o.number}</b></td><td>${esc(o.customer_name)}<small>${esc(o.phone)}</small></td><td class="hide-m nowrap">${when(o.created_at)}</td><td class="hide-m num">${o.item_count}</td><td>${badge(o.status)}</td><td class="r num nowrap"><b>${fmt(o.total)}</b></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="card empty"><b>No orders found</b>Try a different search or status.</div>';
    if (d.rows.length) list.append(pager(ordersState, d.total, d.size, () => viewOrders(el, viewToken)));
    bindRows(list, '[data-oid]', r => openOrder(Number(r.dataset.oid)));
  }
  const bindRows = (root, sel, fn) => $$(sel, root).forEach(r => {
    r.onclick = () => fn(r);
    r.onkeydown = e => { if (e.key === 'Enter') fn(r); };
  });

  async function openOrder(id) {
    let o;
    try { o = await db.order(id); } catch (e) { return fail(e); }
    const dr = openDrawer(`<div class="dr-h"><div><h2>${o.number}</h2><div style="color:var(--mute)">${when(o.created_at)}</div></div>${closeBtn}</div>
      <div class="card"><h2>Status</h2><div class="steps" id="steps" role="group" aria-label="Order status">${STATUSES.map(s => `<button data-s="${s}" class="${s === 'cancelled' ? 'can ' : ''}${o.status === s ? 'on' : ''}" aria-pressed="${o.status === s}">${cap(s)}</button>`).join('')}</div>
        <small style="display:block;color:var(--mute);margin-top:8px">Cancelling returns the items to stock and removes the order from revenue.</small></div>
      <div class="card"><h2>Items</h2><div class="rows">${o.items.map(i => `<div class="rw"><span>${esc(i.name)}<small>${i.code ? `Code ${esc(i.code)} · ` : ''}${esc(i.brand)} · ${i.qty} × ${fmt(i.price)}</small></span><b class="num nowrap">${fmt(i.qty * i.price)}</b></div>`).join('')}
        ${o.discount ? `<div class="rw"><span style="color:var(--mute)">Discount (${esc(o.discount_code)})</span><span class="num">−${fmt(o.discount)}</span></div>` : ''}
        <div class="rw"><span style="color:var(--mute)">Delivery${o.discount_code && !o.discount ? ` (${esc(o.discount_code)})` : ''}</span><span class="num">${o.shipping ? fmt(o.shipping) : 'Free'}</span></div>
        <div class="rw"><b>Total (cash on delivery)</b><b class="num">${fmt(o.total)}</b></div></div></div>
      <div class="card"><h2>Client</h2><dl class="kv"><dt>Name</dt><dd><a href="#" id="toCust">${esc(o.customer_name)}</a></dd><dt>Phone</dt><dd><a href="tel:${esc(o.phone.replace(/[^+\d]/g, ''))}">${esc(o.phone)}</a></dd><dt>Email</dt><dd><a href="mailto:${esc(o.email)}">${esc(o.email)}</a></dd><dt>Governorate</dt><dd>${esc(o.city)}</dd><dt>Address</dt><dd>${esc(o.address)}</dd>${o.notes ? `<dt>Notes</dt><dd>${esc(o.notes)}</dd>` : ''}</dl></div>`);
    $('#toCust', dr).onclick = e => { e.preventDefault(); openCustomer(o.customer_id); };
    $('#steps', dr).onclick = async e => {
      const b = e.target.closest('[data-s]'); if (!b || b.dataset.s === o.status) return;
      const s = b.dataset.s;
      if (s === 'cancelled' && !(await confirmDialog(`Cancel ${o.number}?`, 'Items go back to stock and the order no longer counts towards revenue.', 'Cancel order'))) return;
      try {
        const u = await db.setOrderStatus(o.id, s);
        o.status = u.status;
        $$('[data-s]', dr).forEach(x => { const on = x.dataset.s === o.status; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
        toast(`${o.number} marked ${s}`);
        refreshPending();
        if (current === 'orders') viewOrders($('#view'), viewToken);
        if (current === 'overview') viewOverview($('#view'), ++viewToken, true);
      } catch (err) { fail(err); }
    };
  }

  // ------------------------------------------------------------ products
  const productsState = { q: '', rows: [] };
  async function viewProducts(el, token) {
    if (!$('#pq', el)) {
      el.innerHTML = `<div class="bar"><input class="in grow" id="pq" type="search" placeholder="Search name, brand or code" aria-label="Search products" value="${esc(productsState.q)}"><div style="flex:1"></div><button class="btn ln" id="impP">${I.sheet} Update from sheet</button><button class="btn" id="addP">${I.plus} Add product</button></div><div id="plist"><div class="skeleton" style="height:360px"></div></div>`;
      $('#pq').oninput = e => { productsState.q = e.target.value; drawProducts(); };
      $('#addP').onclick = () => openProductForm(null);
      $('#impP').onclick = openSheetImport;
    }
    try { const rows = await db.products(); if (token !== viewToken) return; productsState.rows = rows; }
    catch (e) { return fail(e); }
    drawProducts();
  }
  const thumb = p => `<div class="th ph-${esc(p.category)}">${p.image ? `<img src="${esc(p.image)}" alt="" width="48" height="48" loading="lazy" decoding="async">` : alolaArt(p)}</div>`;
  function drawProducts() {
    const q = productsState.q.trim().toLowerCase();
    const rows = productsState.rows.filter(p => !q || `${p.name} ${p.brand} ${p.category} ${p.code || ''}`.toLowerCase().includes(q));
    $('#sub').textContent = `${productsState.rows.length} product${productsState.rows.length === 1 ? '' : 's'}`;
    const list = $('#plist'); if (!list) return;
    list.innerHTML = rows.length ? `<div class="tbl-wrap"><table><thead><tr><th>Product</th><th class="hide-m">Category</th><th class="r">Price</th><th>Stock</th><th class="hide-m r">Sold</th><th class="hide-m">Status</th><th class="r">Actions</th></tr></thead><tbody>
      ${rows.map(p => `<tr><td><div class="prod-t">${thumb(p)}<span><b>${esc(p.name)}</b><small style="color:var(--mute)">${p.code ? `Code ${esc(p.code)} · ` : ''}${esc(p.brand)}${p.featured ? ' · Featured' : ''}</small></span></div></td>
        <td class="hide-m">${esc(p.category)}</td><td class="r num nowrap">${fmt(p.price)}${p.compare_at ? `<small><s>${fmt(p.compare_at)}</s></small>` : ''}</td>
        <td>${p.stock <= 0 ? '<span class="st st-out">Sold out</span>' : p.stock <= 10 ? `<span class="st st-low">${p.stock} left</span>` : `<span class="num">${p.stock}</span>`}</td>
        <td class="hide-m r num">${p.sold.toLocaleString()}</td><td class="hide-m"><span class="st st-${p.active ? 'live' : 'hidden'}">${p.active ? 'Live' : 'Hidden'}</span></td>
        <td><div class="acts"><button data-edit="${p.id}" aria-label="Edit ${esc(p.name)}">Edit</button><button class="del" data-del="${p.id}" aria-label="Delete ${esc(p.name)}">Delete</button></div></td></tr>`).join('')}
      </tbody></table></div>` : `<div class="card empty"><b>${q ? 'No products match' : 'No products yet'}</b>${q ? 'Try a different search.' : 'Add your first product to start selling.'}</div>`;
    $$('[data-edit]', list).forEach(b => b.onclick = () => openProductForm(productsState.rows.find(p => p.id === Number(b.dataset.edit))));
    $$('[data-del]', list).forEach(b => b.onclick = async () => {
      const p = productsState.rows.find(x => x.id === Number(b.dataset.del));
      if (!(await confirmDialog(`Delete ${p.name}?`, 'It disappears from the store straight away. Past orders keep their record of it. To take it down temporarily, edit it and untick “Show in store” instead.', 'Delete product'))) return;
      try { await db.deleteProduct(p); toast(`${p.name} deleted`); viewProducts($('#view'), viewToken); } catch (e) { fail(e); }
    });
  }

  // ------------------------------------------------------------ update prices and stock from the shop's item sheet
  function openSheetImport() {
    const dr = openDrawer(`<div class="dr-h"><h2>Update from sheet</h2>${closeBtn}</div>
      <div class="form-err" id="ie" role="alert" hidden></div>
      <div class="card"><h2>1. Choose the sheet</h2>
        <p class="note">Export the item list from your stock system as Excel, CSV or PDF. Products are matched by their <b>product code</b> (كود الصنف). Prices use the selling price column (سعر البيع) and stock uses the balance column (الرصيد or الكمية), when the sheet has them.</p>
        <div class="up"><label class="btn ln" style="cursor:pointer">Choose file<input type="file" id="i_file" accept=".xlsx,.xls,.csv,.pdf" class="sr"></label><span class="note" id="i_name"></span></div>
      </div>
      <div id="i_out"></div>`);
    let sheet = null;
    $('#i_file', dr).onchange = async e => {
      const file = e.target.files[0]; e.target.value = '';
      if (!file) return;
      $('#ie', dr).hidden = true;
      $('#i_name', dr).textContent = `Reading ${file.name}…`;
      $('#i_out', dr).innerHTML = '';
      try {
        sheet = await SheetImport.read(file);
        if (!productsState.rows.length) productsState.rows = await db.products();
        $('#i_name', dr).innerHTML = `<bdi>${esc(file.name)}</bdi>: ${sheet.rows.length.toLocaleString()} items`;
        draw();
      } catch (ex) { sheet = null; $('#i_name', dr).textContent = ''; showErr(ex.message); }
    };
    const showErr = m => { const el = $('#ie', dr); el.textContent = m; el.hidden = false; el.scrollIntoView({ block: 'center' }); };

    function plan(usePrice, useStock) {
      const byCode = new Map(sheet.rows.map(r => [r.code, r]));
      const changes = [], missing = [];
      for (const p of productsState.rows) {
        if (!p.code) continue;
        const r = byCode.get(p.code);
        if (!r) { missing.push(p); continue; }
        const price = usePrice && r.price >= 1 && r.price <= 1e6 ? Math.round(r.price) : p.price;
        const stock = useStock && r.stock !== null && r.stock <= 1e6 ? Math.max(Math.floor(r.stock), 0) : p.stock;
        if (price !== p.price || stock !== p.stock) changes.push({ p, r, price, stock });
      }
      return { changes, missing, noCode: productsState.rows.filter(p => !p.code) };
    }
    function draw() {
      const out = $('#i_out', dr);
      const prev = { price: $('#i_price', dr)?.checked ?? sheet.hasPrice, stock: $('#i_stock', dr)?.checked ?? sheet.hasStock };
      const usePrice = sheet.hasPrice && prev.price, useStock = sheet.hasStock && prev.stock;
      const { changes, missing, noCode } = plan(usePrice, useStock);
      const arrow = (a, b, f = x => x) => a === b ? `<span class="num">${f(a)}</span>` : `<span class="num"><s style="color:var(--mute)">${f(a)}</s> → <b>${f(b)}</b></span>`;
      out.innerHTML = `<div class="card"><h2>2. What to update</h2>
          <label class="tg"><input type="checkbox" id="i_price" ${usePrice ? 'checked' : ''} ${sheet.hasPrice ? '' : 'disabled'}> Prices ${sheet.hasPrice ? '' : '<span class="note">(this sheet has no price column)</span>'}</label>
          <label class="tg"><input type="checkbox" id="i_stock" ${useStock ? 'checked' : ''} ${sheet.hasStock ? '' : 'disabled'}> Stock ${sheet.hasStock ? '' : '<span class="note">(this sheet has no stock column, so stock stays as it is)</span>'}</label>
        </div>
        <div class="card"><h2>3. Check the changes</h2>
          ${changes.length ? `<p class="note">${changes.length} of your ${productsState.rows.length} products will change.</p>
          <div class="tbl-wrap"><table><thead><tr><th>Product</th>${usePrice ? '<th class="r">Price</th>' : ''}${useStock ? '<th class="r">Stock</th>' : ''}</tr></thead><tbody>
            ${changes.map(c => `<tr><td><b>${esc(c.p.name)}</b><small style="color:var(--mute);display:block">Code ${esc(c.p.code)}${c.r.name ? ` · <bdi>${esc(c.r.name)}</bdi>` : ''}</small></td>${usePrice ? `<td class="r nowrap">${arrow(c.p.price, c.price, fmt)}</td>` : ''}${useStock ? `<td class="r nowrap">${arrow(c.p.stock, c.stock)}</td>` : ''}</tr>`).join('')}
          </tbody></table></div>` : `<div class="empty"><b>Nothing to change</b>Every matched product already has these ${[usePrice && 'prices', useStock && 'stock levels'].filter(Boolean).join(' and ') || 'values'}.</div>`}
          ${missing.length ? `<p class="note" style="margin-top:14px"><b>Not in the sheet (${missing.length}):</b> ${missing.map(p => `${esc(p.name)} (${esc(p.code)})`).join(', ')}. These stay as they are. Check their codes if they should be in it.</p>` : ''}
          ${noCode.length ? `<p class="note"><b>No product code (${noCode.length}):</b> ${noCode.map(p => esc(p.name)).join(', ')}. Add a code to update them from the sheet.</p>` : ''}
        </div>
        <div class="dr-foot"><button type="button" class="btn ln" data-close>Cancel</button><button class="btn" id="i_go" ${changes.length ? '' : 'disabled'}>Update ${changes.length} product${changes.length === 1 ? '' : 's'}</button></div>`;
      $$('[data-close]', out).forEach(b => b.onclick = requestClose);
      $('#i_price', dr).onchange = $('#i_stock', dr).onchange = draw;
      $('#i_go', dr).onclick = async e => {
        e.target.disabled = true;
        const rows = changes.map(c => ({ code: c.p.code, price: usePrice ? c.r.price : null, stock: useStock ? c.r.stock : null }));
        try {
          const r = await db.importSheet(rows);
          toast(`${r.updated} product${r.updated === 1 ? '' : 's'} updated from the sheet`);
          closeDrawer();
          viewProducts($('#view'), viewToken);
        } catch (ex) { showErr(ex.message); e.target.disabled = false; }
      };
    }
  }

  const ARTS = [['dropper', 'Dropper bottle'], ['pump', 'Pump bottle'], ['tube', 'Tube'], ['jar', 'Jar'], ['lipstick', 'Lipstick'], ['mascara', 'Mascara'], ['perfume', 'Perfume'], ['bottle', 'Bottle']];
  const ACOLORS = ['cream', 'white', 'olive', 'rose', 'amber', 'gold', 'ink', 'sky', 'plum'];
  function openProductForm(p) {
    const isNew = !p;
    const v = p || { code: '', name: '', name_ar: '', description_ar: '', how_to_ar: '', brand: '', category: 'Skincare', price: '', compare_at: '', stock: '', description: '', how_to: '', ingredients: '', art: 'bottle', color: 'cream', image: null, tag: '', featured: false, active: true };
    const brands = [...new Set(productsState.rows.map(x => x.brand))];
    const dr = openDrawer(`<div class="dr-h"><h2>${isNew ? 'Add product' : 'Edit product'}</h2>${closeBtn}</div>
      <form id="pf" novalidate><div class="form-err" id="pe" role="alert" hidden></div>
      <div class="card"><h2>Details</h2>
        <div class="fld"><label for="f_name">Name</label><input class="in" id="f_name" required maxlength="120" value="${esc(v.name)}"></div>
        <div class="fld"><label for="f_code">Product code</label><input class="in" id="f_code" maxlength="40" autocomplete="off" spellcheck="false" placeholder="Optional" value="${esc(v.code || '')}"><small>Your own code for this product. Each product needs a different one.</small></div>
        <div class="fld"><label for="f_name_ar">Name in Arabic</label><input class="in" id="f_name_ar" dir="rtl" maxlength="120" value="${esc(v.name_ar)}"></div>
        <div class="f2"><div class="fld"><label for="f_brand">Brand</label><input class="in" id="f_brand" required maxlength="60" list="brandList" value="${esc(v.brand)}"><datalist id="brandList">${brands.map(b => `<option value="${esc(b)}">`).join('')}</datalist></div>
          <div class="fld"><label for="f_category">Category</label><select class="in" id="f_category">${['Skincare', 'Makeup', 'Hair', 'Fragrance'].map(c => `<option ${v.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div></div>
        <div class="f3"><div class="fld"><label for="f_price">Price (EGP)</label><input class="in" id="f_price" type="number" min="1" step="1" inputmode="numeric" required value="${v.price}"></div>
          <div class="fld"><label for="f_compare">Original price</label><input class="in" id="f_compare" type="number" min="1" step="1" inputmode="numeric" placeholder="Optional" value="${v.compare_at ?? ''}"></div>
          <div class="fld"><label for="f_stock">Stock</label><input class="in" id="f_stock" type="number" min="0" step="1" inputmode="numeric" required value="${v.stock}"></div></div>
        <div class="fld"><label for="f_tag">Label on card</label><select class="in" id="f_tag">${[['', 'None'], ['New', 'New'], ['Best seller', 'Best seller']].map(([k, l]) => `<option value="${k}" ${v.tag === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <label class="tg"><input type="checkbox" id="f_active" ${v.active ? 'checked' : ''}> Show in store</label>
        <label class="tg"><input type="checkbox" id="f_featured" ${v.featured ? 'checked' : ''}> Feature on the home page</label>
      </div>
      <div class="card"><h2>Image</h2><div class="pv-box"><div class="pv-img" id="pvImg"></div><div style="flex:1;min-width:0">
          <div class="fld"><span class="lb">Product photo</span><small>PNG, JPG or WebP, up to 5 MB. Without a photo, an illustration is used.</small><div class="up"><label class="btn ln" style="cursor:pointer">Upload<input type="file" id="f_file" accept="image/png,image/jpeg,image/webp" class="sr"></label><button type="button" class="btn ln" id="f_rm" ${v.image ? '' : 'hidden'}>Remove</button></div></div></div></div>
        <div class="f2" id="artFields"><div class="fld"><label for="f_art">Illustration shape</label><select class="in" id="f_art">${ARTS.map(([k, l]) => `<option value="${k}" ${v.art === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="fld"><label for="f_color">Illustration colour</label><select class="in" id="f_color">${ACOLORS.map(c => `<option value="${c}" ${v.color === c ? 'selected' : ''}>${cap(c)}</option>`).join('')}</select></div></div>
      </div>
      <div class="card"><h2>Description</h2>
        <div class="fld"><label for="f_desc">Description</label><textarea class="in" id="f_desc" maxlength="4000">${esc(v.description)}</textarea></div>
        <div class="fld"><label for="f_how">How to use</label><textarea class="in" id="f_how" maxlength="2000">${esc(v.how_to)}</textarea></div>
        <div class="fld"><label for="f_ing">Ingredients</label><textarea class="in" id="f_ing" maxlength="2000">${esc(v.ingredients)}</textarea></div>
        <div class="fld"><label for="f_desc_ar">Description in Arabic</label><textarea class="in" id="f_desc_ar" dir="rtl" maxlength="4000">${esc(v.description_ar)}</textarea></div>
        <div class="fld"><label for="f_how_ar">How to use in Arabic</label><textarea class="in" id="f_how_ar" dir="rtl" maxlength="2000">${esc(v.how_to_ar)}</textarea></div>
      </div>
      <div class="dr-foot"><button type="button" class="btn ln" data-close>Cancel</button><button class="btn" id="pSave">${isNew ? 'Add product' : 'Save changes'}</button></div></form>`, { guard: true });
    $$('[data-close]', dr).forEach(b => b.onclick = requestClose);

    let image = v.image;
    const val = id => $(`#${id}`, dr).value;
    function preview() {
      const box = $('#pvImg', dr);
      box.className = `pv-img ph-${val('f_category')}`;
      box.innerHTML = image ? `<img src="${esc(image)}" alt="">` : alolaArt({ name: val('f_name'), brand: val('f_brand') || 'Brand', art: val('f_art'), color: val('f_color') });
      $('#f_rm', dr).hidden = !image;
    }
    ['f_brand', 'f_name', 'f_category', 'f_art', 'f_color'].forEach(id => $(`#${id}`, dr).addEventListener('input', preview));
    preview();
    $('#f_rm', dr).onclick = () => { image = null; preview(); };
    $('#f_file', dr).onchange = e => {
      const file = e.target.files[0]; e.target.value = '';
      if (!file) return;
      db.upload(file).then(url => { image = url; preview(); }).catch(fail);
    };
    $('#pf', dr).onsubmit = async e => {
      e.preventDefault();
      const btn = $('#pSave', dr), err = $('#pe', dr);
      err.hidden = true; btn.disabled = true;
      const num = id => { const s = val(id).trim(); return s === '' ? NaN : Number(s); };
      const body = {
        code: val('f_code').trim() || null, name: val('f_name'), name_ar: val('f_name_ar').trim(), description_ar: val('f_desc_ar').trim(), how_to_ar: val('f_how_ar').trim(), brand: val('f_brand'), category: val('f_category'), price: num('f_price'),
        compare_at: val('f_compare').trim() === '' ? null : num('f_compare'), stock: num('f_stock'), tag: val('f_tag'),
        active: $('#f_active', dr).checked, featured: $('#f_featured', dr).checked, art: val('f_art'), color: val('f_color'), image,
        description: val('f_desc'), how_to: val('f_how'), ingredients: val('f_ing'),
      };
      try {
        await db.saveProduct(isNew ? null : p.id, body, isNew ? null : p.image);
        toast(isNew ? 'Product added' : 'Changes saved');
        closeDrawer();
        viewProducts($('#view'), viewToken);
      } catch (ex) { err.textContent = ex.message; err.hidden = false; err.scrollIntoView({ block: 'center' }); btn.disabled = false; }
    };
  }

  // ------------------------------------------------------------ customers
  const custState = { page: 1, q: '', sort: 'recent' };
  async function viewCustomers(el, token) {
    if (!$('#cq', el)) {
      el.innerHTML = `<div class="bar"><input class="in grow" id="cq" type="search" placeholder="Search name, email, phone or city" aria-label="Search customers" value="${esc(custState.q)}">
        <select class="in" id="cs" aria-label="Sort customers">${[['recent', 'Latest order'], ['spent', 'Total spent'], ['orders', 'Most orders'], ['name', 'Name A–Z']].map(([k, l]) => `<option value="${k}" ${custState.sort === k ? 'selected' : ''}>Sort: ${l}</option>`).join('')}</select></div><div id="clist"><div class="skeleton" style="height:360px"></div></div>`;
      $('#cq').oninput = debounce(e => { custState.q = e.target.value; custState.page = 1; viewCustomers(el, viewToken); });
      $('#cs').onchange = e => { custState.sort = e.target.value; custState.page = 1; viewCustomers(el, viewToken); };
    }
    let d;
    try { d = await db.customers(custState); } catch (e) { return fail(e); }
    if (token !== viewToken) return;
    $('#sub').textContent = `${d.total.toLocaleString()} client${d.total === 1 ? '' : 's'}`;
    const list = $('#clist');
    list.innerHTML = d.rows.length ? `<div class="tbl-wrap"><table><thead><tr><th>Client</th><th>Phone</th><th class="hide-m">Governorate</th><th class="hide-m">Address</th><th class="r">Orders</th><th class="r">Spent</th><th class="hide-m">Last order</th></tr></thead><tbody>
      ${d.rows.map(c => `<tr class="click" data-cid="${c.id}" tabindex="0"><td><b>${esc(c.name)}</b><small>${esc(c.email)}</small></td><td class="nowrap">${esc(c.phone)}</td><td class="hide-m">${esc(c.city)}</td><td class="hide-m">${esc(c.address)}</td><td class="r num">${c.order_count}</td><td class="r num nowrap">${fmt(c.total_spent)}</td><td class="hide-m nowrap">${day(c.last_order)}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="card empty"><b>No clients found</b>Clients appear here after their first order.</div>';
    if (d.rows.length) list.append(pager(custState, d.total, d.size, () => viewCustomers(el, viewToken)));
    bindRows(list, '[data-cid]', r => openCustomer(Number(r.dataset.cid)));
  }
  async function openCustomer(id) {
    let c;
    try { c = await db.customer(id); } catch (e) { return fail(e); }
    const dr = openDrawer(`<div class="dr-h"><div><h2>${esc(c.name)}</h2><div style="color:var(--mute)">Client since ${day(c.created_at)}</div></div>${closeBtn}</div>
      <div class="mini"><div><b class="num">${c.order_count}</b><span>Orders</span></div><div><b class="num">${Number(c.total_spent).toLocaleString('en-US')}</b><span>EGP spent</span></div><div><b class="num">${c.order_count ? Math.round(c.total_spent / c.order_count).toLocaleString('en-US') : 0}</b><span>EGP average</span></div></div>
      <div class="card"><h2>Contact details</h2><dl class="kv"><dt>Phone</dt><dd><a href="tel:${esc(c.phone.replace(/[^+\d]/g, ''))}">${esc(c.phone)}</a></dd><dt>Email</dt><dd><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></dd><dt>Governorate</dt><dd>${esc(c.city)}</dd><dt>Address</dt><dd>${esc(c.address)}</dd><dt>Last order</dt><dd>${when(c.last_order)}</dd></dl></div>
      <div class="card"><h2>Order history</h2><div class="rows">${c.orders.map(o => `<button class="rw" style="width:100%;text-align:left" data-oid="${o.id}"><span><b>${o.number}</b><small>${day(o.created_at)} · ${o.item_count} item${o.item_count === 1 ? '' : 's'}</small></span><span style="display:flex;gap:10px;align-items:center">${badge(o.status)}<b class="num nowrap">${fmt(o.total)}</b></span></button>`).join('') || '<div style="color:var(--mute)">No orders yet.</div>'}</div></div>`);
    $$('[data-oid]', dr).forEach(b => b.onclick = () => openOrder(Number(b.dataset.oid)));
  }

  // ------------------------------------------------------------ discount codes
  const discountState = { rows: [] };
  const todayCairo = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  const discountValue = d => d.type === 'percent' ? `${d.value}% off` : d.type === 'amount' ? `${fmt(d.value)} off` : 'Free delivery';
  function discountStatus(d) {
    if (!d.active) return ['hidden', 'Off'];
    if (d.expires_on && d.expires_on < todayCairo()) return ['out', 'Expired'];
    if (d.max_uses !== null && d.uses >= d.max_uses) return ['out', 'Used up'];
    return ['live', 'Active'];
  }
  async function viewDiscounts(el, token) {
    if (!$('#addD', el)) {
      el.innerHTML = `<div class="bar"><div style="flex:1"></div><button class="btn" id="addD">${I.plus} Add code</button></div><div id="dlist"><div class="skeleton" style="height:240px"></div></div>`;
      $('#addD').onclick = () => openDiscountForm(null);
    }
    try { const rows = await db.discounts(); if (token !== viewToken) return; discountState.rows = rows; }
    catch (e) { return fail(e); }
    drawDiscounts();
  }
  function drawDiscounts() {
    const list = $('#dlist'); if (!list) return;
    const rows = discountState.rows;
    $('#sub').textContent = `${rows.length} code${rows.length === 1 ? '' : 's'}`;
    list.innerHTML = rows.length ? `<div class="tbl-wrap"><table><thead><tr><th>Code</th><th>Discount</th><th class="hide-m">Minimum order</th><th class="r">Used</th><th class="hide-m">Expires</th><th>Status</th><th class="r">Actions</th></tr></thead><tbody>
      ${rows.map(d => { const [cls, label] = discountStatus(d); return `<tr><td class="nowrap"><b>${esc(d.code)}</b></td><td class="nowrap">${esc(discountValue(d))}</td><td class="hide-m num">${d.min_order ? fmt(d.min_order) : 'None'}</td><td class="r num nowrap">${d.uses}${d.max_uses !== null ? ` / ${d.max_uses}` : ''}</td><td class="hide-m nowrap">${d.expires_on ? day(`${d.expires_on}T12:00:00Z`) : 'Never'}</td><td><span class="st st-${cls}">${label}</span></td>
        <td><div class="acts"><button data-dtoggle="${d.id}">${d.active ? 'Turn off' : 'Turn on'}</button><button data-dedit="${d.id}" aria-label="Edit ${esc(d.code)}">Edit</button><button class="del" data-ddel="${d.id}" aria-label="Delete ${esc(d.code)}">Delete</button></div></td></tr>`; }).join('')}
      </tbody></table></div>` : '<div class="card empty"><b>No discount codes yet</b>Add a code for a percentage off, an amount off, or free delivery.</div>';
    $$('[data-dtoggle]', list).forEach(b => b.onclick = async () => {
      const d = rows.find(x => x.id === Number(b.dataset.dtoggle));
      b.disabled = true;
      try { await db.setDiscountActive(d.id, !d.active); toast(`${esc(d.code)} turned ${d.active ? 'off' : 'on'}`); viewDiscounts($('#view'), viewToken); }
      catch (e) { b.disabled = false; fail(e); }
    });
    $$('[data-dedit]', list).forEach(b => b.onclick = () => openDiscountForm(rows.find(x => x.id === Number(b.dataset.dedit))));
    $$('[data-ddel]', list).forEach(b => b.onclick = async () => {
      const d = rows.find(x => x.id === Number(b.dataset.ddel));
      if (!(await confirmDialog(`Delete ${d.code}?`, 'Customers can no longer use it. Past orders keep their discount.', 'Delete code'))) return;
      try { await db.deleteDiscount(d.id); toast(`${esc(d.code)} deleted`); viewDiscounts($('#view'), viewToken); } catch (e) { fail(e); }
    });
  }
  function openDiscountForm(d) {
    const isNew = !d;
    const v = d || { code: '', type: 'percent', value: '', min_order: 0, max_uses: null, expires_on: null, active: true };
    const dr = openDrawer(`<div class="dr-h"><h2>${isNew ? 'Add discount code' : `Edit ${esc(d.code)}`}</h2>${closeBtn}</div>
      <form id="df" novalidate><div class="form-err" id="de" role="alert" hidden></div>
      <div class="card">
        <div class="fld"><label for="d_code">Code</label><input class="in" id="d_code" required maxlength="30" autocomplete="off" spellcheck="false" style="text-transform:uppercase" placeholder="EID20" value="${esc(v.code)}" ${isNew ? '' : 'readonly'}><small>${isNew ? 'What customers type at checkout. Letters, numbers, - or _.' : 'The code can’t change after it’s created.'}</small></div>
        <div class="fld"><label for="d_type">Discount type</label><select class="in" id="d_type"><option value="percent" ${v.type === 'percent' ? 'selected' : ''}>Percentage off</option><option value="amount" ${v.type === 'amount' ? 'selected' : ''}>Amount of money off</option><option value="free_delivery" ${v.type === 'free_delivery' ? 'selected' : ''}>Free delivery</option></select></div>
        <div class="fld" id="d_valueWrap"><label for="d_value" id="d_valueLabel"></label><input class="in" id="d_value" type="number" min="1" step="1" inputmode="numeric" value="${v.type === 'free_delivery' ? '' : v.value}"></div>
      </div>
      <div class="card"><h2>Limits (optional)</h2>
        <div class="f2"><div class="fld"><label for="d_min">Minimum order (EGP)</label><input class="in" id="d_min" type="number" min="0" step="1" inputmode="numeric" placeholder="None" value="${v.min_order || ''}"></div>
          <div class="fld"><label for="d_max">Usage limit</label><input class="in" id="d_max" type="number" min="1" step="1" inputmode="numeric" placeholder="No limit" value="${v.max_uses ?? ''}"></div></div>
        <div class="fld"><label for="d_exp">Last day it works</label><input class="in" id="d_exp" type="date" value="${esc(v.expires_on || '')}"></div>
        <label class="tg"><input type="checkbox" id="d_active" ${v.active ? 'checked' : ''}> Code is on</label>
      </div>
      <div class="dr-foot"><button type="button" class="btn ln" data-close>Cancel</button><button class="btn" id="dSave">${isNew ? 'Add code' : 'Save changes'}</button></div></form>`, { guard: true });
    $$('[data-close]', dr).forEach(b => b.onclick = requestClose);
    const syncType = () => {
      const t = $('#d_type', dr).value;
      $('#d_valueWrap', dr).hidden = t === 'free_delivery';
      $('#d_valueLabel', dr).textContent = t === 'percent' ? 'Percentage off (%)' : 'Amount off (EGP)';
    };
    $('#d_type', dr).onchange = syncType; syncType();
    $('#df', dr).onsubmit = async e => {
      e.preventDefault();
      const btn = $('#dSave', dr), err = $('#de', dr);
      err.hidden = true; btn.disabled = true;
      const num = (id, empty) => { const s = $(`#${id}`, dr).value.trim(); return s === '' ? empty : Number(s); };
      const body = { code: $('#d_code', dr).value, type: $('#d_type', dr).value, value: num('d_value', NaN), min_order: num('d_min', 0), max_uses: num('d_max', null), expires_on: $('#d_exp', dr).value, active: $('#d_active', dr).checked };
      try {
        await db.saveDiscount(isNew ? null : d.id, body);
        toast(isNew ? 'Code added' : 'Changes saved');
        closeDrawer();
        viewDiscounts($('#view'), viewToken);
      } catch (ex) { err.textContent = ex.message; err.hidden = false; btn.disabled = false; }
    };
  }

  // ------------------------------------------------------------ themes
  const THEMES = [
    { id: 'default', name: 'Alola', note: 'The everyday store look.', colors: ['#f6f2e9', '#66794a', '#3b261d', '#c4687c', '#e9d3a6'], bg: 'linear-gradient(135deg,#66794a,#3f4f2c)', ink: '#fff', font: '"Bricolage Grotesque",sans-serif', fontName: 'Bricolage Grotesque + DM Sans' },
    { id: 'newyear', name: 'New Year', note: 'Midnight blue, gold and falling snow.', colors: ['#06101f', '#f6d878', '#d62839', '#5fd38d', '#14406e'], bg: 'linear-gradient(180deg,#0b1a3a,#14406e 55%,#d62839)', ink: '#f6d878', font: '"Mountains of Christmas",cursive', fontName: 'Mountains of Christmas + Cormorant Garamond' },
    { id: 'halloween', name: 'Halloween', note: 'Pumpkin orange, purple, a full moon and bats.', colors: ['#0e0712', '#ff7a00', '#8a3fd1', '#9dff3a', '#ffc533'], bg: 'linear-gradient(180deg,#14081f,#3b1060 55%,#ff7a00)', ink: '#ffc533', font: '"Creepster",cursive', fontName: 'Creepster + IM Fell English' },
    { id: 'ramadan', name: 'Ramadan', note: 'Deep teal and gold, a crescent, a lantern and geometric patterns.', colors: ['#05161f', '#e8c766', '#0f8a6a', '#1e5a8a', '#fdf6e3'], bg: 'linear-gradient(180deg,#041f1c,#0b4a3d 55%,#0f8a6a)', ink: '#f6d878', font: '"Cinzel Decorative",serif', fontName: 'Cinzel Decorative + Amiri' },
    { id: 'eid', name: 'Eid', note: 'Royal purple, pink and gold, with balloons and confetti.', colors: ['#1a0b2e', '#e8478b', '#ffd166', '#3ddbd0', '#7a3fc4'], bg: 'linear-gradient(170deg,#3a1570,#a12a86 60%,#e8478b)', ink: '#ffd166', font: '"El Messiri",serif', fontName: 'El Messiri + Cairo' },
  ];
  async function viewThemes(el, token) {
    el.innerHTML = '<div class="skeleton" style="height:320px"></div>';
    // Load the display fonts so each card shows its real type. This only affects the sample text.
    if (!$('#themeFonts')) {
      const l = document.createElement('link');
      l.id = 'themeFonts'; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Mountains+of+Christmas:wght@700&family=Creepster&family=Cinzel+Decorative:wght@700&family=El+Messiri:wght@700&display=swap';
      document.head.append(l);
    }
    let active, live, schedules;
    try { [active, live, schedules] = await Promise.all([db.theme(), db.liveTheme(), db.themeSchedules()]); }
    catch (e) { return fail(e); }
    if (token !== viewToken) return;
    const nameOf = id => THEMES.find(t => t.id === id)?.name || id;
    const scheduleState = sc => { const n = Date.now(), a = Date.parse(sc.starts_at), z = Date.parse(sc.ends_at); return n < a ? 'upcoming' : n < z ? 'running' : 'finished'; };
    const running = schedules.find(sc => scheduleState(sc) === 'running');
    const rank = { running: 0, upcoming: 1, finished: 2 };
    const ordered = [...schedules].sort((x, y) => rank[scheduleState(x)] - rank[scheduleState(y)] || (scheduleState(x) === 'upcoming' ? Date.parse(x.starts_at) - Date.parse(y.starts_at) : Date.parse(y.starts_at) - Date.parse(x.starts_at)));
    const LABEL = { running: ['live', 'Live now'], upcoming: ['pending', 'Scheduled'], finished: ['hidden', 'Finished'] };
    $('#sub').textContent = running ? `Live now: ${nameOf(live)}, scheduled until ${when(running.ends_at)}` : `Live now: ${nameOf(live)}`;
    el.innerHTML = `<div class="themes">${THEMES.map(t => `<article class="th-card${t.id === live ? ' on' : ''}">
        <div class="th-sample" style="background:${t.bg};color:${t.ink};font-family:${esc(t.font)}"><span>Glow loud.</span></div>
        <div class="th-body"><div class="th-title"><h2>${t.name}</h2>${t.id === live ? '<span class="st st-live">Live now</span>' : t.id === active ? '<span class="st st-hidden">After the schedule</span>' : ''}</div>
          <p>${t.note}</p>
          <div class="th-swatches" aria-hidden="true">${t.colors.map(c => `<i style="background:${c}"></i>`).join('')}</div>
          <small>${t.fontName}</small>
          <div class="th-acts"><a class="btn ln" href="../index.html?theme=${t.id}" target="_blank" rel="noopener">Preview</a>${t.id === active ? '' : `<button class="btn" data-theme-set="${t.id}">${running ? 'Use after schedule' : 'Make live'}</button>`}</div>
        </div></article>`).join('')}</div>
      <p class="th-help">Making a theme live changes the store for all visitors straight away. Anyone with a page already open sees it when they return to that page, or within five minutes. Preview only shows you the home page in that theme, and doesn’t change the live store.</p>
      <section class="card sch" aria-labelledby="schH"><h2 id="schH">Schedule a theme</h2>
        <p class="sch-help">Book a theme for set dates. It starts and ends on time by itself, then the store goes back to ${esc(nameOf(active))}. Times are Cairo time.</p>
        <div class="form-err" id="se" role="alert" hidden></div>
        <form class="sch-form" id="sf" novalidate>
          <div class="fld"><label for="s_theme">Theme</label><select class="in" id="s_theme">${THEMES.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}</select></div>
          <div class="fld"><label for="s_start">Starts</label><input class="in" id="s_start" type="datetime-local" required></div>
          <div class="fld"><label for="s_end">Ends</label><input class="in" id="s_end" type="datetime-local" required></div>
          <button class="btn" id="sAdd">Schedule</button>
        </form>
        ${ordered.length ? `<div class="tbl-wrap sch-list"><table><thead><tr><th>Theme</th><th>Starts</th><th>Ends</th><th>Status</th><th class="r">Actions</th></tr></thead><tbody>
          ${ordered.map(sc => { const [cls, label] = LABEL[scheduleState(sc)]; return `<tr><td><b>${esc(nameOf(sc.theme))}</b></td><td class="nowrap">${when(sc.starts_at)}</td><td class="nowrap">${when(sc.ends_at)}</td><td><span class="st st-${cls}">${label}</span></td><td><div class="acts"><button class="del" data-sdel="${sc.id}" aria-label="Delete ${esc(nameOf(sc.theme))} schedule">Delete</button></div></td></tr>`; }).join('')}
        </tbody></table></div>` : '<div class="sch-empty">No themes scheduled yet.</div>'}
      </section>`;
    const reload = () => viewThemes(el, ++viewToken);
    $$('[data-theme-set]', el).forEach(b => b.onclick = async () => {
      const t = THEMES.find(x => x.id === b.dataset.themeSet);
      $$('[data-theme-set]', el).forEach(x => x.disabled = true);
      try { await db.setTheme(t.id); toast(running ? `${esc(t.name)} will show after the schedule ends` : `${esc(t.name)} is now live`); }
      catch (e) { fail(e); }
      if (token === viewToken) reload();
    });
    $('#sf', el).onsubmit = async e => {
      e.preventDefault();
      const err = $('#se', el), btn = $('#sAdd', el), start = $('#s_start', el).value, end = $('#s_end', el).value, theme = $('#s_theme', el).value;
      err.hidden = true;
      const show = m => { err.textContent = m; err.hidden = false; };
      if (!start || !end) return show('Please choose a start and end time');
      if (end <= start) return show('The end must be after the start');
      btn.disabled = true;
      try { await db.addThemeSchedule(theme, start, end); toast(`${esc(nameOf(theme))} scheduled`); reload(); }
      catch (ex) { if (!ex.handled) show(ex.message); btn.disabled = false; }
    };
    $$('[data-sdel]', el).forEach(b => b.onclick = async () => {
      const sc = schedules.find(x => x.id === Number(b.dataset.sdel));
      const isRunning = scheduleState(sc) === 'running';
      if (!(await confirmDialog(`Delete this ${nameOf(sc.theme)} schedule?`, isRunning ? `It’s live now, so the store goes back to ${nameOf(active)} straight away.` : 'It won’t run. You can schedule it again at any time.', 'Delete schedule'))) return;
      try { await db.deleteThemeSchedule(sc.id); toast('Schedule deleted'); reload(); } catch (e) { fail(e); }
    });
  }

  // ------------------------------------------------------------ home page hero boxes
  const HERO_BOXES = [
    ['main', 'Big box', 'The large box on the left. Its heading has two lines: the second is shown in the accent style.', [
      ['eyebrow', 'Small label at the top', 40, 'Delivered across Egypt'], ['line1', 'Heading, line 1', 24, 'Glow'], ['line2', 'Heading, line 2 (accent)', 24, 'loud.'],
      ['text', 'Text under the heading', 220, 'Skincare, makeup, hair and fragrance…', true], ['btn1_label', 'Button 1 text', 30, 'Shop now'], ['btn2_label', 'Button 2 text', 30, 'The ritual']]],
    ['t2', 'Small box, top', 'The upper box on the right.', [['title', 'Big text', 16, '3–4 days'], ['text', 'Small text', 80, 'Delivery anywhere in Egypt', true]]],
    ['t3', 'Small box, bottom', 'The lower box on the right.', [['title', 'Big text', 16, 'COD'], ['text', 'Small text', 80, 'Pay in cash when it arrives', true]]],
  ];
  const LINK_HELP = 'A page of the store, like <code>shop.html</code> or <code>shop.html?brand=Anua</code>, or a full address starting with <code>https://</code>.';
  async function viewHome(el, token) {
    el.innerHTML = '<div class="skeleton" style="height:420px"></div>';
    let saved;
    try { saved = await db.hero(); } catch (e) { return fail(e); }
    if (token !== viewToken) return;
    const data = JSON.parse(JSON.stringify(saved || AlolaHero.DEFAULT));
    const v = (box, k) => data[box]?.[k] ?? '';
    const textPair = (box, [k, label, max, ph, area]) => {
      const tag = (lang, id, val, dir) => area
        ? `<textarea class="in" id="${id}" maxlength="${max}" rows="2"${dir} placeholder="${esc(lang === 'en' ? ph : '')}">${esc(val)}</textarea>`
        : `<input class="in" id="${id}" maxlength="${max}" autocomplete="off"${dir} placeholder="${esc(lang === 'en' ? ph : '')}" value="${esc(val)}">`;
      return `<div class="f2"><div class="fld"><label for="h_${box}_${k}">${label}</label>${tag('en', `h_${box}_${k}`, v(box, k), '')}</div>
        <div class="fld"><label for="h_${box}_${k}_ar">${label} (Arabic)</label>${tag('ar', `h_${box}_${k}_ar`, v(box, k + '_ar'), ' dir="rtl"')}</div></div>`;
    };
    const linkField = (box, k, label) => `<div class="fld"><label for="h_${box}_${k}">${label}</label><input class="in" id="h_${box}_${k}" maxlength="300" autocomplete="off" spellcheck="false" inputmode="url" placeholder="shop.html" value="${esc(v(box, k))}"><small>${LINK_HELP}</small></div>`;
    const picture = box => `<div class="fld"><span class="lb">Picture</span>
        <div class="pv-box"><div class="pv-img" id="h_${box}_pv"></div><div style="flex:1;min-width:0">
          <small>PNG, JPG or WebP, up to 5&nbsp;MB. Without a picture, a product drawing is shown.</small>
          <div class="up"><label class="btn ln" style="cursor:pointer">Upload<input type="file" id="h_${box}_file" accept="image/png,image/jpeg,image/webp" class="sr"></label><button type="button" class="btn ln" id="h_${box}_rm">Remove</button></div>
          <div class="radios" role="radiogroup" aria-label="Picture style">
            <label class="tg"><input type="radio" name="h_${box}_mode" value="art" ${v(box, 'image_mode') !== 'cover' ? 'checked' : ''}> In the drawing’s place</label>
            <label class="tg"><input type="radio" name="h_${box}_mode" value="cover" ${v(box, 'image_mode') === 'cover' ? 'checked' : ''}> Fill the whole box</label></div>
        </div></div></div>`;
    const colour = box => `<div class="fld"><span class="lb">Background colour</span>
        <label class="tg"><input type="checkbox" id="h_${box}_bgon" ${v(box, 'bg') ? 'checked' : ''}> Use my own colour</label>
        <input type="color" id="h_${box}_bg" value="${esc(v(box, 'bg') || (box === 'main' ? '#66794a' : box === 't2' ? '#f3c9c9' : '#e8d3a8'))}" aria-label="Background colour" style="width:64px;height:40px;border:0;background:none;padding:0">
        <small>Text turns dark or light to stay readable. Ignored when the picture fills the box.</small></div>`;

    el.innerHTML = `<div class="bar"><p class="note" style="flex:1;min-width:240px">The three boxes at the top of the home page. Use them for offers and ads. Leave the English text empty to hide something. Arabic visitors see the Arabic text, or the English one when the Arabic is empty.</p>
        <button class="btn ln" id="hReset">Reset to original</button><button class="btn ln" id="hPreview">Preview</button><button class="btn" id="hSave">Save changes</button></div>
      <div class="form-err" id="hErr" role="alert" hidden></div>
      ${HERO_BOXES.map(([box, title, help, texts]) => `<div class="card" style="margin-bottom:14px"><h2>${title}</h2><p class="note" style="margin:-6px 0 12px">${help}</p>
        <div class="radios kind" role="radiogroup" aria-label="What this box shows">
          <label class="tg"><input type="radio" name="h_${box}_kind" value="text" ${v(box, 'mode') !== 'banner' ? 'checked' : ''}> Text and drawing</label>
          <label class="tg"><input type="radio" name="h_${box}_kind" value="banner" ${v(box, 'mode') === 'banner' ? 'checked' : ''}> Banner pictures (ads)</label></div>
        <div id="h_${box}_textwrap">
        ${texts.map(t => textPair(box, t)).join('')}
        ${box === 'main' ? `<div class="f2">${linkField(box, 'btn1_link', 'Button 1 link')}${linkField(box, 'btn2_link', 'Button 2 link')}</div><p class="note" style="margin:-4px 0 12px">A button shows only when it has both text and a link.</p>`
          : linkField(box, 'link', 'Link (optional): makes the whole box clickable')}
        ${picture(box)}${colour(box)}</div>
        <div id="h_${box}_bannerwrap">
          <p class="note" style="margin-bottom:12px">Ready-made banner pictures fill the whole box, like the ads on big stores. Text and drawings are hidden. Best size: <b>1400&nbsp;×&nbsp;1000 pixels</b>; keep important text away from the edges. With two or more, they turn every 5 seconds and visitors can use the arrows. If a banner has English text, add an Arabic version for Arabic visitors.</p>
          <div class="sl-list" id="h_${box}_slides"></div>
          <label class="btn ln" style="cursor:pointer;margin-top:4px">${I.plus} Add banner<input type="file" id="h_${box}_add" accept="image/png,image/jpeg,image/webp" class="sr"></label>
        </div></div>`).join('')}
      <div class="card" id="hLogos"><h2>Brand logos</h2>
        <p class="note" style="margin:-6px 0 12px">Shown in the home page’s “Shop by brand” section, under each category the brand sells in. A logo is saved as soon as you upload it. A PNG with a transparent or white background looks best. Brands without a logo show their name.</p>
        <div class="logo-admin" id="hLogoList"><div class="skeleton" style="height:120px"></div></div></div>`;
    $('#sub').textContent = saved ? 'Showing your saved boxes' : 'Showing the original design';

    const val = id => $(`#${id}`, el).value.trim();
    const images = Object.fromEntries(HERO_BOXES.map(([b]) => [b, v(b, 'image')]));
    // Banner pictures per box, in the order they play.
    const slides = Object.fromEntries(HERO_BOXES.map(([b]) => [b, (data[b]?.slides || []).map(s => ({ ...s }))]));
    function drawSlides(b) {
      const list = $(`#h_${b}_slides`, el), n = slides[b].length;
      list.innerHTML = n ? slides[b].map((s, i) => `<div class="sl-row" data-i="${i}">
          <div class="sl-pics"><div class="pv-img sl-pv"><img src="${esc(s.image)}" alt=""><span>English</span></div>
            <div class="pv-img sl-pv">${s.image_ar ? `<img src="${esc(s.image_ar)}" alt="">` : '<span class="note">Same as English</span>'}<span>Arabic</span></div></div>
          <div class="sl-fields">
            <div class="up"><label class="btn ln" style="cursor:pointer">Change picture<input type="file" data-up="image" accept="image/png,image/jpeg,image/webp" class="sr"></label>
              <label class="btn ln" style="cursor:pointer">${s.image_ar ? 'Change Arabic' : 'Add Arabic version'}<input type="file" data-up="image_ar" accept="image/png,image/jpeg,image/webp" class="sr"></label>
              ${s.image_ar ? '<button type="button" class="btn ln" data-rmar>Remove Arabic</button>' : ''}</div>
            <div class="fld" style="margin-top:10px"><label for="h_${b}_sl${i}_link">Link (optional)</label><input class="in" id="h_${b}_sl${i}_link" data-k="link" maxlength="300" autocomplete="off" spellcheck="false" inputmode="url" placeholder="shop.html?brand=Anua" value="${esc(s.link)}"></div>
            <div class="fld"><label for="h_${b}_sl${i}_alt">What the banner says (read out to blind visitors)</label><input class="in" id="h_${b}_sl${i}_alt" data-k="alt" maxlength="120" autocomplete="off" placeholder="Anua serums 30% off" value="${esc(s.alt)}"></div>
          </div>
          <div class="sl-acts"><span class="note">${i + 1} of ${n}</span>
            <button type="button" class="btn ln" data-mv="-1" ${i ? '' : 'disabled'} aria-label="Move banner ${i + 1} earlier">↑</button>
            <button type="button" class="btn ln" data-mv="1" ${i < n - 1 ? '' : 'disabled'} aria-label="Move banner ${i + 1} later">↓</button>
            <button type="button" class="btn ln dg-t" data-del aria-label="Remove banner ${i + 1}">Remove</button></div>
        </div>`).join('') : '<div class="empty" style="padding:22px 10px"><b>No banners yet</b>Add a picture to start.</div>';
      $$('.sl-row', list).forEach(row => {
        const i = +row.dataset.i, s = slides[b][i];
        $$('[data-k]', row).forEach(inp => inp.oninput = () => { s[inp.dataset.k] = inp.value.trim(); });
        $$('[data-up]', row).forEach(inp => inp.onchange = e => {
          const file = e.target.files[0]; e.target.value = '';
          if (file) db.upload(file).then(url => { s[inp.dataset.up] = url; drawSlides(b); page.dirty = true; }).catch(fail);
        });
        const rmar = $('[data-rmar]', row); if (rmar) rmar.onclick = () => { s.image_ar = ''; drawSlides(b); page.dirty = true; };
        $$('[data-mv]', row).forEach(btn => btn.onclick = () => {
          const j = i + +btn.dataset.mv; [slides[b][i], slides[b][j]] = [slides[b][j], slides[b][i]]; drawSlides(b); page.dirty = true;
        });
        $('[data-del]', row).onclick = () => { slides[b].splice(i, 1); drawSlides(b); page.dirty = true; };
      });
    }
    const showPic = b => {
      $(`#h_${b}_pv`, el).innerHTML = images[b] ? `<img src="${esc(images[b])}" alt="">` : '<span class="note">None</span>';
      $(`#h_${b}_rm`, el).hidden = !images[b];
    };
    for (const [b] of HERO_BOXES) {
      showPic(b);
      $(`#h_${b}_rm`, el).onclick = () => { images[b] = ''; showPic(b); page.dirty = true; };
      $(`#h_${b}_file`, el).onchange = e => {
        const file = e.target.files[0]; e.target.value = '';
        if (!file) return;
        db.upload(file).then(url => { images[b] = url; showPic(b); page.dirty = true; }).catch(fail);
      };
      $(`#h_${b}_bg`, el).addEventListener('input', () => { $(`#h_${b}_bgon`, el).checked = true; });
      // Text mode or banner mode: show only that part of the form.
      const kind = () => $(`input[name="h_${b}_kind"]:checked`, el).value;
      const showKind = () => { $(`#h_${b}_textwrap`, el).hidden = kind() !== 'text'; $(`#h_${b}_bannerwrap`, el).hidden = kind() !== 'banner'; };
      $$(`input[name="h_${b}_kind"]`, el).forEach(r => r.onchange = showKind);
      showKind();
      drawSlides(b);
      $(`#h_${b}_add`, el).onchange = e => {
        const file = e.target.files[0]; e.target.value = '';
        if (!file) return;
        if (slides[b].length >= 8) return toast('A box can have 8 banners at most', 'err');
        db.upload(file).then(url => { slides[b].push({ image: url, image_ar: '', link: '', alt: '' }); drawSlides(b); page.dirty = true; }).catch(fail);
      };
    }
    el.addEventListener('input', e => { if (!e.target.closest('#hLogos')) page.dirty = true; });
    el.addEventListener('change', e => { if (e.target.type !== 'file' && !e.target.closest('#hLogos')) page.dirty = true; });
    drawLogos();

    // Brand logos save one at a time, straight away, so they don't wait for "Save changes".
    async function drawLogos() {
      const box = $('#hLogoList', el);
      let rows, logos;
      try { [rows, logos] = await Promise.all([productsState.rows.length ? productsState.rows : db.products(), db.brandLogos()]); }
      catch (e) { box.innerHTML = ''; return fail(e); }
      if (token !== viewToken) return;
      const map = Object.fromEntries(logos.map(l => [l.brand, l.logo]));
      const brands = [...new Set(rows.map(p => p.brand))].sort((a, b) => a.localeCompare(b));
      box.innerHTML = brands.map(b => `<div class="logo-row" data-b="${esc(b)}">
          <div class="logo-pv">${map[b] ? `<img src="${esc(map[b])}" alt="${esc(b)} logo">` : `<span>${esc(b)}</span>`}</div>
          <div><b>${esc(b)}</b><small class="note" style="display:block">${map[b] ? 'Logo set' : 'No logo yet'}</small></div>
          <div class="up"><label class="btn ln" style="cursor:pointer">${map[b] ? 'Change' : 'Upload'}<input type="file" accept="image/png,image/jpeg,image/webp" class="sr" aria-label="Upload ${esc(b)} logo"></label>
            ${map[b] ? '<button type="button" class="btn ln" data-rm>Remove</button>' : ''}</div></div>`).join('');
      $$('.logo-row', box).forEach(row => {
        const b = row.dataset.b;
        $('input[type=file]', row).onchange = async e => {
          const file = e.target.files[0]; e.target.value = '';
          if (!file) return;
          try { await db.setBrandLogo(b, await db.upload(file)); toast(`${b} logo saved`); drawLogos(); } catch (ex) { fail(ex); }
        };
        const rm = $('[data-rm]', row);
        if (rm) rm.onclick = async () => {
          if (!(await confirmDialog(`Remove the ${b} logo?`, 'The home page shows the brand’s name instead until you upload a new one.', 'Remove logo', 'Keep it'))) return;
          try { await db.removeBrandLogo(b); toast(`${b} logo removed`); drawLogos(); } catch (ex) { fail(ex); }
        };
      });
    }

    function collect() {
      const out = {};
      for (const [b, , , texts] of HERO_BOXES) {
        const box = out[b] = {};
        for (const [k] of texts) { box[k] = val(`h_${b}_${k}`); box[k + '_ar'] = val(`h_${b}_${k}_ar`); }
        for (const k of b === 'main' ? ['btn1_link', 'btn2_link'] : ['link']) {
          box[k] = val(`h_${b}_${k}`);
          if (box[k] && !AlolaHero.safeLink(box[k])) throw new Error('Links must start with https:// or be a page of this store, like shop.html');
        }
        box.image = images[b];
        box.image_mode = $(`input[name="h_${b}_mode"]:checked`, el).value;
        box.bg = $(`#h_${b}_bgon`, el).checked ? $(`#h_${b}_bg`, el).value.toLowerCase() : '';
        box.mode = $(`input[name="h_${b}_kind"]:checked`, el).value;
        box.slides = slides[b].map(s => ({ image: s.image, image_ar: s.image_ar || '', link: (s.link || '').trim(), alt: (s.alt || '').trim() }));
        if (box.slides.some(s => s.link && !AlolaHero.safeLink(s.link))) throw new Error('Banner links must start with https:// or be a page of this store, like shop.html');
        if (box.mode === 'banner' && !box.slides.length) throw new Error(`Add at least one banner picture to the ${HERO_BOXES.find(x => x[0] === b)[1].toLowerCase()}, or switch it back to text.`);
      }
      return out;
    }
    const showErr = m => { const e = $('#hErr', el); e.textContent = m; e.hidden = !m; if (m) e.scrollIntoView({ block: 'center' }); };
    $('#hPreview', el).onclick = () => {
      try { localStorage.setItem('alola_hero_preview', JSON.stringify(collect())); showErr(''); window.open('../?hero=preview', '_blank', 'noopener'); }
      catch (e) { showErr(e.message); }
    };
    $('#hSave', el).onclick = async e => {
      const btn = e.currentTarget; btn.disabled = true;
      try { await db.setHero(collect()); page.dirty = false; showErr(''); toast('Home page updated. Visitors see it on their next visit.'); $('#sub').textContent = 'Showing your saved boxes'; }
      catch (ex) { if (!ex.handled) showErr(ex.message); }
      btn.disabled = false;
    };
    $('#hReset', el).onclick = async () => {
      if (!(await confirmDialog('Go back to the original boxes?', 'The home page shows the built-in boxes again (“Glow loud.”, 3–4 days, COD). Your saved boxes are removed.', 'Reset', 'Keep mine'))) return;
      try { await db.setHero(null); page.dirty = false; toast('Home page reset to the original'); viewHome(el, ++viewToken); } catch (e) { fail(e); }
    };
  }

  // ------------------------------------------------------------ pop-ups
  const POP_PAGES = [['home', 'Home page'], ['shop', 'All products'], ['product', 'Product pages'], ['account', 'Account page']];
  /** A stored time as Cairo local time for a datetime-local field. */
  const cairoInput = iso => {
    if (!iso) return '';
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(iso)).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  };
  function popupStatus(p) {
    if (!p.active) return ['hidden', 'Off'];
    if (p.ends_at && new Date(p.ends_at) <= new Date()) return ['out', 'Ended'];
    if (p.starts_at && new Date(p.starts_at) > new Date()) return ['low', `Starts ${when(p.starts_at)}`];
    return ['live', 'Live'];
  }
  const triggerText = p => p.trigger === 'scroll' ? `after scrolling ${p.trigger_value}%` : p.trigger === 'exit' ? 'when leaving the page' : p.trigger_value ? `after ${p.trigger_value} seconds` : 'straight away';
  const freqText = p => p.frequency === 'once' ? 'once per visitor' : p.frequency === 'session' ? 'once per visit' : `every ${p.frequency_days} day${p.frequency_days === 1 ? '' : 's'}`;

  async function viewPopups(el, token) {
    if (!$('#ppList', el)) {
      el.innerHTML = `<div class="bar"><p class="note" style="flex:1;min-width:240px">Pop-ups for offers, discount codes and email sign-ups. Only one shows per page, the highest priority that fits, and never on checkout.</p>
        <button class="btn" id="ppAdd">${I.plus} New pop-up</button></div><div id="ppList"><div class="skeleton" style="height:200px"></div></div>`;
      $('#ppAdd').onclick = () => openPopupForm(null);
    }
    let rows;
    try { rows = await db.popups(); } catch (e) { return fail(e); }
    if (token !== viewToken) return;
    const live = rows.filter(p => p.live).length;
    $('#sub').textContent = `${rows.length} pop-up${rows.length === 1 ? '' : 's'} · ${live} live`;
    const list = $('#ppList');
    list.innerHTML = rows.length ? `<div class="pp-cards">${rows.map(p => { const [cls, label] = popupStatus(p), ctr = p.views ? Math.round(p.clicks / p.views * 1000) / 10 : 0;
      return `<div class="card pp-card">
        <div class="pp-thumb${p.layout === 'corner' ? ' corner' : ''}">${p.image ? `<img src="${esc(p.image)}" alt="">` : `<span>${p.layout === 'corner' ? 'Corner' : 'Centre'}</span>`}</div>
        <div class="pp-info"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>${esc(p.title)}</b><span class="st st-${cls}">${esc(label)}</span>${p.code ? `<span class="st st-hidden">Code ${esc(p.code)}</span>` : ''}</div>
          <small>${p.pages.map(x => POP_PAGES.find(y => y[0] === x)?.[1] || x).join(', ')} · ${triggerText(p)} · ${freqText(p)}${p.audience !== 'all' ? ` · ${p.audience === 'new' ? 'first-time visitors' : 'returning visitors'}` : ''}${p.device !== 'all' ? ` · ${p.device === 'mobile' ? 'phones' : 'computers'} only` : ''}${p.ends_at ? ` · until ${when(p.ends_at)}` : ''}</small>
          <div class="pp-stats"><span><b class="num">${p.views.toLocaleString()}</b> views</span><span><b class="num">${p.clicks.toLocaleString()}</b> clicks</span><span><b class="num">${ctr}%</b> click rate</span><span class="note">last 30 days</span></div></div>
        <div class="acts pp-acts"><label class="tg" title="Show on the store"><input type="checkbox" data-on="${p.id}" ${p.active ? 'checked' : ''}> On</label>
          <button data-edit="${p.id}" aria-label="Edit ${esc(p.title)}">Edit</button><button data-copy="${p.id}" aria-label="Duplicate ${esc(p.title)}">Duplicate</button><button class="del" data-del="${p.id}" aria-label="Delete ${esc(p.title)}">Delete</button></div></div>`; }).join('')}</div>`
      : `<div class="card empty"><b>No pop-ups yet</b>Create one for an offer, a discount code or email sign-ups.</div>`;
    const find = id => rows.find(p => p.id === Number(id));
    $$('[data-on]', list).forEach(c => c.onchange = async () => {
      try { await db.setPopupActive(Number(c.dataset.on), c.checked); toast(c.checked ? 'Pop-up turned on' : 'Pop-up turned off'); viewPopups(el, viewToken); }
      catch (e) { c.checked = !c.checked; fail(e); }
    });
    $$('[data-edit]', list).forEach(b => b.onclick = () => openPopupForm(find(b.dataset.edit)));
    $$('[data-copy]', list).forEach(b => b.onclick = () => { const p = find(b.dataset.copy); openPopupForm({ ...p, id: null, active: false, title: `${p.title} (copy)`.slice(0, 80) }); });
    $$('[data-del]', list).forEach(b => b.onclick = async () => {
      const p = find(b.dataset.del);
      if (!(await confirmDialog(`Delete “${p.title}”?`, 'It stops showing on the store straight away, and its view and click counts are removed.', 'Delete pop-up'))) return;
      try { await db.deletePopup(p.id); toast('Pop-up deleted'); viewPopups(el, viewToken); } catch (e) { fail(e); }
    });
  }

  function openPopupForm(p) {
    const isNew = !p || !p.id;
    const v = { active: false, layout: 'center', kind: 'offer', title: '', title_ar: '', body: '', body_ar: '', image: '', image_ar: '', code: '', button_label: 'Shop now', button_label_ar: 'تسوقي الآن', button_link: 'shop.html',
      trigger: 'delay', trigger_value: 5, frequency: 'days', frequency_days: 3, pages: ['home'], audience: 'all', device: 'all', starts_at: null, ends_at: null, priority: 0, ...(p || {}) };
    const radio = (name, val, label, cur) => `<label class="tg"><input type="radio" name="${name}" value="${val}" ${cur === val ? 'checked' : ''}> ${label}</label>`;
    const pair = (k, label, max, area, ph = '') => `<div class="f2"><div class="fld"><label for="p_${k}">${label}</label>${area ? `<textarea class="in" id="p_${k}" maxlength="${max}" rows="3" placeholder="${esc(ph)}">${esc(v[k])}</textarea>` : `<input class="in" id="p_${k}" maxlength="${max}" autocomplete="off" placeholder="${esc(ph)}" value="${esc(v[k])}">`}</div>
      <div class="fld"><label for="p_${k}_ar">${label} (Arabic)</label>${area ? `<textarea class="in" id="p_${k}_ar" dir="rtl" maxlength="${max}" rows="3">${esc(v[k + '_ar'])}</textarea>` : `<input class="in" id="p_${k}_ar" dir="rtl" maxlength="${max}" autocomplete="off" value="${esc(v[k + '_ar'])}">`}</div></div>`;
    const dr = openDrawer(`<div class="dr-h"><h2>${isNew ? 'New pop-up' : 'Edit pop-up'}</h2>${closeBtn}</div>
      <form id="ppf" novalidate><div class="form-err" id="ppe" role="alert" hidden></div>
      <div class="card"><h2>Content</h2>
        <div class="fld"><span class="lb">Type</span><div class="radios">${radio('p_kind', 'offer', 'Offer with a button', v.kind)}${radio('p_kind', 'newsletter', 'Email sign-up', v.kind)}</div></div>
        ${pair('title', 'Title', 80, false, 'Eid sale: 20% off')}
        ${pair('body', 'Text', 300, true, 'Use the code below at checkout. Ends Friday.')}
        <div class="fld"><label for="p_code">Discount code to show (optional)</label><input class="in" id="p_code" maxlength="30" autocomplete="off" spellcheck="false" style="text-transform:uppercase" placeholder="EID20" value="${esc(v.code)}"><small>Shown with a Copy button. Create the code itself in the Discounts tab.</small></div>
        <div id="p_btnBox">${pair('button_label', 'Button text', 30, false, 'Shop now')}
          <div class="fld"><label for="p_button_link">Button link</label><input class="in" id="p_button_link" maxlength="300" autocomplete="off" spellcheck="false" inputmode="url" placeholder="shop.html?brand=Anua" value="${esc(v.button_link)}"><small>${LINK_HELP}</small></div></div>
        <p class="note" id="p_nlNote">The sign-up form adds emails to your newsletter list. The button text above is used on the sign-up button.</p>
      </div>
      <div class="card"><h2>Picture (optional)</h2>
        <div class="f2">${['image', 'image_ar'].map(k => `<div class="fld"><span class="lb">${k === 'image' ? 'Picture' : 'Arabic picture (if it has text)'}</span>
          <div class="pv-img pp-pv" id="p_${k}_pv"></div><div class="up"><label class="btn ln" style="cursor:pointer">Upload<input type="file" data-up="${k}" accept="image/png,image/jpeg,image/webp" class="sr"></label><button type="button" class="btn ln" data-rmimg="${k}">Remove</button></div></div>`).join('')}</div>
        <small class="note">Shown at the top of the pop-up. Wide pictures work best, about 1200 × 600 pixels.</small></div>
      <div class="card"><h2>Look</h2><div class="radios">${radio('p_layout', 'center', 'Window in the middle of the screen', v.layout)}${radio('p_layout', 'corner', 'Small card in the corner', v.layout)}</div></div>
      <div class="card"><h2>When and where</h2>
        <div class="fld"><span class="lb">Show on</span><div class="radios">${POP_PAGES.map(([k, l]) => `<label class="tg"><input type="checkbox" name="p_pages" value="${k}" ${v.pages.includes(k) ? 'checked' : ''}> ${l}</label>`).join('')}</div><small>Never shown on checkout.</small></div>
        <div class="f2"><div class="fld"><label for="p_trigger">Show it</label><select class="in" id="p_trigger">
            <option value="delay" ${v.trigger === 'delay' ? 'selected' : ''}>After some seconds</option><option value="scroll" ${v.trigger === 'scroll' ? 'selected' : ''}>After scrolling down</option><option value="exit" ${v.trigger === 'exit' ? 'selected' : ''}>When they’re about to leave</option></select></div>
          <div class="fld" id="p_tvBox"><label for="p_trigger_value" id="p_tvLabel">Seconds</label><input class="in" id="p_trigger_value" type="number" min="0" max="120" step="1" inputmode="numeric" value="${v.trigger_value}"></div></div>
        <div class="f2"><div class="fld"><label for="p_frequency">How often</label><select class="in" id="p_frequency">
            <option value="once" ${v.frequency === 'once' ? 'selected' : ''}>Once per visitor</option><option value="session" ${v.frequency === 'session' ? 'selected' : ''}>Once per visit</option><option value="days" ${v.frequency === 'days' ? 'selected' : ''}>Again after some days</option></select></div>
          <div class="fld" id="p_fdBox"><label for="p_frequency_days">Days</label><input class="in" id="p_frequency_days" type="number" min="1" max="60" step="1" inputmode="numeric" value="${v.frequency_days}"></div></div>
        <div class="f2"><div class="fld"><label for="p_audience">Who sees it</label><select class="in" id="p_audience">
            <option value="all" ${v.audience === 'all' ? 'selected' : ''}>Everyone</option><option value="new" ${v.audience === 'new' ? 'selected' : ''}>First-time visitors</option><option value="returning" ${v.audience === 'returning' ? 'selected' : ''}>Returning visitors</option></select></div>
          <div class="fld"><label for="p_device">Devices</label><select class="in" id="p_device">
            <option value="all" ${v.device === 'all' ? 'selected' : ''}>Phones and computers</option><option value="mobile" ${v.device === 'mobile' ? 'selected' : ''}>Phones only</option><option value="desktop" ${v.device === 'desktop' ? 'selected' : ''}>Computers only</option></select></div></div>
        <div class="f2"><div class="fld"><label for="p_starts">Starts (optional, Cairo time)</label><input class="in" id="p_starts" type="datetime-local" value="${cairoInput(v.starts_at)}"></div>
          <div class="fld"><label for="p_ends">Ends (optional, Cairo time)</label><input class="in" id="p_ends" type="datetime-local" value="${cairoInput(v.ends_at)}"></div></div>
        <div class="fld"><label for="p_priority">Priority</label><input class="in" id="p_priority" type="number" min="-100" max="100" step="1" inputmode="numeric" value="${v.priority}" style="max-width:120px"><small>When several pop-ups fit a page, the highest number shows.</small></div>
        <label class="tg"><input type="checkbox" id="p_active" ${v.active ? 'checked' : ''}> Show on the store</label>
      </div>
      <div class="dr-foot"><button type="button" class="btn ln" id="p_preview">Preview</button><button type="button" class="btn ln" data-close>Cancel</button><button class="btn" id="p_save">${isNew ? 'Create pop-up' : 'Save changes'}</button></div></form>`, { guard: true });

    const val = id => $(`#${id}`, dr).value.trim();
    const images = { image: v.image || '', image_ar: v.image_ar || '' };
    const showImg = k => { $(`#p_${k}_pv`, dr).innerHTML = images[k] ? `<img src="${esc(images[k])}" alt="">` : '<span class="note">None</span>'; $(`[data-rmimg="${k}"]`, dr).hidden = !images[k]; };
    ['image', 'image_ar'].forEach(k => {
      showImg(k);
      $(`[data-rmimg="${k}"]`, dr).onclick = () => { images[k] = ''; showImg(k); drawer.dirty = true; };
      $(`[data-up="${k}"]`, dr).onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) db.upload(f).then(u => { images[k] = u; showImg(k); drawer.dirty = true; }).catch(fail); };
    });
    const sync = () => {
      const kind = $('input[name="p_kind"]:checked', dr).value, trig = val('p_trigger');
      $('#p_btnBox .fld:last-child', dr).hidden = kind === 'newsletter';
      $('#p_nlNote', dr).hidden = kind !== 'newsletter';
      $('#p_tvBox', dr).hidden = trig === 'exit';
      $('#p_tvLabel', dr).textContent = trig === 'scroll' ? '% of the page' : 'Seconds';
      $('#p_fdBox', dr).hidden = val('p_frequency') !== 'days';
    };
    dr.addEventListener('change', sync); sync();

    const collect = () => {
      const kind = $('input[name="p_kind"]:checked', dr).value;
      const body = {
        id: isNew ? null : p.id, active: $('#p_active', dr).checked, kind, layout: $('input[name="p_layout"]:checked', dr).value,
        title: val('p_title'), title_ar: val('p_title_ar'), body: val('p_body'), body_ar: val('p_body_ar'),
        image: images.image, image_ar: images.image_ar, code: val('p_code').toUpperCase(),
        button_label: val('p_button_label'), button_label_ar: val('p_button_label_ar'), button_link: kind === 'newsletter' ? '' : val('p_button_link'),
        trigger: val('p_trigger'), trigger_value: Number(val('p_trigger_value') || 0), frequency: val('p_frequency'), frequency_days: Number(val('p_frequency_days') || 3),
        pages: $$('input[name="p_pages"]:checked', dr).map(c => c.value), audience: val('p_audience'), device: val('p_device'),
        starts_at: val('p_starts') || null, ends_at: val('p_ends') || null, priority: Number(val('p_priority') || 0),
      };
      if (!body.title) throw new Error('Give the pop-up a title');
      if (!body.pages.length) throw new Error('Choose at least one page to show the pop-up on');
      if (body.code && !/^[A-Z0-9_-]{1,30}$/.test(body.code)) throw new Error('The code can only have letters, numbers, - and _');
      if (kind === 'offer' && body.button_label && !body.button_link) throw new Error('Add a link for the button, or leave the button text empty');
      if (body.button_link && !AlolaHero.safeLink(body.button_link)) throw new Error('Links must start with https:// or be a page of this store, like shop.html');
      return body;
    };
    const showErr = m => { const e = $('#ppe', dr); e.textContent = m; e.hidden = false; e.scrollIntoView({ block: 'center' }); };
    $('#p_preview', dr).onclick = () => {
      try {
        const b = collect(), pageFile = { home: '', shop: 'shop.html', product: 'shop.html', account: 'account.html' }[b.pages[0]];
        localStorage.setItem('alola_popup_preview', JSON.stringify(b));
        window.open(`../${pageFile}?popup=preview`, '_blank', 'noopener');
      } catch (e) { showErr(e.message); }
    };
    $('#ppf', dr).onsubmit = async e => {
      e.preventDefault();
      const btn = $('#p_save', dr); btn.disabled = true; $('#ppe', dr).hidden = true;
      try {
        await db.savePopup(collect());
        toast(isNew ? 'Pop-up created' : 'Pop-up saved');
        closeDrawer();
        viewPopups($('#view'), viewToken);
      } catch (ex) { if (!ex.handled) showErr(ex.message); btn.disabled = false; }
    };
  }

  const VIEWS = { overview: viewOverview, analytics: viewAnalytics, orders: viewOrders, products: viewProducts, customers: viewCustomers, discounts: viewDiscounts, home: viewHome, popups: viewPopups, themes: viewThemes };

  // ------------------------------------------------------------ start
  let hashBound = false;
  async function start() {
    if (!(await db.hasAdminSession().catch(() => false))) return renderLogin();
    renderShell();
    if (!hashBound) { addEventListener('hashchange', route); hashBound = true; }
    route();
    loadNotifs().catch(fail);
    refreshPending();
    startLive();
    // A chart range or the notification list can go stale across a long-open tab: keep "x min ago" honest.
    setInterval(() => { if (notif.pop) drawPop(); }, 60000);
  }
  start();
})();
