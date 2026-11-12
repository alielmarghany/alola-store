// Everything the dashboard asks of Supabase: login, data, photo uploads and live notifications.
window.AdminDB = (function () {
  const cfg = window.ALOLA_CONFIG || {};
  const sb = cfg.url ? supabase.createClient(cfg.url, cfg.anonKey) : null;
  const BUCKET = 'product-images';
  let onUnauthorized = () => {};

  function check(error) {
    if (!error) return;
    // Signed out, session expired, or not an admin.
    if (error.code === '42501' || error.code === 'PGRST301' || error.status === 401) {
      onUnauthorized();
      throw Object.assign(new Error('Please log in'), { handled: true });
    }
    throw new Error(error.message || 'Something went wrong');
  }
  async function rpc(fn, args) {
    const { data, error } = await sb.rpc(fn, args);
    check(error);
    return data;
  }

  // ---------------------------------------- session
  async function signIn(email, password) {
    if (!sb) throw new Error('The store isn’t connected to Supabase yet. See the README.');
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error('Wrong email or password');
    const { data } = await sb.rpc('is_admin');
    if (!data) { await sb.auth.signOut(); throw new Error('This account doesn’t have dashboard access'); }
  }
  async function hasAdminSession() {
    if (!sb) return false;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return false;
    const { data } = await sb.rpc('is_admin');
    return !!data;
  }
  const signOut = () => sb.auth.signOut();

  // ---------------------------------------- products
  function cleanProduct(b) {
    const name = b.name.trim(), brand = b.brand.trim();
    if (name.length < 2) throw new Error('Product name is required');
    if (brand.length < 2) throw new Error('Brand is required');
    if (!Number.isInteger(b.price) || b.price <= 0) throw new Error('Price must be a whole number above 0');
    if (!Number.isInteger(b.stock) || b.stock < 0) throw new Error('Stock must be a whole number, 0 or more');
    if (b.compare_at !== null && (!Number.isInteger(b.compare_at) || b.compare_at <= b.price)) throw new Error('Original price must be higher than the selling price');
    return { ...b, name, brand };
  }
  async function saveProduct(id, body, previousImage) {
    const row = cleanProduct(body);
    const { error } = id ? await sb.from('products').update(row).eq('id', id) : await sb.from('products').insert(row);
    if (error?.code === '23505') throw new Error('That product code is already used by another product');
    check(error);
    if (previousImage && previousImage !== row.image) await removeImage(previousImage);
  }
  async function deleteProduct(p) {
    const { error } = await sb.from('products').delete().eq('id', p.id);
    check(error);
    if (p.image) await removeImage(p.image);
  }
  async function removeImage(url) {
    const key = url.split(`/${BUCKET}/`)[1];
    if (key) await sb.storage.from(BUCKET).remove([decodeURIComponent(key)]); // a leftover file is harmless, so failures are ignored
  }
  /** Trusts the file's actual bytes, not its name or declared type. */
  async function upload(file) {
    if (file.size > 5 * 1024 * 1024) throw new Error('Image must be under 5 MB');
    const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const ascii = (from, to) => String.fromCharCode(...b.slice(from, to));
    let ext = null, type = null;
    if (b[0] === 0x89 && ascii(1, 4) === 'PNG') { ext = 'png'; type = 'image/png'; }
    else if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) { ext = 'jpg'; type = 'image/jpeg'; }
    else if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') { ext = 'webp'; type = 'image/webp'; }
    if (!ext) throw new Error('Please upload a PNG, JPG or WebP image');
    const key = `${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(key, file, { contentType: type });
    check(error);
    return sb.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
  }

  // ---------------------------------------- notifications
  async function notifications() {
    const [rows, count] = await Promise.all([
      sb.from('notifications').select('*').order('id', { ascending: false }).limit(30),
      sb.from('notifications').select('id', { count: 'exact', head: true }).eq('read', false),
    ]);
    check(rows.error); check(count.error);
    return { rows: rows.data, unread: count.count };
  }
  async function markRead(id) {
    let q = sb.from('notifications').update({ read: true });
    q = id ? q.eq('id', id) : q.eq('read', false);
    const { error } = await q;
    check(error);
    const { count, error: e2 } = await sb.from('notifications').select('id', { count: 'exact', head: true }).eq('read', false);
    check(e2);
    return { unread: count };
  }
  /** Calls onNew for each new order as it happens; onReconnect after a dropped connection comes back. */
  function listen(onNew, onReconnect) {
    let connected = false;
    const channel = sb.channel('new-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, e => onNew(e.new))
      .subscribe(status => {
        if (status === 'SUBSCRIBED') { if (connected) onReconnect(); connected = true; }
      });
    return () => sb.removeChannel(channel);
  }

  // ---------------------------------------- discount codes
  async function discounts() {
    const { data, error } = await sb.from('discount_codes').select('*').order('id', { ascending: false });
    check(error);
    return data;
  }
  function cleanDiscount(b) {
    const code = b.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) throw new Error('Code must be 3 to 30 letters or numbers, with no spaces');
    const row = { code, type: b.type, value: 0, active: b.active, expires_on: b.expires_on || null, min_order: b.min_order ?? 0, max_uses: b.max_uses ?? null };
    if (b.type !== 'free_delivery') {
      if (!Number.isInteger(b.value) || b.value <= 0) throw new Error('Enter a whole number above 0 for the discount');
      if (b.type === 'percent' && b.value > 100) throw new Error('A percentage can’t be more than 100');
      row.value = b.value;
    }
    if (!Number.isInteger(row.min_order) || row.min_order < 0) throw new Error('Minimum order must be a whole number, 0 or more');
    if (row.max_uses !== null && (!Number.isInteger(row.max_uses) || row.max_uses <= 0)) throw new Error('Usage limit must be a whole number above 0');
    return row;
  }
  async function saveDiscount(id, body) {
    const row = cleanDiscount(body);
    const { error } = id ? await sb.from('discount_codes').update(row).eq('id', id) : await sb.from('discount_codes').insert(row);
    if (error?.code === '23505') throw new Error('That code already exists');
    check(error);
  }
  async function setDiscountActive(id, active) {
    const { error } = await sb.from('discount_codes').update({ active }).eq('id', id);
    check(error);
  }
  async function deleteDiscount(id) {
    const { error } = await sb.from('discount_codes').delete().eq('id', id);
    check(error);
  }

  return {
    discounts, saveDiscount, setDiscountActive, deleteDiscount,
    setUnauthorizedHandler: fn => { onUnauthorized = fn; },
    signIn, signOut, hasAdminSession,
    analytics: () => rpc('admin_analytics'),
    marketing: days => rpc('admin_marketing', { p_days: days }),
    popups: () => rpc('admin_list_popups'),
    savePopup: p => rpc('admin_save_popup', { p }),
    setPopupActive: (id, active) => rpc('admin_set_popup_active', { p_id: id, p_active: active }),
    deletePopup: async id => {
      const { error } = await sb.from('popups').delete().eq('id', id);
      check(error);
    },
    customersExport: () => rpc('admin_customers_export'),
    subscribersExport: () => rpc('admin_subscribers_export'),
    orders: ({ q = '', status = '', page = 1 } = {}) => rpc('admin_list_orders', { p_q: q, p_status: status, p_page: page }),
    order: id => rpc('admin_get_order', { p_id: id }),
    setOrderStatus: (id, status) => rpc('admin_set_order_status', { p_id: id, p_status: status }),
    customers: ({ q = '', sort = 'recent', page = 1 } = {}) => rpc('admin_list_customers', { p_q: q, p_sort: sort, p_page: page }),
    customer: id => rpc('admin_get_customer', { p_id: id }),
    products: () => rpc('admin_list_products'),
    saveProduct, deleteProduct, upload,
    importSheet: rows => rpc('admin_import_sheet', { p_rows: rows }),
    theme: async () => {
      const { data, error } = await sb.from('store_settings').select('theme').single();
      check(error);
      return data.theme;
    },
    setTheme: theme => rpc('admin_set_theme', { p_theme: theme }),
    hero: async () => {
      const { data, error } = await sb.from('store_settings').select('hero').single();
      check(error);
      return data.hero;
    },
    setHero: hero => rpc('admin_set_hero', { p_hero: hero }),
    brandLogos: async () => {
      const { data, error } = await sb.from('brand_logos').select('brand, logo');
      check(error);
      return data;
    },
    setBrandLogo: async (brand, logo) => {
      const { error } = await sb.from('brand_logos').upsert({ brand, logo, updated_at: new Date().toISOString() });
      check(error);
    },
    removeBrandLogo: async brand => {
      const { error } = await sb.from('brand_logos').delete().eq('brand', brand);
      check(error);
    },
    liveTheme: () => rpc('current_theme'),
    themeSchedules: async () => {
      const { data, error } = await sb.from('theme_schedule').select('*').order('starts_at', { ascending: false });
      check(error);
      return data;
    },
    addThemeSchedule: (theme, starts, ends) => rpc('admin_add_theme_schedule', { p_theme: theme, p_starts: starts, p_ends: ends }),
    deleteThemeSchedule: async id => {
      const { error } = await sb.from('theme_schedule').delete().eq('id', id);
      check(error);
    },
    notifications, markRead, listen,
  };
})();
