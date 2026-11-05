// Customer accounts: login, saved details, order history and placing orders.
// Loaded only on the account and checkout pages. Uses its own session key, so a customer
// login never mixes with a dashboard login in the same browser.
window.Acc = (function () {
  const cfg = window.ALOLA_CONFIG || {};
  const sb = supabase.createClient(cfg.url, cfg.anonKey, { auth: { storageKey: 'alola-customer' } });

  const fail = error => {
    const e = new Error(error.message || 'Something went wrong');
    try { e.fields = JSON.parse(error.details); } catch {} // per-field checkout errors
    return e;
  };
  /** Supabase's sign-in messages, in the store's voice. */
  function authMessage(error) {
    const m = (error.message || '').toLowerCase();
    if (m.includes('invalid login')) return 'Wrong email or password';
    if (m.includes('not confirmed')) return 'Please confirm your email first. Check your inbox for the link.';
    if (m.includes('already registered') || m.includes('already been registered')) return 'That email already has an account. Try logging in.';
    if (m.includes('rate limit') || error.status === 429) return 'Too many attempts. Please wait a few minutes and try again.';
    return error.message || 'Something went wrong';
  }
  const pageUrl = () => new URL('account.html', location.href).href;

  async function user() {
    const { data: { session } } = await sb.auth.getSession();
    return session?.user || null;
  }
  async function signIn(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(authMessage(error));
  }
  /** Returns true if logged in straight away, false if the customer must confirm their email first. */
  async function signUp(name, email, password) {
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: pageUrl() } });
    if (error) throw new Error(authMessage(error));
    // Supabase hides whether an email is taken: an existing address comes back with no identities.
    if (data.user && Array.isArray(data.user.identities) && !data.user.identities.length) throw new Error('That email already has an account. Try logging in.');
    return !!data.session;
  }
  const signOut = () => sb.auth.signOut();
  async function resetPassword(email) {
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: pageUrl() });
    if (error) throw new Error(authMessage(error));
  }
  async function updatePassword(password) {
    const { error } = await sb.auth.updateUser({ password });
    if (error) throw new Error(authMessage(error));
  }
  const onRecovery = fn => sb.auth.onAuthStateChange(event => { if (event === 'PASSWORD_RECOVERY') fn(); });

  /** Saved details, starting from the name given at sign-up. */
  async function profile() {
    const u = await user();
    if (!u) return null;
    const { data, error } = await sb.from('customer_profiles').select('name,phone,city,address').eq('user_id', u.id).maybeSingle();
    if (error) throw fail(error);
    return data || { name: u.user_metadata?.full_name || '', phone: '', city: '', address: '' };
  }
  async function saveProfile(p) {
    const u = await user();
    const { error } = await sb.from('customer_profiles').upsert({ user_id: u.id, name: p.name, phone: p.phone, city: p.city, address: p.address, updated_at: new Date().toISOString() });
    if (error) throw fail(error);
  }
  async function myOrders() {
    const { data, error } = await sb.rpc('my_orders');
    if (error) throw fail(error);
    return data;
  }
  async function placeOrder(payload) {
    const { data, error } = await sb.rpc('place_order', { payload });
    if (error) throw fail(error);
    return data;
  }

  async function previewDiscount(code, items) {
    const { data, error } = await sb.rpc('preview_discount', { p_code: code, p_items: items });
    if (error) throw fail(error);
    return data;
  }

  return { previewDiscount, user, signIn, signUp, signOut, resetPassword, updatePassword, onRecovery, profile, saveProfile, myOrders, placeOrder };
})();
