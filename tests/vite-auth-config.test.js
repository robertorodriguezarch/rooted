import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const project = fileURLToPath(new URL('../', import.meta.url))
const execute = promisify(execFile)

test('Vite API and production verification use the complete browser project despite stale server settings', async () => {
  // Isolate process.env changes, env files, mock authentication, and Vite caches
  // from the developer's running server and real provider configuration.
  const environment = {
    ...process.env, DATABASE_URL: 'database-fixture-preserved', DATABASE_TEST_URL: '',
    GEMINI_API_KEY: 'gemini-fixture-preserved', NODE_USE_ENV_PROXY: '0',
  }
  delete environment.SUPABASE_URL
  delete environment.SUPABASE_PUBLISHABLE_KEY
  delete environment.VITE_SUPABASE_URL
  delete environment.VITE_SUPABASE_PUBLISHABLE_KEY
  const script = String.raw`
    import assert from 'node:assert/strict'
    import { createServer as createHttpServer } from 'node:http'
    import { mkdtemp, writeFile, rm } from 'node:fs/promises'
    import { tmpdir } from 'node:os'
    import { join } from 'node:path'
    import { createServer as createViteServer, resolveConfig } from 'vite'

    const directory = await mkdtemp(join(tmpdir(), 'rooted-vite-auth-'))
    const requests = []
    const auth = createHttpServer((request, response) => {
      requests.push({ path: request.url, key: request.headers.apikey })
      response.setHeader('Content-Type', 'application/json')
      if (request.url === '/auth/v1/user' && request.headers.apikey === 'mode-public-key'
        && request.headers.authorization === 'Bearer local-auth-regression-token') {
        response.end(JSON.stringify({ id: '11111111-1111-4111-8111-111111111111' }))
      } else {
        response.statusCode = 503
        response.end(JSON.stringify({ error: 'Wrong authentication project' }))
      }
    })
    let vite
    try {
      await new Promise((resolve) => auth.listen(0, '127.0.0.1', resolve))
      const origin = 'http://127.0.0.1:' + auth.address().port
      await writeFile(join(directory, '.env'),
        'SUPABASE_URL=' + origin + '/stale-dotenv\nSUPABASE_PUBLISHABLE_KEY=stale-dotenv-key\n')
      await writeFile(join(directory, '.env.local'),
        'VITE_SUPABASE_URL=' + origin + '/stale-base\nVITE_SUPABASE_PUBLISHABLE_KEY=stale-base-key\n')
      await writeFile(join(directory, '.env.development.local'),
        'VITE_SUPABASE_URL=' + origin + '\nVITE_SUPABASE_PUBLISHABLE_KEY=mode-public-key\n')
      process.env.SUPABASE_URL = origin + '/stale-shell'
      process.env.SUPABASE_PUBLISHABLE_KEY = 'stale-shell-key'
      vite = await createViteServer({
        configFile: join(process.cwd(), 'vite.config.js'), envDir: directory,
        mode: 'development', logLevel: 'silent', cacheDir: join(directory, 'cache'),
        server: { host: '127.0.0.1', port: 0, strictPort: true },
      })
      await vite.listen()
      assert.equal(vite.config.env.VITE_SUPABASE_URL, origin)
      assert.equal(vite.config.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'mode-public-key')
      const response = await fetch('http://127.0.0.1:' + vite.httpServer.address().port + '/api/grow-neighbor', {
        method: 'POST', headers: { Authorization: 'Bearer local-auth-regression-token', 'Content-Type': 'application/json' },
        body: '{}', signal: AbortSignal.timeout(5000),
      })
      // Authentication reaches the actual local SDK/mock exchange; input
      // validation then stops before any database or Gemini access.
      assert.equal(response.status, 400)
      assert.equal((await response.json()).error.code, 'invalid_input')
      assert.deepEqual(requests, [{ path: '/auth/v1/user', key: 'mode-public-key' }])
      assert.equal(process.env.DATABASE_URL, 'database-fixture-preserved')
      assert.equal(process.env.GEMINI_API_KEY, 'gemini-fixture-preserved')
      await vite.close()
      vite = null

      process.env.SUPABASE_URL = 'https://stale-production-server.invalid'
      process.env.SUPABASE_PUBLISHABLE_KEY = 'production-server-key'
      process.env.VITE_SUPABASE_URL = origin
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'mode-public-key'
      await resolveConfig({ configFile: join(process.cwd(), 'vite.config.js'), envDir: directory, logLevel: 'silent' }, 'build')
      assert.equal(process.env.SUPABASE_URL, 'https://stale-production-server.invalid')
      const { getAuthConfiguration } = await import('./server/config.js')
      assert.deepEqual(getAuthConfiguration(), {
        url: origin, key: 'mode-public-key',
      })
      const { verifyAccessToken } = await import('./server/auth.js')
      assert.deepEqual(await verifyAccessToken('local-auth-regression-token'), {
        id: '11111111-1111-4111-8111-111111111111',
      })
      assert.deepEqual(requests, [
        { path: '/auth/v1/user', key: 'mode-public-key' },
        { path: '/auth/v1/user', key: 'mode-public-key' },
      ])
      console.log('ROOTED_VITE_AUTH_CHECK_PASSED')
    } finally {
      if (vite) await vite.close()
      auth.closeAllConnections()
      await new Promise((resolve) => auth.close(resolve))
      await rm(directory, { recursive: true, force: true })
    }
  `
  const { stdout } = await execute(process.execPath, ['--input-type=module', '-e', script], {
    cwd: project, env: environment, timeout: 30_000, maxBuffer: 100_000,
  })
  assert.match(stdout, /ROOTED_VITE_AUTH_CHECK_PASSED/)
})
