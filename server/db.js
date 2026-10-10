import { readFileSync } from 'node:fs'
import pg from 'pg'
import './config.js'
import { ApiError } from './errors.js'

export function databaseOptions(connectionString, environment = process.env) {
  if (!connectionString) throw new ApiError(503, 'The database has not been configured yet.', 'database_unconfigured')
  let parsed
  try { parsed = new URL(connectionString) } catch { throw new ApiError(503, 'The database configuration needs attention.', 'database_configuration') }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new ApiError(503, 'The database configuration needs attention.', 'database_configuration')
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  const sslMode = parsed.searchParams.get('sslmode')
  if (sslMode === 'disable' && !local) throw new ApiError(503, 'Remote database connections require verified TLS.', 'database_configuration')
  let ssl = local && (!sslMode || sslMode === 'disable') ? false : { rejectUnauthorized: true }
  const certificatePath = parsed.searchParams.get('sslrootcert')
  if (ssl && certificatePath) ssl.ca = readFileSync(certificatePath, 'utf8')
  if (ssl && environment.DATABASE_CA_CERT) ssl.ca = environment.DATABASE_CA_CERT
  // pg's URL parser may otherwise replace the explicit verified TLS options.
  for (const name of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'ssl', 'sslrejectunauthorized']) parsed.searchParams.delete(name)
  return {
    connectionString: parsed.toString(), ssl, max: 3,
    idleTimeoutMillis: 20_000, connectionTimeoutMillis: 8_000, statement_timeout: 10_000,
    application_name: 'rooted',
  }
}

export function createPool(connectionString = process.env.DATABASE_URL) {
  const pool = new pg.Pool(databaseOptions(connectionString))
  // An idle connection error must not crash a serverless invocation or print credentials.
  pool.on('error', () => {})
  return pool
}

let sharedPool
export function getPool() {
  if (!sharedPool) sharedPool = createPool()
  return sharedPool
}

export async function withTransaction(pool, operation) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await operation(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}
