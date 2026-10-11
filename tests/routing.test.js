import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { getTransformedRoutes } from '@vercel/routing-utils'

const project = fileURLToPath(new URL('../', import.meta.url))
// A temporary old config can demonstrate the regression without changing the
// repository: ROOTED_ROUTING_TEST_CONFIG=/tmp/old-vercel.json node --test ...
const configPath = process.env.ROOTED_ROUTING_TEST_CONFIG ?? `${project}/vercel.json`
const config = JSON.parse(await readFile(configPath, 'utf8'))
const { routes, error } = getTransformedRoutes(config)
assert.equal(error, null, 'Vercel must accept the routing configuration')

function rewrite(path) {
  const url = new URL(path, 'http://rooted.test')
  for (const candidate of routes) {
    const match = candidate.src && url.pathname.match(new RegExp(candidate.src))
    if (!match || !candidate.dest) continue
    const destination = new URL(candidate.dest.replace(/\$(\d+)/g, (_, index) => match[index] ?? ''), url)
    url.pathname = destination.pathname
    for (const [name, value] of destination.searchParams) url.searchParams.set(name, value)
    break
  }
  return `${url.pathname}${url.search}`
}

// Vercel CLI needs an authenticated, linked project. This harness exercises its
// unmatched-request rewrite/proxy behavior with the official converted routes
// and actual Vite responses; it does not claim to run the Vercel CLI itself.
const serverScript = String.raw`
  import { createServer as createHttpServer, request as httpRequest } from 'node:http'
  import { mkdtemp, readFile, rm } from 'node:fs/promises'
  import { tmpdir } from 'node:os'
  import { join } from 'node:path'
  import { createServer as createViteServer, build } from 'vite'
  import { getTransformedRoutes } from '@vercel/routing-utils'

  const config = JSON.parse(await readFile(process.argv[1], 'utf8'))
  const { routes, error } = getTransformedRoutes(config)
  if (error) throw new Error(error.message)
  const cacheDir = await mkdtemp(join(tmpdir(), 'rooted-routing-vite-'))
  const rewrite = (path) => {
    const url = new URL(path, 'http://rooted.test')
    for (const candidate of routes) {
      const match = candidate.src && url.pathname.match(new RegExp(candidate.src))
      if (!match || !candidate.dest) continue
      const destination = new URL(candidate.dest.replace(/\$(\d+)/g, (_, index) => match[index] ?? ''), url)
      url.pathname = destination.pathname
      for (const [name, value] of destination.searchParams) url.searchParams.set(name, value)
      break
    }
    return url.pathname + url.search
  }
  const functionPath = '/api/[...path]'
  const { default: api } = await import('./api/[...path].js')
  const dispatchApi = (req, res) => {
    const routed = new URL(rewrite(req.url), 'http://rooted.test')
    if (routed.pathname !== functionPath) return false
    // Node function invocation keeps the incoming pathname and adds rewritten
    // query parameters; the destination selects the function, not its API route.
    const incoming = new URL(req.url, 'http://rooted.test')
    for (const [name, value] of routed.searchParams) incoming.searchParams.set(name, value)
    req.url = incoming.pathname + incoming.search
    api(req, res)
    return true
  }
  const listen = (server) => new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server.address().port))
  })
  const vite = await createViteServer({
    configFile: join(process.cwd(), 'vite.config.js'), envFile: false,
    mode: 'test', logLevel: 'silent', cacheDir,
    server: { host: '127.0.0.1', port: 0, strictPort: true },
  })
  await vite.listen()
  const vitePort = vite.httpServer.address().port
  const dev = createHttpServer((req, res) => {
    if (dispatchApi(req, res)) return
    const upstream = httpRequest({
      host: '127.0.0.1', port: vitePort, path: rewrite(req.url),
      method: req.method, headers: req.headers,
    }, (response) => {
      res.writeHead(response.statusCode, response.headers)
      response.pipe(res)
    })
    upstream.on('error', () => { res.statusCode = 502; res.end('Development proxy failed') })
    req.pipe(upstream)
  })

  // Build in memory so npm test works in a fresh clone without requiring dist
  // and does not empty or replace a developer's existing production output.
  const built = await build({
    configFile: join(process.cwd(), 'vite.config.js'), envFile: false,
    mode: 'production', logLevel: 'silent', cacheDir,
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: { write: false, emptyOutDir: false },
  })
  const files = new Map((Array.isArray(built) ? built : [built])
    .flatMap((result) => result.output)
    .map((output) => ['/' + output.fileName, output.type === 'asset' ? output.source : output.code]))
  for (const path of ['/favicon.svg', '/images/forest.jpg']) {
    files.set(path, await readFile(join(process.cwd(), 'public', path)))
  }
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' }
  const production = createHttpServer(async (req, res) => {
    try {
      const original = new URL(req.url, 'http://rooted.test').pathname
      if (dispatchApi(req, res)) return
      // Existing build output wins before the SPA fallback (Vercel filesystem
      // phase). Unmatched paths apply the same converted rewrite as dev.
      req.url = files.has(original) ? req.url : rewrite(req.url)
      const path = new URL(req.url, 'http://rooted.test').pathname
      const body = files.get(path)
      if (body === undefined) { res.statusCode = 404; res.end('Not found'); return }
      const extension = path.slice(path.lastIndexOf('.'))
      res.setHeader('Content-Type', mime[extension] ?? 'application/octet-stream')
      res.end(body)
    } catch { res.statusCode = 500; res.end('Production fixture failed') }
  })
  const devPort = await listen(dev)
  const productionPort = await listen(production)
  console.log('ROOTED_ROUTING_READY ' + JSON.stringify({ dev: devPort, production: productionPort }))
  process.once('SIGTERM', async () => {
    dev.closeAllConnections()
    production.closeAllConnections()
    await Promise.all([
      new Promise((resolve) => dev.close(resolve)),
      new Promise((resolve) => production.close(resolve)),
      vite.close(),
    ])
    await rm(cacheDir, { recursive: true, force: true })
    process.exit(0)
  })
`

let child
let urls
before(async () => {
  child = spawn(process.execPath, ['--input-type=module', '-e', serverScript, configPath], {
    cwd: project,
    // Child-process values override dotenv without changing any real settings.
    // The only API checks are unauthenticated or unknown paths, never DB work.
    env: {
      ...process.env, DATABASE_URL: '', DATABASE_TEST_URL: '',
      SUPABASE_URL: '', SUPABASE_PUBLISHABLE_KEY: '',
      VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '',
      VITE_DATA_MODE: 'sample', GEMINI_API_KEY: '', NODE_USE_ENV_PROXY: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  urls = await new Promise((resolve, reject) => {
    let output = ''
    let errors = ''
    const timer = setTimeout(() => reject(new Error('Routing test server did not start')), 30_000)
    child.stderr.on('data', (chunk) => { errors = `${errors}${chunk}`.slice(-4000) })
    child.once('error', (error) => { clearTimeout(timer); reject(error) })
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Routing test server exited (${code}): ${errors}`)) })
    child.stdout.on('data', (chunk) => {
      output += chunk
      const ready = output.match(/ROOTED_ROUTING_READY (.+)\n/)
      if (ready) {
        clearTimeout(timer)
        const ports = JSON.parse(ready[1])
        resolve({ dev: `http://127.0.0.1:${ports.dev}`, production: `http://127.0.0.1:${ports.production}` })
      }
    })
  })
})

after(async () => {
  if (!child || child.exitCode !== null) return
  const exited = new Promise((resolve) => child.once('exit', resolve))
  child.kill('SIGTERM')
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
  await exited
  clearTimeout(timer)
})

async function response(base, path, type, status = 200) {
  const result = await fetch(`${base}${path}`)
  assert.equal(result.status, status, `${path} HTTP status`)
  assert.match(result.headers.get('content-type') ?? '', type, `${path} content type`)
  const text = await result.text()
  if (!type.test('text/html')) assert.doesNotMatch(text, /^\s*(?:<!doctype html>|<html\b)/i, `${path} must not receive the SPA document`)
  return text
}

test('SPA fallback excludes Vite URLs, application modules, assets, and the API namespace', () => {
  for (const path of [
    '/@vite/client', '/@react-refresh', '/@id/__x00__virtual', '/@fs/tmp/shared.jsx',
    '/__vite_ping', '/__vite_invalidate', '/__open-in-editor?file=src/main.jsx',
    '/src/main.jsx', '/src/App.jsx', '/src/styles.css?direct',
    '/node_modules/.vite/deps/react.js?v=test', '/assets/main.hash.js',
    '/_vercel/speed-insights', '/_vercel/insights/script.js',
    '/favicon.svg', '/images/forest.jpg', '/missing-file.js',
  ]) assert.equal(rewrite(path), path, `${path} must reach its original handler`)
  for (const path of ['/', '/explore', '/events/event-id', '/auth/callback', '/unknown/path']) {
    assert.equal(rewrite(path), '/index.html', `${path} must retain the SPA fallback`)
  }
})

test('explicit API rewrite selects the Node function for every path depth and keeps incoming query parameters', () => {
  for (const path of ['/api', '/api/', '/api/me', '/api/grow-neighbor/activity', '/api/events/event-id/registration', '/api/deep/missing/path']) {
    const routed = new URL(rewrite(path), 'http://rooted.test')
    assert.equal(routed.pathname, '/api/[...path]', `${path} must select the API function`)
  }
  const queried = new URL(rewrite('/api/events/event-id?category=cleanup&q=river'), 'http://rooted.test')
  assert.equal(queried.pathname, '/api/[...path]')
  assert.equal(queried.searchParams.get('category'), 'cleanup')
  assert.equal(queried.searchParams.get('q'), 'river')
  assert.equal(queried.searchParams.get('path'), 'events/event-id')
})

test('rewrite-aware development serves real Vite JavaScript, CSS, frontend routes, and API JSON', async () => {
  for (const path of ['/@vite/client', '/@react-refresh', '/src/App.jsx']) {
    await response(urls.dev, path, /javascript/)
  }
  const main = await response(urls.dev, '/src/main.jsx', /javascript/)
  const dependency = main.match(/(?:\/node_modules\/\.vite|\/@fs\/[^"'\s]+)\/deps\/[^"'\s]+\.js(?:\?[^"'\s]*)?/)
  assert.ok(dependency, 'The React entry point must import an optimized dependency')
  await response(urls.dev, dependency[0], /javascript/)
  await response(urls.dev, '/src/styles.css?direct', /text\/css/)
  await response(urls.dev, '/src/styles.css?import', /javascript/)
  for (const path of ['/explore', '/events/creekside-cleanup', '/auth/callback']) {
    assert.match(await response(urls.dev, path, /text\/html/), /<div id="root"><\/div>/)
  }
  assert.equal(JSON.parse(await response(urls.dev, '/api/me', /application\/json/, 401)).error.code, 'authentication_required')
  await response(urls.dev, '/api', /application\/json/, 404)
  await response(urls.dev, '/api/no-such-endpoint', /application\/json/, 404)
  assert.equal(JSON.parse(await response(urls.dev, '/api/grow-neighbor/activity', /application\/json/, 401)).error.code, 'authentication_required')
  assert.equal(JSON.parse(await response(urls.dev, '/api/events/not-a-uuid', /application\/json/, 503)).error.code, 'database_unconfigured')
  assert.equal(JSON.parse(await response(urls.dev, '/api/events/event-id/registration', /application\/json/, 405)).error.code, 'method_not_allowed')
})

test('production output retains assets, React Router fallback, and API JSON without swallowing missing assets', async () => {
  const index = await response(urls.production, '/index.html', /text\/html/)
  const script = index.match(/<script[^>]+src="([^"]+\.js)"/)
  const stylesheet = index.match(/<link[^>]+href="([^"]+\.css)"/)
  assert.ok(script, 'A production bundle must be referenced from index.html')
  assert.ok(stylesheet, 'A production stylesheet must be referenced from index.html')
  assert.ok((await response(urls.production, script[1], /javascript/)).length > 100)
  assert.ok((await response(urls.production, stylesheet[1], /text\/css/)).length > 100)
  await response(urls.production, '/favicon.svg', /image\/svg\+xml/)
  const photo = await fetch(`${urls.production}/images/forest.jpg`)
  assert.equal(photo.status, 200)
  assert.match(photo.headers.get('content-type'), /image\/jpeg/)
  assert.ok((await photo.arrayBuffer()).byteLength > 1000)
  for (const path of ['/', '/explore', '/events/event-id', '/auth/callback', '/unknown/path']) {
    assert.equal(await response(urls.production, path, /text\/html/), index)
  }
  assert.equal((await fetch(`${urls.production}/assets/missing.js`)).status, 404)
  assert.equal(JSON.parse(await response(urls.production, '/api/me', /application\/json/, 401)).error.code, 'authentication_required')
  await response(urls.production, '/api', /application\/json/, 404)
  await response(urls.production, '/api/no-such-endpoint', /application\/json/, 404)
  assert.equal(JSON.parse(await response(urls.production, '/api/grow-neighbor/activity', /application\/json/, 401)).error.code, 'authentication_required')
  assert.equal(JSON.parse(await response(urls.production, '/api/events/not-a-uuid', /application\/json/, 503)).error.code, 'database_unconfigured')
  assert.equal(JSON.parse(await response(urls.production, '/api/events/event-id/registration', /application\/json/, 405)).error.code, 'method_not_allowed')
  assert.equal(JSON.parse(await response(urls.production, '/api/deep/missing/path', /application\/json/, 404)).error.code, 'route_not_found')
})
