# BlitzKart

BlitzKart is a Next.js storefront and operations console backed by Supabase. The project starts with an empty catalogue and no seeded customers, orders, reviews, stock, promotions, or analytics.

## Requirements

- Node.js 20 or newer
- pnpm
- Supabase project
- Razorpay and/or PayU merchant account for online checkout
- HTTPS for production callbacks and webhooks

## Local setup

1. Install dependencies with `pnpm install`.
2. Run the SQL migrations in order from `supabase/migrations/` using the Supabase SQL editor.
3. Copy `.env.example` to `.env.local` and add Supabase configuration. Keep `SUPABASE_SERVICE_ROLE_KEY` server-side.
4. Set Supabase Auth site and redirect URLs for the local app.
5. Run `pnpm dev`.
6. Register the operator account, then promote it to admin from the Supabase SQL editor:

   ```sql
   insert into public.admin_users (user_id)
   select id from auth.users where email = 'the-admin-email@example.com';
   ```

7. Open `/admin` and configure actual products, category photos, inventory, delivery PIN codes and charges before accepting orders.

Run `pnpm test:delivery` to check both enabled modes, each mode independently, both disabled, a disabled PIN, a stale selection, updated pricing and invalid method settings.

For an existing database that already ran migrations `0001`–`0003`, run migrations `0004` through `0011` in numeric order in the Supabase SQL Editor. Migration `0010_live_admin_dual_delivery_recovery.sql` adds separate Blitz and Standard delivery switches, per-PIN prices and ETAs, order delivery snapshots, default-address selection, and a private admin-only change signal for Realtime updates. Migration `0011_checkout_fee_management.sql` adds server-validated checkout fee settings and immutable fee snapshots on orders. Run every migration in order for a new database. Apply all migrations before deploying code that depends on them.

After applying migration `0010`, open `/admin/pincodes` and configure each verified PIN code. Both delivery modes start disabled. The configured defaults are ₹65 for Blitz Delivery (`Same Day`) and ₹50 for Standard Delivery (`2–4 Days`); confirm real fulfilment before enabling a mode or retaining an ETA. Admin pages listen to Supabase Realtime and also refresh every 30 seconds as a connection fallback.

After applying migration `0011`, open `/admin/checkout-fees` to manage packaging, platform and handling fees. Packaging is preset to ₹5, while all three fees start disabled so no new fee is charged until an administrator enables it. New checkout quotes and order creation read fee settings from Supabase; the order RPC recalculates charges and snapshots the amounts. Changes apply to new orders only. Run `pnpm test:checkout-fees` to check fee switches, configured amounts, discounts, delivery modes and product-specific delivery charges.

For password recovery, add `https://www.blitzkart.store/reset-password` to Supabase Auth → URL Configuration → Redirect URLs, and use the production HTTPS site URL. BlitzKart uses Supabase's native email recovery flow; no custom OTP flow is installed. Header delivery location follows the signed-in customer's saved default address. In `/account/addresses`, use **Make default** to choose which saved PIN is shown.

Production page requests to `https://blitzkart.store` redirect to `https://www.blitzkart.store` so password recovery's PKCE verifier cookie and the Supabase redirect use the same host. API requests are not redirected. Customers should open the latest recovery email link in the same browser they used to request it.

If the homepage catalogue fails after a code deployment, verify the Supabase URL and anon key in Vercel and confirm the migrations are applied. The storefront can still read the legacy product schema while migration `0006` is pending, but product-specific fee management and checkout require that migration. Sales-based home sections also require the server-only service-role key; they stay hidden when that access is unavailable.

## Payment providers

The older standalone UPI gateway integration has been removed. Checkout supports Razorpay Standard Checkout and PayU Hosted Checkout. Configure one or both providers using server-side variables in `.env.local` or Vercel project settings:

```dotenv
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
RAZORPAY_ENVIRONMENT=live

PAYU_KEY=
PAYU_SALT=
PAYU_ENVIRONMENT=live
```

Use `test` mode with test credentials only outside production. Test checkout is rejected in production. Secrets never use the `NEXT_PUBLIC_` prefix.

Register these public HTTPS webhook/callback endpoints with the respective providers:

- Razorpay webhook: `https://YOUR_BLITZKART_HOST/api/payments/razorpay/webhook` (subscribe to `payment.captured` and `order.paid`)
- PayU server notification: `https://YOUR_BLITZKART_HOST/api/payments/payu/webhook`
- PayU success/failure/cancel return URL: `https://YOUR_BLITZKART_HOST/api/payments/payu/return`

Razorpay signatures and captured amounts are checked server-side. PayU response hashes and transaction status are checked server-side before orders become paid. Provider redirects alone never mark an order paid. Register webhook secrets exactly as configured in Vercel and the provider dashboard.

## Admin and fulfilment

Admin routes check the authenticated user's `admin_users` record server-side. Supabase RLS protects personal and operational data. Product and category photos use admin-authorized signed uploads to Supabase Storage. Products support one main photo and up to five gallery photos.

Delivery is in manual mode. Admins can enter provider-issued references and update delivery status; customers can view those updates in order tracking. Migration `0008` imports the 76 assigned Delhi PIN codes from the supplied directory; none of the PINs is automatically serviceable. After applying migration `0010`, open `/admin/pincodes` to enable Blitz or Standard independently and confirm fees, minimums and realistic fulfilment estimates before taking orders. The mode defaults are ₹65 / `Same Day` and ₹50 / `2–4 Days`, and remain disabled until configured by an administrator. The system rejects PIN codes outside the supplied Delhi directory. Optional per-item delivery charges can be set on each product; leave them blank to charge no product-specific fee.

Customers can submit cancellation requests before dispatch, return/exchange requests for delivered orders, support messages, and account deletion requests. Admins can review those requests in `/admin/requests`. Cancellation is blocked once an order is out for delivery. Verified product ratings can be added to paid, delivered purchases. Return/exchange WhatsApp contact links go only to +91 8506006599.

The configured customer support details supplied by the business owner are +91 7678563252, +91 8506006599, and blitzkart2026@gmail.com. Confirm these channels are monitored before launch.

## Environment variables

| Variable | Use | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser Supabase access with RLS | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side checkout, verification, uploads and reporting | Yes |
| `RAZORPAY_KEY_ID` | Razorpay Checkout public key identifier | No |
| `RAZORPAY_KEY_SECRET` | Razorpay API and payment signature verification | Yes |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook verification | Yes |
| `RAZORPAY_ENVIRONMENT` | `live` or `test` | No |
| `PAYU_KEY` | PayU merchant key | Treat as sensitive |
| `PAYU_SALT` | PayU hash and API signing | Yes |
| `PAYU_ENVIRONMENT` | `live` or `test` | No |
| `NEXT_PUBLIC_SITE_URL` | Public HTTPS BlitzKart URL | No |

Never commit `.env.local`, Supabase service-role credentials, Razorpay secrets, PayU salt, or webhook signing secrets.

## Data and launch state

No demo catalogue, customer, order, discount, rating, review or chart is seeded. Product data, metrics and promotions come from real database records. The only imported operational directory data are the 76 PIN/locality records supplied with this task; all are disabled until an administrator confirms them. Review privacy, terms and return policy copy for the operating business before launch. The guest contact form requires migration `0005`; it stores messages in the admin support queue and rate limits submissions using a keyed, non-reversible network identifier.
