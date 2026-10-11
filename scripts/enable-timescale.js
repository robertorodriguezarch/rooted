import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export async function enableTimescaleActivity(pool) {
  const { rows } = await pool.query(`SELECT n.nspname AS schema FROM pg_extension e
    JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='timescaledb'`)
  if (!rows.length) throw new Error('Enable the timescaledb extension in your Tiger Data service, then rerun npm run db:timescale.')
  const schema = '"' + rows[0].schema.replaceAll('"', '""') + '"'
  await pool.query(`SELECT ${schema}.create_hypertable('ai_request_activity'::regclass, 'recorded_at',
    chunk_time_interval => INTERVAL '1 day', if_not_exists => true, migrate_data => true)`)
  const { rows: tables } = await pool.query(`SELECT count(*)::integer AS count FROM timescaledb_information.hypertables
    WHERE hypertable_schema=current_schema() AND hypertable_name='ai_request_activity'`)
  if (tables[0].count !== 1) throw new Error('The assistant activity hypertable was not found after setup.')
}

async function main() {
  let pool
  try {
    const { createPool } = await import('../server/db.js')
    pool = createPool()
    await enableTimescaleActivity(pool)
    console.log('Timescale assistant activity hypertable is ready. Existing request records are preserved.')
  } catch {
    console.error('Timescale setup failed. Apply npm run db:migrate, confirm the timescaledb extension is enabled in Tiger Data, and check database connectivity and permissions.')
    process.exitCode = 1
  } finally {
    await pool?.end()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
