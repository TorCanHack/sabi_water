# Sabi Water implementation plan

Status: customer storefront, PostgreSQL customer authentication, saved addresses and persistent preview orders implemented. Operational order processing remains pending.

## Delivery experience update

- Home, Office and custom address labels support estate, street, house/office number, landmark and delivery instructions, with selection, editing and deletion.
- Signed-in addresses and test orders persist in PostgreSQL and are scoped to the authenticated customer. Guest data persists in this browser. Orders retain their address and price snapshots.
- New addresses default to Brains & Hammers, Galadimawa, shown as a delivery-area note without an estate selector. Existing unsupported addresses remain blocked before payment and on the server.
- One-time checkout supports Deliver now and Schedule for later, validating future delivery times in Abuja time. Recurring subscriptions remain separate and pending.
- Confirmed, Preparing, Out for Delivery and Delivered appear in the status timeline. Account orders refresh every 15 seconds; only server state determines their status. Test orders start at Confirmed and do not automatically advance. Business Padi fulfilment integration is still required for operational status updates.
- Reorder restores product quantities and address, using current catalogue prices. Search supports product name, size and brand, including accents and spaces in units.
- Verification: frontend lint/build and nine automated checks passed, including isolated PostgreSQL ownership, coverage, scheduling, order snapshots and status reads. Browser verification was unavailable because no browser was connected.

Earlier phase notes below describe the prior baseline; the update above supersedes their current-visit-only storage limitations.

## Implementation progress

- Built responsive catalogue, category filters, persistent basket, and test checkout.
- Added estate and phone validation, empty-bottle acknowledgement, free delivery, and a clearly marked demonstration confirmation.
- Online payment is shown as unconnected. Test orders remain in memory and are not sent to staff or saved on a server.
- Added a Sabi Water Express/PostgreSQL account API with signup, signin, session restoration, and signout. Business Padi has not been changed.
- Frontend lint and production build pass; the development server responds with HTTP 200. Browser interaction and visual verification are pending because no browser was connected.

## Confirmed requirements

- Sabi Water is the customer app for households and workplaces.
- Business Padi remains an internal staff application for operations.
- Launch coverage: Brains & Hammers estate, Galadimawa, Abuja. Expansion proceeds estate by estate.
- On-demand ordering and delivery, with 24/7 availability for testing. Operating hours must be configurable for launch.
- Free delivery within the initial estate.
- Dispenser water costs NGN 1,700 per bottle exchange. One empty is expected per full bottle delivered.
- Table-water brands initially include CWAY, Nestlé, and Swan.
- Customers can pay online or on delivery.
- Subscriptions are an experiment for a later phase; schedule, pricing, and billing rules are not agreed.

## Existing applications

Sabi Water has a React/Vite/Tailwind customer storefront. Its Express backend now provides PostgreSQL-backed customer accounts and opaque cookie sessions. Ordering and staff operations are not yet connected.

Business Padi has React/Vite/Tailwind, Express, PostgreSQL, and Supabase authentication. It implements products, incoming stock, sales, customers, staff records, debts and partial payments, bottle balances, invoices, exports, and business reporting. It has desktop and mobile staff interfaces.

Business Padi currently scopes business records to the authenticated owner's user ID. Its staff records are not a staff authentication/authorization system. Customer accounts must not inherit that owner access.

## Proposed architecture

Retain separate customer and staff frontends. Extend the existing Business Padi backend with customer ordering and fulfilment modules, exposing separate customer and staff API routes. This is the proposed starting architecture, not an implemented integration.

Use the existing operational PostgreSQL records as the authoritative product, stock, sales, debt, and container records. Add ordering tables in the same database so stock reservation and sale creation can be transactional. Avoid two independently editable stock ledgers.

The Sabi Water frontend must access only customer-safe APIs. The backend determines the Sabi Water business identity; a shopper cannot choose an arbitrary business owner ID. Customer authentication links a shopper to a customer record in that business. Staff endpoints require explicit business membership and permissions. Never put owner credentials or database service keys in the customer frontend.

Use an isolated test database and payment-provider test mode during development. Preserve existing Business Padi records and workflows through additive migrations. The sparse Sabi Water server should not evolve into a competing operations backend; settle backend placement before implementation.

## Customer menu

- Home: delivery address for the current visit, Order Water, popular products, current order status, reorder, and promotions.
- Shop: sachet water, bottled water, dispenser bottles, and ice/other category filters, search, and cart. Unstocked categories show an empty state.
- Orders: active delivery and tracking information, current-visit test order history, reorder, downloadable test receipts, and issue-reporting availability.
- Subscriptions replaces Wallet because no wallet exists. Scheduled deliveries remain explicitly marked coming later.
- Account: personal details, saved-address section, payment methods, notifications, help and support, settings, and authenticated logout.

The five destinations are accessible on desktop and mobile. Live tracking, persistent order history, saved addresses, profile editing, notifications, support submission, and subscriptions still require implementation. Test history and the delivery address are held in memory for the current visit only. Frontend lint and production build pass after the menu update; visual browser verification remains pending.

## Customer experience

1. Confirm service estate; unsupported locations receive a clear coverage message before checkout.
2. Browse dispenser and table water, with brand, bottle size, pack quantity, price, and availability visible.
3. Add products to the cart. Dispenser items explain the empty-bottle exchange requirement.
4. Provide recipient name, phone, estate, street/house or office, and delivery instructions. Support saved home and office addresses.
5. Review server-calculated prices and the NGN 0 delivery fee; choose online payment or payment on delivery.
6. Receive an order reference and view confirmation, preparation, out-for-delivery, and delivered status, plus failure/cancellation information when applicable.
7. Access order history, reorder using current prices and availability, and contact support by the agreed channel.

Do not promise a numerical delivery ETA until operations supplies one. The first release needs status tracking, not continuous GPS.

## Staff experience in Business Padi

- Add incoming orders alongside existing operational screens.
- Accept orders, review payment status, prepare items, and assign a delivery.
- Group nearby pending orders into a trip and manually order stops, while preserving the on-demand service expectation.
- Give delivery staff a restricted mobile view of assigned stops and necessary customer details.
- Record quantities delivered, actual empty bottles collected, payment collection, and unsuccessful attempts.
- Keep call/WhatsApp sales supported. Orders entered by staff should use the same reservation/fulfilment rules when awaiting delivery.
- Retain existing reports and ledger workflows; add order/delivery metrics separately.

## Data additions

- Service zones: estate, active status, delivery fee, operating hours, timezone.
- Customer identities and saved addresses: explicit links to existing business customer records; verify ownership rather than merging by name.
- Storefront product details: category, brand, size, pack quantity, image, published status, mapped to existing product IDs.
- Orders and order items: immutable checkout price/address snapshots, source channel, customer, totals, timestamps, and status history.
- Stock reservations: quantity per product/order, state, and expiry where relevant.
- Order payments: order association, provider reference, amount, method, payment/refund state, and deduplication identifiers.
- Delivery trips/stops: assignee, stop order, outcome, actual delivered quantities, timestamps, and collection records.
- Fulfilment links: unique association between fulfilled order items and Business Padi sales to prevent duplicate posting.
- Staff memberships and roles: owner/admin, operations, and delivery staff, with enforced permissions.

Keep recurring schedules out of the first implementation until their business rules are settled.

## Critical business rules

### Stock and fulfilment

Available-to-order stock equals operational on-hand stock minus active reservations. Reserve stock atomically at order submission; concurrent requests must not oversell. Manual staff sales must respect reservations too.

At fulfilment, create the corresponding sale and release its reservation in one transaction. Each fulfilment can affect stock once only. Cancelled/expired orders release reservations. Partial deliveries affect only quantities actually delivered; remaining quantities must be explicitly rescheduled or cancelled.

### Payments

Track payment and delivery status independently. Payment on delivery does not mean paid at checkout. A customer returning from a payment screen is not evidence of payment; verify provider events server-side, including amount, currency, and order reference.

Store order-specific payments separately from Business Padi's oldest-debt-first payment allocation. Advance payments must not clear unrelated debt. Preserve payment references when a fulfilled order posts to the sales ledger. Handle repeated notifications, late success after reservation expiry, failed payments, and cancellations/refunds explicitly.

Payment provider selection, payment-on-delivery methods, and refund operations remain implementation decisions to settle before live payments.

### Bottle exchanges

Expect one empty per full dispenser bottle. Record actual delivered and collected quantities, including partial returns, in the delivery record. Reconcile the net container movement with the existing customer bottle ledger exactly once; an equal exchange has zero net movement.

Do not automatically sell a new bottle or invent a deposit when the customer has no empty. The purchase/deposit policy and accepted bottle brands/sizes remain open. Show a support path for customers who cannot meet the exchange requirement.

### Catalogue and prices

Dispenser exchange price is confirmed at NGN 1,700. Table-water prices and pack variants below are planning placeholders from retailer listings, not confirmed Sabi Water prices or Abuja market averages:

| Product | Provisional unit | NGN |
| --- | --- | ---: |
| CWAY | 75cl × 12 | 2,200 |
| Nestlé Pure Life | 60cl × 20 | 4,850 |
| Swan | 50cl × 12 | 2,100 |

References reviewed during planning:
- https://unistores.com.ng/product-category/uwaters/
- https://www.supermart.ng/collections/nestle-pure-life
- https://shop.ojaoba.com/products/swan-natural-spring-bottle-water-50cl-pack-by-12

Prices and variants must be editable by staff. Do not overwrite existing live product prices with these placeholders. Historical order totals remain unchanged when catalogue prices change.

## Implementation sequence

1. Foundation: settle backend placement, isolate development data, define additive migrations and customer/staff authorization. Keep the existing React/Vite/Tailwind stack; decide TypeScript adoption before feature work.
2. Storefront: implement responsive catalogue, cart, service check, address entry, and checkout with clearly identified test data.
3. First complete order: persist payment-on-delivery orders, reserve stock, show the staff queue, fulfil an order, and update sales/stock/container records once.
4. Online payments: integrate provider test mode, verification, order-specific allocation, deduplication, failure and cancellation paths.
5. Dispatch: implement staff assignments, restricted mobile stop lists, basic route batching, partial/failed deliveries, and customer status updates.
6. Launch readiness: replace provisional products, configure real hours/contact details, verify staff roles, reconcile records, and run a pilot within the estate.
7. Subscription experiment: consider scheduled repeat orders with reminders and per-delivery payment; confirm terms before implementing recurring billing.

## Verification

- One customer can place a mixed-product order and view only their own information.
- Staff and customers cannot access another business's records; drivers see only authorized deliveries.
- Two buyers competing for the final stock cannot both reserve it; manual sales obey the same rule.
- Retried checkout, payment callbacks, and delivery submission do not duplicate orders, money, stock changes, or container changes.
- Successful online payment is attached to its order, including when the customer has older debts.
- Paid-before-delivery and unpaid-after-delivery remain accurately represented.
- Cancellation, reservation expiry, late payment, partial delivery, and failed attempts reconcile correctly.
- Bottle exchange and partial returns agree with the existing bottle balance.
- Existing Business Padi sales, partial payments, imports, and reports remain functional after changes.
- End-to-end test covers customer checkout through staff fulfilment and ledger reconciliation on mobile and desktop.

## Remaining decisions

These do not block planning or storefront prototyping, but must be resolved before their dependent features:

- Customer sign-in method and guest checkout policy.
- Online payment provider and permitted payment-on-delivery methods.
- Bottle purchase/deposit and accepted exchange-container rules.
- Exact stocked variants, images, launch prices, and support details.
- Actual launch operating hours and delivery expectation.
- Staff login provisioning, order acceptance policy, and driver assignment process.
- Subscription schedule, confirmation, price-change, and billing rules.

## Cross-device cart update

Account carts now persist in PostgreSQL with authenticated customer ownership. Guest carts merge on sign-in; queued browser changes retry with operation IDs so lost responses do not duplicate quantities. Connected devices refresh every ten seconds and on focus/reconnection. Logout syncs first and clears the device session's cart while retaining the server copy. Offline changes remain device-local until successfully synced. Recovery, concurrency, deduplication and ownership are covered by frontend and isolated PostgreSQL integration checks.
