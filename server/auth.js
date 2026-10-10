import { createClient } from '@supabase/supabase-js'
import { getAuthConfiguration } from './config.js'
import { ApiError } from './errors.js'

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function createAuthFetch({ fetchImpl = globalThis.fetch, timeoutMs = 10_000 } = {}) {
  return (input, options = {}) => {
    const signals = [input?.signal, options.signal, AbortSignal.timeout(timeoutMs)].filter(Boolean)
    return fetchImpl(input, { ...options, signal: AbortSignal.any(signals) })
  }
}

export async function verifyAccessToken(token) {
  const configuration = getAuthConfiguration()
  if (!configuration) throw new ApiError(503, 'Account services have not been configured yet.', 'auth_unconfigured')
  const client = createClient(configuration.url, configuration.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: createAuthFetch() },
  })
  let result
  try { result = await client.auth.getUser(token) } catch {
    throw new ApiError(503, 'Account services are temporarily unavailable.', 'auth_unavailable')
  }
  if (result.error && (result.error.status >= 500 || result.error.name === 'AuthRetryableFetchError')) {
    throw new ApiError(503, 'Account services are temporarily unavailable.', 'auth_unavailable')
  }
  if (result.error || !result.data?.user || !uuidPattern.test(result.data.user.id)) {
    throw new ApiError(401, 'Please sign in again to continue.', 'invalid_session')
  }
  return result.data.user
}

export function readAccessToken(request, required = true) {
  const authorization = request.headers?.authorization
  if (!authorization && !required) return null
  if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization) || authorization.length > 16_384) {
    throw new ApiError(401, 'Please sign in to continue.', 'authentication_required')
  }
  return authorization.slice(7)
}

export async function ensureProfile(pool, user) {
  const metadataName = user.user_metadata?.display_name || user.user_metadata?.name
  const suggested = typeof metadataName === 'string' ? metadataName : 'Rooted neighbor'
  const displayName = suggested.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) || 'Rooted neighbor'
  const result = await pool.query(`
    INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)
    ON CONFLICT (user_id) DO NOTHING RETURNING user_id`, [user.id, displayName])
  return result.rowCount > 0
}
