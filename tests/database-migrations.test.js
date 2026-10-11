import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import pg from 'pg'
import { createPool, databaseOptions } from '../server/db.js'
import { MigrationIntegrityError, readMigrations, runMigrations } from '../scripts/migrate.js'
import { sampleId, seed } from '../scripts/seed.js'
import { events } from '../src/data/events.js'

// These tests create and remove an isolated schema in the explicitly supplied
// test database. They never connect to DATABASE_URL or alter application data.
describe('PostgreSQL migrations and sample seed', { skip: !process.env.DATABASE_TEST_URL }, () => {
  const schema = `rooted_test_${randomUUID().replaceAll('-', '')}`
  let adminPool
  let pool

  before(async () => {
    adminPool = createPool(process.env.DATABASE_TEST_URL)
    await adminPool.query(`CREATE SCHEMA ${schema}`)
    pool = new pg.Pool({ ...databaseOptions(process.env.DATABASE_TEST_URL), options: `-c search_path=${schema}` })
    pool.on('error', () => {})
  })

  after(async () => {
    await pool?.end()
    if (adminPool) {
      await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await adminPool.end()
    }
  })

  it('applies once, rejects changed history, and rolls back a failed new migration', async () => {
    const migrations = await readMigrations()
    assert.deepEqual(await runMigrations(pool), migrations.map(({ filename }) => filename))
    assert.deepEqual(await runMigrations(pool), [])
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'rooted-migrations-'))
    try {
      const initial = await readFile(new URL('../db/migrations/001_initial_schema.sql', import.meta.url), 'utf8')
      const initialPath = join(temporaryDirectory, '001_initial_schema.sql')
      for (const { filename, sql } of migrations) await writeFile(join(temporaryDirectory, filename), sql)
      await writeFile(initialPath, `${initial}\n-- Changed historical migration\n`)
      await assert.rejects(runMigrations(pool, { migrationsDirectory: temporaryDirectory }), MigrationIntegrityError)
      await writeFile(initialPath, initial)
      await writeFile(join(temporaryDirectory, '999_failed.sql'), 'CREATE TABLE should_rollback (id integer); SELECT * FROM missing_table;')
      await assert.rejects(runMigrations(pool, { migrationsDirectory: temporaryDirectory }), { code: '42P01' })
      assert.equal((await pool.query("SELECT to_regclass('should_rollback') AS name")).rows[0].name, null)
      assert.equal((await pool.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count, migrations.length)
      assert.deepEqual(await runMigrations(pool), [])
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true })
    }
  })

  it('seeds nine labeled events without fake participation and preserves existing records on rerun', async () => {
    const ids = await seed(pool)
    assert.equal(ids.length, 9)
    assert.equal(new Set(ids).size, 9)
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM events WHERE is_sample')).rows[0].count, 9)
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM communities WHERE is_sample')).rows[0].count, 3)
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM profiles WHERE is_sample')).rows[0].count, 9)
    for (const table of ['event_registrations', 'event_attendance', 'environmental_contributions', 'contribution_journal']) {
      assert.equal((await pool.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count, 0)
    }
    const organizerId = sampleId('organizer', events[0].organizer)
    await pool.query('UPDATE events SET title = $2 WHERE id = $1', [ids[0], 'An edited event to preserve'])
    await pool.query('UPDATE profiles SET display_name = $2 WHERE user_id = $1', [organizerId, 'An edited organizer to preserve'])
    assert.deepEqual(await seed(pool), ids)
    assert.equal((await pool.query('SELECT title FROM events WHERE id = $1', [ids[0]])).rows[0].title, 'An edited event to preserve')
    assert.equal((await pool.query('SELECT display_name FROM profiles WHERE user_id = $1', [organizerId])).rows[0].display_name, 'An edited organizer to preserve')
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM events')).rows[0].count, 9)
  })

  it('rejects duplicate registrations, unverifiable completion, invalid metric units and quantities, and journal rewrites', async () => {
    const eventId = sampleId('event', events[0].id)
    const verifierId = sampleId('organizer', events[0].organizer)
    const userId = randomUUID()
    await pool.query('INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)', [userId, 'Test neighbor'])
    await assert.rejects(pool.query('INSERT INTO event_attendance (event_id, user_id) VALUES ($1, $2)', [eventId, userId]), { code: '23503' })
    await pool.query('INSERT INTO event_registrations (event_id, user_id) VALUES ($1, $2)', [eventId, userId])
    await assert.rejects(pool.query('INSERT INTO event_registrations (event_id, user_id) VALUES ($1, $2)', [eventId, userId]), { code: '23505' })
    await assert.rejects(pool.query(`INSERT INTO event_attendance (event_id, user_id, attendance_status, completed)
      VALUES ($1, $2, 'present', true)`, [eventId, userId]), { code: '23514' })
    const { rows: attendance } = await pool.query(`INSERT INTO event_attendance
      (event_id, user_id, attendance_status, completed, verified_by, verified_at)
      VALUES ($1, $2, 'present', true, $3, now()) RETURNING id`, [eventId, userId, verifierId])
    const attendanceId = attendance[0].id
    for (const [metric, amount, unit] of [
      ['volunteer_hours', -1, 'hours'], ['volunteer_hours', 'NaN', 'hours'],
      ['waste_kg', 2, 'hours'], ['trees_planted', 1.5, 'trees'],
    ]) {
      await assert.rejects(pool.query(`INSERT INTO environmental_contributions
        (attendance_id, metric, amount, unit, verified_by) VALUES ($1, $2, $3, $4, $5)`,
      [attendanceId, metric, amount, unit, verifierId]), { code: '23514' })
    }
    const { rows: contributions } = await pool.query(`INSERT INTO environmental_contributions
      (attendance_id, metric, amount, unit, verified_by) VALUES ($1, 'volunteer_hours', 2, 'hours', $2) RETURNING id`,
    [attendanceId, verifierId])
    const { rows: operations } = await pool.query(`INSERT INTO verification_operations
      (idempotency_key, request_hash, actor_id) VALUES ($1, $2, $3) RETURNING id`, ['test-verification', 'test-request-hash', verifierId])
    await assert.rejects(pool.query(`INSERT INTO verification_operations
      (idempotency_key, request_hash, actor_id) VALUES ($1, $2, $3)`, ['test-verification', 'different-request-hash', verifierId]), { code: '23505' })
    await pool.query(`INSERT INTO verification_operations
      (idempotency_key, request_hash, actor_id) VALUES ($1, $2, $3)`, ['test-verification', 'another-organizer-request-hash', userId])
    const { rows: journal } = await pool.query(`INSERT INTO contribution_journal
      (contribution_id, event_id, user_id, metric, unit, delta, contributed_at, verified_by, operation_id)
      VALUES ($1, $2, $3, 'volunteer_hours', 'hours', 2, now(), $4, $5) RETURNING id`,
    [contributions[0].id, eventId, userId, verifierId, operations[0].id])
    await assert.rejects(pool.query('UPDATE contribution_journal SET delta = 3 WHERE id = $1', [journal[0].id]), { code: '55000' })
    await assert.rejects(pool.query('DELETE FROM contribution_journal WHERE id = $1', [journal[0].id]), { code: '55000' })
    await pool.query(`INSERT INTO contribution_journal
      (contribution_id, event_id, user_id, metric, unit, delta, contributed_at, verified_by, operation_id)
      VALUES ($1, $2, $3, 'volunteer_hours', 'hours', -0.5, now(), $4, $5)`,
    [contributions[0].id, eventId, userId, verifierId, operations[0].id])
    assert.equal((await pool.query('SELECT sum(delta)::float AS amount FROM contribution_journal WHERE user_id = $1', [userId])).rows[0].amount, 1.5)
  })
})
