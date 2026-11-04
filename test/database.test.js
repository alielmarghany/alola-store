'use strict';
// Runs the real schema and seed in an in-memory Postgres, with Supabase's auth and storage stubbed,
// and checks store logic and access rules as each kind of visitor.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const ADMIN = '11111111-1111-1111-1111-111111111111';
const STRANGER = '22222222-2222-2222-2222-222222222222';
const sql = f => fs.readFileSync(path.join(__dirname, '..', 'supabase', f), 'utf8');
const SHOPPER_A = '33333333-3333-3333-3333-333333333333';
const SHOPPER_B = '44444444-4444-4444-4444-444444444444';
let db;

/** Runs a query as anon (no uid) or as a signed-in user, the way PostgREST would. */
async function as(role, uid, text, params = []) {
  await db.exec(`set role ${role}; select set_config('test.uid', '${uid || ''}', false);`);
  try { return (await db.query(text, params)).rows; }
  finally { await db.exec('reset role;'); }
}
const anon = (t, p) => as('anon', null, t, p);
const admin = (t, p) => as('authenticated', ADMIN, t, p);
const stranger = (t, p) => as('authenticated', STRANGER, t, p);
const one = async p => (await p)[0];
const buyer = { name: 'Test Buyer', phone: '01000000000', email: 'buyer@test.local', city: 'Cairo', address: '1 Test Street, Apt 2' };
const order = payload => one(anon('select place_order($1::jsonb) r', [JSON.stringify({ ...buyer, ...payload })])).then(x => x.r);

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    -- Supabase's default: new tables and functions are open unless schema.sql locks them down.
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (bucket_id text, name text);
    alter table storage.objects enable row level security;
    create publication supabase_realtime;
  `);
  await db.exec(sql('schema.sql'));
  await db.exec(sql('seed.sql'));
  await db.query('insert into admins values ($1)', [ADMIN]);
  await db.query("insert into auth.users values ($1,'shopper.a@test.local'),($2,'shopper.b@test.local')", [SHOPPER_A, SHOPPER_B]);
});

test('shoppers see the 8 live products', async () => {
  assert.equal((await anon('select id from products')).length, 8);
  assert.equal((await one(anon('select shipping_fee, free_shipping_over from store_settings'))).shipping_fee, 60);
});

test('anonymous visitors cannot touch private data or call admin functions', async () => {
  for (const t of ['customers', 'orders', 'order_items', 'notifications', 'subscribers', 'admins', 'order_attempts']) {
    await assert.rejects(anon(`select * from ${t}`), /permission denied/, t);
  }
  await assert.rejects(anon("insert into products (name,brand,category,price) values ('Fake','Fake','Hair',1)"), /permission denied/);
  await assert.rejects(anon('update products set price = 1'), /permission denied/);
  await assert.rejects(anon('delete from products'), /permission denied/);
  for (const f of ['admin_analytics()', 'admin_list_orders()', 'admin_list_customers()', 'admin_list_products()', 'admin_get_order(1)', "admin_set_order_status(1,'cancelled')", 'admin_get_customer(1)']) {
    await assert.rejects(anon(`select ${f}`), /permission denied/, f);
  }
  for (const f of ['require_admin()', 'order_number(1)', 'like_pattern(\'x\')']) {
    await assert.rejects(anon(`select ${f}`), /permission denied/, f);
  }
});

test('a signed-in non-admin gets no admin access', async () => {
  for (const t of ['customers', 'orders', 'admins']) await assert.rejects(stranger(`select * from ${t}`), /permission denied/, t);
  assert.equal((await stranger('select * from notifications')).length, 0);
  await assert.rejects(stranger('select admin_analytics()'), /Not authorised/);
  await assert.rejects(stranger('select admin_list_customers()'), /Not authorised/);
  await assert.rejects(stranger("insert into products (name,brand,category,price) values ('Fake','Fake','Hair',1)"), /row-level security/);
  assert.equal((await stranger('update products set price = 1 returning id')).length, 0);
  assert.equal((await stranger('delete from products returning id')).length, 0);
  await assert.rejects(stranger("insert into storage.objects (bucket_id,name) values ('product-images','x.png')"), /permission denied|row-level security/);
});

test('an order uses database prices, reduces stock, and creates client and notification', async () => {
  const before = await one(anon('select * from products order by id limit 1'));
  const r = await order({ items: [{ id: Number(before.id), qty: 2, price: 1 }] });
  assert.equal(r.subtotal, before.price * 2);
  assert.equal(r.shipping, 0); // 1440 is over the free delivery limit
  assert.equal(r.total, r.subtotal);
  assert.equal((await one(anon('select stock from products where id=$1', [before.id]))).stock, before.stock - 2);

  const n = await one(admin('select * from notifications order by id desc limit 1'));
  assert.equal(n.title, `New order ${r.number}`);
  assert.equal(n.read, false);
  assert.match(n.body, /Test Buyer · 2 items · 1,440 EGP/);

  const list = (await one(admin("select admin_list_customers('buyer@test.local') r"))).r;
  assert.equal(list.total, 1);
  assert.equal(list.rows[0].order_count, 1);
  const customer = (await one(admin('select admin_get_customer($1) r', [list.rows[0].id]))).r;
  assert.equal(customer.orders[0].number, r.number);
});

test('small orders pay delivery; repeat clients are not duplicated', async () => {
  const cheap = await one(anon('select * from products order by price limit 1'));
  const r = await order({ name: 'Renamed Buyer', items: [{ id: Number(cheap.id), qty: 1 }] });
  assert.equal(r.shipping, 60);
  const list = (await one(admin("select admin_list_customers('buyer@test.local') r"))).r;
  assert.equal(list.total, 1);
  assert.equal(list.rows[0].name, 'Renamed Buyer');
});

test('bad orders are refused and change nothing', async () => {
  const p = await one(anon('select * from products order by id limit 1'));
  const item = [{ id: Number(p.id), qty: 1 }];
  await assert.rejects(order({ phone: 'abc', items: item }), e => e.message === 'Please check your details' && !!JSON.parse(e.detail).phone);
  await assert.rejects(order({ items: [] }), /cart is empty/);
  await assert.rejects(order({ items: 'nope' }), /cart is empty/);
  await assert.rejects(order({ items: [{ id: Number(p.id), qty: -5 }] }), /Invalid item/);
  await assert.rejects(order({ items: [{ id: Number(p.id), qty: 0 }] }), /Invalid item/);
  await assert.rejects(order({ items: [{ id: "1; drop table products", qty: 1 }] }), /Invalid item/);
  await assert.rejects(order({ items: [{ id: 99999, qty: 1 }] }), /no longer available/);
  await assert.rejects(order({ items: [{ id: Number(p.id), qty: 99 }] }), /Only \d+ left/);
  assert.equal((await one(anon('select stock from products where id=$1', [p.id]))).stock, p.stock);
});

test('cancelling restores stock and revenue; reopening takes them again', async () => {
  const p = await one(anon('select * from products where art=\'pump\''));
  const rev = async () => (await one(admin('select admin_analytics() r'))).r.today.revenue;
  const r0 = await rev();
  const placed = await order({ items: [{ id: Number(p.id), qty: 1 }] });
  const id = Number(placed.number.replace('ALO-', '')) - 10000;
  assert.equal(await rev(), r0 + placed.total);
  await admin("select admin_set_order_status($1,'cancelled')", [id]);
  assert.equal((await one(anon('select stock from products where id=$1', [p.id]))).stock, p.stock);
  assert.equal(await rev(), r0);
  await admin("select admin_set_order_status($1,'pending')", [id]);
  assert.equal((await one(anon('select stock from products where id=$1', [p.id]))).stock, p.stock - 1);
});

test('analytics has full series and the expected shape', async () => {
  const a = (await one(admin('select admin_analytics() r'))).r;
  assert.equal(a.daily.length, 90);
  assert.equal(a.monthly.length, 12);
  assert.ok(a.clients.total > 50);
  assert.ok(a.monthly.reduce((s, m) => s + m.revenue, 0) > 0);
  assert.deepEqual(Object.keys(a.statusCounts).sort(), ['cancelled', 'confirmed', 'delivered', 'pending', 'shipped']);
  assert.ok(a.topProducts.length > 0 && a.topProducts.length <= 5);
  assert.ok(a.recentOrders[0].number.startsWith('ALO-'));
});

test('order search finds by number, name and phone, and treats wildcards literally', async () => {
  const r = (await one(admin("select admin_list_orders('', '', 1) r"))).r;
  assert.equal(r.rows.length, 20);
  const first = r.rows[0];
  assert.equal((await one(admin('select admin_list_orders($1) r', [first.number]))).r.rows[0].id, first.id);
  assert.ok((await one(admin("select admin_list_orders('renamed') r"))).r.total >= 1);
  assert.equal((await one(admin("select admin_list_orders('%') r"))).r.total, 0);
  assert.ok((await one(admin("select admin_list_orders('', 'pending') r"))).r.rows.every(o => o.status === 'pending'));
  assert.equal((await one(admin("select admin_list_orders('', '', 2) r"))).r.page, 2);
});

test('customers can be sorted', async () => {
  for (const s of ['recent', 'spent', 'orders', 'name']) assert.equal((await one(admin("select admin_list_customers('', $1) r", [s]))).r.rows.length, 20);
  const rows = (await one(admin("select admin_list_customers('', 'spent') r"))).r.rows;
  assert.ok(rows[0].total_spent >= rows[1].total_spent);
});

test('admins manage products; hidden ones leave the store; orders survive deletion', async () => {
  const made = await one(admin("insert into products (name,brand,category,price,stock) values ('Test Balm','Alola','Skincare',100,5) returning *"));
  assert.equal((await anon('select id from products where id=$1', [made.id])).length, 1);
  await admin('update products set active=false where id=$1', [made.id]);
  assert.equal((await anon('select id from products where id=$1', [made.id])).length, 0);
  await assert.rejects(order({ items: [{ id: Number(made.id), qty: 1 }] }), /no longer available/);
  await assert.rejects(admin('update products set price=-1 where id=$1', [made.id]), /check constraint/);
  await assert.rejects(admin('update products set compare_at=50 where id=$1', [made.id]), /compare_above_price/);
  await admin('update products set active=true where id=$1', [made.id]);
  const placed = await order({ items: [{ id: Number(made.id), qty: 1 }] });
  assert.equal((await admin('delete from products where id=$1 returning id', [made.id])).length, 1);
  const id = Number(placed.number.replace('ALO-', '')) - 10000;
  const o = (await one(admin('select admin_get_order($1) r', [id]))).r;
  assert.equal(o.items[0].name, 'Test Balm');
  assert.equal(o.items[0].product_id, null);
});

test('notifications can be marked read by admins', async () => {
  await admin('update notifications set read=true where not read');
  assert.equal((await admin('select id from notifications where not read')).length, 0);
});

test('newsletter stores valid emails only', async () => {
  await anon("select subscribe('Glow@Test.local')");
  await anon("select subscribe('glow@test.local')");
  assert.equal((await db.query('select * from subscribers')).rows.length, 1);
  await assert.rejects(anon("select subscribe('nope')"), /valid email/);
});

test('order flood is limited per visitor', async () => {
  const p = await one(anon("select * from products where art='lipstick'"));
  await db.query('delete from order_attempts');
  for (let i = 0; i < 20; i++) await order({ items: [{ id: Number(p.id), qty: 1 }] });
  await assert.rejects(order({ items: [{ id: Number(p.id), qty: 1 }] }), /Too many orders/);
});

test('logged-in orders are saved to the account, use its email, and save details on request', async () => {
  await db.query('delete from order_attempts');
  const a = (t, p) => as('authenticated', SHOPPER_A, t, p);
  const p = await one(anon("select * from products where art='jar'"));
  const payload = { ...buyer, email: 'someone.else@test.local', save: true, items: [{ id: Number(p.id), qty: 1 }] };
  const r = (await one(a('select place_order($1::jsonb) r', [JSON.stringify(payload)]))).r;
  const mine = (await one(a('select my_orders() r'))).r;
  assert.equal(mine.length, 1);
  assert.equal(mine[0].number, r.number);
  assert.equal(mine[0].items[0].name, p.name);
  assert.equal((await db.query('select email from orders where id=$1', [Number(r.number.replace('ALO-', '')) - 10000])).rows[0].email, 'shopper.a@test.local');
  const saved = await one(a('select * from customer_profiles'));
  assert.equal(saved.address, buyer.address);

  // Without "save", saved details stay as they were.
  await a('select place_order($1::jsonb) r', [JSON.stringify({ ...payload, address: 'Another Address 22', save: false })]);
  assert.equal((await one(a('select address from customer_profiles'))).address, buyer.address);
  assert.equal((await one(a('select my_orders() r'))).r.length, 2);
});

test('customers can only reach their own details and orders', async () => {
  const b = (t, p) => as('authenticated', SHOPPER_B, t, p);
  assert.equal((await one(b('select my_orders() r'))).r.length, 0);
  assert.equal((await b('select * from customer_profiles')).length, 0);
  assert.equal((await b('update customer_profiles set address=$1 returning user_id', ['Hacked Street 1'])).length, 0);
  await assert.rejects(b('insert into customer_profiles (user_id,name) values ($1,$2)', [SHOPPER_A, 'Hacked']), /row-level security|duplicate key/);
  await b('insert into customer_profiles (user_id,name) values ($1,$2)', [SHOPPER_B, 'Shopper B']);
  assert.equal((await b('select name from customer_profiles')).length, 1);
  await assert.rejects(b('delete from customer_profiles'), /permission denied/);
  await assert.rejects(anon('select my_orders()'), /permission denied/);
  await assert.rejects(anon('select * from customer_profiles'), /permission denied/);
  await assert.rejects(b('select admin_analytics()'), /Not authorised/);
  await assert.rejects(b('select * from orders'), /permission denied/);
});

test('guest orders are not linked to an account with the same email', async () => {
  await db.query('delete from order_attempts');
  const p = await one(anon("select * from products where art='lipstick'"));
  await order({ email: 'shopper.b@test.local', items: [{ id: Number(p.id), qty: 1 }] });
  assert.equal((await one(as('authenticated', SHOPPER_B, 'select my_orders() r'))).r.length, 0);
});

test('only admins can switch the store theme, and everyone can read it', async () => {
  const read = async () => (await one(anon('select theme from store_settings'))).theme;
  assert.equal(await read(), 'default');
  await assert.rejects(anon("select admin_set_theme('halloween')"), /permission denied/);
  await assert.rejects(stranger("select admin_set_theme('halloween')"), /Not authorised/);
  await assert.rejects(anon("update store_settings set theme='halloween'"), /permission denied/);
  await assert.rejects(stranger("update store_settings set theme='halloween'"), /permission denied/);
  assert.equal(await read(), 'default');
  await admin("select admin_set_theme('halloween')");
  assert.equal(await read(), 'halloween');
  await admin("select admin_set_theme('newyear')");
  assert.equal(await read(), 'newyear');
  await assert.rejects(admin("select admin_set_theme('nope')"), /Unknown theme/);
  await admin("select admin_set_theme('default')");
  assert.equal(await read(), 'default');
});

test('clearing sample data leaves real clients and products', async () => {
  await db.exec(sql('clear-sample-data.sql'));
  assert.equal((await db.query("select * from customers where email like '%@example.com'")).rows.length, 0);
  assert.equal((await db.query("select * from customers where email = 'buyer@test.local'")).rows.length, 1);
  assert.ok((await db.query('select * from products')).rows.length >= 8);
});
