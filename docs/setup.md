# Connecting Supabase and Tiger Data

The Supabase project URL and public publishable key configure authentication. Tiger Data supplies the PostgreSQL database for profiles, events, and registrations. A Supabase database is not used for application records.

## Supabase

1. Open your Supabase project. Under **Project Settings → API** (or **Connect**), copy the project URL and **publishable** key. Rooted already has the public configuration supplied for project `tkcakmhjmqxshsuqfbtq` in this cloud instance; its API URL is `https://tkcakmhjmqxshsuqfbtq.supabase.co`.
2. Under **Authentication → Providers → Email**, enable email/password sign-in. Email confirmation is currently enabled on this project. A new account must confirm its email before signing in.
3. Under **Authentication → URL Configuration**, set the local Site URL to `http://localhost:5173`. Add `http://localhost:5173/auth/callback` and `http://localhost:5173/reset-password` to the redirect allowlist. Use the same hostname when browsing locally. For a hosted preview, use its actual HTTPS origin and add the equivalent two paths; for production, use the deployed HTTPS origin.
4. Set `VITE_SUPABASE_URL` and `SUPABASE_URL` to the project API URL. Set `VITE_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_PUBLISHABLE_KEY` to the public publishable key. These are public project settings; do not use a service role or secret key.

Rooted uses PKCE for confirmation and recovery. Open the email link in the same browser where you requested it. If a signup confirmation opens elsewhere, return to the sign-in page after confirming. Password recovery must complete through the emailed recovery link. Configure Supabase email delivery for a public launch and check the provider's sending limits before inviting users.

### Backend authentication troubleshooting

If sign-in succeeds but Profile, Create or Grow Neighbor reports **Account services are temporarily unavailable**, the browser reached Supabase but the backend could not complete its separate session-verification request. Run `npm run check:auth` from the repository root. It makes read-only requests, reports configuration comparisons and safe network error codes, and never prints keys, tokens, passwords or response bodies. It does not query or change the database.

Keep both `SUPABASE_URL` and `VITE_SUPABASE_URL` set to the project's API URL (`https://tkcakmhjmqxshsuqfbtq.supabase.co` for this project), with matching publishable keys. A dashboard URL is not the API URL. During `npm run dev`, the local API uses Vite's resolved `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, so stale server settings cannot point verification at a different project. This includes Vite mode files such as `.env.development.local`; exported public `VITE_*` shell values still take precedence over these files. A missing frontend auth setting leaves the local API unconfigured.

Production Functions and standalone server scripts retain explicit `SUPABASE_*` precedence over the `VITE_*` fallback. Their exported shell values take precedence over `.env.local`, which takes precedence over `.env`. `npm run check:auth` checks these standalone settings, so an old exported `SUPABASE_*` value can still make that diagnostic report a mismatch even after local Vite is working. Keep production server settings matched to the frontend build settings, and remove stale local shell overrides before running the standalone diagnostic.

A DNS error means Node cannot resolve the host; a connection error or timeout points to routing, proxy, VPN or firewall access; a certificate error requires fixing the trusted certificate configuration. Do not disable TLS verification. Browser access and a working Gemini connection do not establish that Node can reach the Supabase host. Restart Vite after changing configuration, then use the exact port printed by the new process. If it selects port 5174, an older process may still be serving different code or settings on 5173. Supabase email redirect settings must match the origin you actually use.

The diagnostic deliberately sends an invalid token to the verification endpoint and expects a rejection: HTTP 401, or HTTP 403 with Supabase's `bad_jwt` code. This confirms that the endpoint is reachable; it does not validate a user's session. After it passes, sign out, sign back in and open Profile to test the actual protected workflow.

## Tiger Data

1. Sign in at [Tiger Data](https://www.tigerdata.com/) and create a PostgreSQL/Timescale service for Rooted. Choose a region near your users and an appropriate plan. Retain the generated database password securely; creating or upgrading a service may incur provider charges.
2. Open the service's connection details and copy its PostgreSQL connection string, including the provider's hostname, port, database, username, password, and TLS setting. Use a URL of the form `postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require`; preserve the actual provider values and URL-encode any password characters when assembling the string yourself.
3. In this cloud environment's secure variable settings, add the connection string as **`DATABASE_URL`**. Do not paste it into chat or a tracked file. For local development, add it to ignored `.env.local`. Add the service's exact hostname to allowed network destinations if required. PostgreSQL also needs outbound TCP connectivity to the provider's port; an HTTPS proxy alone does not provide that connection.
4. Remote connections always verify TLS certificates. If the provider requires a custom CA, add its PEM certificate as `DATABASE_CA_CERT` or use its supported `sslrootcert` path. Do not disable certificate verification.

Apply the application schema after the service is reachable:

```sh
npm run db:migrate
```

The migration runner uses a transaction, an advisory lock, and checksums. Rerunning it is safe; editing an already applied migration is rejected. Use a dedicated development database rather than a database containing unrelated production tables.

Optionally add the nine fictional discovery examples:

```sh
npm run db:seed
```

The seed preserves existing records when rerun. It labels samples, adds no fake registrations or impact, and keeps sample events unavailable for registration. Real events are created through the authenticated Create page.

## Enable and verify live mode

1. Set **`VITE_DATA_MODE=live`** and restart Vite after the database connection and migrations pass their checks. The cloud instance uses `sample` until those checks succeed. Live mode requires both services and never falls back to samples after a failed API request.
2. Check `/api/health`. HTTP 200 with `status: "ready"` means the required database tables can be queried and auth configuration is present. It does not test email delivery or authenticate a person. A missing connection returns a safe 503 response.
3. Sign up with your own test account, confirm the email, and sign in. Save a profile, create a future event, then join and leave it. Refresh the page to confirm persistence. Repeat with another account to test capacity and ownership. Joining must not add verified impact.
4. Request a password reset and complete the email flow in the same browser. Sign out and sign back in with the updated password.

Never point `DATABASE_TEST_URL` at production. `npm run test:db` provides its own disposable local database and does not change `DATABASE_URL`. Browser tests mock external service responses; successful tests do not replace these live checks.

## Cloud configuration and deployment

The saved environment draft includes install/start instructions, public Supabase settings, a requirement for `DATABASE_URL`, and the Tiger Data hostname `p7vc8gvxes.pm7bhqjmbe.tsdb.cloud.timescale.com`. Review and save those changes in environment settings, enter the database connection securely, and publish the environment to activate the saved configuration for future tasks. Saving a draft alone does not restart services or publish an environment. A proxy response of **Domain forbidden** means the running network policy has not allowed that destination; retry the connection after the settings are applied before attempting migrations.

The current cloud proxy now allows that hostname, but native DNS returns `EAI_AGAIN` and PostgreSQL connections through the proxy close before authentication. A successful HTTP CONNECT or HTTPS handshake alone does not verify PostgreSQL transport. Both standard PostgreSQL TLS negotiation and direct TLS were checked; no database query succeeded. Do not disable certificate verification or keep changing passwords to fix this network failure. Apply migrations and run the live API from a development machine or deployment runtime with native DNS and outbound PostgreSQL TCP access to port **36467**, or arrange that supported access for this workspace first. Keep sample mode until the database and migrations pass readiness checks.

Use Node 24 and `NODE_USE_ENV_PROXY=1` for server-side HTTP requests in this cloud workspace. Preserve the platform's proxy and certificate configuration. Local development outside this cloud typically does not need this setting.

For Vercel, set the public `VITE_` values before building, add matching server-side Supabase settings and `DATABASE_URL`, and apply migrations separately before serving live traffic. Supabase redirect URLs must match the deployed origin. Rooted uses Vercel Functions for the API and a client-route rewrite for React pages. Follow [the production deployment guide](deploy.md) for the existing project and release checks.

## Gemini and the demo

Follow [the demo guide](demo.md) to add the server-only Gemini key, apply the additive assistant migration and enable the Timescale request-activity hypertable. Use `GEMINI_MODEL=gemini-flash-lite-latest`, which was verified with an actual structured Gemini response. Run `npm run check:gemini` before recording and verify real event recommendation → registration → Profile persistence in live mode. Existing database credentials and migration history stay unchanged.
