# BlitzKart

BlitzKart is a Next.js storefront and operations console backed by Supabase. It starts with an empty catalogue and contains no seeded customers, orders, reviews, stock, promotions, or analytics. The UPI Gateway from the supplied archive is integrated as a separately hosted payment service.

## Requirements

- Node.js 20 or newer
- A Supabase project
- The Laravel UPI Gateway deployed separately for live payments
- HTTPS and a public webhook URL for production

## Local setup

1. Install dependencies with `pnpm install`.
2. Create a Supabase project and run `supabase/migrations/0001_blitzkart.sql` in its SQL editor.
3. Copy `.env.example` to `.env.local` and fill the Supabase URL and anon key. Keep the service-role key server-only.
4. Set the Supabase Auth site URL and allowed redirect URLs for the local app.
5. Start the app with `pnpm dev`.
6. Register the first user. Promote that user to admin from the Supabase SQL editor:

   ```sql
   insert into public.admin_users (user_id)
   select id from auth.users where email = 'the-admin-email@example.com';
   ```

   This is an operator action. The app has no public admin-signup flow.

7. In `/admin`, add categories, products, actual inventory, a delivery zone with the real charge, and any real promotions. Checkout stays unavailable for PIN codes without an active delivery zone.

## UPI Gateway connection

The attached `upi-gateway-main.zip` is a Laravel 12 application, not the BlitzKart storefront. Deploy it as its own PHP 8.2+ application with MySQL and HTTPS. Keep its Laravel project files private and serve only its `public/` directory. Complete its installer, create a merchant account, configure a real payment account and payment verification, then keep its API credentials on the BlitzKart server.

In the UPI Gateway merchant settings:

- Add the BlitzKart HTTPS host to the redirect URL allowlist.
- Set the webhook endpoint to `https://YOUR_BLITZKART_HOST/api/payments/webhook`.
- Copy the API key, API secret and the matching live webhook-signing secret into the BlitzKart server environment.

Set the following server variables in `.env.local` (or the Vercel project environment):

```dotenv
UPI_GATEWAY_URL=https://YOUR_GATEWAY_HOST
UPI_GATEWAY_API_KEY=key_...
UPI_GATEWAY_API_SECRET=sec_...
UPI_GATEWAY_WEBHOOK_SECRET=...
UPI_GATEWAY_ENVIRONMENT=live
NEXT_PUBLIC_SITE_URL=https://YOUR_BLITZKART_HOST
```

The API key and webhook secret are never sent to the browser. The authenticated checkout route calls a service-role-only order function, where prices, stock, delivery zones and coupons are recalculated in PostgreSQL. The customer is redirected to the gateway-hosted payment page; a redirect alone does not confirm payment. BlitzKart marks an order paid only after a signature-verified webhook or a server-to-server gateway status check confirms the order reference, amount and environment. Duplicate/out-of-order webhook events are deduplicated and sequence checked.

For sandbox development, use a separate non-production Supabase project and the gateway's sandbox API key and matching sandbox webhook secret, set `UPI_GATEWAY_ENVIRONMENT=sandbox`, and set `NODE_ENV` to a non-production value. Sandbox orders are labelled as tests and excluded from live revenue and sales analytics. The app rejects sandbox checkout in production.

## Admin and fulfilment

Admin routes check the authenticated user's `admin_users` record server-side; the database enforces row-level policies and protects status/payment fields from client updates. Product inventory, movement records, customer account status, coupons, supplier/sourcing records, order status history, internal notes and delivery history use real database rows.

Manual delivery mode is active. Admins can record a carrier-issued tracking reference and update delivery status from `/admin/deliveries` or an order detail page; customers see those updates in their signed-in tracking page. The provided ZIP contains the payment gateway only, so Shiprocket Quick booking is not represented as connected. Configure real PIN codes and delivery charges under `/admin/settings` before accepting checkout. Paid order cancellation is blocked until a refund workflow is configured, so the app will not imply that a refund occurred.

## Environment variables

| Variable | Where used | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser/server Supabase project URL | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser with RLS | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side checkout, payment reconciliation, image management and sales aggregation | **Yes** |
| `UPI_GATEWAY_URL` | Server-side gateway base URL | No |
| `UPI_GATEWAY_API_KEY` | Server-to-server gateway authentication | **Yes** |
| `UPI_GATEWAY_API_SECRET` | Server-to-server gateway authentication | **Yes** |
| `UPI_GATEWAY_WEBHOOK_SECRET` | Verify gateway webhooks | **Yes** |
| `UPI_GATEWAY_ENVIRONMENT` | `live` or non-production `sandbox` | No |
| `NEXT_PUBLIC_SITE_URL` | HTTPS return URL sent to gateway | No |

Never expose or commit `.env.local`, Supabase service-role credentials, gateway API secrets or webhook signing secrets.

## Data and launch state

There is no fabricated catalogue, business address, contact number, product image, price, delivery charge, order, customer, discount, review or chart. Missing data is shown as an empty state. Product and banner content must be entered by an operator; checkout requires a configured live PIN-code zone and a working Supabase/UPI Gateway deployment. The privacy/terms pages are starter copy and should be reviewed for the operating business before launch. A production payment could not be exercised from this workspace because no live merchant credentials or Supabase project were provided.
