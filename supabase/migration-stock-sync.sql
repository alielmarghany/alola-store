-- Automatic stock sync from the shop PC (stock-sync/ in this repo).
-- Run once in the Supabase SQL editor on a store set up before this change.

begin;

-- The shop PC's automatic stock sync: one row. See sync_stock.
create table stock_sync (
  id integer primary key default 1 check (id = 1),
  key_hash text,
  key_made_at timestamptz,
  last_at timestamptz,
  last_rows integer,
  last_matched integer,
  last_updated integer
);
insert into stock_sync default values;

alter table stock_sync enable row level security; -- no policies: functions only
revoke all on stock_sync from anon, authenticated;

drop function admin_import_sheet(jsonb);

-- Updates prices and stock from the shop's own item sheet, matching rows by product code.
-- Each row is {code, price, stock}; a missing price or stock leaves that value as it is.
-- Prices are rounded to whole pounds. Returns how many products changed and how many codes matched.
-- Not callable directly: admin_import_sheet and sync_stock check who is calling first.
create function import_item_rows(p_rows jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_updated integer;
  v_matched integer;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'The sheet has no rows'; end if;
  if jsonb_array_length(p_rows) > 20000 then raise exception 'The sheet is too large (20,000 rows at most)'; end if;
  with s as (
    select distinct on (btrim(code)) btrim(code) code, price, stock
    from jsonb_to_recordset(p_rows) as x(code text, price numeric, stock numeric)
    where nullif(btrim(code), '') is not null
    order by btrim(code)
  ), n as (
    select p.id,
      coalesce(case when s.price >= 1 and s.price <= 1000000 then round(s.price)::integer end, p.price) np,
      coalesce(case when s.stock is not null and s.stock <= 1000000 then greatest(floor(s.stock), 0)::integer end, p.stock) ns
    from products p join s on s.code = p.code
  ), upd as (
    update products p set price = n.np, stock = n.ns,
      compare_at = case when p.compare_at > n.np then p.compare_at end -- a sale price that is no longer below the original is dropped
    from n where p.id = n.id and (p.price <> n.np or p.stock <> n.ns)
    returning p.id
  )
  select (select count(*) from upd), (select count(*) from n) into v_updated, v_matched;
  return jsonb_build_object('updated', v_updated, 'matched', v_matched);
end $$;

create function admin_import_sheet(p_rows jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform require_admin();
  return import_item_rows(p_rows);
end $$;

-- ---------------------------------------------------------------- automatic stock sync from the shop PC
-- The Alola Stock Sync program on the shop PC exports stock from E-Stock and sends it here every 30 minutes.
-- It holds a sync key instead of an admin login: the key can only update stock, nothing else.
-- Only a hash of the key is kept; the key itself is shown once, when it is made.
create function sync_key_hash(p_key text) returns text language sql immutable set search_path = public as
$$ select encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex') $$;

create function admin_new_sync_key() returns text language plpgsql security definer set search_path = public as $$
declare
  v_key text := 'alola_sync_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  perform require_admin();
  update stock_sync set key_hash = sync_key_hash(v_key), key_made_at = now() where id = 1;
  return v_key;
end $$;

create function admin_stop_sync() returns void language plpgsql security definer set search_path = public as $$
begin
  perform require_admin();
  update stock_sync set key_hash = null where id = 1;
end $$;

create function admin_sync_status() returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform require_admin();
  return (select jsonb_build_object('on', key_hash is not null, 'key_made_at', key_made_at, 'last_at', last_at,
    'last_rows', last_rows, 'last_matched', last_matched, 'last_updated', last_updated) from stock_sync where id = 1);
end $$;

-- Called by the shop PC with its key. Rows are {code, stock}: prices are never changed this way.
create function sync_stock(p_key text, p_rows jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ok boolean;
  v_result jsonb;
begin
  select key_hash is not null and key_hash = sync_key_hash(p_key) into v_ok from stock_sync where id = 1 for update;
  if not coalesce(v_ok, false) then raise exception 'This sync key is not valid. Make a new one in the dashboard: Products > Update from sheet.' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'The sheet has no rows'; end if;
  v_result := import_item_rows((select coalesce(jsonb_agg(jsonb_build_object('code', r->>'code', 'stock', r->'stock')), '[]') from jsonb_array_elements(p_rows) r));
  update stock_sync set last_at = now(), last_rows = jsonb_array_length(p_rows),
    last_matched = (v_result->>'matched')::integer, last_updated = (v_result->>'updated')::integer where id = 1;
  return v_result;
end $$;

revoke all on function import_item_rows(jsonb), sync_key_hash(text), admin_import_sheet(jsonb), admin_new_sync_key(), admin_stop_sync(),
  admin_sync_status(), sync_stock(text, jsonb) from public, anon, authenticated;
grant execute on function admin_import_sheet(jsonb), admin_new_sync_key(), admin_stop_sync(), admin_sync_status() to authenticated;
grant execute on function sync_stock(text, jsonb) to anon, authenticated;

commit;
