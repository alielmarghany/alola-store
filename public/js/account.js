// Customer account page: log in, sign up, reset password, saved details and order history.
(async function () {
  const { $, $$, esc, fmt } = A;
  A.mountChrome('account');
  const root = $('#acct');
  const params = new URLSearchParams(location.search);
  const afterLogin = () => { if (params.get('next') === 'checkout') location.href = 'checkout.html'; else renderAccount(); };

  const fld = (id, label, attrs = '', hint = '') => `<div class="fld" id="f-${id}"><label for="${id}">${label}</label><input class="in" id="${id}" name="${id}" ${attrs}>${hint ? `<small class="hint">${hint}</small>` : ''}<div class="err" id="e-${id}"></div></div>`;
  const STATUS = { pending: 'Received', confirmed: 'Confirmed', shipped: 'On its way', delivered: 'Delivered', cancelled: 'Cancelled' };
  const dateFmt = new Intl.DateTimeFormat(T.ar ? 'ar-EG-u-nu-latn' : 'en-GB', { timeZone: 'Africa/Cairo', day: 'numeric', month: 'short', year: 'numeric' });

  function setBusy(btn, busy, label) { btn.disabled = busy; if (label) btn.textContent = label; }
  function showErrors(fields) {
    $$('.fld').forEach(f => f.classList.remove('bad'));
    $$('.err').forEach(e => e.textContent = '');
    let first = null;
    for (const [id, msg] of Object.entries(fields)) {
      $(`#f-${id}`).classList.add('bad');
      $(`#e-${id}`).textContent = msg;
      first ||= id;
    }
    if (first) $(`#${first}`).focus();
    return !first;
  }
  const validEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  // -------------------------------------------------- logged out
  function renderAuth(mode = 'login', notice = '') {
    const tabs = `<div class="auth-tabs" role="tablist"><button role="tab" data-mode="login" aria-selected="${mode === 'login'}">Log in</button><button role="tab" data-mode="signup" aria-selected="${mode === 'signup'}">Create account</button></div>`;
    const heading = { login: 'Welcome <em>back</em>', signup: 'Join <em>Alola</em>', forgot: 'Reset your <em>password</em>' }[mode];
    const sub = {
      login: 'Log in to use your saved details and see your orders.',
      signup: 'Save your details once and check out faster every time.',
      forgot: 'Enter your email and we’ll send you a link to set a new password.',
    }[mode];
    const body = {
      login: `${fld('email', 'Email', 'type="email" autocomplete="email" required')}${fld('password', 'Password', 'type="password" autocomplete="current-password" required')}
        <button class="btn dk" style="width:100%" id="go">Log in</button><p class="auth-alt"><button type="button" class="linkish" data-mode="forgot">Forgot your password?</button></p>`,
      signup: `${fld('name', 'Full name', 'autocomplete="name" required')}${fld('email', 'Email', 'type="email" autocomplete="email" required')}${fld('password', 'Password', 'type="password" autocomplete="new-password" required', 'At least 8 characters')}
        <button class="btn ro" style="width:100%" id="go">Create account</button>`,
      forgot: `${fld('email', 'Email', 'type="email" autocomplete="email" required')}<button class="btn dk" style="width:100%" id="go">Send reset link</button><p class="auth-alt"><button type="button" class="linkish" data-mode="login">Back to log in</button></p>`,
    }[mode];
    root.innerHTML = `<div class="auth-box panel">${mode === 'forgot' ? '' : tabs}<h1>${heading}</h1><p class="sub">${sub}</p>
      <div class="note" id="notice" role="status" ${notice ? '' : 'hidden'}>${esc(notice)}</div><div class="alert" id="formErr" role="alert" hidden></div>
      <form id="af" novalidate>${body}</form></div>`;
    $$('[data-mode]', root).forEach(b => b.onclick = () => renderAuth(b.dataset.mode));
    const firstInput = $('input', root); if (firstInput && !notice) firstInput.focus();

    $('#af').onsubmit = async e => {
      e.preventDefault();
      const email = $('#email').value.trim(), password = $('#password')?.value || '', name = $('#name')?.value.trim() || '';
      const errs = {};
      if (mode === 'signup' && name.length < 2) errs.name = 'Please enter your full name';
      if (!validEmail(email)) errs.email = 'Please enter a valid email';
      if (mode === 'login' && !password) errs.password = 'Please enter your password';
      if (mode === 'signup' && password.length < 8) errs.password = 'Use at least 8 characters';
      if (!showErrors(errs)) return;
      const btn = $('#go'), label = btn.textContent, errBox = $('#formErr');
      errBox.hidden = true; setBusy(btn, true, 'Just a moment…');
      try {
        if (mode === 'login') { await Acc.signIn(email, password); return afterLogin(); }
        if (mode === 'signup') {
          if (await Acc.signUp(name, email, password)) return afterLogin();
          return renderAuth('login', `Almost there. We sent a confirmation link to ${email}. Open it, then log in here.`);
        }
        await Acc.resetPassword(email);
        renderAuth('login', `If ${email} has an account, a reset link is on its way.`);
      } catch (err) { errBox.textContent = err.message; errBox.hidden = false; setBusy(btn, false, label); }
    };
  }

  // -------------------------------------------------- reset link opened
  function renderNewPassword() {
    root.innerHTML = `<div class="auth-box panel"><h1>New <em>password</em></h1><p class="sub">Choose a new password for your account.</p><div class="alert" id="formErr" role="alert" hidden></div>
      <form id="af" novalidate>${fld('password', 'New password', 'type="password" autocomplete="new-password" required', 'At least 8 characters')}<button class="btn dk" style="width:100%" id="go">Save password</button></form></div>`;
    $('#af').onsubmit = async e => {
      e.preventDefault();
      const password = $('#password').value;
      if (!showErrors(password.length < 8 ? { password: 'Use at least 8 characters' } : {})) return;
      const btn = $('#go'); setBusy(btn, true);
      try { await Acc.updatePassword(password); recovering = false; history.replaceState(null, '', location.pathname); A.toast('Password updated'); renderAccount(); }
      catch (err) { $('#formErr').textContent = err.message; $('#formErr').hidden = false; setBusy(btn, false); }
    };
  }

  // -------------------------------------------------- logged in
  async function renderAccount() {
    const user = await Acc.user();
    if (!user) return renderAuth();
    root.innerHTML = '<div class="empty">Loading your account…</div>';
    let profile, orders, cfgGovs;
    try { [profile, orders] = await Promise.all([Acc.profile(), Acc.myOrders()]); }
    catch { root.innerHTML = '<div class="empty"><h3>Your account could not load</h3><p>Please refresh the page.</p></div>'; return; }
    if (recovering) return; // a password reset link opened meanwhile: keep its form on screen
    cfgGovs = A.GOVERNORATES;
    const first = (profile.name || '').split(' ')[0];

    root.innerHTML = `<div class="page-h acct-h"><div><h1>${first ? `${T.t('Hi,')} <em>${esc(first)}</em>` : 'My <em>account</em>'}</h1><p>${esc(user.email)}</p></div><button class="btn ln" id="logout">Log out</button></div>
      <div class="co">
        <section id="orders" style="padding:0"><div class="panel"><h2>My orders</h2><div id="orderList">${orders.length ? orders.map(orderCard).join('') : `<div class="empty" style="padding:30px 10px"><p>You haven’t ordered anything yet.</p><p style="margin-top:14px"><a class="btn dk" href="shop.html">Browse products</a></p></div>`}</div></div></section>
        <aside>
          <form class="panel" id="pf" novalidate><h2>My details</h2><p class="sub" style="margin-bottom:12px">We’ll fill these in for you at checkout.</p>
            ${fld('name', 'Full name', `autocomplete="name" value="${esc(profile.name)}"`)}
            ${fld('phone', 'Phone', `type="tel" autocomplete="tel" placeholder="01X XXXX XXXX" value="${esc(profile.phone)}"`)}
            <div class="fld" id="f-city"><label for="city">Governorate</label><select class="in" id="city" autocomplete="address-level1"><option value="">Choose…</option>${cfgGovs.map(g => `<option value="${g}" ${g === profile.city ? 'selected' : ''}>${g}</option>`).join('')}</select><div class="err" id="e-city"></div></div>
            <div class="fld" id="f-address"><label for="address">Delivery address</label><textarea class="in" id="address" autocomplete="street-address" placeholder="Street, building, floor, apartment">${esc(profile.address)}</textarea><div class="err" id="e-address"></div></div>
            <button class="btn dk" style="width:100%" id="saveP">Save details</button></form>
          <form class="panel" id="pw" novalidate><h2>Change password</h2>${fld('password', 'New password', 'type="password" autocomplete="new-password"', 'At least 8 characters')}<button class="btn ln" style="width:100%" id="saveW">Update password</button></form>
        </aside>
      </div>`;

    $('#logout').onclick = async () => { await Acc.signOut().catch(() => {}); A.toast('Logged out'); renderAuth(); };
    $('#pf').onsubmit = async e => {
      e.preventDefault();
      const p = { name: $('#name').value.trim(), phone: $('#phone').value.trim(), city: $('#city').value, address: $('#address').value.trim() };
      const errs = {};
      if (p.name.length < 2) errs.name = 'Please enter your full name';
      if (p.phone && !/^\+?[0-9][0-9 ()-]{6,18}$/.test(p.phone)) errs.phone = 'Please enter a valid phone number';
      if (p.address && p.address.length < 5) errs.address = 'Please enter your full address';
      if (!showErrors(errs)) return;
      const btn = $('#saveP'); setBusy(btn, true);
      try { await Acc.saveProfile(p); A.toast('Details saved'); }
      catch (err) { A.toast(err.message); }
      setBusy(btn, false);
    };
    $('#pw').onsubmit = async e => {
      e.preventDefault();
      const input = $('#pw #password');
      if (input.value.length < 8) { $('#f-password').classList.add('bad'); $('#e-password').textContent = 'Use at least 8 characters'; input.focus(); return; }
      $('#f-password').classList.remove('bad'); $('#e-password').textContent = '';
      const btn = $('#saveW'); setBusy(btn, true);
      try { await Acc.updatePassword(input.value); input.value = ''; A.toast('Password updated'); }
      catch (err) { A.toast(err.message); }
      setBusy(btn, false);
    };
    if (location.hash === '#orders') $('#orders').scrollIntoView();
  }

  function orderCard(o) {
    return `<article class="ord"><div class="ord-h"><div><b>${esc(o.number)}</b><small>${dateFmt.format(new Date(o.created_at))}</small></div><span class="st st-${esc(o.status)}">${STATUS[o.status] || esc(o.status)}</span></div>
      ${o.items.map(i => `<div class="ord-i"><span>${esc((T.ar && i.name_ar) || i.name)}<small>${esc(i.brand)} · ${i.qty} × ${fmt(i.price)}</small></span><span>${fmt(i.qty * i.price)}</span></div>`).join('')}
      ${o.discount ? `<div class="ord-i disc"><span>Discount (${esc(o.discount_code)})</span><span>−${fmt(o.discount)}</span></div>` : ''}
      <div class="ord-t"><span>Delivery to ${esc(o.city)}: ${o.shipping ? fmt(o.shipping) : 'Free'}</span><b>${fmt(o.total)}</b></div></article>`;
  }

  // -------------------------------------------------- start
  let recovering = /(^|[#&])type=recovery(&|$)/.test(location.hash);
  Acc.onRecovery(() => { recovering = true; renderNewPassword(); });
  if (!window.ALOLA_CONFIG?.url) { root.innerHTML = '<div class="empty"><h3>Accounts aren’t available yet</h3></div>'; return; }
  const user = await Acc.user().catch(() => null);
  if (recovering) return renderNewPassword();
  if (user) afterLogin(); else renderAuth(params.get('mode') === 'signup' ? 'signup' : 'login');
})();
