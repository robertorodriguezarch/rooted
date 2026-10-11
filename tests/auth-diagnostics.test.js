import test from 'node:test'
import assert from 'node:assert/strict'
import { checkAuthConnection } from '../scripts/check-auth.js'

const configuration = {
  SUPABASE_URL: 'https://private-project.example.com', SUPABASE_PUBLISHABLE_KEY: 'private-publishable-key',
  VITE_SUPABASE_URL: 'https://private-project.example.com', VITE_SUPABASE_PUBLISHABLE_KEY: 'private-publishable-key',
}
const jsonResponse = (status, body = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const assertSafe = (result) => assert.doesNotMatch(JSON.stringify(result), /private-project|private-publishable|secret-password|private-token/)

test('auth connection check probes the real SDK paths without a user token or account changes', async () => {
  const requests = []
  const result = await checkAuthConnection({ environment: configuration, fetchImpl: async (url, options) => {
    requests.push({ url, options })
    return jsonResponse(requests.length === 1 ? 200 : 401)
  } })
  assert.equal(result.ok, true)
  assert.deepEqual(requests.map(({ url }) => url), [
    'https://private-project.example.com/auth/v1/settings', 'https://private-project.example.com/auth/v1/user',
  ])
  for (const { options } of requests) {
    assert.equal(options.method, 'GET')
    assert.equal(options.headers.apikey, configuration.SUPABASE_PUBLISHABLE_KEY)
    assert.equal(options.headers.Accept, 'application/json')
    assert.equal(options.headers['X-Supabase-Api-Version'], '2024-01-01')
    assert.ok(options.signal instanceof AbortSignal)
  }
  assert.equal(requests[0].options.headers.Authorization, undefined)
  assert.equal(requests[1].options.headers.Authorization, 'Bearer rooted-connectivity-check-invalid-token')
  assertSafe(result)
})

test('auth diagnostics stop before requests for missing or mismatched project settings', async () => {
  let calls = 0
  const fetchImpl = async () => { calls += 1; throw new Error('Should not be called') }
  for (const environment of [
    {}, { ...configuration, SUPABASE_URL: 'https://different-project.example.com' },
    { ...configuration, SUPABASE_PUBLISHABLE_KEY: 'different-key' },
    { ...configuration, VITE_SUPABASE_PUBLISHABLE_KEY: '' },
  ]) {
    const result = await checkAuthConnection({ environment, fetchImpl })
    assert.equal(result.ok, false)
    assertSafe(result)
  }
  assert.equal(calls, 0)
})

test('auth diagnostics report status codes without printing rejected settings or provider bodies', async () => {
  for (const status of [401, 403, 503]) {
    let calls = 0
    const result = await checkAuthConnection({ environment: configuration, fetchImpl: async () => {
      calls += 1
      return jsonResponse(status, { error: 'private-token secret-password' })
    } })
    assert.equal(result.ok, false)
    assert.equal(calls, 1)
    assert.ok(result.lines.some((line) => line.includes(`HTTP ${status}`)))
    assertSafe(result)
  }
})

test('auth diagnostics reject HTML and preserve configured URL paths instead of masking dashboard URLs', async () => {
  const environment = {
    SUPABASE_URL: 'https://private-project.example.com/dashboard/project/private-project/',
    SUPABASE_PUBLISHABLE_KEY: 'private-publishable-key',
  }
  let requestedUrl
  const result = await checkAuthConnection({ environment, fetchImpl: async (url) => {
    requestedUrl = url
    return new Response('<html>secret-password</html>', { status: 200, headers: { 'Content-Type': 'text/html' } })
  } })
  assert.equal(result.ok, false)
  assert.equal(requestedUrl, 'https://private-project.example.com/dashboard/project/private-project/auth/v1/settings')
  assert.match(result.lines.join(' '), /dashboard page/)
  assertSafe(result)
})

test('auth diagnostics preserve only approved network codes and never print raw errors', async () => {
  for (const code of ['EAI_AGAIN', 'ENOTFOUND', 'ENETUNREACH', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_INVALID']) {
    const result = await checkAuthConnection({ environment: configuration, fetchImpl: async () => {
      throw new Error('private-token secret-password', { cause: Object.assign(new Error('private-publishable-key'), { code }) })
    } })
    assert.equal(result.ok, false)
    assert.ok(result.lines.some((line) => line.includes(code)))
    assertSafe(result)
  }
  const unknown = await checkAuthConnection({ environment: configuration, fetchImpl: async () => {
    throw Object.assign(new Error('secret-password'), { code: 'private-token' })
  } })
  assert.equal(unknown.ok, false)
  assertSafe(unknown)
})

test('auth diagnostics bound a stalled request even if its fetch implementation ignores cancellation', async () => {
  let signal
  const result = await checkAuthConnection({ environment: configuration, timeoutMs: 15, fetchImpl: (_, options) => {
    signal = options.signal
    return new Promise(() => {})
  } })
  assert.equal(result.ok, false)
  assert.equal(signal.aborted, true)
  assert.match(result.lines.join(' '), /timed out/)
  assertSafe(result)
})

test('auth diagnostics never mark an accepted invalid token or a non-JSON rejection as success', async () => {
  for (const userResponse of [jsonResponse(200), new Response('<html>private-token</html>', { status: 401 })]) {
    let calls = 0
    const result = await checkAuthConnection({ environment: configuration, fetchImpl: async () => {
      calls += 1
      return calls === 1 ? jsonResponse(200) : userResponse
    } })
    assert.equal(result.ok, false)
    assert.equal(calls, 2)
    assertSafe(result)
  }
})

test('auth diagnostics accept Supabase bad_jwt rejection but reject unrelated forbidden responses', async () => {
  for (const [body, expected] of [
    [{ code: 'bad_jwt', message: 'private-token secret-password' }, true],
    [{ code: 'gateway_denied', message: 'private-token secret-password' }, false],
    [{ error: 'Forbidden' }, false],
  ]) {
    let calls = 0
    const result = await checkAuthConnection({ environment: configuration, fetchImpl: async () => {
      calls += 1
      return calls === 1 ? jsonResponse(200) : jsonResponse(403, body)
    } })
    assert.equal(result.ok, expected)
    assert.equal(calls, 2)
    assertSafe(result)
  }
})
