import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { events } from '../src/data/events.js'

// These fixtures prove browser contracts, not live provider/database readiness.
const AUTH_ORIGIN = 'https://rooted-auth.test.supabase.co'
const ORIGIN = 'http://127.0.0.1:4193'
const USER_ID = 'a42703db-57a4-4d92-a02b-8775d57d26fd'
const EVENT_ID = '8bd58a16-a2b1-4e85-aedb-d9f82ebeb8ab'
const EMAIL = 'neighbor@example.test'
const QUESTION = 'I want a beginner-friendly cleanup in Chapel Hill.'
const ANSWER = 'This creek cleanup welcomes beginners. Open the event to see its meeting place and join.'

const user = {
  id: USER_ID, aud: 'authenticated', role: 'authenticated', email: EMAIL,
  email_confirmed_at: '2026-10-01T12:00:00Z', identities: [],
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { display_name: 'Test Neighbor' },
  created_at: '2026-10-01T12:00:00Z', updated_at: '2026-10-01T12:00:00Z',
}

function session() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const expires = Math.floor(Date.now() / 1000) + 3600
  return {
    access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: USER_ID, aud: 'authenticated', role: 'authenticated', exp: expires })}.test-signature`,
    token_type: 'bearer', refresh_token: 'fixture-refresh-grow-neighbor',
    expires_in: 3600, expires_at: expires, user,
  }
}

async function mockServices(page) {
  const state = {
    session: session(), requests: [], registered: false, failAssistant: false,
    failActivity: false, engine: 'timescale', attempts: 0, successes: 0,
    event: {
      ...events[0], id: EVENT_ID, title: 'A real creek gathering', isSample: false,
      startsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      endsAt: new Date(Date.now() + 7 * 86_400_000 + 7_200_000).toISOString(),
      organizerId: USER_ID, organizer: 'Test Neighbor', organizerDescription: 'A Rooted neighbor.',
      description: 'A welcoming creek cleanup for neighbors trying their first event.',
      participants: 0, capacity: 12, status: 'published', isRegistered: false,
    },
  }
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' }
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) })
  await page.route(`${AUTH_ORIGIN}/auth/v1/**`, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/token')) return json(route, state.session)
    if (path.endsWith('/user')) return json(route, user)
    if (path.endsWith('/logout')) return json(route, {})
    throw new Error(`Unexpected mocked auth endpoint: ${path}`)
  })
  await page.route(`${ORIGIN}/api/**`, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    const body = request.postDataJSON()
    state.requests.push({ path, method, body, headers: request.headers() })
    if (path === '/api/grow-neighbor' && method === 'POST') {
      state.attempts += 1
      if (state.failAssistant) return json(route, { error: { code: 'gemini_unavailable', message: 'Gemini is busy. Please try again.' } }, 503)
      state.successes += 1
      return json(route, { answer: ANSWER, recommendations: [state.event], model: 'gemini-2.5-flash' })
    }
    if (path === '/api/grow-neighbor/activity') {
      if (state.failActivity) return json(route, { error: { code: 'database_unavailable', message: 'Activity is temporarily unavailable.' } }, 503)
      const metrics = { requests: state.attempts, successfulRequests: state.successes, averageLatencyMs: state.attempts ? 123 : null }
      return json(route, { engine: state.engine, hours: 24, summary: metrics, buckets: state.attempts ? [{ hour: new Date().toISOString(), ...metrics }] : [] })
    }
    if (path === '/api/me') return json(route, {
      profile: { userId: USER_ID, displayName: 'Test Neighbor', city: 'Chapel Hill', interests: ['cleanup'], bio: '', avatarUrl: '' },
      upcomingEvents: state.registered ? [state.event] : [], attendedEvents: [],
      stats: { completedEvents: 0, volunteerHours: 0, wasteKg: 0, treesPlanted: 0 },
    })
    if (path === `/api/events/${EVENT_ID}/registration`) {
      state.registered = method === 'POST'
      state.event = { ...state.event, participants: state.registered ? 1 : 0, isRegistered: state.registered }
      return json(route, { registered: state.registered, participants: state.event.participants })
    }
    if (path === `/api/events/${EVENT_ID}`) return json(route, { event: state.event })
    if (path === '/api/events') return json(route, { events: [state.event] })
    return json(route, { error: { code: 'not_found', message: 'Not found.' } }, 404)
  })
  return state
}

async function login(page) {
  await page.goto('/login?next=/grow-neighbor')
  await page.getByLabel('Email address', { exact: true }).fill(EMAIL)
  await page.getByLabel(/^Password/).fill('rooted-test-password')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page).toHaveURL(`${ORIGIN}/grow-neighbor`)
}

async function ask(page) {
  await page.getByLabel('Your question', { exact: true }).fill(QUESTION)
  await page.getByLabel('City (optional)', { exact: true }).fill('Chapel Hill')
  await page.getByRole('button', { name: 'Ask Grow Neighbor', exact: true }).click()
}

async function expectNoOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Mobile page should fit the viewport').toBe(true)
}

test('authenticated recommendation opens a database event, joins and persists in Profile', async ({ page }) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const state = await mockServices(page)
  await login(page)
  await ask(page)
  await expect(page.getByRole('region', { name: 'Grow Neighbor answer', exact: true })).toContainText(ANSWER)
  const request = state.requests.find((entry) => entry.path === '/api/grow-neighbor')
  expect(request.body).toEqual({ message: QUESTION, city: 'Chapel Hill' })
  expect(request.headers.authorization).toBe(`Bearer ${state.session.access_token}`)
  expect(request.body).not.toHaveProperty('userId')
  await expect(page.getByTestId('event-card')).toHaveCount(1)
  await expectNoOverflow(page)
  await page.getByText('Recommendation activity', { exact: true }).click()
  const activity = page.getByRole('region', { name: 'Recommendation activity', exact: true })
  await expect(activity).toContainText(/Timescale/i)
  await expect.poll(() => state.requests.filter((entry) => entry.path.endsWith('/activity')).length).toBeGreaterThanOrEqual(2)
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([])
  await page.getByRole('link', { name: state.event.title, exact: true }).click()
  await expect(page).toHaveURL(`${ORIGIN}/events/${EVENT_ID}`)
  await page.getByRole('button', { name: 'Join event', exact: true }).click()
  await expect.poll(() => state.registered).toBe(true)
  expect(state.requests.find((entry) => entry.path.endsWith('/registration')).headers.authorization).toBe(`Bearer ${state.session.access_token}`)
  await page.goto('/profile')
  await page.reload()
  await expect(page.getByRole('region', { name: 'Your upcoming events', exact: true }).getByRole('link', { name: state.event.title, exact: true })).toBeVisible()
  await expect(page.getByText(/Joining an event alone doesn’t add impact/)).toBeVisible()
  await expectNoOverflow(page)
  expect(errors).toEqual([])
})

test('Gemini failure shows an error and cannot display a successful recommendation', async ({ page }) => {
  const state = await mockServices(page)
  state.failAssistant = true
  await login(page)
  await ask(page)
  await expect(page.getByRole('alert').filter({ hasText: 'Gemini is busy. Please try again.' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Grow Neighbor answer', exact: true })).toHaveCount(0)
  await expect(page.getByTestId('event-card')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Ask Grow Neighbor', exact: true })).toBeEnabled()
  expect(state.attempts).toBe(1)
  expect(state.successes).toBe(0)
})

test('logged-out neighbors are gated before any assistant or activity request, including narrow mobile', async ({ page }) => {
  const state = await mockServices(page)
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/grow-neighbor')
  const loginLink = page.getByRole('link', { name: 'Log in to ask Grow Neighbor', exact: true })
  await expect(loginLink).toHaveAttribute('href', '/login?next=/grow-neighbor')
  await expect(page.getByRole('button', { name: 'Ask Grow Neighbor', exact: true })).toHaveCount(0)
  await expectNoOverflow(page)
  expect(state.requests.filter((entry) => entry.path.startsWith('/api/grow-neighbor'))).toEqual([])
})

test('plain PostgreSQL telemetry is identified honestly and telemetry failure does not discard Gemini answers', async ({ page }) => {
  const state = await mockServices(page)
  state.engine = 'postgres'
  await login(page)
  await page.getByText('Recommendation activity', { exact: true }).click()
  const activity = page.getByRole('region', { name: 'Recommendation activity', exact: true })
  await expect(activity).toContainText(/PostgreSQL/i)
  state.failActivity = true
  await ask(page)
  await expect(page.getByRole('region', { name: 'Grow Neighbor answer', exact: true })).toContainText(ANSWER)
  await expect(page.getByTestId('event-card')).toHaveCount(1)
  await expect(activity).toContainText('Activity is temporarily unavailable.')
})
