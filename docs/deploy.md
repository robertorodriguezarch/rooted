# Production deployment

Rooted's existing Vercel project is [rooted11/rooted](https://vercel.com/rooted11/rooted). Its production alias is [rooted-rosy.vercel.app](https://rooted-rosy.vercel.app), and its GitHub integration builds `main` from `robertorodriguezarch/rooted`. A successful build publishes code; the checks below establish service readiness.

## Production settings

In the project's **Settings → Environment Variables**, configure the following for **Production**. Use the working local values, entered securely in Vercel. Redeploy after changing build or server variables.

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://tkcakmhjmqxshsuqfbtq.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | The project's public publishable key |
| `VITE_DATA_MODE` | `live` |
| `SUPABASE_URL` | Optional server-only fallback; use the same project API URL as `VITE_SUPABASE_URL` |
| `SUPABASE_PUBLISHABLE_KEY` | Optional server-only fallback; use the same public key as `VITE_SUPABASE_PUBLISHABLE_KEY` |
| `DATABASE_URL` | The existing Tiger Data PostgreSQL URL with verified TLS |
| `GEMINI_API_KEY` | The real Google Gemini key, entered directly into Vercel |
| `GEMINI_MODEL` | `gemini-flash-lite-latest` |

If the database provider requires a custom CA, also configure `DATABASE_CA_CERT`. Cloud proxy credentials are scoped to this workspace; enter the actual Gemini key securely in Vercel. Preserve the existing database credentials. Git does not include `.env.local`, and those local settings are not automatically installed in production.

Use Vercel's **Vite** framework preset, root directory `.` for this repository, `npm run build`, output directory `dist`, and **Node.js 24** for Functions. The repository's `vercel.json` gives API Functions a 60-second limit and preserves frontend route fallback while excluding API and asset requests. An explicit rewrite sends every API path depth to `api/[...path].js`; standalone Vercel bracket filenames alone match only one path segment.

In Supabase **Authentication → URL Configuration**, set the production Site URL to `https://rooted-rosy.vercel.app` and allow `https://rooted-rosy.vercel.app/auth/callback` and `https://rooted-rosy.vercel.app/reset-password`. Keep any local URLs needed for development. The same-origin PKCE email flow requires opening links in the browser where the request started.

## Database and release checks

The user already applied migration `002_grow_neighbor.sql` and enabled the Timescale activity hypertable on the connected laptop. If production uses that same Tiger Data service, no reset or new database is needed. If it uses a different service, run `npm run db:migrate` and `npm run db:timescale` from a machine with that service's native PostgreSQL access. Neither command belongs in the frontend build.

Push the verified release to `main`, or redeploy the latest `main` deployment in Vercel after configuring Production variables. Verify that its commit matches the release before sharing the alias.

1. Open `/`, `/explore`, `/grow-neighbor` and `/profile` directly and refresh them. Routes should load the app; `/api/health` should return JSON with `status: "ready"`, `database: true`, and `auth: true`. Health requires the profile, event, registration, assistant activity and assistant limit tables. It does not test a real account, Gemini or a Timescale hypertable.
2. Use a confirmed account to sign in, open Profile, create a future real event and join it. Refresh Profile to confirm persistent registration.
3. Ask Grow Neighbor for an event in the same city. Confirm the answer uses real event cards, then open and join a recommendation.
4. Expand Recommendation activity and verify **Timescale hypertable**, a successful request and its hourly bucket. PostgreSQL-only labels do not establish the Timescale requirement.
5. Sign out and confirm protected operations require sign-in. Verify email confirmation/recovery redirects separately if recording those flows.

Backend authentication uses the complete `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` pair in production, matching the browser's project even when duplicate `SUPABASE_*` settings are stale. A complete `SUPABASE_*` pair is used only when a complete public pair is absent. URL and key pairs are never mixed, and rejected tokens are not retried against another project. Gemini errors remain visible and never produce a fabricated successful fallback. Organizer verification, community management and impact leaderboards remain later work.

If production reports `auth_unavailable`, `/api/health?diagnostics=auth` adds two safe booleans: `matchesFrontend` compares the configured project URL and public key, and `urlIsOrigin` rejects dashboard paths, query strings and embedded credentials as a diagnostic. Missing comparison settings produce `null`. These diagnostics reveal no setting values and do not prove connectivity. Failed session verification also includes a bounded `reason`, such as `ENOTFOUND`, a certificate code, `timeout`, `non_json_response` or `upstream_5xx`; raw errors, tokens and provider bodies remain private. If settings match, investigate that reason rather than changing the database or bypassing authentication. Workspace proxy variables should not be copied into Vercel Production.
