// Checkout: delivery details and cash-on-delivery order placement. The server recalculates all totals.
(async function () {
  const { $, esc, fmt, media } = A;
  A.mountChrome('checkout');
  const root = $('#co');
  const GOVS = ['Cairo', 'Giza', 'Alexandria', 'Aswan', 'Asyut', 'Beheira', 'Beni Suef', 'Dakahlia', 'Damietta', 'Faiyum', 'Gharbia', 'Ismailia', 'Kafr El Sheikh', 'Luxor', 'Matrouh', 'Minya', 'Monufia', 'New Valley', 'North Sinai', 'Port Said', 'Qalyubia', 'Qena', 'Red Sea', 'Sharqia', 'Sohag', 'South Sinai', 'Suez'];
  let cfg;
  try { cfg = await A.config(); await A.products(); }
  catch { root.innerHTML = '<div class="empty"><h3>Checkout could not load</h3><p>Please refresh the page.</p></div>'; return; }

  const field = (id, label, input) => `<div class="fld" id="f-${id}"><label for="${id}">${label}</label>${input}<div class="err" id="e-${id}"></div></div>`;
  const inp = (id, type, auto, extra = '') => `<input class="in" id="${id}" name="${id}" type="${type}" autocomplete="${auto}" ${extra}>`;

  async function renderSummary() {
    const box = $('#summary'); if (!box) return;
    const lines = await A.cartLines(), t = A.totals(lines, cfg);
    if (!lines.length) return renderEmpty();
    box.innerHTML = `${lines.map(({ p, qty }) => `<div class="ci"><div class="thumb ph-${esc(p.category)}">${media(p)}</div><div class="ci-m"><b>${esc(p.name)}</b><small>${esc(p.brand)} · ${qty} × ${fmt(p.price)}</small></div><b>${fmt(p.price * qty)}</b></div>`).join('')}
      <div style="height:12px"></div><div class="tot"><span>Subtotal</span><span>${fmt(t.subtotal)}</span></div>
      <div class="tot"><span>Delivery</span><span>${t.shipping ? fmt(t.shipping) : 'Free'}</span></div>
      <div class="tot g"><span>Total</span><span>${fmt(t.total)}</span></div>`;
    $('#placeBtn').textContent = `Place order · ${fmt(t.total)}`;
  }
  function renderEmpty() {
    root.innerHTML = `<div class="empty"><h3>Your cart is empty</h3><p>Add something before checking out.</p><p style="margin-top:14px"><a class="btn dk" href="shop.html">Browse products</a></p></div>`;
  }

  if (!(await A.cartLines()).length) return renderEmpty();

  root.innerHTML = `<div class="page-h"><a class="crumb" href="shop.html">${A.ICON.back} Keep shopping</a><h1>Check<em>out</em></h1></div>
    <form class="co" id="form" novalidate>
      <div>
        <div class="alert" id="formErr" role="alert" hidden></div>
        <div class="panel"><h2>Your details</h2>
          ${field('name', 'Full name', inp('name', 'text', 'name', 'required'))}
          <div class="f2">${field('phone', 'Phone', inp('phone', 'tel', 'tel', 'required placeholder="01X XXXX XXXX"'))}${field('email', 'Email', inp('email', 'email', 'email', 'required'))}</div>
        </div>
        <div class="panel"><h2>Delivery</h2>
          ${field('city', 'Governorate', `<select class="in" id="city" name="city" required autocomplete="address-level1"><option value="">Choose…</option>${GOVS.map(g => `<option>${g}</option>`).join('')}</select>`)}
          ${field('address', 'Address', `<textarea class="in" id="address" name="address" required autocomplete="street-address" placeholder="Street, building, floor, apartment"></textarea>`)}
          ${field('notes', 'Notes (optional)', `<textarea class="in" id="notes" name="notes" style="min-height:60px" placeholder="Anything the courier should know"></textarea>`)}
        </div>
        <div class="panel"><h2>Payment</h2><div class="payopt">${A.ICON.cash}<div><b>Cash on delivery</b><small>Pay the courier when your order arrives.</small></div></div></div>
      </div>
      <aside class="panel sum"><h2>Your order</h2><div id="summary"></div><button class="btn ro" id="placeBtn" style="width:100%">Place order</button></aside>
    </form>`;
  await renderSummary();
  document.addEventListener('alola:cart', () => { renderSummary(); });

  const form = $('#form');
  function showErrors(fields = {}) {
    for (const id of ['name', 'phone', 'email', 'city', 'address']) {
      $(`#f-${id}`).classList.toggle('bad', !!fields[id]);
      $(`#e-${id}`).textContent = fields[id] || '';
      $(`#${id}`).setAttribute('aria-invalid', !!fields[id]);
    }
    const first = Object.keys(fields)[0];
    if (first) $(`#${first}`).focus();
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#placeBtn'), errBox = $('#formErr');
    errBox.hidden = true; showErrors();
    const lines = await A.cartLines();
    btn.disabled = true; btn.textContent = 'Placing your order…';
    try {
      const data = Object.fromEntries(new FormData(form));
      const order = await A.placeOrder({ ...data, items: lines.map(l => ({ id: l.p.id, qty: l.qty })) });
      A.setCart({});
      success(order);
    } catch (err) {
      if (err.fields) showErrors(err.fields);
      else { errBox.textContent = err.message; errBox.hidden = false; errBox.scrollIntoView({ block: 'center' }); }
      btn.disabled = false;
      renderSummary();
    }
  });

  function success(o) {
    const first = esc(o.name.split(' ')[0]);
    root.innerHTML = `<div class="done">
      <div class="wr">${alolaWreath({ leaves: 26, a: '#7d8f5e', b: '#a3b585', stem: '#a3b585' })}<div class="tick"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg></div></div>
      <h1>Thank you, <em>${first}</em></h1>
      <p>Your order is in. We’ll call you to confirm, then it’s on its way to ${esc(o.city)}. Pay ${fmt(o.total)} in cash on delivery.</p>
      <div class="num">Order ${esc(o.number)}</div><br>
      <a class="btn dk" href="shop.html">Keep shopping</a></div>`;
    scrollTo({ top: 0 });
  }
})();
