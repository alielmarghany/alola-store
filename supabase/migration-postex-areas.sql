-- PostEx delivery areas: checkout picks governorate, then area; delivery follows PostEx's price.

begin;

create table ship_areas (
  id integer primary key,
  name text not null,
  gov_id integer not null,
  gov_name text not null,
  price integer check (price is null or price >= 0),
  updated_at timestamptz not null default now()
);

alter table orders add column area_id integer, add column area text not null default '';

alter table customer_profiles add column area_id integer;

create function shipping_for(p_subtotal integer, p_area integer) returns integer language sql stable set search_path = public as $$
  select case when p_subtotal >= s.free_shipping_over then 0
    else coalesce((select a.price from ship_areas a where a.id = p_area), s.shipping_fee) end
  from store_settings s
$$;

drop function preview_discount(text, jsonb);

create function preview_discount(p_code text, p_items jsonb, p_area integer default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_ip text := md5('code:' || coalesce(split_part(nullif(current_setting('request.headers', true), '')::json->>'x-forwarded-for', ',', 1), 'unknown'));
  v_subtotal integer;
  v_shipping integer;
  v_applied jsonb;
begin
  -- A limit per visitor, so codes can't be guessed by trying thousands of them.
  delete from order_attempts where at < now() - interval '1 minute';
  if (select count(*) from order_attempts where ip_hash = v_ip) >= 30 then
    return jsonb_build_object('error', 'Too many attempts. Please wait a few minutes and try again.');
  end if;
  insert into order_attempts (ip_hash) values (v_ip);

  if jsonb_typeof(p_items) <> 'array' or exists (select 1 from jsonb_array_elements(p_items) i
      where coalesce(i->>'id', '') !~ '^[0-9]{1,15}$' or coalesce(i->>'qty', '') !~ '^[0-9]{1,2}$') then
    return jsonb_build_object('error', 'Invalid item in cart');
  end if;
  select coalesce(sum(p.price * (i->>'qty')::int), 0)::int into v_subtotal
    from jsonb_array_elements(p_items) i join products p on p.id = (i->>'id')::bigint and p.active;
  v_shipping := shipping_for(v_subtotal, p_area);
  v_applied := apply_discount(v_code, v_subtotal, v_shipping, false);
  if v_applied ? 'error' then return v_applied; end if;
  return v_applied || jsonb_build_object('subtotal', v_subtotal,
    'total', v_subtotal - (v_applied->>'discount')::int + (v_applied->>'shipping')::int);
end $$;

create or replace function place_order(payload jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_name text := left(btrim(coalesce(payload->>'name', '')), 80);
  v_phone text := left(btrim(coalesce(payload->>'phone', '')), 20);
  v_email text := lower(left(btrim(coalesce(payload->>'email', '')), 120));
  v_city text := left(btrim(coalesce(payload->>'city', '')), 60);
  v_address text := left(btrim(coalesce(payload->>'address', '')), 300);
  v_notes text := left(btrim(coalesce(payload->>'notes', '')), 500);
  v_fields jsonb := '{}';
  v_ip text;
  v_item jsonb;
  v_line record;
  v_product products;
  v_lines jsonb := '[]';
  v_subtotal integer := 0;
  v_count integer := 0;
  v_shipping integer;
  v_total integer;
  v_customer bigint;
  v_order bigint;
  v_user uuid := auth.uid();
  v_code text := upper(btrim(coalesce(payload->>'code', '')));
  v_applied jsonb;
  v_discount integer := 0;
  v_area_id text := btrim(coalesce(payload->>'area', ''));
  v_area ship_areas;
begin
  -- Logged-in orders always use the account's own email.
  if v_user is not null then select lower(email) into v_email from auth.users where id = v_user; end if;

  -- A simple per-visitor limit, so a script can't flood the store with orders.
  v_ip := md5(coalesce(split_part(nullif(current_setting('request.headers', true), '')::json->>'x-forwarded-for', ',', 1), 'unknown'));
  delete from order_attempts where at < now() - interval '1 minute';
  if (select count(*) from order_attempts where ip_hash = v_ip) >= 20 then
    raise exception 'Too many orders. Please wait a minute and try again.';
  end if;
  insert into order_attempts (ip_hash) values (v_ip);

  if char_length(v_name) < 2 then v_fields := v_fields || '{"name":"Please enter your full name"}'; end if;
  if v_phone !~ '^\+?[0-9][0-9 ()-]{6,18}$' then v_fields := v_fields || '{"phone":"Please enter a valid phone number"}'; end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then v_fields := v_fields || '{"email":"Please enter a valid email"}'; end if;
  -- Once PostEx areas are loaded, the area is required and sets the governorate.
  if exists (select 1 from ship_areas) then
    if v_area_id ~ '^[0-9]{1,9}$' then select * into v_area from ship_areas where id = v_area_id::int; end if;
    if v_area.id is null then v_fields := v_fields || '{"area":"Please choose your area"}';
    else v_city := v_area.gov_name; end if;
  end if;
  if char_length(v_city) < 2 then v_fields := v_fields || '{"city":"Please choose your governorate"}'; end if;
  if char_length(v_address) < 5 then v_fields := v_fields || '{"address":"Please enter your full address"}'; end if;
  if v_fields <> '{}' then raise exception 'Please check your details' using detail = v_fields::text; end if;

  if jsonb_typeof(payload->'items') <> 'array' or jsonb_array_length(payload->'items') not between 1 and 50 then
    raise exception 'Your cart is empty';
  end if;
  for v_item in select value from jsonb_array_elements(payload->'items') loop
    if coalesce(v_item->>'id', '') !~ '^[0-9]{1,15}$' or coalesce(v_item->>'qty', '') !~ '^[0-9]{1,2}$' or (v_item->>'qty')::int < 1 then
      raise exception 'Invalid item in cart';
    end if;
  end loop;

  -- Always the database's prices, never the browser's. Rows are locked so two
  -- customers can't both buy the last unit.
  for v_line in
    select (value->>'id')::bigint as id, sum((value->>'qty')::int)::int as qty
    from jsonb_array_elements(payload->'items') group by 1 order by 1
  loop
    select * into v_product from products where id = v_line.id and active for update;
    if not found then raise exception 'An item in your cart is no longer available'; end if;
    if v_product.stock < v_line.qty then
      if v_product.stock > 0 then raise exception 'Only % left of %', v_product.stock, v_product.name;
      else raise exception '% just sold out', v_product.name; end if;
    end if;
    v_subtotal := v_subtotal + v_product.price * v_line.qty;
    v_count := v_count + v_line.qty;
    v_lines := v_lines || jsonb_build_object('id', v_product.id, 'name', v_product.name, 'brand', v_product.brand, 'price', v_product.price, 'qty', v_line.qty);
    update products set stock = stock - v_line.qty where id = v_line.id;
  end loop;

  v_shipping := shipping_for(v_subtotal, v_area.id);

  -- The code is checked here, with the row locked, so its limit can't be passed by two orders at once.
  if v_code <> '' then
    v_applied := apply_discount(v_code, v_subtotal, v_shipping, true);
    if v_applied ? 'error' then raise exception '%', v_applied->>'error'; end if;
    v_discount := (v_applied->>'discount')::int;
    v_shipping := (v_applied->>'shipping')::int;
    update discount_codes set uses = uses + 1 where code = v_code;
  end if;
  v_total := v_subtotal - v_discount + v_shipping;

  insert into customers (name, email, phone, city, address) values (v_name, v_email, v_phone, v_city, v_address)
  on conflict (email) do update set name = excluded.name, phone = excluded.phone, city = excluded.city, address = excluded.address
  returning id into v_customer;

  insert into orders (customer_id, customer_name, email, phone, city, address, notes, subtotal, shipping, total, user_id, discount, discount_code, area_id, area)
  values (v_customer, v_name, v_email, v_phone, v_city, v_address, v_notes, v_subtotal, v_shipping, v_total, v_user, v_discount, nullif(v_code, ''), v_area.id, coalesce(v_area.name, ''))
  returning id into v_order;

  insert into order_items (order_id, product_id, name, brand, price, qty)
  select v_order, (l->>'id')::bigint, l->>'name', l->>'brand', (l->>'price')::int, (l->>'qty')::int from jsonb_array_elements(v_lines) l;

  -- The dashboard listens for new rows here through Supabase Realtime.
  insert into notifications (type, title, body, order_id)
  values ('order', 'New order ' || order_number(v_order),
    v_name || ' · ' || v_count || case when v_count = 1 then ' item' else ' items' end || ' · ' || to_char(v_total, 'FM999,999,990') || ' EGP', v_order);

  if v_user is not null and payload->>'save' = 'true' then
    insert into customer_profiles (user_id, name, phone, city, address, area_id) values (v_user, v_name, v_phone, v_city, v_address, v_area.id)
    on conflict (user_id) do update set name = excluded.name, phone = excluded.phone, city = excluded.city, address = excluded.address, area_id = excluded.area_id, updated_at = now();
  end if;

  return jsonb_build_object('number', order_number(v_order), 'total', v_total, 'subtotal', v_subtotal, 'shipping', v_shipping, 'discount', v_discount, 'discount_code', nullif(v_code, ''),
    'name', v_name, 'city', v_city, 'area', coalesce(v_area.name, ''), 'items', v_lines);
end $$;

create function admin_set_ship_areas(p_areas jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform require_admin();
  if jsonb_typeof(p_areas) <> 'array' then raise exception 'No areas received from PostEx'; end if;
  if not exists (select 1 from jsonb_array_elements(p_areas) a where a->>'id' ~ '^[0-9]{1,9}$' and coalesce(a->>'gov_id', '') ~ '^[0-9]{1,9}$'
      and btrim(coalesce(a->>'name', '')) <> '' and btrim(coalesce(a->>'gov_name', '')) <> '') then
    raise exception 'No areas received from PostEx';
  end if;
  with n as (
    select distinct on ((a->>'id')::int) (a->>'id')::int id, left(btrim(a->>'name'), 120) name, (a->>'gov_id')::int gov_id, left(btrim(a->>'gov_name'), 60) gov_name,
      case when a->>'price' ~ '^[0-9]{1,6}$' then (a->>'price')::int end price
    from jsonb_array_elements(p_areas) a
    where a->>'id' ~ '^[0-9]{1,9}$' and coalesce(a->>'gov_id', '') ~ '^[0-9]{1,9}$'
      and btrim(coalesce(a->>'name', '')) <> '' and btrim(coalesce(a->>'gov_name', '')) <> ''
    order by (a->>'id')::int
  ), gone as (
    delete from ship_areas where id not in (select id from n) returning id
  )
  insert into ship_areas (id, name, gov_id, gov_name, price, updated_at)
  select id, name, gov_id, gov_name, price, now() from n
  on conflict (id) do update set name = excluded.name, gov_id = excluded.gov_id, gov_name = excluded.gov_name, price = excluded.price, updated_at = now();
  return jsonb_build_object('areas', (select count(*) from ship_areas), 'priced', (select count(*) from ship_areas where price is not null),
    'governorates', (select count(distinct gov_id) from ship_areas));
end $$;

alter table ship_areas enable row level security;

create policy "Delivery areas are public" on ship_areas for select to anon, authenticated using (true);

revoke all on ship_areas from anon, authenticated;

grant select on ship_areas to anon, authenticated;

revoke all on function shipping_for(integer, integer), preview_discount(text, jsonb, integer), admin_set_ship_areas(jsonb) from public, anon, authenticated;

grant execute on function preview_discount(text, jsonb, integer) to anon, authenticated;

grant execute on function admin_set_ship_areas(jsonb) to authenticated;

commit;
