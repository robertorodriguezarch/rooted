# Rooted demo

The implemented flow is: authenticated neighbor asks Grow Neighbor → the backend reads eligible events from Tiger Data → the official Google Gemini SDK selects actual event IDs and generates guidance → the neighbor opens and joins an event → registration persists in Profile → Timescale shows assistant request activity.

Gemini runs only on the server. Event cards come from database records, not model-generated titles, dates or URLs. Sample, past, unpublished and full events are excluded, and availability is rechecked after generation. Requests are bounded to 1,000 characters and limited in PostgreSQL to five per minute and 30 per hour per authenticated user, including failed provider attempts. The provider call has a 12-second timeout and automatic retries are disabled.

## Configure locally

Keep the existing Supabase and Tiger Data credentials. In ignored `.env.local`, add `GEMINI_API_KEY` from [Google AI Studio](https://aistudio.google.com/apikey), set `GEMINI_MODEL=gemini-flash-lite-latest`, and set `VITE_DATA_MODE=live`. Never prefix the Gemini key with `VITE_`. Use a model available to your project if you override the default Flash Lite alias, and confirm its quota before recording.

From the repository root:

```sh
npm ci
npm run db:migrate
npm run db:timescale
npm run check:auth
npm run check:gemini
npm run dev
```

The new `002_grow_neighbor.sql` migration is additive. It preserves `001_initial_schema.sql` and all existing events/profiles/registrations. It creates append-only request metadata and shared request limits, and makes the activity table a hypertable when the Timescale extension is installed. `db:timescale` verifies/converts that table idempotently, including existing request rows. No database reset is needed.

If Timescale setup reports the extension missing, enable `timescaledb` through your Tiger Data service/SQL editor using its supported setup, then rerun `npm run db:timescale`. The assistant works on ordinary PostgreSQL too, but the UI explicitly labels that storage as PostgreSQL; it is not evidence of Timescale analytics. The request panel must say **Timescale hypertable** for the Tiger Data analytics demonstration.

For Vercel development, use `npx vercel dev` instead of `npm run dev`. For deployment, set server `GEMINI_API_KEY`/`GEMINI_MODEL`, existing server auth/database variables, and public build variables in Vercel. Apply migrations from the machine already connected to Tiger Data. Supabase redirect origins must match the origin used for account email flows. Do not run remote migrations or a reset from a test suite.

## Rehearse and record

1. Use a confirmed test account and sign in before recording; email delivery is not part of the demo path.
2. Create one future event through **Create**, with a clear city, public meeting place, capacity and beginner-friendly description. Label any staged event as a hackathon demonstration. Seeded fictional preview events cannot be joined and are intentionally excluded from AI recommendations.
3. Open **Grow Neighbor**, enter the same city, and ask “Find a beginner-friendly cleanup.” A recommendation should open the actual event details page.
4. Join the event. Open **Profile** and refresh: the event must remain in **Your upcoming events**. Registration does not earn attendance or environmental impact.
5. Return to Grow Neighbor, expand **Recommendation activity**, and show **Timescale hypertable**, successful request totals and hourly buckets. These values come from actual assistant attempts, not seeded impact.
6. Show the architecture briefly: Supabase verifies identity; Tiger Data stores application records and time-series request activity; Gemini supplies guidance and event selection; Vercel/Vite serves the same backend handlers.

`npm run check:gemini` performs one actual, bounded API call with a nonpersonal prompt. It verifies the Gemini key/model independently; it does not establish authentication, database connectivity or the whole browser flow. `/api/health` verifies the existing tables are queryable and auth configuration is present. The manual steps above establish the live full workflow.

Keep a recorded successful run once the flow works. Use the working local runtime for the video if deployment would consume the recording buffer. Do not claim organizer verification, community impact, leaderboards or AI-assisted event writing are implemented.

## Automated checks

```sh
npm test
npm run test:db
npm run test:db:timescale
npm run build
npm run test:e2e
npm run test:e2e:phase2
npm run test:e2e:grow-neighbor
```

Database test commands use disposable loopback Docker containers and never the application's `DATABASE_URL`. The Timescale variant exercises a real hypertable and `time_bucket`, not an emulation. Browser tests mock external auth/API responses; Node tests use controlled Gemini responses, including the real SDK transport format. Passing these checks does not replace the live key/provider check or manual Tiger Data flow.

Only request metadata (user UUID, timestamp, model, latency, outcome, count) is stored. Prompts, Gemini answers, access tokens and email addresses are not retained in analytics. Activity is private to the signed-in user. Organizer verification and environmental contribution reporting remain later milestones.
