import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuthFetch, verifyAccessToken } from '../server/auth.js'
import { publicError } from '../server/errors.js'

const configuration = { url: 'https://private-project.example.com', key: 'private-publishable-key' }
const token = 'private-user-token'
const assertSafe = (value) => assert.doesNotMatch(JSON.stringify(value), /private-project|private-publishable|private-user-token|secret-password/)

async function failure(fetchImpl, expectedReason, options = {}) {
  await assert.rejects(verifyAccessToken(token, { configuration, fetchImpl, ...options }), (error) => {
    assert.equal(error.status, 503)
    assert.equal(error.code, 'auth_unavailable')
    assert.equal(error.authReason, expectedReason)
    assertSafe(error)
    assertSafe(publicError(error))
    return true
  })
}

test('authentication exposes only approved native network failure reasons through the real SDK', async () => {
  for (const code of ['ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'UND_ERR_CONNECT_TIMEOUT', 'CERT_HAS_EXPIRED']) {
    await failure(async () => {
      throw new Error('secret-password private-user-token', { cause: Object.assign(new Error('private-project'), { code }) })
    }, code)
  }
  await failure(async () => { throw Object.assign(new Error('secret-password'), { code: 'private-user-token' }) }, 'network_failure')
  await failure(async () => { throw 'secret-password private-publishable-key' }, 'network_failure')
})

test('authentication reports invalid headers without sending a malformed publishable key upstream', async () => {
  let calls = 0
  await failure(async () => { calls += 1 }, 'invalid_header', {
    configuration: { ...configuration, key: 'private-publishable-key\nsecret-password' },
  })
  assert.equal(calls, 0)
})

test('authentication identifies HTML and provider failures without consuming or exposing response bodies', async () => {
  await failure(async () => new Response('<html>secret-password private-user-token</html>', {
    status: 200, headers: { 'Content-Type': 'text/html' },
  }), 'non_json_response')
  await failure(async () => new Response(JSON.stringify({ message: 'secret-password private-publishable-key' }), {
    status: 503, headers: { 'Content-Type': 'application/json' },
  }), 'upstream_5xx')
  const response = new Response('unchanged body', { status: 503 })
  let reason
  assert.equal(await createAuthFetch({ fetchImpl: async () => response, onFailure: (value) => { reason = value } })('https://unused.example.com'), response)
  assert.equal(response.bodyUsed, false)
  assert.equal(reason, 'upstream_5xx')
})

test('authentication timeout reasons preserve cancellation and never authorize a stalled request', async () => {
  await failure((_, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }), 'timeout', { timeoutMs: 15 })
})

test('rejected sessions remain 401 and successful verification requires a valid UUID', async () => {
  await assert.rejects(verifyAccessToken(token, { configuration, fetchImpl: async () => new Response(JSON.stringify({ code: 'bad_jwt', message: 'secret-password' }), {
    status: 403, headers: { 'Content-Type': 'application/json' },
  }) }), (error) => error.status === 401 && error.code === 'invalid_session' && error.authReason === undefined)
  const user = { id: '11111111-1111-4111-8111-111111111111' }
  assert.deepEqual(await verifyAccessToken(token, { configuration, fetchImpl: async () => new Response(JSON.stringify(user), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  }) }), user)
  await assert.rejects(verifyAccessToken(token, { configuration, fetchImpl: async () => new Response(JSON.stringify({ id: 'forged' }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  }) }), (error) => error.status === 401 && error.code === 'invalid_session')
})
