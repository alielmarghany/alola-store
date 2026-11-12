-- Pop-up sign-up tracking. Run once in the Supabase SQL editor (already included in schema.sql).
begin;

alter table subscribers add column popup_id bigint references popups(id) on delete set null,
  add column from_popup boolean not null default false;

drop function subscribe(text);

create function subscribe(p_email text, p_popup bigint default null) returns void language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(left(btrim(coalesce(p_email, '')), 120));
  v_popup bigint;
begin
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'Please enter a valid email'; end if;
  if p_popup is not null then select id into v_popup from popups where id = p_popup; end if;
  insert into subscribers (email, popup_id, from_popup) values (v_email, v_popup, v_popup is not null) on conflict do nothing;
end $$;

create function admin_subscribers_export() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('email', s.email, 'created_at', s.created_at,
      'source', case when s.from_popup then 'Pop-up' else 'Website form' end, 'popup', coalesce(p.title, case when s.from_popup then 'Deleted pop-up' end))
    order by s.created_at desc) from subscribers s left join popups p on p.id = s.popup_id), '[]');
end $$;

create or replace function admin_marketing(p_days integer default 30) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_from timestamptz := ((v_today - (v_days - 1))::timestamp at time zone 'Africa/Cairo');
  v_to timestamptz := ((v_today + 1)::timestamp at time zone 'Africa/Cairo');
  v_prev timestamptz := v_from - make_interval(days => v_days);
begin
  perform require_admin();
  return jsonb_build_object(
    'days', v_days, 'from', v_from, 'to', v_to,
    'trackingSince', (select min(at) from events),
    'current', marketing_kpis(v_from, v_to),
    'previous', marketing_kpis(v_prev, v_from),
    'daily', (select jsonb_agg(jsonb_build_object('key', to_char(d, 'YYYY-MM-DD'),
        'visitors', (select count(distinct visitor) from events where (at at time zone 'Africa/Cairo')::date = d::date),
        'orders', (select count(*) from orders where status <> 'cancelled' and local_day = d::date),
        'revenue', (select coalesce(sum(total), 0) from orders where status <> 'cancelled' and local_day = d::date)) order by d)
      from generate_series(v_today - (v_days - 1), v_today, interval '1 day') d),
    'channels', coalesce((select jsonb_agg(x order by x.sessions desc) from (
        select channel name, count(*) sessions, count(distinct visitor) visitors, sum(orders) orders, sum(revenue) revenue
        from session_rows(v_from, v_to) group by channel) x), '[]'),
    'campaigns', coalesce((select jsonb_agg(x order by x.sessions desc) from (
        select campaign name, min(channel) channel, count(*) sessions, sum(orders) orders, sum(revenue) revenue
        from session_rows(v_from, v_to) where campaign <> '' group by campaign order by count(*) desc limit 20) x), '[]'),
    'devices', coalesce((select jsonb_agg(x order by x.sessions desc) from (
        select device name, count(*) sessions, sum(orders) orders, sum(revenue) revenue from session_rows(v_from, v_to) group by device) x), '[]'),
    'languages', coalesce((select jsonb_agg(x order by x.sessions desc) from (
        select case lang when 'ar' then 'Arabic' else 'English' end name, count(*) sessions, sum(orders) orders, sum(revenue) revenue
        from session_rows(v_from, v_to) group by lang) x), '[]'),
    'funnel', (select jsonb_build_array(
        jsonb_build_object('step', 'Visited the store', 'n', count(*)),
        jsonb_build_object('step', 'Viewed a product', 'n', count(*) filter (where viewed)),
        jsonb_build_object('step', 'Added to cart', 'n', count(*) filter (where carted)),
        jsonb_build_object('step', 'Started checkout', 'n', count(*) filter (where checked_out)),
        jsonb_build_object('step', 'Ordered', 'n', count(*) filter (where purchased)))
      from session_rows(v_from, v_to)),
    'products', coalesce((select jsonb_agg(x order by x.views desc, x.sold desc) from (
        select p.id, p.name, p.brand, p.code,
          (select count(*) from events e where e.type = 'product_view' and e.product_id = p.id and e.at >= v_from and e.at < v_to) views,
          (select coalesce(sum(coalesce(e.qty, 1)), 0) from events e where e.type = 'add_to_cart' and e.product_id = p.id and e.at >= v_from and e.at < v_to) carts,
          (select coalesce(sum(i.qty), 0) from order_items i join orders o on o.id = i.order_id
            where i.product_id = p.id and o.status <> 'cancelled' and o.created_at >= v_from and o.created_at < v_to) sold,
          (select coalesce(sum(i.qty * i.price), 0) from order_items i join orders o on o.id = i.order_id
            where i.product_id = p.id and o.status <> 'cancelled' and o.created_at >= v_from and o.created_at < v_to) revenue
        from products p) x where x.views + x.carts + x.sold > 0), '[]'),
    'searches', coalesce((select jsonb_agg(x order by x.n desc) from (
        select query, count(*) n, min(results) min_results, max(results) max_results from events
        where type = 'search' and query is not null and at >= v_from and at < v_to group by query order by count(*) desc limit 25) x), '[]'),
    'cities', coalesce((select jsonb_agg(x order by x.revenue desc) from (
        select city name, count(*) orders, sum(total) revenue, count(distinct customer_id) customers from orders
        where status <> 'cancelled' and created_at >= v_from and created_at < v_to group by city) x), '[]'),
    'customers', (with c as (
        select o.customer_id, count(*) n, sum(o.total) spent,
          exists (select 1 from orders e where e.customer_id = o.customer_id and e.status <> 'cancelled' and e.created_at < v_from) is_returning
        from orders o where o.status <> 'cancelled' and o.created_at >= v_from and o.created_at < v_to group by o.customer_id)
      select jsonb_build_object(
        'buyers', (select count(*) from c),
        'new', (select count(*) from c where not is_returning),
        'returning', (select count(*) from c where is_returning),
        'repeatRateAllTime', (select case when count(*) > 0 then round(100.0 * count(*) filter (where n > 1) / count(*), 1) else 0 end
          from (select customer_id, count(*) n from orders where status <> 'cancelled' group by customer_id) a),
        'top', coalesce((select jsonb_agg(x order by x.spent desc) from (
          select cu.id, cu.name, cu.city, c.n orders, c.spent from c join customers cu on cu.id = c.customer_id order by c.spent desc limit 10) x), '[]'))),
    'heatOrders', (select jsonb_agg(coalesce(n, 0) order by k) from generate_series(0, 167) k left join (
        select (extract(isodow from created_at at time zone 'Africa/Cairo')::int - 1) * 24 + extract(hour from created_at at time zone 'Africa/Cairo')::int k2, count(*) n
        from orders where status <> 'cancelled' and created_at >= v_from and created_at < v_to group by 1) h on h.k2 = k),
    'heatVisits', (select jsonb_agg(coalesce(n, 0) order by k) from generate_series(0, 167) k left join (
        select (extract(isodow from started at time zone 'Africa/Cairo')::int - 1) * 24 + extract(hour from started at time zone 'Africa/Cairo')::int k2, count(*) n
        from session_rows(v_from, v_to) group by 1) h on h.k2 = k),
    'discounts', coalesce((select jsonb_agg(x order by x.orders desc) from (
        select discount_code code, count(*) orders, sum(total) revenue, sum(discount) discount from orders
        where status <> 'cancelled' and discount_code is not null and created_at >= v_from and created_at < v_to group by discount_code) x), '[]'),
    -- Orders: purchases in a visit where the pop-up was clicked (or signed up to) before buying.
    'popups', coalesce((select jsonb_agg(x order by x.views desc, x.signups desc) from (
        select p.id, p.title, p.kind, p.active,
          (select count(*) from events e where e.popup_id = p.id and e.type = 'popup_view' and e.at >= v_from and e.at < v_to) views,
          (select count(*) from events e where e.popup_id = p.id and e.type = 'popup_click' and e.at >= v_from and e.at < v_to) clicks,
          (select count(*) from subscribers s where s.popup_id = p.id and s.created_at >= v_from and s.created_at < v_to) signups,
          b.orders, b.revenue
        from popups p cross join lateral (
          select count(*) orders, coalesce(sum(e.value), 0) revenue from events e
          where e.type = 'purchase' and e.at >= v_from and e.at < v_to
            and exists (select 1 from events c where c.session = e.session and c.popup_id = p.id and c.type = 'popup_click' and c.at <= e.at)) b) x
      where x.views + x.clicks + x.signups > 0), '[]'),
    'signups', jsonb_build_object(
      'total', (select count(*) from subscribers where created_at >= v_from and created_at < v_to),
      'fromPopups', (select count(*) from subscribers where from_popup and created_at >= v_from and created_at < v_to),
      'previousTotal', (select count(*) from subscribers where created_at >= v_prev and created_at < v_from),
      'previousFromPopups', (select count(*) from subscribers where from_popup and created_at >= v_prev and created_at < v_from),
      'allTime', (select count(*) from subscribers),
      'recent', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select s.email, s.created_at, p.title popup from subscribers s left join popups p on p.id = s.popup_id
        where s.from_popup order by s.created_at desc limit 8) x), '[]'))
  );
end $$;

create or replace function admin_list_popups() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object(
      'views', (select count(*) from events e where e.popup_id = p.id and e.type = 'popup_view' and e.at > now() - interval '30 days'),
      'clicks', (select count(*) from events e where e.popup_id = p.id and e.type = 'popup_click' and e.at > now() - interval '30 days'),
      'signups', (select count(*) from subscribers s where s.popup_id = p.id and s.created_at > now() - interval '30 days'),
      'live', p.active and (p.starts_at is null or p.starts_at <= now()) and (p.ends_at is null or p.ends_at > now()))
    order by p.priority desc, p.id desc) from popups p), '[]');
end $$;

revoke all on function subscribe(text, bigint), admin_subscribers_export() from public, anon, authenticated;

grant execute on function subscribe(text, bigint) to anon, authenticated;

grant execute on function admin_subscribers_export() to authenticated;

commit;
