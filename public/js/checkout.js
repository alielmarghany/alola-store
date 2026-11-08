// Checkout: delivery details and cash-on-delivery order placement. The server recalculates all totals.
(async function () {
  const { $, esc, fmt, media } = A;
  A.mountChrome('checkout');
  const root = $('#co');
  const GOVS = A.GOVERNORATES;
  let cfg, user = null, saved = null;
  try {
    cfg = await A.config(); await A.products();
    // Accounts are optional: if they can't load, guest checkout still works.
    try { user = await Acc.user(); if (user) saved = await Acc.profile(); } catch { user = null; saved = null; }
  }
  catch { root.innerHTML = '<div class="empty"><h3>Checkout could not load</h3><p>Please refresh the page.</p></div>'; return; }

  const field = (id, label, input) => `<div class="fld" id="f-${id}"><label for="${id}">${label}</label>${input}<div class="err" id="e-${id}"></div></div>`;
  const inp = (id, type, auto, extra = '', value = '') => `<input class="in" id="${id}" name="${id}" type="${type}" autocomplete="${auto}" value="${esc(value)}" ${extra}>`;

  // The code the customer applied. The database works out what it's worth, here and again when the order is placed.
  let appliedCode = null;
  const cartItems = lines => lines.map(l => ({ id: l.p.id, qty: l.qty }));
  let summaryRun = 0;

  async function renderSummary() {
    const box = $('#summary'); if (!box) return;
    const run = ++summaryRun;
    const lines = await A.cartLines(), t = A.totals(lines, cfg);
    if (!lines.length) return renderEmpty();
    let discount = 0;
    if (appliedCode) {
      let d;
      try { d = await Acc.previewDiscount(appliedCode, cartItems(lines)); }
      catch (err) { d = { error: err.message }; }
      if (run !== summaryRun) return; // a newer update has taken over
      if (d.error) { appliedCode = null; renderCode(d.error); }
      else { discount = d.discount; t.shipping = d.shipping; t.total = d.total; t.subtotal = d.subtotal; }
    }
    box.innerHTML = `${lines.map(({ p, qty }) => `<div class="ci"><div class="thumb ph-${esc(p.category)}">${media(p)}</div><div class="ci-m"><b>${esc(A.pname(p))}</b><small>${esc(p.brand)} · ${qty} × ${fmt(p.price)}</small></div><b>${fmt(p.price * qty)}</b></div>`).join('')}
      <div style="height:12px"></div><div class="tot"><span>Subtotal</span><span>${fmt(t.subtotal)}</span></div>
      ${discount ? `<div class="tot disc"><span>Discount (${esc(appliedCode)})</span><span>−${fmt(discount)}</span></div>` : ''}
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
        <div class="note acct-note">${user ? `Logged in as <b>${esc(user.email)}</b>. We’ve filled in your saved details.` : `<span>Have an account? <a href="account.html?next=checkout"><b>Log in</b></a> to use your saved details, or <a href="account.html?mode=signup&next=checkout"><b>create one</b></a>.</span>`}</div>
        <div class="panel"><h2>Your details</h2>
          ${field('name', 'Full name', inp('name', 'text', 'name', 'required', saved?.name))}
          <div class="f2">${field('phone', 'Phone', inp('phone', 'tel', 'tel', 'required placeholder="01X XXXX XXXX"', saved?.phone))}${field('email', 'Email', inp('email', 'email', 'email', user ? 'required readonly' : 'required', user?.email))}</div>
        </div>
        <div class="panel"><h2>Delivery</h2>
          ${field('city', 'Governorate', `<select class="in" id="city" name="city" required autocomplete="address-level1"><option value="">Choose…</option>${GOVS.map(g => `<option value="${g}" ${g === saved?.city ? 'selected' : ''}>${g}</option>`).join('')}</select>`)}
          ${field('address', 'Address', `<textarea class="in" id="address" name="address" required autocomplete="street-address" placeholder="Street, building, floor, apartment">${esc(saved?.address)}</textarea>`)}
          ${field('notes', 'Notes (optional)', `<textarea class="in" id="notes" name="notes" style="min-height:60px" placeholder="Anything the courier should know"></textarea>`)}
          ${user ? `<label class="chk"><input type="checkbox" name="save" checked> Save these details for next time</label>` : ''}
        </div>
        <div class="panel"><h2>Payment</h2><div class="payopt">${A.ICON.cash}<div><b>Cash on delivery</b><small>Pay the courier when your order arrives.</small></div></div></div>
      </div>
      <aside class="panel sum"><h2>Your order</h2><div id="summary"></div><div id="codeBox"></div><button class="btn ro" id="placeBtn" style="width:100%">Place order</button></aside>
    </form>`;
  function renderCode(message = '') {
    const box = $('#codeBox'); if (!box) return;
    box.innerHTML = appliedCode
      ? `<div class="code-on"><span><b>${esc(appliedCode)}</b> <span>Code applied</span></span><button type="button" class="linkish" id="codeRemove">Remove</button></div>`
      : `<label class="code-l" for="codeInput">Discount code</label><div class="code-row"><input class="in" id="codeInput" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="30" placeholder="e.g. EID20"><button type="button" class="btn ln" id="codeApply">Apply</button></div>${message ? `<div class="err" role="alert">${esc(message)}</div>` : ''}`;
    if (appliedCode) { $('#codeRemove').onclick = () => { appliedCode = null; renderCode(); renderSummary(); }; return; }
    const input = $('#codeInput'), btn = $('#codeApply');
    // Enter here applies the code; it must not place the order.
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); btn.click(); } });
    btn.onclick = async () => {
      const code = input.value.trim().toUpperCase();
      if (!code) return input.focus();
      btn.disabled = true;
      try {
        const d = await Acc.previewDiscount(code, cartItems(await A.cartLines()));
        if (d.error) { renderCode(d.error); $('#codeInput').value = code; return; }
        appliedCode = d.code;
        renderCode();
        await renderSummary();
      } catch (err) { renderCode(err.message); }
    };
  }
  renderCode();
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
      data.save = !!data.save;
      const order = await Acc.placeOrder({ ...data, code: appliedCode || '', items: cartItems(lines) });
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
      <div class="wr">${alolaWreath({ leaves: 26, a: '#7d8f5e', b: '#a3b585', stem: '#a3b585' })}<div class="tick"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg></div></div>
      <h1>Thank you, <em>${first}</em></h1>
      <p>Your order is in. We’ll call you to confirm, then it’s on its way to ${esc(o.city)}. Pay ${fmt(o.total)} in cash on delivery.</p>
      ${o.discount_code ? `<p>Discount code ${esc(o.discount_code)} applied.</p>` : ''}
      <div class="num">Order ${esc(o.number)}</div><br>
      <a class="btn dk" href="shop.html">Keep shopping</a>
      ${user ? `<p style="margin-top:14px"><a href="account.html#orders"><b>View my orders</b></a></p>` : `<p style="margin-top:14px"><a href="account.html?mode=signup"><b>Create an account</b></a> to check out faster next time.</p>`}</div>`;
    scrollTo({ top: 0 });
  }
})();
