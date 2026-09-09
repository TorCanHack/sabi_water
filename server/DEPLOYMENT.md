# Deploying the API

This is a standard Node 24 service backed by PostgreSQL. It uses environment
variables and does not depend on Render APIs or local persistent storage. Keep
`server/` and `shared/` together; the backend imports the shared catalogue and
validation modules. The Dockerfile and Render configuration both preserve this.

## Render

Create a Blueprint from the repository's `render.yaml`, or create a Node web
service manually with these settings:

| Setting | Value |
| --- | --- |
| Root directory | Leave blank (repository root) |
| Build command | `npm ci --prefix server --omit=dev` |
| Start command | `npm start --prefix server` |
| Health check | `/api/health` |
| Node version | 24 (set by `.node-version`) |

Set secrets in the service's Environment settings, never in Git:

| Variable | Production value |
| --- | --- |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `PORT` | Let Render supply it |
| `TRUST_PROXY` | `1` for Render's direct proxy |
| `FRONTEND_URL` | Exact HTTPS frontend origin, without trailing slash; comma separated for multiple origins |
| `DATABASE_URL` | Your existing PostgreSQL connection URL |
| `DATABASE_SSL` | `true` for a TLS database; see TLS notes below |
| `PAYSTACK_MODE` | `test` until ready for real payments |
| `PAYSTACK_SECRET_KEY` | Matching, rotated secret key; leave unset to disable online payments |
| `PAYSTACK_CALLBACK_URL` | `https://YOUR_FRONTEND_DOMAIN/?payment=return` |
| `BUSINESS_PADI_OWNER_ID` | Existing owner's UUID if connecting fulfilment to Business Padi |

The Blueprint prompts for required configuration and payment settings. Add
`BUSINESS_PADI_OWNER_ID` separately when using the Business Padi connection.
Reuse the existing shared database for that integration; creating an empty
database does not bring over Business Padi's records. No database is provisioned
by this Blueprint.

The Blueprint selects the free plan for initial testing. Free web services spin
down when idle; the in-process refund worker only runs while the API is awake.
Use an always-on paid service before relying on timely refunds or production
traffic. Choose the plan in Render before deploying production.

Set the Paystack webhook to
`https://YOUR_PUBLIC_API_DOMAIN/api/payments/paystack/webhook` in the matching
test/live environment. `NODE_ENV=production` does not enable live payments.

Render references: [Node deployment](https://render.com/docs/deploy-node-express-app),
[monorepo roots](https://render.com/docs/monorepo-support),
[health checks](https://render.com/docs/health-checks),
[free service limitations](https://render.com/docs/free).

## Frontend routing and cookies

### Local frontend with a hosted backend

While the frontend runs only on your PC, explicitly set these variables on the
hosted backend, then redeploy the updated code:

```dotenv
FRONTEND_URL=http://localhost:5174
PAYSTACK_MODE=test
PAYSTACK_CALLBACK_URL=http://localhost:5174/?payment=return
```

Keep `NODE_ENV=production` on the hosted backend. HTTP origins are allowed only
for loopback hosts (`localhost`, `127.0.0.1`, `[::1]`); HTTP payment callbacks
also require test mode and an origin listed in `FRONTEND_URL`. Live payment
callbacks still require HTTPS. The production frontend origin must be explicitly
set; a missing value produces a configuration error.

Create `front_end/.env.local` on your PC with your real backend URL:

```dotenv
API_PROXY_TARGET=https://YOUR_SERVICE.onrender.com
```

Restart `npm run dev --prefix front_end` and open `http://localhost:5174`.
Vite proxies relative `/api` requests to the hosted API; the target variable is
used only by the dev server, not exposed in the client bundle. See
[Vite's proxy configuration](https://vite.dev/config/server-options#server-proxy).
Use `localhost` consistently for testing cookies. The Paystack webhook must
still use the publicly reachable backend URL, never localhost.

### Deployed frontend

The current frontend calls relative `/api` URLs and uses secure, HTTP-only,
`SameSite=Lax` session cookies in production. Configure your frontend host to
reverse-proxy `/api/*` to this backend, preserving the full path, cookies, and
`Set-Cookie` headers. CORS alone does not create that route. Avoid a redirect:
requests must stay on the frontend origin in the browser.

For example, the browser requests `https://shop.example.com/api/auth/me`, and the
frontend host proxies it to `https://YOUR_SERVICE.onrender.com/api/auth/me`.
Do not cache `/api` responses. A frontend on an unrelated domain calling the API
directly would require separate frontend URL and cookie/CSRF design changes.

`TRUST_PROXY` is the number of trusted proxies between client and app. Set it
for the actual topology; every trusted proxy must overwrite forwarded headers.
If adding a frontend proxy before Render, review the hop count for that path
and any direct API access path before changing it. The sign-in limiter currently
lives in process memory, so start with one instance; use shared rate limiting
before scaling horizontally.

## Database and migrations

Alternatively to `DATABASE_URL`, supply `PGHOST`, `PGPORT`, `PGUSER`,
`PGPASSWORD`, and `PGDATABASE`. `PGHOST` selects this mode and takes precedence
over `DATABASE_URL`. Discrete settings enable verified TLS by default; use
`DATABASE_SSL=false` only for a trusted connection that does not use TLS.

`DATABASE_SSL=true` now verifies certificates. If your provider requires a
private CA, supply `DATABASE_CA_CERT` with its PEM certificate (literal `\n`
escapes are supported). Existing connections that relied on disabled certificate
verification need the correct CA. Do not combine URL TLS parameters (`sslmode`,
`sslrootcert`, etc.) with `DATABASE_SSL` or `DATABASE_CA_CERT`; remove one source
of settings. If the provider URL already configures TLS, remove `DATABASE_SSL`
from the Render service/Blueprint. URL-only TLS behavior follows node-postgres.
See [node-postgres TLS configuration](https://node-postgres.com/features/ssl).

The pool defaults to 10 connections per instance (`DATABASE_POOL_MAX`), with a
3-second connection timeout. Budget connections across this API and Business
Padi. `/api/health` runs a bounded database check and returns 200 or 503 without
database details.

Startup applies the existing additive schema under a PostgreSQL advisory lock
before listening. The database user needs schema creation/alteration privileges.
Back up production before schema changes. To apply it separately from the repo:

```sh
npm run db:migrate --prefix server
```

The migration command needs the same environment as the API. Building the app
does not connect to the database or apply migrations.

## VPS using Docker

From the repository root:

```sh
docker build -t sabi-water-api .
```

Create a private environment file on the VPS, for example
`/etc/sabi-water/api.env`, based on `server/.env.example`. Set production values
from the table above, `PORT=3000`, `HOST=0.0.0.0`, and `TRUST_PROXY=1` for a single
local reverse proxy. Restrict the file to its owner (`chmod 600`). Then run:

```sh
docker run -d --name sabi-water-api --restart unless-stopped \
  --stop-timeout 30 --env-file /etc/sabi-water/api.env \
  -p 127.0.0.1:3000:3000 sabi-water-api
```

The container runs as the unprivileged `node` user. Environment files and keys
are excluded from the build context. Supply an externally reachable PostgreSQL
host; `localhost` inside the container refers to the container itself.

Use an HTTPS reverse proxy (Nginx or Caddy) to expose the service. In the frontend
domain's existing TLS-enabled Nginx server block, this preserves `/api` paths:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 60s;
    proxy_cache off;
}
```

The example assumes Nginx is the only public-facing proxy. Serve the frontend
from the same HTTPS domain and keep port 3000 private. For updates, build a new
image, gracefully stop/remove the old container, and run the new image with the
same environment. Customer state remains in PostgreSQL. This simple single
container workflow has a short deployment interruption.

## VPS without Docker

Install Node 24 and copy/clone the repository. Run
`npm ci --prefix server --omit=dev`. Run `node server.js` with working directory
`server/` under your service manager (for example systemd), an unprivileged user,
the production environment, automatic restart, and a stop timeout of at least
30 seconds. Set `HOST=127.0.0.1` behind a local proxy, or firewall the app port.
`npm start --prefix server` also works and loads a local `server/.env` if present.
Use the same HTTPS proxy and database settings as above.

On SIGTERM/SIGINT the API stops accepting requests, waits for active requests
and the current refund batch, then closes PostgreSQL. After 25 seconds it exits
with failure rather than hanging indefinitely; interrupted refund submissions
remain subject to the existing reconciliation rules. Error logs omit raw error
messages, SQL, request bodies, and credentials.

## Verify after deploying

1. Request `/api/health`: expect HTTP 200 and `{"ok":true}`.
2. Request `/api/payments/config`: confirm the intended mode and enabled state.
3. From the actual HTTPS frontend, sign up/sign in, reload, and sign out; verify
   that sessions survive reload and API responses are not cached.
4. In Paystack test mode, verify checkout return, webhook confirmation, wallet
   top-up, and refunds before enabling live payments.
5. Restart the API and confirm stored sessions/orders persist and health recovers.

Local tests: `npm test --prefix server`. Database integration tests require an
explicit disposable `TEST_DATABASE_URL`; do not point them at production.

## Diagnosing startup failures

`startup_step` logs identify payment configuration, database initialization,
session cleanup, and HTTP listening. The last step before `startup_failed`
identifies where startup stopped. Known configuration failures have a specific
code and a fixed hint; arbitrary exception messages and credentials stay hidden.

For `PAYSTACK_CALLBACK_HTTPS_REQUIRED`, update `PAYSTACK_CALLBACK_URL` to the
hosted frontend's HTTPS URL plus `/?payment=return`. Updating `FRONTEND_URL`
alone does not update the payment callback. `DATABASE_CONFIG_MISSING` means the
database settings must be supplied in the backend service's hosting environment.
If a failure still has `UNEXPECTED_ERROR`, report it together with the last
`startup_step` rather than sharing environment file contents.
