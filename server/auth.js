import { createClient } from '@supabase/supabase-js'
import { getAuthConfiguration } from './config.js'
import { ApiError } from './errors.js'

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const authNetworkReasons = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'ECONNREFUSED', 'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_HAS_EXPIRED',
])

function authFailureReason(error) {
  const pending = [error]
  const visited = new Set()
  while (pending.length && visited.size < 12) {
    const current = pending.shift()
    if (!current || typeof current !== 'object' || visited.has(current)) continue
    visited.add(current)
    if (current.name === 'TimeoutError' || current.name === 'AbortError') return 'timeout'
    if (authNetworkReasons.has(current.code)) return current.code
    pending.push(current.cause)
    if (Array.isArray(current.errors)) pending.push(...current.errors.slice(0, 8))
  }
  return 'network_failure'
}

export function createAuthFetch({ fetchImpl = globalThis.fetch, timeoutMs = 10_000, onFailure } = {}) {
  const report = (reason) => { try { onFailure?.(reason) } catch { /* Diagnostics never change authentication. */ } }
  return async (input, options = {}) => {
    try { new Headers(options.headers ?? input?.headers) } catch (error) {
      report('invalid_header')
      throw error
    }
    try {
      const signals = [input?.signal, options.signal, AbortSignal.timeout(timeoutMs)].filter(Boolean)
      const response = await fetchImpl(input, { ...options, signal: AbortSignal.any(signals) })
      if (response.status >= 500) report('upstream_5xx')
      else if (!/\b(?:application\/json|[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+\+json)\b/i.test(response.headers.get('content-type') ?? '')) {
        report('non_json_response')
      }
      return response
    } catch (error) {
      report(authFailureReason(error))
      throw error
    }
  }
}

export async function verifyAccessToken(token, { configuration = getAuthConfiguration(), fetchImpl = globalThis.fetch, timeoutMs = 10_000 } = {}) {
  if (!configuration) throw new ApiError(503, 'Account services have not been configured yet.', 'auth_unconfigured')
  let reason = 'network_failure'
  const unavailable = () => Object.assign(new ApiError(503, 'Account services are temporarily unavailable.', 'auth_unavailable'), { authReason: reason })
  const client = createClient(configuration.url, configuration.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: createAuthFetch({ fetchImpl, timeoutMs, onFailure: (nextReason) => { reason = nextReason } }) },
  })
  let result
  try { result = await client.auth.getUser(token) } catch {
    throw unavailable()
  }
  if (result.error && (result.error.status >= 500 || result.error.name === 'AuthRetryableFetchError')) {
    throw unavailable()
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
