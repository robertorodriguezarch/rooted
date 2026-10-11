import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import pg from 'pg'
import { databaseOptions } from '../server/db.js'
import { createApiHandler } from '../server/router.js'
import { runMigrations } from '../scripts/migrate.js'
import { ApiError } from '../server/errors.js'
import { enableTimescaleActivity } from '../scripts/enable-timescale.js'

async function invoke(handler, { token, method = 'POST', path = '/api/grow-neighbor', body = { message: 'Find a cleanup.', city: 'Durham' } } = {}) {
  const request = Readable.from(body === undefined ? [] : [JSON.stringify(body)])
  Object.assign(request, { method, url: path, headers: token ? { authorization: `Bearer ${token}` } : {} })
  const response = { setHeader() {}, end(text) { this.body = JSON.parse(text) } }
  await handler(request, response)
  return { status: response.statusCode, body: response.body }
}

async function isolatedDatabase(operation) {
  const schema = `neighbor_test_${randomUUID().replaceAll('-', '')}`
  const admin = new pg.Pool(databaseOptions(process.env.DATABASE_TEST_URL))
  let pool
  try {
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new pg.Pool({ ...databaseOptions(process.env.DATABASE_TEST_URL), options: `-c search_path=${schema},public` })
    await runMigrations(pool)
    await operation(pool, schema)
  } finally {
    await pool?.end()
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    await admin.end()
  }
}

test('assistant authentication and validation stop before database work or Gemini calls', async () => {
  let calls = 0
  const handler = createApiHandler({ getPool: () => { calls++; throw new Error('Must not connect') }, verifyUser: async () => ({ id: randomUUID() }), recommend: async () => { calls++; throw new Error('Must not call Gemini') } })
  assert.equal((await invoke(handler)).status, 401)
  assert.equal((await invoke(handler, { token: 'fixture', body: { message: 'x'.repeat(1001) } })).status, 400)
  assert.equal((await invoke(handler, { method: 'GET', path: '/api/grow-neighbor/activity' })).status, 401)
  assert.equal((await invoke(handler, { method: 'GET' })).status, 405)
  assert.equal(calls, 0)
})

test('database-backed recommendations link to eligible events, persist registration and isolate append-only activity', { skip: !process.env.DATABASE_TEST_URL }, async () => {
  await isolatedDatabase(async (pool, schema) => {
    const users = { organizer: { id: randomUUID() }, neighbor: { id: randomUUID() }, other: { id: randomUUID() } }
    const now = Date.parse('2026-10-10T12:30:00Z')
    let chosen
    let candidates
    const handler = createApiHandler({ pool, verifyUser: async token => users[token], now: () => now, recommend: async request => {
      candidates = request.events
      assert.equal(request.city, 'Durham')
      return { answer: 'A cleanup is a good first step.', eventIds: [chosen, chosen], model: 'sdk-fixture', recommendations: [{ title: 'Forged title', id: randomUUID() }] }
    } })
    const create = async (title, changes = {}) => {
      const response = await invoke(handler, { token: 'organizer', method: 'POST', path: '/api/events', body: { title, description: 'A welcoming development event for testing.', category: 'cleanup', startsAt: '2026-10-20T10:00:00Z', endsAt: '2026-10-20T12:00:00Z', city: 'Durham', location: 'Public trail', address: 'Park entrance', ...changes } })
      assert.equal(response.status, 201)
      return response.body.event.id
    }
    chosen = await create('Canonical creek cleanup')
    const sample = await create('Sample cleanup')
    const past = await create('Past cleanup')
    const draft = await create('Draft cleanup')
    const full = await create('Full cleanup', { capacity: 1 })
    await create('Different city cleanup', { city: 'Chapel Hill' })
    await pool.query('UPDATE events SET is_sample=true WHERE id=$1', [sample])
    await pool.query("UPDATE events SET starts_at='2026-09-01',ends_at='2026-09-02' WHERE id=$1", [past])
    await pool.query("UPDATE events SET status='draft' WHERE id=$1", [draft])
    assert.equal((await invoke(handler, { token: 'other', path: `/api/events/${full}/registration`, body: {} })).status, 200)
    const result = await invoke(handler, { token: 'neighbor', body: { message: 'Find a cleanup.', city: 'Durham', userId: users.other.id } })
    assert.equal(result.status, 200)
    assert.deepEqual(candidates.map(event => event.id), [chosen])
    assert.deepEqual(result.body.recommendations.map(event => event.id), [chosen])
    assert.equal(result.body.recommendations[0].title, 'Canonical creek cleanup')
    assert.equal(result.body.recommendations[0].isSample, false)
    assert.equal((await invoke(handler, { token: 'neighbor', path: `/api/events/${chosen}/registration`, body: {} })).status, 200)
    const profile = await invoke(handler, { token: 'neighbor', method: 'GET', path: '/api/me', body: undefined })
    assert.deepEqual(profile.body.upcomingEvents.map(event => event.id), [chosen])
    assert.equal(profile.body.stats.completedEvents, 0)
    assert.equal(profile.body.stats.volunteerHours, 0)
    const activity = await invoke(handler, { token: 'neighbor', method: 'GET', path: '/api/grow-neighbor/activity', body: undefined })
    assert.equal(activity.status, 200)
    assert.equal(activity.body.summary.requests, 1)
    assert.equal(activity.body.summary.successfulRequests, 1)
    const extension = await pool.query("SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='timescaledb') AS enabled")
    const timescale = extension.rows[0].enabled
    if (process.env.ROOTED_TEST_TIMESCALE === '1') assert.equal(timescale, true, 'The Timescale test run must actually enable the extension')
    assert.equal(activity.body.engine, timescale ? 'timescale' : 'postgres')
    assert.equal(activity.body.buckets[0].hour, '2026-10-10T12:00:00.000Z')
    if (timescale) {
      await enableTimescaleActivity(pool)
      await enableTimescaleActivity(pool)
      assert.equal((await pool.query("SELECT count(*)::integer AS count FROM timescaledb_information.hypertables WHERE hypertable_schema=$1 AND hypertable_name='ai_request_activity'", [schema])).rows[0].count, 1)
    } else await assert.rejects(enableTimescaleActivity(pool), /Enable the timescaledb extension/)
    const privateActivity = await invoke(handler, { token: 'other', method: 'GET', path: '/api/grow-neighbor/activity', body: undefined })
    assert.equal(privateActivity.body.summary.requests, 0)
    await assert.rejects(pool.query('UPDATE ai_request_activity SET recommendation_count=0'), { code: '55000' })
    await assert.rejects(pool.query('DELETE FROM ai_request_activity'), { code: '55000' })
    const columns = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='ai_request_activity'", [schema])
    assert.ok(!columns.rows.some(row => /prompt|answer|token|email/.test(row.column_name)))
    assert.deepEqual(await runMigrations(pool), [])
  })
})

test('shared database limits are atomic across handlers and failed Gemini attempts are counted safely', { skip: !process.env.DATABASE_TEST_URL }, async () => {
  await isolatedDatabase(async pool => {
    const user = { id: randomUUID() }
    const now = Date.parse('2026-10-10T12:30:00Z')
    let providerCalls = 0
    const recommend = async () => {
      providerCalls++
      if (providerCalls === 1) throw new ApiError(503, 'Gemini is unavailable.', 'ai_unavailable')
      return { answer: 'Try reducing household waste while looking for a local event.', eventIds: [], model: 'sdk-fixture' }
    }
    const handlers = [createApiHandler({ pool, now: () => now, verifyUser: async () => user, recommend }), createApiHandler({ pool, now: () => now, verifyUser: async () => user, recommend })]
    const results = await Promise.all(Array.from({ length: 8 }, (_, index) => invoke(handlers[index % 2], { token: 'neighbor' })))
    assert.equal(results.filter(result => result.status === 429).length, 3)
    assert.equal(results.filter(result => result.status === 503).length, 1)
    assert.equal(results.filter(result => result.status === 200).length, 4)
    assert.equal(providerCalls, 5)
    const activity = await invoke(handlers[0], { token: 'neighbor', method: 'GET', path: '/api/grow-neighbor/activity', body: undefined })
    assert.equal(activity.body.summary.requests, 5)
    assert.equal(activity.body.summary.successfulRequests, 4)
    const limits = await pool.query('SELECT requests FROM ai_request_limits ORDER BY window_seconds')
    assert.deepEqual(limits.rows.map(row => row.requests), [5, 5])
    const errors = await pool.query('SELECT error_code FROM ai_request_activity WHERE success=false')
    assert.deepEqual(errors.rows.map(row => row.error_code), ['ai_unavailable'])
  })
})

test('events that become unavailable during Gemini generation are removed from the returned cards', { skip: !process.env.DATABASE_TEST_URL }, async () => {
  await isolatedDatabase(async pool => {
    const user = { id: randomUUID() }
    let eventId
    const handler = createApiHandler({ pool, now: () => Date.parse('2026-10-10T12:30:00Z'), verifyUser: async () => user, recommend: async () => {
      await pool.query("UPDATE events SET status='canceled' WHERE id=$1", [eventId])
      return { answer: 'Check availability before joining.', eventIds: [eventId], model: 'sdk-fixture' }
    } })
    const event = await invoke(handler, { token: 'neighbor', path: '/api/events', body: { title: 'Future creek cleanup', description: 'A welcoming cleanup event for the whole neighborhood.', category: 'cleanup', startsAt: '2026-10-20T10:00:00Z', endsAt: '2026-10-20T12:00:00Z', city: 'Durham', location: 'Public park', address: 'Entrance' } })
    assert.equal(event.status, 201)
    eventId = event.body.event.id
    const result = await invoke(handler, { token: 'neighbor' })
    assert.equal(result.status, 200)
    assert.deepEqual(result.body.recommendations, [])
  })
})
