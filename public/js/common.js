// Shared storefront code: API, header/footer, product cards, cart, saved items, reveals.
window.A = (function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Number(n).toLocaleString('en-US') + (T.ar ? ' ج.م' : ' EGP');
  /** A product's text in the visitor's language, falling back to English. */
  const loc = (p, field) => (T.ar && p[`${field}_ar`]) || p[field] || '';
  const pname = p => loc(p, 'name');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ICON = {
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.500-6 8-6s8 2 8 6"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16M14 6l6 6-6 6"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12H4M10 6l-6 6 6 6"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7.500-4.600-9-9.200C2 7.300 4.200 4.500 7.300 4.500c2 0 3.700 1 4.700 2.800 1-1.800 2.700-2.800 4.700-2.800 3.100 0 5.300 2.800 4.300 6.300C19.500 15.400 12 20 12 20z"/></svg>',
    truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6h12v10H2zM14 10h4l4 4v2h-8z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
    cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linecap="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.500"/><path d="M6 10v.01M18 14v.01"/></svg>',
    leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19C5 10 11 4 20 4c0 9-6 15-15 15zM5 19 14 10"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg>',
  };

  // ------------------------------------------------ API
  const GOVERNORATES = ['Cairo', 'Giza', 'Alexandria', 'Aswan', 'Asyut', 'Beheira', 'Beni Suef', 'Dakahlia', 'Damietta', 'Faiyum', 'Gharbia', 'Ismailia', 'Kafr El Sheikh', 'Luxor', 'Matrouh', 'Minya', 'Monufia', 'New Valley', 'North Sinai', 'Port Said', 'Qalyubia', 'Qena', 'Red Sea', 'Sharqia', 'Sohag', 'South Sinai', 'Suez'];
  const CFG = window.ALOLA_CONFIG || {};
  async function rest(path, opts = {}) {
    if (!CFG.url) throw new Error('The store isn’t connected to Supabase yet');
    const res = await fetch(`${CFG.url}/rest/v1/${path}`, { ...opts, headers: { apikey: CFG.anonKey, Authorization: `Bearer ${CFG.anonKey}`, 'Content-Type': 'application/json' } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(data.message || 'Something went wrong');
      try { e.fields = JSON.parse(data.details); } catch {} // per-field checkout errors
      throw e;
    }
    return data;
  }
  const rpc = (fn, args) => rest(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
  let productsP, configP;
  const products = () => (productsP ||= rest('products?select=*&active=eq.true&order=featured.desc,id'));
  const config = () => (configP ||= rest('store_settings?select=*').then(r => ({ shippingFee: r[0].shipping_fee, freeShippingOver: r[0].free_shipping_over })));
  const subscribe = email => rpc('subscribe', { p_email: email });

  // ------------------------------------------------ storage (the browser may refuse it: never let that break the page)
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  // ------------------------------------------------ product rendering
  const media = p => p.image
    ? `<div class="media photo"><img src="${esc(p.image)}" alt="${esc(p.brand + ' ' + pname(p))}" loading="lazy"></div>`
    : `<div class="media">${alolaArt(p)}</div>`;
  const starStr = r => { const n = Math.round(r); return '★'.repeat(n) + '☆'.repeat(5 - n); };
  const rating = p => p.rating_count
    ? `<div class="rt"><span class="st" aria-hidden="true">${starStr(p.rating)}</span><span>${p.rating.toFixed(1)}<span class="cnt"> (${p.rating_count})</span></span><span class="sr">out of 5</span></div>`
    : '';
  const price = p => `${fmt(p.price)}${p.compare_at ? `<s>${fmt(p.compare_at)}</s>` : ''}`;
  const url = p => `product.html?id=${p.id}`;
  function tagHtml(p) {
    if (p.stock <= 0) return '<span class="tag out">Sold out</span>';
    if (p.compare_at) return `<span class="tag sale">-${Math.round((1 - p.price / p.compare_at) * 100)}%</span>`;
    return p.tag ? `<span class="tag">${esc(p.tag)}</span>` : '';
  }
  const card = (p, i = 0) => `<article class="card" style="--d:${i}" data-id="${p.id}">
    <div class="ph ph-${esc(p.category)}">${tagHtml(p)}
      <button class="heart${saved().includes(p.id) ? ' on' : ''}" data-heart="${p.id}" aria-label="Save ${esc(pname(p))}" aria-pressed="${saved().includes(p.id)}">${ICON.heart}</button>
      ${media(p)}</div>
    <div class="info"><div class="br">${esc(p.brand)}</div><h3 class="nm"><a href="${url(p)}">${esc(pname(p))}</a></h3>${rating(p)}
      <div class="row"><div class="pr">${price(p)}</div><button class="add" data-add="${p.id}" ${p.stock <= 0 ? 'disabled' : ''}>${p.stock <= 0 ? 'Sold out' : 'Add +'}</button></div></div>
  </article>`;

  // ------------------------------------------------ saved items
  const saved = () => load('alola_saved', []);
  function toggleSaved(id) {
    const s = saved(); const i = s.indexOf(id);
    if (i >= 0) s.splice(i, 1); else s.push(id);
    save('alola_saved', s);
    document.dispatchEvent(new CustomEvent('alola:saved'));
    return i < 0;
  }

  // ------------------------------------------------ cart
  const getCart = () => load('alola_cart', {});
  const setCart = c => { save('alola_cart', c); renderCart(); };
  function addToCart(id, qty = 1) {
    return products().then(list => {
      const p = list.find(x => x.id === id);
      if (!p || p.stock <= 0) { toast('This product is sold out'); return false; }
      const c = getCart();
      const next = (c[id] || 0) + qty;
      if (next > p.stock) { toast(`Only ${p.stock} left in stock`); c[id] = p.stock; setCart(c); return false; }
      c[id] = next; setCart(c);
      return true;
    });
  }
  async function cartLines() {
    const list = await products(); const c = getCart();
    const lines = []; let changed = false;
    for (const id of Object.keys(c)) {
      const p = list.find(x => x.id === Number(id));
      if (!p) { delete c[id]; changed = true; continue; } // removed from the store since it was added
      lines.push({ p, qty: c[id] });
    }
    if (changed) save('alola_cart', c);
    return lines;
  }
  const totals = (lines, cfg) => {
    const subtotal = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
    const shipping = !lines.length || subtotal >= cfg.freeShippingOver ? 0 : cfg.shippingFee;
    return { subtotal, shipping, total: subtotal + shipping, count: lines.reduce((s, l) => s + l.qty, 0) };
  };
  async function renderCart() {
    const box = $('#cartItems'); if (!box) return;
    const [lines, cfg] = await Promise.all([cartLines(), config()]);
    const t = totals(lines, cfg);
    box.innerHTML = lines.length ? lines.map(({ p, qty }) => `<div class="ci"><a class="thumb ph-${esc(p.category)}" href="${url(p)}" aria-label="${esc(pname(p))}">${media(p)}</a>
      <div class="ci-m"><b>${esc(pname(p))}</b><small>${esc(p.brand)} · ${fmt(p.price)}</small></div>
      <div class="qt"><button data-cq="${p.id}" data-d="-1" aria-label="Remove one ${esc(pname(p))}">−</button><span>${qty}</span><button data-cq="${p.id}" data-d="1" aria-label="Add one ${esc(pname(p))}">+</button></div></div>`).join('')
      : `<div class="empty"><h3>Your cart is empty</h3><p>Find something you’ll love.</p><p style="margin-top:14px"><a class="btn dk" href="shop.html">Browse products</a></p></div>`;
    $$('.cart-count').forEach(el => el.textContent = t.count);
    $('#cartFoot').hidden = !lines.length;
    $('#cartSub').textContent = fmt(t.subtotal);
    $('#cartShip').textContent = t.shipping ? fmt(t.shipping) : 'Free';
    $('#cartTotal').textContent = fmt(t.total);
    const left = cfg.freeShippingOver - t.subtotal;
    $('#shipBar').hidden = !lines.length;
    $('#shipMsg').textContent = left > 0 ? `Add ${fmt(left)} more for free delivery` : 'You’ve unlocked free delivery';
    $('#shipFill').style.width = Math.min(100, (t.subtotal / cfg.freeShippingOver) * 100) + '%';
    document.dispatchEvent(new CustomEvent('alola:cart'));
  }
  let lastFocus;
  function openCart(on) {
    const dr = $('#cartDrawer');
    dr.classList.toggle('on', on); $('#overlay').classList.toggle('on', on);
    if (on) { lastFocus = document.activeElement; $('#cartClose').focus(); } else if (dr.contains(document.activeElement)) lastFocus?.focus();
  }
  function flyToCart(fromEl) {
    if (reduced || !fromEl) return;
    const target = $('#cartBtn'); if (!target) return;
    const a = fromEl.getBoundingClientRect(), b = target.getBoundingClientRect();
    const f = document.createElement('div'); f.className = 'fly'; f.setAttribute('aria-hidden', 'true');
    f.innerHTML = fromEl.innerHTML; f.style.left = a.left + a.width / 2 - 45 + 'px'; f.style.top = a.top + a.height / 2 - 45 + 'px';
    document.body.append(f);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    f.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx * .6}px,${dy * .45 - 40}px) scale(.8) rotate(-12deg)`, opacity: 1, offset: .55 }, { transform: `translate(${dx}px,${dy}px) scale(.18) rotate(-20deg)`, opacity: .3 }], { duration: 760, easing: 'cubic-bezier(.45,.05,.3,1)' }).onfinish = () => {
      f.remove();
      $$('.cart-count').forEach(c => c.animate([{ transform: 'scale(1.7)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' }));
    };
  }

  // ------------------------------------------------ toast
  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2400);
  }

  // ------------------------------------------------ page chrome
  function mountChrome(active) {
    const home = active === 'home' ? '' : './';
    const head = document.createElement('div');
    head.innerHTML = `<div class="promo">Free delivery on orders over <b>1,000 EGP</b> · Cash on delivery across Egypt</div>
    <header class="nav" id="navbar"><div id="bar"></div>
      <a class="logo" href="./" aria-label="Alola home"><img src="assets/logo.png" alt="Alola" width="128" height="46"></a>
      <nav class="links" id="links" aria-label="Main"><span class="ind" id="ind"></span>
        <a href="shop.html"${active === 'shop' ? ' class="cur"' : ''}>All products</a><a href="${home}#featured">Featured</a><a href="${home}#brands">Brands</a><a href="${home}#why">Why Alola</a><a href="${home}#reviews">Reviews</a></nav>
      <div class="nav-r">
        <a class="icon-btn" href="shop.html?focus=1" aria-label="Search products">${ICON.search}</a>
        <button class="icon-btn lang-btn" id="langBtn" lang="${T.ar ? 'en' : 'ar'}" aria-label="${T.ar ? 'Switch to English' : 'التبديل إلى العربية'}">${T.ar ? 'EN' : 'ع'}</button>
        <a class="icon-btn" href="account.html" aria-label="My account"${active === 'account' ? ' aria-current="page"' : ''}>${ICON.user}</a>
        <button class="cart" id="cartBtn" aria-label="Open cart"><span class="lbl">Cart</span> <i class="cart-count">0</i></button>
        <button class="icon-btn burger" id="burger" aria-label="Menu" aria-expanded="false">${ICON.menu}</button>
      </div></header>`;
    document.body.prepend(...head.children);

    const tail = document.createElement('div');
    tail.innerHTML = `<footer class="ft"><div class="ft-g">
        <div><img src="assets/logo.png" alt="Alola" width="122" height="44"><p>Skincare, makeup, hair and fragrance from brands you trust, delivered across Egypt.</p></div>
        <div><h4>Shop</h4><a href="shop.html">All products</a><a href="shop.html?category=Skincare">Skincare</a><a href="shop.html?category=Makeup">Makeup</a><a href="shop.html?category=Hair">Hair</a><a href="shop.html?category=Fragrance">Fragrance</a></div>
        <div><h4>Store</h4><a href="account.html">My account</a><a href="./#why">Why Alola</a><a href="./#brands">Brands</a><a href="./#reviews">Reviews</a></div>
        <div><h4>Staff</h4><a href="admin/">Admin dashboard</a></div>
      </div><div class="ft-b"><span>© ${new Date().getFullYear()} Alola Cosmetics</span><span>Prices include VAT · Cash on delivery</span></div></footer>
      <div class="ov" id="overlay"></div>
      <aside class="dr" id="cartDrawer" aria-label="Shopping cart"><div class="dh"><h3>Your cart</h3><button class="icon-btn" id="cartClose" aria-label="Close cart">${ICON.close}</button></div>
        <div class="ship" id="shipBar" hidden><span id="shipMsg"></span><i><u id="shipFill" style="width:0"></u></i></div>
        <div id="cartItems"></div>
        <div id="cartFoot" hidden><div style="height:10px"></div><div class="tot"><span>Subtotal</span><span id="cartSub"></span></div><div class="tot"><span>Delivery</span><span id="cartShip"></span></div><div class="tot g"><span>Total</span><span id="cartTotal"></span></div><a class="btn ro" style="width:100%" href="checkout.html">Checkout ${ICON.arrow}</a></div>
      </aside>
      <div class="toast" id="toast" role="status" aria-live="polite"></div>`;
    document.body.append(...tail.children);

    $('#langBtn').onclick = () => T.set(T.ar ? 'en' : 'ar');

    // nav behaviour
    const ind = $('#ind');
    $$('#links a').forEach(a => a.addEventListener('mouseenter', () => { ind.style.left = a.offsetLeft + 'px'; ind.style.width = a.offsetWidth + 'px'; ind.style.opacity = 1; }));
    $('#links').addEventListener('mouseleave', () => ind.style.opacity = 0);
    const burger = $('#burger'), links = $('#links');
    const setMenu = on => { links.classList.toggle('open', on); burger.innerHTML = on ? ICON.close : ICON.menu; burger.setAttribute('aria-expanded', on); };
    burger.onclick = () => setMenu(!links.classList.contains('open'));
    links.addEventListener('click', () => setMenu(false));
    const nav = $('#navbar'), bar = $('#bar');
    const onScroll = () => {
      const d = document.documentElement;
      nav.classList.toggle('sc', scrollY > 30);
      bar.style.width = (scrollY / Math.max(1, d.scrollHeight - innerHeight)) * 100 + '%';
    };
    addEventListener('scroll', onScroll, { passive: true }); onScroll();

    // cart + delegated product actions
    $('#cartBtn').onclick = () => openCart(true);
    $('#cartClose').onclick = $('#overlay').onclick = () => openCart(false);
    addEventListener('keydown', e => { if (e.key === 'Escape') { openCart(false); document.dispatchEvent(new CustomEvent('alola:esc')); } });
    document.addEventListener('click', async e => {
      const add = e.target.closest('[data-add]');
      if (add) {
        e.preventDefault();
        const from = add.closest('.card')?.querySelector('.media');
        if (await addToCart(Number(add.dataset.add))) { flyToCart(from); toast('Added to cart'); }
        return;
      }
      const heart = e.target.closest('[data-heart]');
      if (heart) {
        e.preventDefault();
        const on = toggleSaved(Number(heart.dataset.heart));
        heart.classList.toggle('on', on); heart.setAttribute('aria-pressed', on);
        toast(on ? 'Saved to your list' : 'Removed from your list');
        return;
      }
      const cq = e.target.closest('[data-cq]');
      if (cq) {
        const id = Number(cq.dataset.cq), d = Number(cq.dataset.d);
        const c = getCart(), list = await products(), p = list.find(x => x.id === id);
        const next = (c[id] || 0) + d;
        if (d > 0 && p && next > p.stock) return toast(`Only ${p.stock} left in stock`);
        if (next <= 0) delete c[id]; else c[id] = next;
        setCart(c);
      }
    });
    renderCart().catch(() => {});
    addEventListener('storage', e => { if (e.key === 'alola_cart') renderCart(); });
  }

  // ------------------------------------------------ scroll reveals
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(x => {
    if (!x.isIntersecting) return;
    x.target.classList.add('on');
    x.target.querySelectorAll('[data-count]').forEach(countUp);
    io.unobserve(x.target);
  }), { threshold: .12 }) : null;
  function reveal(root = document) {
    $$('.rev:not(.on)', root).forEach(el => {
      if (!el.style.getPropertyValue('--d') && el.parentElement) {
        const sibs = [...el.parentElement.children].filter(c => c.classList.contains('rev'));
        el.style.setProperty('--d', Math.max(0, sibs.indexOf(el)));
      }
      io ? io.observe(el) : el.classList.add('on');
    });
  }
  function countUp(el) {
    const n = Number(el.dataset.count), suf = el.dataset.suffix || '';
    if (reduced) { el.textContent = n.toLocaleString('en-US') + suf; return; }
    const t0 = performance.now();
    const f = t => {
      const k = Math.min((t - t0) / 1400, 1);
      el.textContent = Math.round(n * (1 - Math.pow(1 - k, 3))).toLocaleString('en-US') + suf;
      if (k < 1) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }

  return { $, $$, esc, fmt, loc, pname, products, config, subscribe, GOVERNORATES, media, card, rating, price, url, tagHtml, saved, getCart, setCart, addToCart, cartLines, totals, openCart, flyToCart, toast, mountChrome, reveal, renderCart, ICON, reduced };
})();
