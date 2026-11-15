# BlitzKart development report

## Checkout, account recovery and live operations — 2026-11-15

### Implemented

- Added independently configurable Blitz Delivery and Standard Delivery settings per verified Delhi PIN. Their defaults are ₹65 / `Same Day` and ₹50 / `2–4 Days`; both mode switches remain off until an administrator enables them. PIN-level fees, ETAs, master serviceability, locality aliases and minimum order are editable, searchable, filterable and bulk-toggleable. The verified directory can be exported to CSV and settings can be imported only for PINs already in the verified directory.
- Updated the customer delivery lookup and checkout quote to return only methods enabled for the selected PIN. Checkout requires a method, recalculates the displayed total when it changes, and sends the method ID (never a client price) to order creation. The database RPC and order trigger re-read and lock the current zone, re-check locality, availability, minimum and price, and store method, PIN, location, fee and estimate snapshots on each new order. Existing historical order charges and payment gateway flows remain unchanged.
- Added delivery mode, PIN, fee and ETA to admin order listings/details and customer order tracking. Orders can be filtered by Blitz or Standard delivery.
- Added `admin_live_events`, an admin-readable signal without customer data, with triggers on current business tables. Admin pages subscribe to Supabase Realtime and refresh on change; a 30-second refresh and visibility refresh cover lost Realtime connections. The top bar shows whether the Realtime channel is connected or the fallback is active.
- Added a server-authenticated default-address endpoint, a secure database action for selecting exactly one default address, and header location sync for signed-in customers. A customer's default saved PIN/locality overrides the prior browser-selected location; signed-out sessions clear that account-derived location.
- Added `/forgot-password` using `supabase.auth.resetPasswordForEmail()` with the fixed production reset URL, a generic response that does not disclose whether an email exists, and `/reset-password` that requires Supabase's `PASSWORD_RECOVERY` event/session before calling `supabase.auth.updateUser({ password })`. The user is signed out and sent to login after success. No custom OTP or service-role key was added to browser code.
- Improved desktop and mobile header spacing, location display, checkout's four-step progress and delivery cards, admin PIN controls, and password recovery screens.

### Database, API and configuration

- Added `supabase/migrations/0010_live_admin_dual_delivery_recovery.sql`; it must be applied after migrations 0001–0009. It adds delivery mode settings/snapshots, replaces the PIN lookup and server-only order RPC with method-aware versions, adds the default-address RPC, and installs an admin-only change signal. It conditionally adds that signal table to `supabase_realtime` when the publication exists.
- Updated `/api/delivery-availability`, `/api/checkout/quote`, and `/api/checkout`; added authenticated `/api/account/default-address` and shared server validation in `lib/delivery.ts`.
- Configure Supabase Auth Redirect URLs to include `https://www.blitzkart.store/reset-password`. Apply migration 0010, then explicitly configure a verified PIN's availability, fees and actual ETA before customers can check out.

### Verification and remaining limitations

- `tsc --noEmit`: passed.
- ESLint: passed after removing an unused icon import.
- `node scripts/test-delivery-modes.cjs` (`pnpm test:delivery`): passed for both modes enabled, Blitz-only, Standard-only, neither enabled, inactive PIN, stale mode choice, updated per-PIN price, invalid price and missing estimate.
- Optimized Next.js build: passed and generated all 41 app routes. The default Windows `.next` path hit an environment `EPERM` while creating a generated route directory, so the build was rerun successfully with a temporary output directory; the temporary `next.config.ts` and `tsconfig.json` changes were reverted.
- Live Supabase database, Realtime delivery, recovery-email delivery, and Razorpay/PayU transactions could not be exercised because this workspace has no connected production credentials. Migration 0010 is included but has not been applied to the live database.
- The supplied verified postal data contains 76 assigned PINs; new postal records are intentionally not invented. CSV import updates those verified rows only. Business operators must confirm actual fulfilment availability and ETA before enabling either method.

## 1. Issues found

- Recent Vercel builds failed on missing or incompatible TypeScript symbols in checkout, homepage and category image upload code.
- Checkout had mismatched saved-address types, and the local lint command opened an interactive setup instead of checking the code.
- The production dependency tree included an old Zod release and an older PostCSS nested under Next.js.
- Product images were rendered directly, without Next.js image sizing/optimization. Product-level delivery charges were not included in the order calculation.
- The storefront's catalogue query depended on migration 0006's optional product-fee column, so a code-only deploy against an older Supabase schema could hide otherwise valid products.
- Admin order details queried that optional column directly and did not gracefully handle failed database reads. Date displays also relied on the server's default timezone, which can differ from India.
- The project has no live Supabase credentials in this workspace, so database and payment-provider workflows could not be exercised end to end.

## 2. Issues fixed

- Fixed the reported checkout type, missing homepage icon and category upload symbol issues; retained the guarded Razorpay amount handling and corrected checkout's Supabase extension search path in its migration.
- Added a working ESLint flat configuration and lint script. Lint now completes with zero errors and zero warnings.
- Updated Zod to a patched 4.x release and pinned the PostCSS override to a patched release. The production dependency audit reported zero advisories when run after those production dependency changes.
- Configured Next.js image handling for public Supabase Storage images and converted storefront/admin product and category imagery to `next/image`.
- Admin order details now tolerate optional columns missing from an older schema and show a recovery state instead of throwing when order reads fail.
- Delivery status update failures now return to the order with a clear message rather than surfacing an unhandled server-action exception. Admin order pages also have a retry boundary that preserves the Vercel error digest for log lookup.
- Standardized customer and admin date displays to the `Asia/Kolkata` timezone, including order placement, status history, delivery updates, support requests and inventory movements.
- Refined the storefront navigation into a compact icon menu with current-page highlighting, and added a sticky, softly transparent rounded header with a restrained white-to-yellow page background.
- Reworked the phone header and bottom navigation to use a compact logo/actions row, service-location row, search row, and the requested Home/Categories/Quick Buy/Orders/Account navigation.

## 3. Features implemented or improved

- Catalogue search suggestions, price filters, sorting and pagination use live product records.
- Product pages include a gallery, availability checks, actual pricing/discounts, delivery PIN lookup, stock-aware cart actions, structured metadata and shopping information.
- Checkout fetches the signed-in customer's saved addresses, allows address selection, validates server-side totals and displays PIN delivery, product delivery, discounts and total separately.
- Admin product forms allow an optional delivery fee per item. Leaving it blank clears that fee. Checkout quotes and database order creation calculate the fee from current product records and quantity; order details show the recorded fee.
- Guest support messages are stored for the admin queue and rate-limited. Empty product, category, order and analytics states avoid invented business metrics.
- Added customer order notifications, order cancellation/return/exchange request intake, account deletion requests and verified post-delivery product ratings. Admins can review/update requests, cancel only eligible unpaid orders, remove orders, and process deletion requests while retaining anonymized order records. Cancellation is blocked by the database after dispatch/out-for-delivery.
- Added the supplied support phone numbers and email address. Return/exchange WhatsApp requests route only to +91 8506006599.
- Reworked Add Product into a simpler listing form beside the live inventory list, with a useful empty state.
- Added the supplied Delhi postal directory to a migration: 76 unique assigned PIN codes from 110001 through 110077, excluding unassigned 110050. Directory records start disabled with a ₹60 delivery charge, no invented delivery estimate, and only the supplied locality names/aliases.
- Added a PIN-management workspace with search, serviceability filters, per-code charge/minimum/ETA/alias editing, bulk serviceability actions, and real order counts grouped by PIN.
- Customer PIN lookup now returns only verified Delhi directory records, resolves locality aliases, supports choosing a locality, and shows the configured serviceability and delivery terms. Checkout rechecks the PIN, locality, serviceability, minimum and fee on the server and again in a database trigger; unsupported/disabled PINs are rejected with the requested unavailable message.
- Applied the supplied palette tokens (#FFFCF3, #FFFDF7, #F0E5C8, #FFD21F, #242424 and #737373) to the storefront theme.
- Added a dedicated `/categories` page backed by active database categories, with a responsive card grid, image/empty/error states and links to each existing category catalogue. Updated desktop/mobile Categories buttons and footer links to open it, and added the route to the sitemap.
- Product catalogue/detail reads now fall back to the legacy schema if only the optional delivery-fee column is missing. Admin product management explains the missing migration; checkout remains unavailable until schema-based fee checks are possible. Sales-based homepage sections are hidden if authorized analytics access is unavailable.
- Added sitemap, robots rules and a custom not-found page.

## 4. Files changed

- Storefront, admin and checkout: `app/`, `components/`, `lib/`, `app/storefront.css`.
- Admin recovery: `app/admin/error.tsx`, `app/admin/orders/[id]/error.tsx`, `components/admin-error-state.tsx`.
- Date/time formatting: `lib/datetime.ts`.
- Build and dependency setup: `package.json`, `pnpm-lock.yaml`, `next.config.ts`, `tsconfig.json`, `next-env.d.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `.gitignore`.
- Database and setup docs: `supabase/migrations/0004_checkout_pgcrypto_search_path.sql` through `0009_verified_product_reviews.sql`, `README.md`, `DEVELOPMENT_REPORT.md`.

## 5. Database changes

- Migration 0004 configures the checkout function's trusted extension search path.
- Migration 0005 supports guest support requests and database-backed rate limiting.
- Migration 0006 adds optional product delivery fees and stores the calculated per-order amount.
- Migration 0007 adds customer requests, notifications, safe cancellation/deletion/order actions, request and notification policies, and order cancellation safeguards. It also preserves historical orders by anonymizing customer-linked data on account deletion.
- Migration 0008 seeds the 76 assigned PIN codes supplied in the request, disables all of them pending operational review, sets ₹60 as the initial charge, and installs postal lookup, grouped admin reporting, and checkout enforcement. It also disables legacy/unverified zones so they cannot remain accidentally serviceable.
- Migration 0009 adds verified-purchase reviews and aggregate public-safe product ratings.
- Migrations are included in the ZIP but have not been applied to the live Supabase project. Run them in numeric order before deploying the matching application code.

## 6. API changes

- Added `/api/products/suggest`, `/api/support`, and product-aware delivery availability.
- Updated checkout quote/order logic to validate current products, stock, coupons, active directory PIN codes, selected locality, configured zone fee, minimum order amount and per-item delivery fees on the server.
- Added `/api/delivery-availability` server lookup with a strict verified Delhi directory, plus authenticated customer/admin request, notification and review actions.
- Razorpay and PayU endpoints remain in the app; no provider success is accepted from a browser redirect without server-side verification.

## 7. Security improvements

- Product prices, stock, coupons, delivery fees and order totals are read or calculated server-side.
- Guest support input is validated and rate-limited; product and category images use admin-authorized signed uploads.
- Public Supabase values stay distinct from server-only service and provider secrets. No `.env.local` or credential file is included in the ZIP.
- Production dependencies had zero reported advisories in the completed audit. The complete development-dependency audit did not finish in this environment.

## 8. Tests performed

- Verified the supplied PIN seed contains exactly 76 unique codes, starts at 110001, ends at 110077, and excludes unassigned 110050.
- TypeScript check: passed after the customer requests, reviews, admin queue, PIN management and category-page changes.
- Full-project ESLint: passed with zero errors and zero warnings after the same changes.
- Next.js production build: passed after all changes, including `/categories`; Next generated 39 static pages and all dynamic routes.
- Production dependency audit: zero advisories reported after the Zod/PostCSS fixes.
- Live checkout, Supabase RLS, provider webhooks, storage uploads and admin actions were not integration-tested because this workspace has no live service credentials.

## 9. Remaining issues

- Apply migrations 0004–0009 in numeric order to the existing Supabase database before deploying these changes. All PINs intentionally start disabled; configure serviceable areas, minimums and realistic delivery estimates in Admin → Delivery PINs after operational validation.
- Live payments, PIN charges, inventory updates, guest support storage and image uploads still need verification against the production Supabase project and provider dashboards.
- The reported production error digest could not be matched to a specific Vercel exception from this workspace because production function logs and Supabase credentials are not connected; the delivery save error path and admin error boundary are now handled safely in code.
- Delivery is manual. Shiprocket Quick is not connected; tracking references and status updates must come from the real carrier/operator.
- Wishlist, automated WhatsApp order notifications, abandoned-cart automation, an online refund workflow and dedicated shipping/return/replacement policy pages are not implemented as working features. No reviews or ratings are fabricated.
- The provided privacy and terms pages are brief operational summaries; the business owner should have them reviewed and provide any required legal/business details before launch.

## 10. Configuration needed from the business owner

- Supabase project URL, anon key and server-side service-role key in Vercel environment variables; keep the service-role key private.
- Razorpay and/or PayU production credentials and correctly configured HTTPS webhook/return endpoints. Rotate the payment credentials shared earlier in this conversation before production use.
- The real public site URL, verified active delivery PIN codes and actual delivery charges.
- The actual product catalogue and stock, verified business photos, and approved legal/policy text. The support phone/email values were supplied in this request; confirm ownership and that they are monitored before launch.

## Homepage structure update — 2026-11-14

- Reordered the homepage around the supplied desktop and mobile references: Delhi banner, live categories, configured promotions, actual discounted products, paid-order bestseller/trending shelves, recent products, and verified feature information.
- Added a mobile header with menu, account, cart count, PIN selector and search rows; the menu links to working catalogue, account, tracking and support routes. Kept the existing mobile bottom navigation.
- Added responsive category shortcuts, paired desktop sales shelves, compact mobile product cards, and service/trust content describing existing PIN checks, verified payment status, recorded order progress and support.
- Products, categories and promotions continue to come from the database. Bestseller/trending sections appear only when paid delivered-order data exists; no sample products, reviews, ratings, discount claims or sales numbers were added.
- Files changed in this update: `app/page.tsx`, `components/header.tsx`, `app/storefront.css`.
- No database migration or API change was needed.
- Verification: full ESLint passed with no warnings; the optimized Next.js production build passed and generated all 36 routes.

## Customer requests, Delhi delivery directory and Categories route — 2026-11-14

- Added authenticated customer requests and notifications, verified order/product ratings, admin request handling, eligible order cancellation, order removal and account deletion with historical-order anonymization.
- Added the requested support phone numbers and email address. Return/exchange WhatsApp links use only +91 8506006599.
- Added the user-supplied 76-code Delhi PIN directory as disabled records with ₹60 default charge; no unassigned 110050 record or fabricated delivery estimate is created. Added admin configuration, locality/alias resolution, customer availability lookup and independent server/database checkout validation.
- Added a live-data category directory and updated desktop, mobile and footer Categories links to point to it.
- Verification: exact PIN-seed count/uniqueness check passed; TypeScript, ESLint and the optimized production build passed. The build includes `/categories` and generated 39 static pages/routes.

## Product management and mobile storefront refinement — 2026-11-14

- Reworked Admin → Products into a live-data management view with actual product totals, active/hidden/zero-stock counts, status tabs, name/SKU search, category and status filters, pagination, image thumbnails, and a focused edit panel. No reference-image statistics or sample products were added.
- A delete blocked by the database because of order or stock history now deactivates the existing product through the protected admin update RPC and reports that the history was retained. Products with no dependent history continue through the existing delete path.
- Updated the phone storefront to follow the supplied information order: compact yellow menu/brand/search/cart header, confirmed delivery location, Delhi banner, category shortcuts, live offer shelf, service information, database-backed promotions and product shelves, and Home/Categories/Offers/Orders/Account bottom navigation.
- Mobile offers, product shelves, categories, cart count, saved location, and delivery estimate remain sourced from configured application data. Unconfigured delivery times and absent catalogue sections are not fabricated.
- Files changed in this refinement: `app/admin/[section]/page.tsx`, `lib/actions/admin.ts`, `app/page.tsx`, `components/header.tsx`, `components/location-selector.tsx`, `components/mobile-bottom-navigation.tsx`, `app/storefront.css`, and this report.
- Verification: full-project ESLint passed with zero warnings and TypeScript passed. The Next.js webpack compile completed, but local Windows builds then failed while creating generated `.next` subdirectories with `EPERM`; this workspace limitation prevented a completed local production build in this run. Earlier successful build notes above refer to the earlier code state. Vercel/Linux deployment and live Supabase data were not available to verify here.
- No database migration or API change was required for this refinement.

## Dual delivery, live admin refresh and password recovery — 2026-11-15

### Issues addressed

- Checkout previously had no separately selectable delivery method or per-PIN pricing for Blitz and Standard delivery.
- Admin changes depended on navigation/manual refresh for most server-rendered views.
- The header did not consistently follow the signed-in customer's chosen default saved address.
- Login did not provide a complete Supabase password recovery path.

### Implemented

- Added migration `0010_live_admin_dual_delivery_recovery.sql`: independent per-PIN Blitz/Standard switches, fees and estimates; order delivery snapshots; a customer-scoped default-address RPC; and a private admin change-signal table with business-table triggers.
- Added server-side delivery method resolution to availability, quote and order creation. Server/database validation checks the current PIN, locality, mode, amount and minimum order; order rows snapshot mode, charge, PIN, locality and ETA. The existing Razorpay and PayU verification paths are unchanged.
- Added the responsive checkout method cards, a four-step progress indicator, live order summary and a required explicit method selection.
- Added admin PIN search/filter, independent mode switches, prices and estimates, per-PIN edit, bulk mode changes and CSV update/export for the verified PIN directory. All modes remain disabled until an operator enables them.
- Added Supabase Realtime admin change notifications with a 30-second refresh fallback and refresh-on-return behavior.
- Added authenticated default-address selection and a no-store endpoint used to synchronize the storefront delivery location.
- Added `/forgot-password` and `/reset-password` using Supabase native email recovery, `resetPasswordForEmail`, recovery-session gating and `updateUser`.
- Made the login recovery link a larger, high-contrast button-style action below the password field so it is easy to spot on mobile and desktop.

### Files changed in this update

- Pages and APIs: `app/admin/[section]/page.tsx`, `app/admin/layout.tsx`, `app/admin/orders/[id]/page.tsx`, `app/account/addresses/page.tsx`, `app/account/orders/[id]/page.tsx`, `app/login/page.tsx`, `app/forgot-password/page.tsx`, `app/reset-password/page.tsx`, `app/api/account/default-address/route.ts`, `app/api/checkout/route.ts`, `app/api/checkout/quote/route.ts`, `app/api/delivery-availability/route.ts`.
- Components and server logic: `components/admin-live-refresh.tsx`, `components/admin-pincode-manager.tsx`, `components/checkout-form.tsx`, `components/forgot-password-form.tsx`, `components/reset-password-form.tsx`, `components/location-selector.tsx`, `lib/actions/admin.ts`, `lib/actions/auth.ts`, `lib/delivery.ts`, `app/storefront.css`.
- Database, setup and checks: `supabase/migrations/0010_live_admin_dual_delivery_recovery.sql`, `scripts/test-delivery-modes.mjs`, `package.json`, `README.md`, `DEVELOPMENT_REPORT.md`.

### Verification and remaining setup

- Full-project ESLint: passed. TypeScript `--noEmit`: passed. Delivery-mode checks: passed for both modes, each mode independently, both disabled, inactive PIN, stale mode, invalid configuration and changed price.
- Next.js production build: passed with 41 routes, including password recovery and delivery APIs. The build was run with a temporary `.next-vercel-check` output directory because Windows denied creation of some directories in the default/alternate build output locations. The normal Next and TypeScript config files were restored afterward.
- Migration 0010 has not been applied to the live database. Run migrations 0004–0010 in order for an existing database after confirming migrations 0001–0003 are already applied; all migrations in order for a new database. Existing orders keep their recorded method/charge snapshot.
- Delivery modes intentionally start disabled. Apply the migration, then verify real fulfilment and enable modes/ETAs by PIN under Admin → Delivery PINs before accepting orders.
- Add `https://www.blitzkart.store/reset-password` to Supabase Auth redirect URLs. Confirm Supabase Realtime is enabled for `admin_live_events` and verify reset email delivery in the Supabase project.
- Database-trigger behavior, live realtime events, payment-provider callbacks and real checkout could not be integration-tested without production Supabase and provider credentials. The ZIP contains `.env.example` only; no local secret files are included.
