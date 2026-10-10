import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const defaultMigrationsDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../db/migrations')

export class MigrationIntegrityError extends Error {
  constructor(filename, reason) {
    super(`Migration ${filename} ${reason}. Restore its original contents and add a new migration.`)
    this.name = 'MigrationIntegrityError'
  }
}

export async function readMigrations(migrationsDirectory = defaultMigrationsDirectory) {
  const filenames = (await readdir(migrationsDirectory))
    .filter((filename) => /^\d+_[a-z0-9_]+\.sql$/.test(filename))
    .sort()
  return Promise.all(filenames.map(async (filename) => {
    const sql = await readFile(resolve(migrationsDirectory, filename), 'utf8')
    return { filename, sql, checksum: createHash('sha256').update(sql).digest('hex') }
  }))
}

// A single transaction and advisory lock prevent competing deployments from
// applying the same migration. Checksums keep applied migration history intact.
export async function runMigrations(pool, { migrationsDirectory = defaultMigrationsDirectory } = {}) {
  const migrations = await readMigrations(migrationsDirectory)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock($1)', [1876439201])
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`)
    const { rows: applied } = await client.query('SELECT filename, checksum FROM schema_migrations ORDER BY filename')
    const available = new Map(migrations.map((migration) => [migration.filename, migration]))
    for (const previous of applied) {
      const current = available.get(previous.filename)
      if (!current) throw new MigrationIntegrityError(previous.filename, 'is missing')
      if (current.checksum !== previous.checksum) throw new MigrationIntegrityError(previous.filename, 'has changed')
    }
    const appliedFilenames = new Set(applied.map((migration) => migration.filename))
    const added = []
    for (const migration of migrations) {
      if (appliedFilenames.has(migration.filename)) continue
      await client.query(migration.sql)
      await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', [migration.filename, migration.checksum])
      added.push(migration.filename)
    }
    await client.query('COMMIT')
    return added
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export const migrate = runMigrations

async function main() {
  let pool
  try {
    const { createPool } = await import('../server/db.js')
    pool = createPool()
    const added = await runMigrations(pool)
    console.log(added.length ? `Applied ${added.length} database migration(s).` : 'Database migrations are current.')
  } catch (error) {
    // Driver errors can include connection details. Print only a safe category.
    console.error(error instanceof MigrationIntegrityError ? error.message : 'Database migration failed. Check DATABASE_URL, connectivity, permissions, and PostgreSQL compatibility.')
    process.exitCode = 1
  } finally {
    await pool?.end()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
