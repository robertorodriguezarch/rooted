# Rooted

Reconnect with nature. Grow your community.

Rooted is a mobile-first environmental community platform for HackNC 2026. Phase 2 adds Supabase Auth, persistent profiles, PostgreSQL-backed event discovery, event creation, and registration. Tiger Data holds application data; Supabase provides authentication. Community management, organizer verification, impact analytics, and Gemini features remain later milestones.

The default sample preview contains nine clearly fictional events. Sample events cannot be joined or edited and never earn verified impact. Live mode uses the server API and reports connection errors instead of switching to fictional data.

## Development

Use Node 24 (or Node 22.12+ for ordinary local development):

```sh
npm ci
test -f .env.local || cp .env.example .env.local
npm run dev
```

Open the address printed by Vite in your local browser. Follow [the service setup guide](docs/setup.md) to configure Supabase and Tiger Data, apply migrations, and enable live mode. Restart Vite after changing environment variables.

In the Codex cloud environment, use `npm --cache /workspace/.npm-cache ci` because the default npm cache is not writable. Set `NODE_USE_ENV_PROXY=1` before starting Node 24 services so server-side Supabase requests use the supplied cloud proxy and trusted certificates. Cloud tasks already have isolated environments; use the existing checkout at `/workspace/rooted` without creating a worktree.

## Checks

```sh
npm test
npm run test:db
npm run build
npm run test:e2e
npm run test:e2e:phase2
```

`npm test` runs discovery and API unit checks. PostgreSQL integration cases are explicitly skipped unless `DATABASE_TEST_URL` is supplied. `npm run test:db` requires Docker and runs the complete Node suite against a disposable PostgreSQL 17 container bound only to loopback; it never uses the application's `DATABASE_URL`. Tests isolate their schemas and verify migration reruns, seed preservation, authorization, capacity races, registration idempotency, and impact constraints.

The browser suites use `/usr/bin/chromium` when installed, otherwise Playwright's Chromium (`npx playwright install chromium`). They start isolated Vite servers on ports 4173 and 4183. Foundation checks cover discovery, filters, direct routes, sharing, responsive layout, and public account screens. Phase 2 checks exercise the real Supabase SDK with mocked HTTP responses for login, token refresh, confirmation, recovery, profile editing, event creation, and join/leave. These checks do not establish live service readiness or email delivery. Automated WCAG A/AA scans supplement manual accessibility review.

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

Secrets belong in secure platform settings or ignored local environment files. Never expose `DATABASE_URL`, `DATABASE_CA_CERT`, or `GEMINI_API_KEY` through a `VITE_` variable. A Supabase service role key is unnecessary. Vercel's SPA rewrite excludes API routes. Deployment and live Tiger Data integration have not yet been verified.

## Assets

Illustrative landscape photos are bundled from the MIT-licensed [Start Bootstrap Grayscale](https://github.com/StartBootstrap/startbootstrap-grayscale) template. Its license is retained at `public/images/LICENSE.txt`. Photos illustrate the theme and do not depict sample event locations. Fonts use the system sans-serif stack and Georgia.
