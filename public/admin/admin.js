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

  const SVG = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.900" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
  const I = {
    overview: SVG('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    orders: SVG('<path d="M6 7h12l1.500 13h-15zM9 7V5a3 3 0 0 1 6 0v2"/>'),
    products: SVG('<path d="M9 3h6v4H9zM7 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"/>'),
    customers: SVG('<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6M16 4a4 4 0 0 1 0 8M22 21c0-3-1.500-5-4-5.700"/>'),
    discounts: SVG('<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9zM8 8v.01M15.500 8.500l-7 7"/>'),
    themes: SVG('<path d="M12 3a9 9 0 1 0 0 18c1.500 0 2-1 2-2 0-1.500-1-2-1-3 0-1 1-2 2-2h2a4 4 0 0 0 4-4c0-4-4-7-9-7z"/><circle cx="7.500" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>'),
    store: SVG('<path d="M3 10v10h18V10M2 10l2-6h16l2 6zM9 20v-6h6v6"/>'),
    out: SVG('<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10"/>'),
    bell: SVG('<path d="M6 10a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 0 0 4 0"/>'),
    x: SVG('<path d="M6 6l12 12M18 6 6 18"/>'),
    plus: SVG('<path d="M12 5v14M5 12h14"/>'),
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
      <img src="../assets/logo.png" alt="Alola" height="50"><h1>Store <em>dashboard</em></h1>
      <div class="form-err" id="le" role="alert" hidden></div>
      <div class="fld"><label for="u">Email</label><input class="in" id="u" type="email" autocomplete="username" required></div>
      <div class="fld"><label for="p">Password</label><input class="in" id="p" type="password" autocomplete="current-password" required></div>
      <button class="btn" style="width:100%;margin-top:6px">Log in</button>
      <p style="text-align:center;margin-top:14px"><a href="../" class="linkbtn">Back to store</a></p></form></div>`;
    $('#u').focus();
    $('#lf').onsubmit = async e => {
      e.preventDefault();
      const b = $('button', e.target); b.disabled = true;
      try { await db.signIn($('#u').value.trim(), $('#p').value); start(); }
      catch (err) { $('#le').textContent = err.message; $('#le').hidden = false; b.disabled = false; }
    };
  }

  // ------------------------------------------------------------ shell + routing
  const NAV = [['overview', 'Overview'], ['orders', 'Orders'], ['products', 'Products'], ['customers', 'Customers'], ['discounts', 'Discounts'], ['themes', 'Themes']];
  const notif = { unread: 0, rows: [], pop: false };

  function renderShell() {
    app.innerHTML = `<div class="shell">
      <aside class="nav"><a class="brand" href="#/overview"><img src="../assets/logo.png" alt="Alola" height="42"></a>
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

  let current = null, viewToken = 0;
  function route() {
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
  function openDrawer(html) {
    const root = $('#drawerRoot');
    root.innerHTML = `<div class="ov" id="ov"></div><aside class="dr" role="dialog" aria-modal="true">${html}</aside>`;
    $('#ov').onclick = closeDrawer;
    $$('[data-close]', root).forEach(b => b.onclick = closeDrawer);
    $('.x', root)?.focus();
    return $('.dr', root);
  }
  function closeDrawer() { const r = $('#drawerRoot'); if (r) r.innerHTML = ''; }
  addEventListener('keydown', e => { if (e.key === 'Escape') { if (notif.pop) togglePop(false); else if (!$('dialog[open]')) closeDrawer(); } });
  function confirmDialog(title, text, okLabel) {
    return new Promise(res => {
      const d = document.createElement('dialog');
      d.innerHTML = `<h3>${esc(title)}</h3><p>${esc(text)}</p><div class="row"><button class="btn ln" value="n">Keep it</button><button class="btn dg" value="y">${esc(okLabel)}</button></div>`;
      document.body.append(d);
      d.addEventListener('close', () => { d.remove(); res(d.returnValue === 'y'); });
      $$('button', d).forEach(b => b.onclick = () => d.close(b.value));
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
      el.innerHTML = `<div class="bar"><input class="in grow" id="pq" type="search" placeholder="Search name, brand or code" aria-label="Search products" value="${esc(productsState.q)}"><div style="flex:1"></div><button class="btn" id="addP">${I.plus} Add product</button></div><div id="plist"><div class="skeleton" style="height:360px"></div></div>`;
      $('#pq').oninput = e => { productsState.q = e.target.value; drawProducts(); };
      $('#addP').onclick = () => openProductForm(null);
    }
    try { const rows = await db.products(); if (token !== viewToken) return; productsState.rows = rows; }
    catch (e) { return fail(e); }
    drawProducts();
  }
  const thumb = p => `<div class="th ph-${esc(p.category)}">${p.image ? `<img src="${esc(p.image)}" alt="">` : alolaArt(p)}</div>`;
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
      <div class="dr-foot"><button type="button" class="btn ln" data-close>Cancel</button><button class="btn" id="pSave">${isNew ? 'Add product' : 'Save changes'}</button></div></form>`);
    $$('[data-close]', dr).forEach(b => b.onclick = closeDrawer);

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
      <div class="dr-foot"><button type="button" class="btn ln" data-close>Cancel</button><button class="btn" id="dSave">${isNew ? 'Add code' : 'Save changes'}</button></div></form>`);
    $$('[data-close]', dr).forEach(b => b.onclick = closeDrawer);
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

  const VIEWS = { overview: viewOverview, orders: viewOrders, products: viewProducts, customers: viewCustomers, discounts: viewDiscounts, themes: viewThemes };

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
