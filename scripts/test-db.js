import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { constants } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const repository = fileURLToPath(new URL('..', import.meta.url))
const timescale = process.argv.includes('--timescale')
const image = timescale
  ? 'timescale/timescaledb:latest-pg17@sha256:836e3eda797a144f6327b9a280c7c30368e4158ecb5f4bc0012aa3247c2b4018'
  : 'postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24'
const container = `rooted-test-db-${process.pid}-${randomBytes(6).toString('hex')}`
let containerStarted = false
let interrupted
let tests
let killTimer

const signalExitCode = (signal) => 128 + (constants.signals[signal] || 1)
function interrupt(signal) {
  if (interrupted) return
  interrupted = signal
  if (tests) {
    tests.kill(signal)
    killTimer = setTimeout(() => tests?.kill('SIGKILL'), 5_000)
  }
}
const onInterrupt = () => interrupt('SIGINT')
const onTerminate = () => interrupt('SIGTERM')
process.on('SIGINT', onInterrupt)
process.on('SIGTERM', onTerminate)

function checkInterrupted() {
  if (interrupted) throw new Error('Database test run interrupted.')
}

function docker(args) {
  return new Promise((resolveCommand, reject) => {
    // Only generated local container names and the pinned public image are
    // passed to Docker. Do not forward command errors or arbitrary env values.
    const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'ignore'] })
    let output = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { output += chunk })
    child.on('error', () => reject(new Error('Docker is required for database tests. Start a local Docker daemon and try again.')))
    child.on('close', (code) => code === 0
      ? resolveCommand(output.trim())
      : reject(new Error(`Docker ${args[0]} failed. Check the local Docker daemon and access to the pinned PostgreSQL image.`)))
  })
}

async function waitForPostgres(port) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    checkInterrupted()
    const client = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', database: 'rooted_test', ssl: false, connectionTimeoutMillis: 1_000, query_timeout: 1_000 })
    try {
      await client.connect()
      await client.query('SELECT 1')
      return
    } catch {
      // Startup refusals are expected. Driver errors can contain connection
      // details, so report only the final safe readiness message below.
    } finally {
      await client.end().catch(() => {})
    }
    await new Promise((ready) => setTimeout(ready, 250))
  }
  throw new Error('The disposable PostgreSQL database did not become ready within 30 seconds.')
}

function runTests(filenames, testUrl) {
  return new Promise((resolveTests, reject) => {
    tests = spawn(process.execPath, ['--test', ...filenames], {
      cwd: repository,
      stdio: 'inherit',
      // Blank the application URL so dotenv cannot restore it, and scope the
      // disposable database URL to this child alone. No app credentials are used.
      env: { ...process.env, DATABASE_URL: '', DATABASE_TEST_URL: testUrl, GEMINI_API_KEY: '', ROOTED_TEST_TIMESCALE: timescale ? '1' : '0' },
    })
    tests.on('error', () => reject(new Error('Could not start the Node test runner.')))
    tests.on('close', (code, signal) => resolveTests(code ?? signalExitCode(signal)))
  })
}

try {
  const filenames = (await readdir(resolve(repository, 'tests'), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.js'))
    .map((entry) => resolve(repository, 'tests', entry.name))
    .sort()
  if (!filenames.length) throw new Error('No Node test files were found in tests/.')
  checkInterrupted()
  console.log(`Starting a disposable ${timescale ? 'Timescale/PostgreSQL 17' : 'PostgreSQL 17'} database for all Node tests…`)
  // Mark this unique name for cleanup before starting Docker, including startup
  // failures or signals. Existing containers are never inspected or removed.
  containerStarted = true
  await docker(['run', '--detach', '--rm', '--name', container, '--publish', '127.0.0.1::5432', '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', '--env', 'POSTGRES_DB=rooted_test', image])
  checkInterrupted()
  const binding = await docker(['port', container, '5432/tcp'])
  const match = /^127\.0\.0\.1:(\d+)$/.exec(binding)
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 65535) throw new Error('Docker did not provide the expected loopback-only database port.')
  const port = Number(match[1])
  await waitForPostgres(port)
  if (timescale) await docker(['exec', container, 'psql', '-U', 'postgres', '-d', 'rooted_test', '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE EXTENSION IF NOT EXISTS timescaledb'])
  checkInterrupted()
  console.log('PostgreSQL is ready. Running all Node tests against the disposable database.')
  process.exitCode = await runTests(filenames, `postgresql://postgres@127.0.0.1:${port}/rooted_test?sslmode=disable`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  clearTimeout(killTimer)
  tests = null
  if (containerStarted) {
    try {
      await docker(['rm', '--force', container])
      console.log('Removed the disposable test database.')
    } catch {
      console.error(`Could not remove the owned test container. Run: docker rm --force ${container}`)
      if (!process.exitCode) process.exitCode = 1
    }
  }
  if (interrupted) process.exitCode = signalExitCode(interrupted)
  process.removeListener('SIGINT', onInterrupt)
  process.removeListener('SIGTERM', onTerminate)
}
