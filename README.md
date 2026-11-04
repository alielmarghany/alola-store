# Alola store

**Live site:** https://alielmarghany.github.io/alola-store/

A cosmetics store and admin dashboard. The site is static files hosted on **GitHub Pages**. Data, admin login, photo storage and live order notifications run on **Supabase**.

## What's included

**Store:** landing page, all-products page with search and filters, product pages, cart, and cash-on-delivery checkout.

**Dashboard (`/admin/`):**
- Revenue per day and per month, orders, number of clients, top products and low stock
- Orders: search, view details and change status
- Products: add, edit, hide or delete, with photo upload
- Customers: contact details, total spent and order history
- Live new-order alerts: bell counter, pop-up, sound, tab title count and optional desktop alerts

## How it fits together

```
Shopper's browser ──> GitHub Pages (HTML, CSS, JS)
        │
        └── place order ──> Supabase ──> live notification ──> Dashboard
```

The public key in `public/js/config.js` is safe to publish. Access rules in `supabase/schema.sql` limit shoppers to reading live products, placing orders and joining the newsletter. Prices, stock and totals are checked in the database, not the browser. Client and order data can only be read by accounts listed in the `admins` table.

**Never commit the `service_role` key or a database password.**

## Set up your own copy

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In the **SQL Editor**, run `supabase/schema.sql`.
3. Optional: run `supabase/seed.sql` to add 8 test products and a year of made-up orders and clients. Run `supabase/clear-sample-data.sql` to remove the made-up orders and clients later.
4. Under **Authentication > Users**, add a user with your email and password.
5. Make that user an admin. In the SQL Editor, run this with your email:
   ```sql
   insert into admins (user_id)
   select id from auth.users where email = 'you@example.com';
   ```
6. Under **Authentication > Sign In / Providers**, turn off **Allow new users to sign up**. Sign-ups wouldn't get dashboard access anyway, but there's no reason to allow them.
7. Copy the **Project URL** and **anon public** key into `public/js/config.js`.

### 2. GitHub Pages

1. Push this repo to GitHub. Pages on a free account needs a public repo.
2. Under **Settings > Pages**, set **Source** to **GitHub Actions**.
3. Each push to `main` runs the tests and deploys the `public` folder.

## Run it locally

Needs Node 22 or newer.

```bash
npm install
```

```bash
npm start
```

Then open http://localhost:3000. It uses the Supabase project set in `config.js`, so orders placed locally are real rows in that database.

## Tests

```bash
npm test
```

The tests run the real schema and seed in an in-memory Postgres ([PGlite](https://pglite.dev)) with Supabase's login and storage stubbed. They check order logic and what anonymous visitors, signed-in non-admins and admins can each do.

## Settings

| What | Where |
|---|---|
| Delivery fee and free-delivery threshold | `store_settings` table in Supabase |
| Free-delivery text in the top banner | `mountChrome` in `public/js/common.js` |
| Supabase project | `public/js/config.js` |

## Before going live

- Replace the sample products, ratings and customer reviews with real ones.
- Only keep claims such as "official brands" and "100% authentic" if they're true.
- Add your own terms and privacy pages, since the store collects customer details.
- Free Supabase projects pause after a period of inactivity, and a paused store can't load products or take orders. Use a paid plan for a real store.
- Only cash on delivery is supported. Card payments would need a payment provider.

## Project layout

```
public/            The website GitHub Pages serves
  js/config.js     Supabase project URL and public key
  admin/           Dashboard
  vendor/          Supabase browser library (v2.118.0)
supabase/          Database schema, sample data and cleanup
test/              Database tests
scripts/serve.js   Local development server
```
