# Sabi Water account API

Express and PostgreSQL backend for customer signup, signin, session restoration, and signout. Passwords use salted `scrypt` hashes. Login sessions use random opaque tokens; only a SHA-256 hash of each token is stored in PostgreSQL, while the browser receives the original token in an HTTP-only cookie.

## Configure PostgreSQL

Create a PostgreSQL database and user, then copy the example environment file:

```sh
cp .env.example .env
```

Update `DATABASE_URL` in `.env` if your database credentials differ. For a hosted database that requires TLS, set `DATABASE_SSL=true`.

The API applies `schema.sql` automatically when it starts. It creates `customer_users` and `customer_sessions` without deleting existing data.

## Run

```sh
npm install
npm run dev
```

Run the frontend in a second terminal:

```sh
cd ../front_end
npm run dev
```

Vite proxies `/api` requests to `http://localhost:3000`. In production, serve both under the same site or route `/api` to this server, set `FRONTEND_URL` to the frontend origin, use HTTPS, and set `NODE_ENV=production`.

## Business Padi connection

Point this server and the Business Padi server at the same Supabase PostgreSQL
database. This server accepts either `DATABASE_URL` or the same `PGHOST`,
`PGPORT`, `PGUSER`, `PGPASSWORD`, and `PGDATABASE` variables used by Business
Padi. Set `BUSINESS_PADI_OWNER_ID` to the Supabase Auth user UUID of the
Business Padi owner who operates this storefront. New signed-in pay-on-delivery
and Paystack orders are then tagged for that owner's staff queue. Never put this
server's database credentials or a Supabase secret key in the customer frontend.

Apply the additive shared schema explicitly with `npm run db:migrate`, or simply
start this API; startup applies the same migration before accepting requests.

## Routes

- `POST /api/auth/signup` with `name`, `email`, and `password`
- `POST /api/auth/signin` with `email` and `password`
- `GET /api/auth/me`
- `POST /api/auth/signout`
- `GET /api/health`

## Checks

```sh
npm test
npm run verify:auth
```

`verify:auth` expects the API to be running. It creates a temporary account, checks the complete authentication lifecycle, and deletes the account afterward.

## Saved addresses and delivery previews

The additive schema also creates `customer_addresses` and `customer_preview_orders`.
All `/api/customer/*` routes require a valid customer session and scope records to that customer:

- `GET /api/customer/addresses`
- `POST /api/customer/addresses` creates or updates an address with optional `id`, plus `label`, `estate`, `street`, `houseNumber`, `landmark`, and `instructions`.
- `DELETE /api/customer/addresses/:id`
- `GET /api/customer/orders` returns current preview-order statuses; the frontend polls every 15 seconds.
- `POST /api/customer/orders` accepts `name`, `phone`, `address`, `deliveryMode` (`now` or `later`), `scheduledAt` (ISO timestamp), `items` (`id`, `qty`), and `exchange` (empty-bottle acknowledgement).

Prices come from `../shared/products.mjs`; coverage and validation come from `../shared/commerce.mjs`. Include the shared directory when deploying the server or building the frontend. Scheduled times entered by shoppers are interpreted in Africa/Lagos (UTC+01:00).

Orders are **test orders only**. They do not charge customers, reserve stock, create sales or dispatch drivers. They start at Confirmed. No customer-facing status mutation endpoint exists. Operational transitions require the future authenticated Business Padi fulfilment integration. Supported states are Confirmed, Preparing, Out for Delivery and Delivered.

To run integration checks, point `TEST_DATABASE_URL` at an isolated test database:

```sh
TEST_DATABASE_URL=postgresql://localhost/sabi_test npm test
```

Tests initialize the additive schema, create temporary customer records, and delete those records afterward. Without `TEST_DATABASE_URL`, the database integration test is skipped and pure validation/password tests still run.

## Cross-device carts

Signed-in customers have one PostgreSQL cart per account. `GET /api/customer/cart` restores it; `POST /api/customer/cart` applies an operation with the authenticated `userId`, a unique UUID `operation.id`, a `type` (`adjust`, `merge`, or `replace`), and an `items` object mapping catalogue IDs to quantities. Adjust operations carry quantity deltas. Unknown products and invalid quantities are rejected. Row locking serializes changes, and persisted operation IDs prevent retries from applying changes twice.

The additive startup schema creates `customer_carts` and `customer_cart_operations`; restart the API after updating. These carts contain product IDs and quantities only; checkout calculates prices from the current catalogue.

The frontend merges the guest cart on sign-in, saves account changes immediately, and refreshes on focus, reconnection and every ten seconds. Pending operations persist under an account-specific browser key and retry after a restart. Logout waits for successful synchronization, removes the local account cache and clears the visible guest cart while preserving the server cart. Failed signout does not pretend the session has ended.

Offline changes cannot appear on another device until they reach the server. Guests must sign in to transfer a cart to another device. Reorder intentionally replaces the account cart; normal quantity adjustments preserve unrelated changes from other devices. Completed checkout subtracts the ordered quantities.

Run `npm test --prefix ../front_end` for local-recovery and sync-controller tests. Database integration tests also cover separate login sessions, concurrent changes, retry deduplication, logout recovery and customer isolation.

## Paystack payments (test or live)

Online checkout now uses Paystack's hosted checkout. Customers must sign in. The server calculates NGN amounts in kobo from the shared catalogue, stores the order before calling Paystack, and confirms the reference, amount, currency, customer email and test/live domain before recording payment. Signed webhooks and authenticated callback verification share an atomic, repeat-safe settlement operation; cart quantities are subtracted once. Pay-on-delivery and historical preview orders remain previews.

Configure these **server-only** values in `.env` or your hosting secret settings:

```dotenv
PAYSTACK_MODE=live
PAYSTACK_SECRET_KEY=sk_live_REPLACE_WITH_YOUR_SECRET
PAYSTACK_CALLBACK_URL=https://YOUR_FRONTEND_DOMAIN/?payment=return
```

`PAYSTACK_MODE` is independent of `NODE_ENV`: live Paystack payments can run while the app remains in development. Use `test` and an `sk_test_` key for simulated payments. A missing key disables online checkout; a key/mode mismatch prevents startup. Never put the secret in frontend code or a `VITE_` variable. No public key is needed for hosted checkout.

1. Activate your business for live payments in Paystack and obtain the matching secret key in its dashboard.
2. Configure the values above and restart the API. Startup applies the additive `customer_payments` ledger schema.
3. In Paystack's matching test/live settings, set the webhook URL to `https://YOUR_PUBLIC_API_DOMAIN/api/payments/paystack/webhook`. Local development requires a public HTTPS tunnel to receive webhooks. Set the callback to the frontend address accessible in the paying browser, preserving `?payment=return`. Keep frontend and `/api` on the same site for session cookies.
4. Confirm the checkout explicitly displays **Live Paystack checkout** before accepting real payments. Verify the hosted flow, callback and webhook in test mode first.

Routes:
- `GET /api/payments/config`: enabled state and mode only; never secrets.
- `POST /api/customer/payments`: the preview-order payload plus a UUID `checkoutId`; retries reuse the stored reference.
- `POST /api/customer/payments/:reference/verify`: authenticated owner-only server verification.
- `POST /api/payments/paystack/webhook`: raw-body HMAC-SHA512 signature validation.

Pending and paid payments appear in Orders. Returning customers can continue an existing checkout or check its status there. If initialization times out after reaching Paystack, the pending reference is retained; do not create a replacement payment until that reference is reconciled in Paystack. The callback URL alone never proves payment. Abandoned payments remain pending and never trigger fulfilment. Keep the matching key available to reconcile old pending transactions before switching modes.

**Current operational limit:** paid orders are saved as **Confirmed**. Inventory reservation, Business Padi dispatch, automated refunds and recurring charges are not implemented. Receiving a payment does not book a delivery; live orders require manual fulfilment. The UI states this explicitly.

Implementation follows [Paystack accept payments](https://paystack.com/docs/payments/accept-payments/) and [webhook verification](https://paystack.com/docs/payments/webhooks/). Automated checks use a mocked Paystack API and never charge money.


## Delivery tracking

Verified payments start at **Confirmed**, including existing paid orders. Progress is persisted separately from payment status: **Confirmed → Getting a dispatch → Out for delivery → Delivered**. Repeated payment verification never resets delivery progress. The customer view refreshes after verification and polls every 15 seconds.

An operator with server access can advance a paid order one stage at a time:

```sh
npm run delivery:update -- SABI-ORDER-REFERENCE "Getting a dispatch"
npm run delivery:update -- SABI-ORDER-REFERENCE "Out for delivery"
npm run delivery:update -- SABI-ORDER-REFERENCE "Delivered"
```

Customer endpoints cannot change delivery status. Delivery stages require operator updates; they do not automatically book a courier. Test orders remain explicitly labelled as tests.
