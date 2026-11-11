# Alola store

**Live site:** https://alielmarghany.github.io/alola-store/

A cosmetics store and admin dashboard. The site is static files hosted on **GitHub Pages**. Data, admin login, photo storage and live order notifications run on **Supabase**.

## What's included

**Store:** landing page, all-products page with search and filters, product pages, cart, and cash-on-delivery checkout.

**Arabic version:** a language button in the header switches the store between English and Arabic, with a right-to-left layout. First-time visitors get Arabic if their browser is set to it. Translations of site text are in `public/js/i18n.js`, and Arabic product text is edited in the dashboard.

**Customer accounts:** sign up and log in, saved name, phone and delivery address filled in at checkout, order history with status, and password change and reset. Guest checkout still works. No card details are collected or stored.

**Dashboard (`/admin/`):**
- Revenue per day and per month, orders, number of clients, top products and low stock
- Orders: search, view details and change status
- Products: add, edit, hide or delete, with photo upload
- Update from sheet: upload the item sheet exported from the shop's stock system (Excel, CSV or PDF). Products are matched by product code (كود الصنف), and their price (سعر البيع) and stock (الرصيد or الكمية) are updated after you check a preview of every change
- Customers: contact details, total spent and order history
- Live new-order alerts: bell counter, pop-up, sound, tab title count and optional desktop alerts
- Discount codes: a percentage off, an amount off or free delivery, with optional minimum order, usage limit and expiry date
- Home page: edit the three boxes at the top of the home page for offers and ads: text in English and Arabic, buttons and links, a picture (in the drawing's place or filling the box) and a background colour, with a preview before saving
- Themes: switch the live store between the normal look, New Year, Halloween, Ramadan and Eid, straight away or scheduled for set dates

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
3. Run `supabase/products-alola.sql`, then `supabase/products-alola-arabic.sql` and `supabase/products-alola-codes.sql`, to add Alola's 50 products with Arabic names and product codes. Then run `supabase/products-alola-photos.sql` to link their photos, which live in `public/assets/products`. To try the dashboard with made-up data on a test project instead, run `supabase/seed.sql`.
4. Under **Authentication > Users**, add a user with your email and password.
5. Make that user an admin. In the SQL Editor, run this with your email:
   ```sql
   insert into admins (user_id)
   select id from auth.users where email = 'you@example.com';
   ```
6. Leave **Allow new users to sign up** on, since customers need it. New accounts get no dashboard access unless they're added to `admins`.
7. Under **Authentication > URL Configuration**, set **Site URL** to your live site, and add `https://YOUR-USERNAME.github.io/YOUR-REPO/account.html` to **Redirect URLs**. Otherwise links in confirmation and reset emails go to the wrong place.
8. Set up email (see **Customer account emails** below).
9. Copy the **Project URL** and **anon public** key into `public/js/config.js`.

### 2. GitHub Pages

1. Push this repo to GitHub. Pages on a free account needs a public repo.
2. Under **Settings > Pages**, set **Source** to **GitHub Actions**.
3. Each push to `main` runs the tests and deploys the `public` folder.

## Customer account emails

Supabase's built-in email sender only delivers to your own Supabase team members, and only a few per hour. That means customers won't receive sign-up confirmation or password reset emails from it.

- **For testing:** turn off **Confirm email** under **Authentication > Sign In / Providers**. Customers can then sign up and log in straight away, but password reset emails still won't reach them.
- **For launch:** add a mail service such as Resend or Brevo under **Authentication > SMTP Settings**, then turn **Confirm email** back on.

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
| Theme colours and fonts | `public/css/themes.css`, plus the font list in `public/js/theme.js` |

## Before going live

- Set real stock levels: products start at a placeholder of 20 each.
- Replace the customer reviews on the home page with real ones, and add product photos and descriptions.
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
