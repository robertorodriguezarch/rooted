import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { createServer } from 'node:http'
import { createApiHandler } from '../server/router.js'
import { databaseOptions } from '../server/db.js'
import { getAuthConfiguration } from '../server/config.js'
import { createAuthFetch, readAccessToken } from '../server/auth.js'
import { validateEvent, validateProfile } from '../server/validation.js'

export async function invoke(handler, { method = 'GET', path = '/api/me', token, body } = {}) {
  const request = Readable.from(body === undefined ? [] : [JSON.stringify(body)])
  request.method = method
  request.url = path
  request.headers = token ? { authorization: `Bearer ${token}` } : {}
  const response = { headers: {}, setHeader(key, value) { this.headers[key] = value }, end(text) { this.body = JSON.parse(text) } }
  await handler(request, response)
  return { status: response.statusCode, body: response.body, headers: response.headers }
}

const futureEvent = {
  title: 'Care for the trail', description: 'An outdoor community cleanup.', category: 'cleanup',
  startsAt: '2099-01-01T10:00:00Z', endsAt: '2099-01-01T12:00:00Z', city: 'Durham',
  location: 'Welcome point', address: 'Public meeting point', capacity: 20,
}

test('verified TLS remains enabled for remote PostgreSQL URLs, including sslmode=require', () => {
  for (const suffix of ['', '?sslmode=require', '?sslmode=verify-full', '?ssl=true']) {
    const config = databaseOptions(`postgresql://neighbor:password@db.example.com/rooted${suffix}`, {})
    assert.equal(config.ssl.rejectUnauthorized, true)
    assert.equal(new URL(config.connectionString).searchParams.has('sslmode'), false)
    assert.equal(config.max, 3)
  }
  assert.throws(() => databaseOptions('postgres://neighbor:password@db.example.com/rooted?sslmode=disable', {}), /verified TLS/)
  assert.equal(databaseOptions('postgres://neighbor:password@127.0.0.1/rooted?sslmode=disable', {}).ssl, false)
})

test('authentication requires a bearer token and configuration accepts only secure public URLs', () => {
  assert.throws(() => readAccessToken({ headers: {} }), (error) => error.status === 401)
  assert.throws(() => readAccessToken({ headers: { authorization: 'Bearer x extra' } }), (error) => error.status === 401)
  assert.equal(readAccessToken({ headers: {} }, false), null)
  assert.equal(getAuthConfiguration({ SUPABASE_URL: 'http://supabase.example.com', SUPABASE_PUBLISHABLE_KEY: 'key' }), null)
  assert.ok(getAuthConfiguration({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'public-key' }))
})

test('auth requests preserve request options and caller cancellation, and abort stalled upstream requests', async () => {
  const server = createServer((request, response) => {
    if (request.url === '/stall') return
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ method: request.method, marker: request.headers['x-marker'] }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const authFetch = createAuthFetch({ timeoutMs: 1000 })
  try {
    const successful = await authFetch(`${base}/ready`, { method: 'POST', headers: { 'X-Marker': 'kept' } })
    assert.deepEqual(await successful.json(), { method: 'POST', marker: 'kept' })
    await assert.rejects(createAuthFetch({ timeoutMs: 30 })(`${base}/stall`), (error) => error.name === 'TimeoutError')
    const caller = new AbortController()
    caller.abort(new Error('caller canceled'))
    await assert.rejects(authFetch(`${base}/stall`, { signal: caller.signal }), /caller canceled/)
    const requestController = new AbortController()
    const request = new Request(`${base}/stall`, { signal: requestController.signal })
    requestController.abort(new Error('request canceled'))
    await assert.rejects(authFetch(request), /request canceled/)
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('profile and event validation cannot set identity, impact, or untrusted local image paths', () => {
  assert.deepEqual(validateProfile({ displayName: 'Neighbor', userId: 'someone-else', volunteerHours: 999 }), { display_name: 'Neighbor' })
  const validated = validateEvent({ ...futureEvent, organizerId: 'forged', isSample: true, featured: true, communityId: 'forged' })
  assert.equal(validated.organizer_id, undefined)
  assert.equal(validated.is_sample, undefined)
  assert.equal(validated.community_id, undefined)
  for (const image of ['javascript:alert(1)', 'http://example.com/a.jpg', '/images/../../private', 'https://user:secret@example.com/a']) {
    assert.throws(() => validateEvent({ ...futureEvent, image }), (error) => error.status === 400)
  }
  assert.throws(() => validateEvent({ ...futureEvent, capacity: 1.5 }), (error) => error.status === 400)
  assert.throws(() => validateProfile({ avatarUrl: '/images/forest.jpg' }), (error) => error.status === 400)
})

test('unauthenticated profile requests never reach the database; invalid identities are rejected', async () => {
  let queries = 0
  const pool = { query() { queries += 1; throw new Error('Should not query') } }
  const handler = createApiHandler({ pool, verifyUser: async () => ({ id: 'forged-identity' }) })
  assert.equal((await invoke(handler)).status, 401)
  assert.equal((await invoke(handler, { token: 'invalid' })).status, 401)
  assert.equal(queries, 0)
})

test('health distinguishes missing configuration; driver errors never expose SQL or credentials', async () => {
  const missing = createApiHandler({ databaseConfigured: false, authConfigured: false })
  assert.deepEqual((await invoke(missing, { path: '/api/health' })).body, { status: 'unconfigured', database: false, auth: false })
  const pool = { async query() { throw new Error('SELECT secret FROM private; postgres://user:password@host/db') } }
  const handler = createApiHandler({ pool, authConfigured: true })
  const health = await invoke(handler, { path: '/api/health' })
  assert.equal(health.status, 503)
  assert.equal(health.body.status, 'degraded')
  const events = await invoke(handler, { path: '/api/events' })
  assert.equal(events.status, 503)
  assert.equal(events.body.error.code, 'service_unavailable')
  assert.doesNotMatch(JSON.stringify(events.body), /password|SELECT|postgres:/)
})
