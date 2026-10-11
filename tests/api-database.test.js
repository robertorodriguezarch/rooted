import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { databaseOptions } from '../server/db.js'
import { createApiHandler } from '../server/router.js'
import { runMigrations } from '../scripts/migrate.js'

async function invoke(handler, { method = 'GET', path = '/api/me', token, body } = {}) {
  const request = Readable.from(body === undefined ? [] : [JSON.stringify(body)])
  Object.assign(request, { method, url: path, headers: token ? { authorization: `Bearer ${token}` } : {} })
  const response = { setHeader() {}, end(text) { this.body = JSON.parse(text) } }
  await handler(request, response)
  return { status: response.statusCode, body: response.body }
}

const testUrl = process.env.DATABASE_TEST_URL

test('real PostgreSQL: health requires the assistant migration before reporting ready', { skip: !testUrl }, async () => {
  const schema = `health_test_${randomUUID().replaceAll('-', '')}`
  const admin = new pg.Pool(databaseOptions(testUrl))
  await admin.query(`CREATE SCHEMA ${schema}`)
  const pool = new pg.Pool({ ...databaseOptions(testUrl), options: `-c search_path=${schema},public` })
  const migrationsDirectory = await mkdtemp(join(tmpdir(), 'rooted-health-migrations-'))
  const handler = createApiHandler({ pool, authConfigured: true })
  try {
    // Copy the unchanged historical migration; the application's real database
    // and migration files are never modified by this isolated readiness check.
    const initial = await readFile(new URL('../db/migrations/001_initial_schema.sql', import.meta.url), 'utf8')
    await writeFile(join(migrationsDirectory, '001_initial_schema.sql'), initial)
    assert.deepEqual(await runMigrations(pool, { migrationsDirectory }), ['001_initial_schema.sql'])
    assert.deepEqual(await invoke(handler, { path: '/api/health' }), {
      status: 503, body: { status: 'degraded', database: false, auth: true },
    })

    assert.deepEqual(await runMigrations(pool), ['002_grow_neighbor.sql'])
    assert.deepEqual(await invoke(handler, { path: '/api/health' }), {
      status: 200, body: { status: 'ready', database: true, auth: true },
    })
  } finally {
    await pool.end()
    await admin.query(`DROP SCHEMA ${schema} CASCADE`)
    await admin.end()
    await rm(migrationsDirectory, { recursive: true, force: true })
  }
})

test('real PostgreSQL: profiles, authorization, event capacity and verified-only impact', { skip: !testUrl }, async () => {
  const schema = `api_test_${randomUUID().replaceAll('-', '')}`
  const admin = new pg.Pool(databaseOptions(testUrl))
  await admin.query(`CREATE SCHEMA ${schema}`)
  const pool = new pg.Pool({ ...databaseOptions(testUrl), options: `-c search_path=${schema},public` })
  const users = {
    organizer: { id: randomUUID(), user_metadata: { display_name: 'Organizer' }, email: 'private@example.com' },
    alice: { id: randomUUID(), email: 'alice@example.com' },
    bob: { id: randomUUID(), email: 'bob@example.com' },
  }
  const handler = createApiHandler({ pool, authConfigured: true, now: () => Date.parse('2026-10-10T12:00:00Z'), verifyUser: async (token) => users[token] })
  const call = (token, method, path, body) => invoke(handler, { token, method, path, body })
  try {
    await runMigrations(pool)
    assert.equal((await call(undefined, 'GET', '/api/health')).status, 200)
    const initial = await call('alice', 'GET', '/api/me')
    assert.equal(initial.status, 200)
    assert.equal(initial.body.profile.displayName, 'Rooted neighbor')
    assert.doesNotMatch(JSON.stringify(initial.body), /alice@example.com/)
    await call('alice', 'GET', '/api/me')
    assert.equal((await pool.query('SELECT count(*)::integer AS count FROM profiles WHERE user_id=$1', [users.alice.id])).rows[0].count, 1)
    const patched = await call('alice', 'PATCH', '/api/me', { displayName: 'Alice', userId: users.organizer.id, bio: 'Cares for the creek' })
    assert.equal(patched.body.profile.userId, users.alice.id)
    assert.equal(patched.body.profile.displayName, 'Alice')

    const created = await call('organizer', 'POST', '/api/events', {
      title: 'Community cleanup', description: 'A real database-backed development event.', category: 'cleanup',
      startsAt: '2026-10-20T10:00:00Z', endsAt: '2026-10-20T12:00:00Z', city: 'Durham',
      location: 'Public trail', address: 'Meeting point', capacity: 1,
      organizerId: users.alice.id, communityId: randomUUID(), isSample: true,
    })
    assert.equal(created.status, 201)
    assert.equal(created.body.event.organizerId, users.organizer.id)
    assert.equal(created.body.event.isSample, false)
    assert.equal(created.body.event.community, null)
    const id = created.body.event.id
    const path = `/api/events/${id}`
    assert.equal((await call('alice', 'PATCH', path, { title: 'Unauthorized' })).status, 403)
    assert.equal((await call('organizer', 'PATCH', path, { title: 'Updated cleanup' })).body.event.title, 'Updated cleanup')
    assert.equal((await call(undefined, 'GET', '/api/events?q=updated&category=cleanup&location=Durham')).body.events.length, 1)
    assert.equal((await call(undefined, 'GET', '/api/events?q=%25')).body.events.length, 0)
    const joins = await Promise.all(['alice', 'bob'].map((token) => call(token, 'POST', `${path}/registration`, { userId: users.organizer.id, volunteerHours: 100 })))
    assert.deepEqual(joins.map((result) => result.status).sort(), [200, 409])
    const winner = joins[0].status === 200 ? 'alice' : 'bob'
    assert.deepEqual((await call(winner, 'POST', `${path}/registration`)).body, { registered: true, participants: 1 })
    assert.equal((await pool.query("SELECT count(*)::integer AS count FROM event_registrations WHERE status='registered'")).rows[0].count, 1)
    assert.equal((await call('organizer', 'PATCH', path, { capacity: null })).status, 200)
    const me = await call(winner, 'GET', '/api/me')
    assert.equal(me.body.upcomingEvents.length, 1)
    assert.deepEqual(me.body.stats, { completedEvents: 0, volunteerHours: 0, wasteKg: 0, treesPlanted: 0 })
    assert.deepEqual((await call(winner, 'DELETE', `${path}/registration`)).body, { registered: false, participants: 0 })
    assert.deepEqual((await call(winner, 'DELETE', `${path}/registration`)).body, { registered: false, participants: 0 })
    assert.equal((await call(winner, 'POST', `${path}/registration`)).status, 200)

    // Only organizer-verified completions contribute; registration above awarded nothing.
    const attendance = await pool.query(`INSERT INTO event_attendance (event_id,user_id,attendance_status,completed,verified_by,verified_at)
      VALUES ($1,$2,'present',true,$3,now()) RETURNING id`, [id, users[winner].id, users.organizer.id])
    await pool.query(`INSERT INTO environmental_contributions (attendance_id,metric,amount,unit,verified_by)
      VALUES ($1,'volunteer_hours',2,'hours',$2), ($1,'waste_kg',3.5,'kg',$2), ($1,'trees_planted',4,'trees',$2)`, [attendance.rows[0].id, users.organizer.id])
    assert.deepEqual((await call(winner, 'GET', '/api/me')).body.stats, { completedEvents: 1, volunteerHours: 2, wasteKg: 3.5, treesPlanted: 4 })
    await call('organizer', 'PATCH', path, { status: 'canceled' })
    assert.equal((await call(winner, 'POST', `${path}/registration`)).status, 409)
  } finally {
    await pool.end()
    await admin.query(`DROP SCHEMA ${schema} CASCADE`)
    await admin.end()
  }
})
