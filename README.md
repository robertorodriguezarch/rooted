# Rooted

Reconnect with nature. Grow your community.

Rooted is a mobile-first environmental community platform for HackNC 2026. Supabase provides authentication; Tiger Data holds profiles, events and registrations. Grow Neighbor uses the official Google Gemini SDK through a protected backend endpoint to recommend available database events. Its private request activity uses a Timescale hypertable and hourly `time_bucket` analytics when the extension is enabled. Community management, organizer verification, environmental impact analytics and leaderboards remain later milestones.

The default sample preview contains nine clearly fictional events. Sample events cannot be joined or edited and never earn verified impact. Live mode uses the server API and reports connection errors instead of switching to fictional data.

## Development

Use Node 24 (or Node 22.12+ for ordinary local development):

```sh
npm ci
test -f .env.local || cp .env.example .env.local
npm run dev
```

Open the address printed by Vite in your local browser. Follow [the service setup guide](docs/setup.md) to configure Supabase and Tiger Data, apply migrations, and enable live mode. Restart Vite after changing environment variables.

If sign-in succeeds but protected pages report unavailable account services, run `npm run check:auth` to check the backend's Supabase connection without exposing credentials. See the service guide for configuration, DNS, proxy and certificate troubleshooting.

For the complete Gemini → Tiger Data → registration demo, follow [the demo setup and recording guide](docs/demo.md). Add the server-only Gemini key securely, apply the additive migration, run `npm run db:timescale`, and verify the provider with `npm run check:gemini`. No database reset is needed.

For production, follow [the Vercel deployment guide](docs/deploy.md). The existing project is `rooted11/rooted`, with the production alias `rooted-rosy.vercel.app`, connected to this repository's `main` branch. Configure production variables before deploying the new assistant; local environment files are ignored by Git.

To exercise Vercel Functions and its development router together, run `npx vercel dev` from the repository root after linking your Vercel project. The CLI normally serves the app on port 3000. Keep your existing local environment configuration; this command does not require resetting migrations. Add that origin's `/auth/callback` and `/reset-password` URLs to Supabase's allowed redirects when testing account email flows there.

The Vercel SPA rewrite applies to extensionless frontend routes, including `/explore`, `/events/:id`, and `/auth/callback`. API paths, Vite's virtual modules, source files, dependency cache, and assets bypass it. A broad rewrite to `index.html` also rewrites JavaScript module requests during `vercel dev`, causing HTML to reach Vite's JavaScript parser. Vite's own SPA fallback and the shared local API middleware remain in `vite.config.js`; the React module entry remains `/src/main.jsx`.

In the Codex cloud environment, use `npm --cache /workspace/.npm-cache ci` because the default npm cache is not writable. Set `NODE_USE_ENV_PROXY=1` before starting Node 24 services so server-side Supabase requests use the supplied cloud proxy and trusted certificates. Cloud tasks already have isolated environments; use the existing checkout at `/workspace/rooted` without creating a worktree.

## Checks

```sh
npm test
npm run test:db
npm run test:db:timescale
npm run build
npm run test:e2e
npm run test:e2e:phase2
npm run test:e2e:grow-neighbor
```

`npm test` runs discovery and API unit checks. PostgreSQL integration cases are explicitly skipped unless `DATABASE_TEST_URL` is supplied. `npm run test:db` requires Docker and runs the complete Node suite against a disposable PostgreSQL 17 container bound only to loopback; it never uses the application's `DATABASE_URL`. Tests isolate their schemas and verify migration reruns, seed preservation, authorization, capacity races, registration idempotency, and impact constraints.

Routing regression checks use Vercel's official route converter and real Vite HTTP responses to verify JavaScript modules, CSS, images, frontend deep links, and API JSON. They also check built production assets and SPA fallback. They require no Vercel credentials and do not launch the full Vercel CLI. The test-only route converter uses a patched compatible `path-to-regexp` version through the npm override.

The browser suites use `/usr/bin/chromium` when installed, otherwise Playwright's Chromium (`npx playwright install chromium`). They start isolated Vite servers on ports 4173, 4183 and 4193. Foundation checks cover discovery, filters, direct routes, sharing, responsive layout, and public account screens. Phase 2 checks exercise the real Supabase SDK with mocked HTTP responses for login, token refresh, confirmation, recovery, profile editing, event creation, and join/leave. Grow Neighbor checks cover authenticated recommendations, registration persistence, assistant failures, request activity, accessibility and mobile overflow. These checks do not establish live service readiness or email delivery. Automated WCAG A/AA scans supplement manual accessibility review.

## Structure

- `src`: React pages, accessible navigation, Supabase session state, and API client.
- `server`: shared API routing, verified access tokens, validation, and parameterized PostgreSQL queries.
- `api/[...path].js`: Vercel Functions adapter; Vite uses the same API locally.
- `db/migrations`: transactional, checksum-checked database schema migrations.
- `scripts`: migration runner, optional fictional seed, and disposable database test runner.
- `tests` and `e2e`: unit, database integration, and browser checks.
- `src/data/events.js`: sample preview fixtures, separate from real participation.
- `public/images`: bundled illustrative landscape photos.

Protected API operations derive identity from a Supabase-verified bearer token. Event capacity and duplicate registrations are enforced inside database transactions. Joining an event changes registration only; impact totals require verified completed attendance. The verification workflow itself is a future milestone.

Secrets belong in secure platform settings or ignored local environment files. Never expose `DATABASE_URL`, `DATABASE_CA_CERT`, or `GEMINI_API_KEY` through a `VITE_` variable. A Supabase service role key is unnecessary. Vercel's SPA rewrite excludes API routes. The user verified Tiger Data migrations, the Timescale activity hypertable, a real Gemini response, and the corrected local runtime on their laptop. Production requires its own environment configuration and live checks.

## Assets

Illustrative landscape photos are bundled from the MIT-licensed [Start Bootstrap Grayscale](https://github.com/StartBootstrap/startbootstrap-grayscale) template. Its license is retained at `public/images/LICENSE.txt`. Photos illustrate the theme and do not depict sample event locations. Fonts use the system sans-serif stack and Georgia.
