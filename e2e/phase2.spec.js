import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { events } from '../src/data/events.js'

// These are network-contract tests, using the real Supabase JavaScript SDK
// against mocked HTTP endpoints. They do not prove live email, database or
// provider configuration. No credentials or real accounts are used.
const AUTH_ORIGIN = 'https://rooted-auth.test.supabase.co'
const ORIGIN = 'http://127.0.0.1:4183'
const USER_ID = 'a42703db-57a4-4d92-a02b-8775d57d26fd'
const EVENT_ID = '8bd58a16-a2b1-4e85-aedb-d9f82ebeb8ab'
const EMAIL = 'neighbor@example.test'
const PASSWORD = 'rooted-test-password'
const browserErrors = new WeakMap()

test.beforeEach(({ page }) => {
  const errors = []
  browserErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
})

test.afterEach(({ page }) => {
  expect(browserErrors.get(page), 'Account workflows should not throw uncaught browser errors').toEqual([])
})

const user = {
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: EMAIL,
  email_confirmed_at: '2026-10-01T12:00:00Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { display_name: 'Test Neighbor' },
  identities: [],
  created_at: '2026-10-01T12:00:00Z',
  updated_at: '2026-10-01T12:00:00Z',
}

function token(label) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: USER_ID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, label })}.test-signature`
}

function session(label = 'login') {
  return { access_token: token(label), token_type: 'bearer', refresh_token: `fixture-refresh-${label}`, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user }
}

async function mockServices(page) {
  const state = {
    authRequests: [],
    apiRequests: [],
    session: session(),
    profile: { userId: USER_ID, displayName: 'Test Neighbor', city: 'Chapel Hill', interests: ['cleanup'], bio: '', avatarUrl: '' },
    registered: false,
    rejectLogin: false,
    rejectProfile: false,
    event: {
      ...events[0], id: EVENT_ID, title: 'A real creek gathering', isSample: false,
      organizerId: USER_ID, organizer: 'Test Neighbor', organizerDescription: 'A Rooted neighbor.',
      description: 'Neighbors will collect litter along a public creek path. This fixture represents a live database record.',
      participants: 0, capacity: 12, status: 'published', isRegistered: false,
    },
  }
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'Access-Control-Expose-Headers': 'X-Supabase-Api-Version' }
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) })

  await page.route(`${AUTH_ORIGIN}/auth/v1/**`, async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const url = new URL(request.url())
    const body = request.postDataJSON()
    state.authRequests.push({ path: url.pathname, grant: url.searchParams.get('grant_type'), url: request.url(), method: request.method(), body, headers: request.headers() })
    if (url.pathname.endsWith('/signup')) return json(route, { ...user, email_confirmed_at: null, confirmed_at: null })
    if (url.pathname.endsWith('/recover')) return json(route, {})
    if (url.pathname.endsWith('/logout')) return json(route, {})
    if (url.pathname.endsWith('/user')) return json(route, user)
    if (url.pathname.endsWith('/token')) {
      if (state.rejectLogin && url.searchParams.get('grant_type') === 'password') return json(route, { code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400)
      if (url.searchParams.get('grant_type') === 'refresh_token') state.session = session('refreshed')
      if (url.searchParams.get('grant_type') === 'pkce') state.session = session('confirmed')
      return json(route, state.session)
    }
    throw new Error(`Unexpected mocked Supabase endpoint: ${request.method()} ${url.pathname}`)
  })

  await page.route(`${ORIGIN}/api/**`, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    const body = request.postDataJSON()
    state.apiRequests.push({ path, method, body, headers: request.headers() })
    if (path === '/api/me') {
      if (state.rejectProfile) return json(route, { error: { code: 'unauthorized', message: 'Please sign in again. Your session could not be verified.' } }, 401)
      if (method === 'PATCH') { state.profile = { ...state.profile, ...body }; return json(route, { profile: state.profile }) }
      return json(route, { profile: state.profile, upcomingEvents: state.registered ? [state.event] : [], attendedEvents: [], stats: { completedEvents: 0, volunteerHours: 0, wasteKg: 0, treesPlanted: 0 } })
    }
    if (path === '/api/events' && method === 'POST') {
      state.event = { ...state.event, ...body, id: EVENT_ID, participants: 0, image: body.image || '/images/forest.jpg', organizerId: USER_ID, organizer: 'Test Neighbor', isSample: false }
      return json(route, { event: state.event }, 201)
    }
    if (path === '/api/events') return json(route, { events: [state.event] })
    if (path === `/api/events/${EVENT_ID}/registration`) {
      state.registered = method === 'POST'
      state.event = { ...state.event, participants: state.registered ? 1 : 0, isRegistered: state.registered }
      return json(route, { registered: state.registered, participants: state.event.participants })
    }
    if (path === `/api/events/${EVENT_ID}`) return json(route, { event: state.event })
    return json(route, { error: { code: 'not_found', message: 'Event not found.' } }, 404)
  })
  return state
}

async function login(page, next = '/profile') {
  await page.goto(`/login?next=${encodeURIComponent(next)}`)
  await page.getByLabel('Email address', { exact: true }).fill(EMAIL)
  await page.getByLabel(/^Password/).fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page).toHaveURL(`${ORIGIN}${next}`)
}

function callbackFrom(request, path) {
  const redirect = new URL(new URL(request.url).searchParams.get('redirect_to'))
  expect(redirect.origin).toBe(ORIGIN)
  expect(redirect.pathname).toBe(path)
  redirect.searchParams.set('code', 'mock-email-verification-code')
  return redirect.toString()
}

test('SDK login, persisted-session refresh, profile editing and logout use authenticated requests', async ({ page }) => {
  const state = await mockServices(page)
  await login(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome, Test Neighbor.', exact: true })).toBeVisible()
  const passwordRequest = state.authRequests.find((request) => request.grant === 'password')
  expect(passwordRequest.body).toMatchObject({ email: EMAIL, password: PASSWORD })
  expect(passwordRequest.headers.apikey).toBe('sb_publishable_phase2_test_public')
  expect(state.apiRequests.find((request) => request.path === '/api/me').headers.authorization).toBe(`Bearer ${state.session.access_token}`)

  await page.getByLabel('Display name', { exact: true }).fill('River Neighbor')
  await page.getByLabel('City', { exact: false }).fill('Durham')
  await page.getByLabel('Your story', { exact: false }).fill('I enjoy keeping local trails welcoming.')
  await page.getByRole('button', { name: 'Save profile', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Your profile has been saved.')
  const update = state.apiRequests.find((request) => request.method === 'PATCH')
  expect(update.body).toMatchObject({ displayName: 'River Neighbor', city: 'Durham', bio: 'I enjoy keeping local trails welcoming.' })
  expect(update.body).not.toHaveProperty('id')
  expect(update.body).not.toHaveProperty('userId')
  expect(update.headers.authorization).toBe(`Bearer ${state.session.access_token}`)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome, River Neighbor.', exact: true })).toBeVisible()
  expect(state.authRequests.filter((request) => request.grant === 'password')).toHaveLength(1)

  // Expire the SDK's own persisted fixture session to exercise its real
  // refresh-token HTTP flow, rather than injecting an AuthContext user.
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((name) => name.endsWith('-auth-token'))
    const stored = JSON.parse(localStorage.getItem(key))
    stored.expires_at = Math.floor(Date.now() / 1000) - 1
    localStorage.setItem(key, JSON.stringify(stored))
  })
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome, River Neighbor.', exact: true })).toBeVisible()
  await expect.poll(() => state.authRequests.filter((request) => request.grant === 'refresh_token').length).toBe(1)
  const refresh = state.authRequests.find((request) => request.grant === 'refresh_token')
  expect(refresh.body.refresh_token).toBe('fixture-refresh-login')
  expect(state.apiRequests.at(-1).headers.authorization).toBe(`Bearer ${state.session.access_token}`)
  await page.getByRole('button', { name: 'Log out', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Your story starts outside.', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('link', { name: 'Log in', exact: true })).toBeVisible()
  expect(state.authRequests.some((request) => request.path.endsWith('/logout'))).toBe(true)
})

test('signup validates fields, requires email confirmation and exchanges its PKCE callback', async ({ page }) => {
  const state = await mockServices(page)
  await page.goto('/signup')
  await page.getByLabel('Display name', { exact: false }).fill('Test Neighbor')
  await page.getByLabel('Email address', { exact: true }).fill('invalid-email')
  await page.getByLabel('Password', { exact: false }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  expect(await page.getByLabel('Email address', { exact: true }).evaluate((input) => input.validity.typeMismatch)).toBe(true)
  expect(state.authRequests).toHaveLength(0)
  await page.getByLabel('Email address', { exact: true }).fill(EMAIL)
  await page.getByLabel('Password', { exact: false }).fill('short')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  expect(state.authRequests).toHaveLength(0)
  await page.getByLabel('Password', { exact: false }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Check your inbox for a confirmation email.')
  await expect(page).toHaveURL(`${ORIGIN}/signup`)
  const signup = state.authRequests.find((request) => request.path.endsWith('/signup'))
  expect(signup.body).toMatchObject({ email: EMAIL, password: PASSWORD, data: { display_name: 'Test Neighbor' }, code_challenge_method: 's256' })
  expect(signup.body.code_challenge).toMatch(/^[A-Za-z0-9_-]+$/)
  expect(state.apiRequests.filter((request) => request.path === '/api/me')).toHaveLength(0)
  await page.goto(callbackFrom(signup, '/auth/callback'))
  await expect(page.getByRole('heading', { name: 'You’re ready to grow.', exact: true })).toBeVisible()
  const exchange = state.authRequests.find((request) => request.grant === 'pkce')
  expect(exchange.body.auth_code).toBe('mock-email-verification-code')
  expect(exchange.body.code_verifier.length).toBeGreaterThan(40)
  await page.getByRole('link', { name: 'Go to your profile', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome, Test Neighbor.', exact: true })).toBeVisible()
})

test('password recovery sends a PKCE email link and requires recovery before changing a password', async ({ page }) => {
  const state = await mockServices(page)
  await page.goto('/reset-password')
  await expect(page.getByRole('button', { name: 'Save new password', exact: true })).toBeDisabled()
  await expect(page.getByRole('status')).toContainText('Open the password reset link from your email')
  await page.getByRole('link', { name: 'Request a new reset link', exact: true }).click()
  await page.getByLabel('Email address', { exact: true }).fill(EMAIL)
  await page.getByRole('button', { name: 'Send reset link', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('If an account uses that email')
  const recovery = state.authRequests.find((request) => request.path.endsWith('/recover'))
  expect(recovery.body).toMatchObject({ email: EMAIL, code_challenge_method: 's256' })
  await page.goto(callbackFrom(recovery, '/reset-password'))
  await expect(page.getByRole('button', { name: 'Save new password', exact: true })).toBeEnabled()
  await page.getByLabel('New password', { exact: false }).first().fill('new-rooted-password')
  await page.getByLabel('Confirm new password', { exact: true }).fill('a-different-password')
  await page.getByRole('button', { name: 'Save new password', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Your passwords don’t match.')
  expect(state.authRequests.filter((request) => request.method === 'PUT')).toHaveLength(0)
  await page.getByLabel('Confirm new password', { exact: true }).fill('new-rooted-password')
  await page.getByRole('button', { name: 'Save new password', exact: true }).click()
  await expect(page).toHaveURL(`${ORIGIN}/profile`)
  await expect(page.getByRole('status').filter({ hasText: 'Your password has been updated.' })).toBeVisible()
  const update = state.authRequests.find((request) => request.method === 'PUT')
  expect(update.body.password).toBe('new-rooted-password')
  expect(update.headers.authorization).toBe(`Bearer ${state.session.access_token}`)
  await page.goto('/reset-password')
  await expect(page.getByRole('button', { name: 'Save new password', exact: true })).toBeDisabled()
})

test('guest gate, event publishing and join/leave requests preserve identity and never award impact', async ({ page }) => {
  const state = await mockServices(page)
  await page.goto('/create')
  await expect(page.getByRole('heading', { name: 'Your next good thing starts here.', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Log in', exact: true })).toHaveAttribute('href', '/login?next=/create')
  await login(page, '/create')
  await page.getByRole('button', { name: 'Publish event', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('A few details need your attention.')
  expect(state.apiRequests.filter((request) => request.method === 'POST')).toHaveLength(0)
  await page.getByLabel('Event name', { exact: false }).fill('Neighbors care for our creek')
  await page.getByLabel('Description', { exact: false }).fill('Join neighbors for a welcoming morning collecting litter by the creek.')
  await page.getByLabel('Start date and time', { exact: true }).fill('2027-05-01T09:00')
  await page.getByLabel('End date and time', { exact: true }).fill('2027-05-01T11:00')
  await page.getByLabel('City', { exact: true }).fill('Chapel Hill')
  await page.getByLabel('Meeting place', { exact: true }).fill('Public creek trail entrance')
  await page.getByLabel('Street address or meeting directions', { exact: false }).fill('100 Creek Street, Chapel Hill')
  await page.getByLabel('Participant limit', { exact: false }).fill('12')
  await page.getByLabel('What to bring and know', { exact: false }).fill('Wear sturdy shoes.\nBring drinking water.')
  await page.getByRole('button', { name: 'Publish event', exact: true }).click()
  await expect(page).toHaveURL(`${ORIGIN}/events/${EVENT_ID}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Neighbors care for our creek', exact: true })).toBeVisible()
  const creation = state.apiRequests.find((request) => request.path === '/api/events' && request.method === 'POST')
  expect(creation.body).toMatchObject({ title: 'Neighbors care for our creek', capacity: 12, instructions: ['Wear sturdy shoes.', 'Bring drinking water.'] })
  expect(new Date(creation.body.startsAt).toISOString()).toBe(creation.body.startsAt)
  expect(creation.body).not.toHaveProperty('organizerId')
  expect(creation.body).not.toHaveProperty('userId')
  expect(creation.headers.authorization).toBe(`Bearer ${state.session.access_token}`)
  await expect(page.getByText('Sample events', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Join event', exact: true }).click()
  await expect.poll(() => state.registered).toBe(true)
  const join = state.apiRequests.find((request) => request.path.endsWith('/registration') && request.method === 'POST')
  expect(join.headers.authorization).toBe(`Bearer ${state.session.access_token}`)
  expect(join.body?.userId).toBeUndefined()
  await page.goto('/profile')
  await expect(page.getByRole('region', { name: 'Your upcoming events', exact: true }).getByRole('link', { name: state.event.title, exact: true })).toBeVisible()
  await expect(page.getByText(/Joining an event alone doesn’t add impact/)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Your participation history', exact: true }).getByText('There’s room for your first chapter.', { exact: true })).toBeVisible()
  await page.goto(`/events/${EVENT_ID}`)
  await page.getByRole('button', { name: 'Leave event', exact: true }).click()
  await expect.poll(() => state.registered).toBe(false)
  const leave = state.apiRequests.find((request) => request.path.endsWith('/registration') && request.method === 'DELETE')
  expect(leave.headers.authorization).toBe(`Bearer ${state.session.access_token}`)
  await page.goto('/profile')
  await expect(page.getByRole('region', { name: 'Your upcoming events', exact: true }).getByTestId('event-card')).toHaveCount(0)
})

test('rejected authentication, unsafe redirects and unauthorized profiles remain honest and accessible', async ({ page }) => {
  test.setTimeout(90_000)
  const state = await mockServices(page)
  state.rejectLogin = true
  await page.goto('/login?next=https://outside.example.test')
  await page.getByLabel('Email address', { exact: true }).fill(EMAIL)
  await page.getByLabel(/^Password/).fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Invalid login credentials')
  await expect(page).toHaveURL(/\/login\?/)
  expect(state.apiRequests.filter((request) => request.path === '/api/me')).toHaveLength(0)
  state.rejectLogin = false
  state.rejectProfile = true
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page).toHaveURL(`${ORIGIN}/profile`)
  await expect(page.getByRole('alert')).toContainText('Please sign in again. Your session could not be verified.')
  await expect(page.getByRole('heading', { name: 'Your profile needs a moment.', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save profile', exact: true })).toHaveCount(0)
  state.rejectProfile = false
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome, Test Neighbor.', exact: true })).toBeVisible()
  for (const width of [375, 430, 1440]) {
    await page.setViewportSize({ width, height: width > 600 ? 1000 : 844 })
    for (const route of ['/profile', '/create']) {
      await page.goto(route)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      if (route === '/profile') await expect(page.getByRole('button', { name: 'Save profile', exact: true })).toBeVisible()
      const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }))
      expect(dimensions.content, `${route} at ${width}px`).toBeLessThanOrEqual(dimensions.viewport + 1)
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
      expect(result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) })), `${route} at ${width}px should be accessible`).toEqual([])
    }
  }
})
