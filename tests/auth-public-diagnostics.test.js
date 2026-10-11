import test from 'node:test'
import assert from 'node:assert/strict'
import { createApiHandler } from '../server/router.js'
import { ApiError, publicError } from '../server/errors.js'

async function invoke(handler, path, token) {
  const request = { method: 'GET', url: path, headers: token ? { authorization: `Bearer ${token}` } : {} }
  const response = { setHeader() {}, end(body) { this.body = JSON.parse(body) } }
  await handler(request, response)
  return { status: response.statusCode, body: response.body }
}

test('opt-in auth diagnostics describe the effective browser project and server fallback without disclosing settings', async () => {
  const environment = {
    SUPABASE_URL: 'https://server-project.supabase.co/', SUPABASE_PUBLISHABLE_KEY: 'server-public-key',
    VITE_SUPABASE_URL: 'https://frontend-project.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'frontend-public-key',
  }
  const handler = createApiHandler({ databaseConfigured: false, authEnvironment: environment })
  assert.equal((await invoke(handler, '/api/health')).body.authentication, undefined)
  const mismatch = await invoke(handler, '/api/health?diagnostics=auth')
  assert.deepEqual(mismatch.body.authentication, { matchesFrontend: true, urlIsOrigin: true })
  assert.doesNotMatch(JSON.stringify(mismatch.body), /server-project|frontend-project|public-key/)

  environment.SUPABASE_URL = ' https://frontend-project.supabase.co/ '
  environment.SUPABASE_PUBLISHABLE_KEY = ' frontend-public-key '
  assert.deepEqual((await invoke(handler, '/api/health?diagnostics=auth')).body.authentication,
    { matchesFrontend: true, urlIsOrigin: true })

  environment.SUPABASE_URL = 'https://supabase.com/dashboard/project/example'
  assert.deepEqual((await invoke(handler, '/api/health?diagnostics=auth')).body.authentication,
    { matchesFrontend: true, urlIsOrigin: true })

  environment.VITE_SUPABASE_URL = ''
  assert.deepEqual((await invoke(handler, '/api/health?diagnostics=auth')).body.authentication,
    { matchesFrontend: null, urlIsOrigin: false })
})

test('auth failure responses expose only approved reason codes and never arbitrary error metadata', async () => {
  let reason = 'ENOTFOUND'
  const handler = createApiHandler({ verifyUser: async () => {
    const error = new ApiError(503, 'Account services are temporarily unavailable.', 'auth_unavailable')
    error.authReason = reason
    error.cause = new Error('secret token and private connection string')
    throw error
  } })
  const diagnostic = await invoke(handler, '/api/me', 'invalid-test-token')
  assert.equal(diagnostic.status, 503)
  assert.equal(diagnostic.body.error.reason, 'ENOTFOUND')
  assert.doesNotMatch(JSON.stringify(diagnostic.body), /secret|token|connection string/)
  reason = 'private-secret-provider-body'
  assert.equal((await invoke(handler, '/api/me', 'invalid-test-token')).body.error.reason, undefined)
  const unrelated = new ApiError(503, 'Try again.', 'service_unavailable')
  unrelated.authReason = 'ENOTFOUND'
  assert.equal(publicError(unrelated).reason, undefined)
})
