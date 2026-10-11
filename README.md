# Rooted

Reconnect with nature. Grow your community.

Rooted is a mobile-first environmental community platform for HackNC 2026. Supabase provides authentication; Tiger Data holds profiles, events and registrations. Grow Neighbor uses the official Google Gemini SDK through a protected backend endpoint to recommend available database events. Its private request activity uses a Timescale hypertable and hourly `time_bucket` analytics when the extension is enabled. Community management, organizer verification, environmental impact analytics and leaderboards remain later milestones.

The default sample preview contains nine clearly fictional events. Sample events cannot be joined or edited and never earn verified impact. Live mode uses the server API and reports connection errors instead of switching to fictional data.

## AI use disclosure

For our HackNC 2026 / Devpost submission, we disclose both the AI integrated into Rooted and the AI assistance used to build it.

### AI in the application

**Google Gemini** powers **Grow Neighbor** through the official `@google/genai` SDK. The default model alias is `gemini-flash-lite-latest`, configurable through `GEMINI_MODEL`. Its implemented uses are:

- **Sustainability guidance:** generate short answers to environmental education questions and practical preparation advice for volunteering.
- **Event recommendations:** interpret a neighbor's question and optional city, then select up to three matching events from eligible records retrieved from Tiger Data. The backend supplies at most 30 future, published, non-sample events with available capacity. Gemini returns guidance and event IDs; displayed event titles, dates, locations and availability come from database records.
- **Integration verification:** `npm run check:gemini` makes a real Gemini request with a fixed, nonpersonal question to check the configured key and model independently of the full application flow.

Gemini runs on the server. Request context contains the user's question, optional city, and selected event fields: ID, title, a shortened description, category, dates, city, public meeting location, participant count, capacity and difficulty. Rooted does not automatically add account profiles, email addresses, user IDs, Supabase access tokens, database credentials or previous conversation history to that context. Anything a user types into the question is sent to Gemini. Google's handling of those requests is subject to the provider's policies.

Tiger Data supplies the application records used to ground recommendations. Its Timescale integration stores private assistant request metadata—user UUID, timestamp, model, latency, outcome, recommendation count and error code—and produces hourly activity summaries. These analytics do not store questions or generated answers.

The backend validates structured output and event IDs, removes duplicates and rechecks availability after generation. Provider failures are shown as errors, with no fictional successful fallback. AI guidance can still be inaccurate. Joining events, changing profiles and recording registrations use authenticated application operations; Gemini does not perform those actions, verify attendance or award environmental impact. AI-assisted event-description writing remains a future feature. No custom model training or fine-tuning is implemented.

### AI assistance during development

**OpenAI Codex, an AI coding assistant, was used extensively during this hackathon.** Substantial portions of the application code, tests, sample content and documentation were generated or revised with AI assistance, including:

- Project planning, architecture, feature prioritization and the demo workflow.
- React scaffolding, page layouts, styling, responsive behavior, accessibility, interface copy and clearly fictional sample event fixtures.
- Backend API handlers, Supabase authentication, validation, Tiger Data queries and migrations, event creation and registration logic, Timescale activity tracking, and the Gemini integration and prompt.
- Unit, database integration and browser tests, controlled test responses, code review, and debugging of local/backend connectivity, Vite/Vercel routing and production authentication.
- Setup scripts, cloud environment instructions, README and service/demo/deployment guides, deployment configuration, and GitHub release preparation and checks.

The project creator supplied the product direction, selected priorities, configured external services and credentials, ran local service checks, and approved publication. Validation included automated unit tests, disposable PostgreSQL/Timescale integration tests, browser checks and real Gemini connectivity requests. Automated tests also use controlled or mocked provider responses; those fixtures are separate from live application answers and do not establish production readiness by themselves.

### Assets

The bundled landscape photographs come from the MIT-licensed Start Bootstrap Grayscale template, credited below. They are third-party illustrative assets rather than AI-generated photographs.

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
