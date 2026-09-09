# Sabi Water storefront

React, Vite, and Tailwind customer storefront for Sabi Water, serving Brains & Hammers, Galadimawa, Abuja.

## Run locally

```sh
npm install
npm run dev
```

Open http://localhost:5174. This port is reserved for Sabi Water so Business Padi can keep using port 5173. Vite will report an error if port 5174 is already occupied.

## Checks

```sh
npm run lint
npm run build
```

## Current milestone

- Responsive storefront with dispenser/table-water filters.
- Editable basket retained in browser local storage (products and quantities only).
- Test checkout with address, Nigerian mobile number, estate eligibility, and required bottle-exchange acknowledgement.
- Free delivery, NGN 1,700 dispenser exchanges, provisional table-water prices.
- Payment-on-delivery demonstration and an explicitly unconnected online-payment option.
- PostgreSQL-backed customer signup, signin, persistent cookie sessions, and signout through the API in `../server`.
- In-memory test confirmation. No real payment, saved order, or dispatch.

Products live in `src/data/products.js`. Packaging is illustrative; replace it with approved product photos and confirm table-water variants before launch.

Business Padi remains the staff operations application. Customer authentication is connected to the Sabi Water API; ordering and fulfilment are not yet connected to Business Padi. See `../PLAN.md` for the intended reservation, payment, and fulfilment design.

## Verification status

Lint and production build pass. The local server returned HTTP 200. Interactive browser and mobile visual checks remain pending because no browser was connected during implementation.
