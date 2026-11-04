-- Sample data: 8 test products and about a year of made-up orders and clients, so the
-- dashboard has something to show. All clients use @example.com addresses.
-- To remove the made-up orders and clients later, run clear-sample-data.sql.

insert into products (name, brand, category, price, compare_at, stock, art, color, tag, featured, rating, rating_count, created_at, description, how_to, ingredients) values
('Niacinamide 10% + Zinc 1% Serum', 'The Ordinary', 'Skincare', 720, null, 34, 'dropper', 'amber', 'Best seller', true, 4.8, 212, now() - interval '30 days',
 'A lightweight daily serum that helps balance oil, refine the look of pores and even out skin tone. Water-based, fast absorbing and easy to layer under moisturiser.',
 'Apply a few drops to clean skin, morning and evening, before heavier creams. Follow with sunscreen during the day.',
 'Aqua, Niacinamide, Pentylene Glycol, Zinc PCA, Tamarindus Indica Seed Gum, Xanthan Gum, Phenoxyethanol'),
('Hydrating Facial Cleanser', 'CeraVe', 'Skincare', 640, 750, 48, 'pump', 'white', 'Sale', true, 4.9, 348, now() - interval '42 days',
 'A creamy, non-foaming cleanser with ceramides and hyaluronic acid. It lifts away the day without leaving normal to dry skin feeling tight.',
 'Massage onto damp skin in circular motions, then rinse with lukewarm water. Use morning and night.',
 'Aqua, Glycerin, Cetearyl Alcohol, Ceramide NP, Ceramide AP, Ceramide EOP, Sodium Hyaluronate, Phenoxyethanol'),
('Capital Soleil SPF 50 Sun Cream', 'Vichy', 'Skincare', 1050, null, 22, 'tube', 'gold', '', true, 4.7, 96, now() - interval '54 days',
 'High, broad-spectrum protection in a silky formula that sinks in fast and sits well under makeup. Made for strong Egyptian sun and everyday wear.',
 'Apply generously as the last step of your morning routine. Reapply every two hours when outdoors.',
 'Aqua, Homosalate, Ethylhexyl Salicylate, Glycerin, Silica, Tocopherol, Parfum'),
('Super Lustrous Crème Lipstick', 'Revlon', 'Makeup', 495, null, 60, 'lipstick', 'rose', '', true, 4.6, 154, now() - interval '66 days',
 'Rich, one-swipe colour in a comfortable crème texture. Vitamin E keeps lips soft while the pigment stays true for hours.',
 'Apply directly from the bullet, starting at the centre of the lips and working outward. Layer for more intensity.',
 'Castor Oil, Mica, Candelilla Wax, Shea Butter, Tocopheryl Acetate, Iron Oxides'),
('Lash Sensational Volume Mascara', 'Maybelline', 'Makeup', 550, 620, 41, 'mascara', 'ink', 'New', true, 4.5, 187, now() - interval '78 days',
 'A fanned brush that reaches every lash, even the tiny ones at the corners. Builds soft, lifted volume with no clumps.',
 'Wiggle the brush from root to tip. Add a second coat before the first dries for extra volume.',
 'Aqua, Beeswax, Paraffin, Glyceryl Stearate, Iron Oxides, Panthenol'),
('Extraordinary Oil Hair Serum', 'L’Oréal', 'Hair', 420, null, 37, 'bottle', 'gold', 'Best seller', true, 4.7, 263, now() - interval '90 days',
 'Six precious flower oils melt into a weightless finish that tames frizz and adds a glossy shine, without a greasy feel.',
 'Warm two pumps between your palms and smooth through mid-lengths and ends, on damp or dry hair.',
 'Cyclopentasiloxane, Dimethiconol, Rosa Canina Seed Oil, Chamomile Oil, Linseed Oil, Parfum'),
('Hair Food Argan Repair Mask', 'Garnier', 'Hair', 310, null, 8, 'jar', 'olive', '', false, 4.4, 71, now() - interval '102 days',
 'A rich, 98% natural-origin mask with argan and shea that brings dry, heat-styled hair back to soft and manageable.',
 'After shampoo, work through damp lengths. Leave for three minutes, then rinse well. Use twice a week.',
 'Aqua, Cetearyl Alcohol, Argania Spinosa Kernel Oil, Butyrospermum Parkii Butter, Citric Acid, Parfum'),
('Olive Blossom Eau de Parfum', 'Alola', 'Fragrance', 1150, null, 15, 'perfume', 'amber', 'New', true, 4.9, 42, now() - interval '114 days',
 'Our house signature. Green olive leaf and neroli over warm amber and soft musk: fresh at first, then close and quietly lasting.',
 'Spray on pulse points from 15 cm away. Avoid contact with eyes.',
 'Alcohol Denat., Parfum, Aqua, Limonene, Linalool, Coumarin');

do $$
declare
  first_names text[] := array['Mona','Nour','Salma','Hana','Yasmin','Dina','Laila','Rana','Farida','Mariam','Aya','Habiba','Malak','Jana','Reem','Sara','Nada','Heba','Ola','Amira'];
  last_names text[] := array['Hassan','Ibrahim','Mostafa','Fahmy','Saad','Khalil','Nasser','Tawfik','Gamal','Sherif','Adel','Zaki','Ramzy','Lotfy','Mansour'];
  cities text[] := array['Cairo','Cairo','Cairo','Giza','Giza','Alexandria','Alexandria','Mansoura','Tanta','Aswan','Luxor','Port Said'];
  streets text[] := array['El Merghany St','Abbas El Akkad St','Road 9','Corniche Rd','Tahrir St','Gamal Abdel Nasser St','Syria St','Makram Ebeid St'];
  prods products[];
  back integer; growth float; n integer; k integer; kinds integer; made integer := 0;
  whn timestamptz; c customers; o_id bigint; p products; pos integer;
  fname text; lname text; line_ids integer[]; line_qty integer[];
  sub integer; ship integer; st text;
begin
  perform setseed(0.42); -- same sample data every time
  select array_agg(x order by x.id) into prods from products x;

  for back in reverse 364..0 loop
    growth := 1 - back / 364.0;
    for n in 1..floor(random() * (1 + growth * 4.2) + growth * 0.8)::int loop
      whn := now() - back * interval '1 day' - random() * (case when back = 0 then 3 else 20 end) * interval '1 hour';

      if made = 0 or random() < 0.32 then
        made := made + 1;
        fname := first_names[1 + floor(random() * 20)::int];
        lname := last_names[1 + floor(random() * 15)::int];
        insert into customers (name, email, phone, city, address, created_at)
        values (fname || ' ' || lname, lower(fname || '.' || lname || made || '@example.com'), '010' || lpad((55500000 + made * 137)::text, 8, '0'),
          cities[1 + floor(random() * 12)::int], (1 + floor(random() * 90)::int) || ' ' || streets[1 + floor(random() * 8)::int] || ', Apt ' || (1 + floor(random() * 30)::int), whn)
        returning * into c;
      else
        select * into c from customers order by id offset floor(random() * made)::int limit 1;
      end if;

      line_ids := '{}'; line_qty := '{}';
      kinds := 1 + floor(random() * random() * 4)::int;
      for k in 1..kinds loop
        pos := 1 + floor(random() * array_length(prods, 1))::int;
        if pos = any(line_ids) then
          line_qty[array_position(line_ids, pos)] := line_qty[array_position(line_ids, pos)] + 1;
        else
          line_ids := line_ids || pos;
          line_qty := line_qty || (case when random() < 0.15 then 2 else 1 end);
        end if;
      end loop;

      sub := 0;
      for k in 1..array_length(line_ids, 1) loop sub := sub + prods[line_ids[k]].price * line_qty[k]; end loop;
      ship := case when sub >= 1000 then 0 else 60 end;

      if back > 6 then st := case when random() < 0.08 then 'cancelled' else 'delivered' end;
      elsif back > 3 then st := (array['shipped','delivered','delivered','confirmed'])[1 + floor(random() * 4)::int];
      else st := (array['pending','pending','confirmed','shipped'])[1 + floor(random() * 4)::int];
      end if;

      insert into orders (customer_id, customer_name, email, phone, city, address, subtotal, shipping, total, status, created_at)
      values (c.id, c.name, c.email, c.phone, c.city, c.address, sub, ship, sub + ship, st, whn) returning id into o_id;

      for k in 1..array_length(line_ids, 1) loop
        p := prods[line_ids[k]];
        insert into order_items (order_id, product_id, name, brand, price, qty) values (o_id, p.id, p.name, p.brand, p.price, line_qty[k]);
      end loop;
    end loop;
  end loop;
end $$;
