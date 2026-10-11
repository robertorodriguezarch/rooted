import { pathToFileURL } from 'node:url'
import { getAuthConfiguration } from '../server/config.js'

const safeNetworkCodes = new Set([
  'EAI_AGAIN', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_HAS_EXPIRED',
])

function connectionFailure(error) {
  const pending = [error]
  const visited = new Set()
  while (pending.length && visited.size < 12) {
    const current = pending.shift()
    if (!current || typeof current !== 'object' || visited.has(current)) continue
    visited.add(current)
    if (current.name === 'TimeoutError' || current.name === 'AbortError') {
      return 'The server connection timed out. Check your network, VPN, and proxy settings.'
    }
    if (safeNetworkCodes.has(current.code)) {
      const certificate = /CERT|SIGNATURE|SELF_SIGNED/.test(current.code)
      return `The server connection failed (${current.code}). ${certificate
        ? 'Check the trusted certificate configuration; keep TLS verification enabled.'
        : 'Check your network, VPN, DNS, and proxy settings.'}`
    }
    pending.push(current.cause)
    if (Array.isArray(current.errors)) pending.push(...current.errors.slice(0, 8))
  }
  return 'The server could not reach account services. Check the server project settings and network connection.'
}

async function probe(fetchImpl, url, headers, timeoutMs) {
  const controller = new AbortController()
  let timer
  const timedOut = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new DOMException('Request timed out', 'TimeoutError')
      controller.abort(error)
      reject(error)
    }, timeoutMs)
  })
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(url, { method: 'GET', headers, signal: controller.signal })
        let body
        try { body = await response.json() } catch { body = null }
        return {
          status: response.status,
          jsonObject: Boolean(body && typeof body === 'object' && !Array.isArray(body)),
          badJwt: body?.code === 'bad_jwt',
        }
      })(),
      timedOut,
    ])
  } finally {
    clearTimeout(timer)
  }
}

export async function checkAuthConnection({ environment = process.env, fetchImpl = globalThis.fetch, timeoutMs = 10_000 } = {}) {
  const lines = []
  const configuration = getAuthConfiguration(environment)
  if (!configuration) {
    return { ok: false, lines: ['Server authentication configuration is missing or invalid. Set the project API URL and public publishable key.'] }
  }
  lines.push('Server authentication configuration is present.')
  const browserUrl = environment.VITE_SUPABASE_URL?.trim()
  const browserKey = environment.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (browserUrl && browserKey) {
    const sameUrl = configuration.url.replace(/\/+$/, '') === browserUrl.replace(/\/+$/, '')
    const sameKey = configuration.key.trim() === browserKey
    lines.push(`Server and frontend project URLs match: ${sameUrl ? 'yes' : 'no'}.`)
    lines.push(`Server and frontend publishable keys match: ${sameKey ? 'yes' : 'no'}.`)
    if (!sameUrl || !sameKey) {
      lines.push('Use matching project settings for the server and frontend, then restart the development server.')
      return { ok: false, lines }
    }
  } else if (browserUrl || browserKey) {
    lines.push('Frontend authentication configuration is incomplete. Set both VITE_SUPABASE settings, then restart the development server.')
    return { ok: false, lines }
  } else {
    lines.push('Frontend comparison skipped: both VITE_SUPABASE settings are not present in this process.')
  }

  const base = configuration.url.replace(/\/+$/, '')
  try {
    const settings = await probe(fetchImpl, `${base}/auth/v1/settings`, {
      apikey: configuration.key, Accept: 'application/json', 'X-Supabase-Api-Version': '2024-01-01',
    }, timeoutMs)
    lines.push(`Supabase settings endpoint returned HTTP ${settings.status}.`)
    if (settings.status !== 200 || !settings.jsonObject) {
      lines.push(settings.jsonObject
        ? 'Check the server project API URL and public publishable key.'
        : 'The endpoint did not return an account-service JSON object. Check that the server uses the project API URL, rather than a dashboard page.')
      return { ok: false, lines }
    }
    const user = await probe(fetchImpl, `${base}/auth/v1/user`, {
      apikey: configuration.key, Accept: 'application/json', 'X-Supabase-Api-Version': '2024-01-01',
      Authorization: 'Bearer rooted-connectivity-check-invalid-token',
    }, timeoutMs)
    lines.push(`Supabase verification endpoint returned HTTP ${user.status}.`)
    if (!user.jsonObject || !(user.status === 401 || (user.status === 403 && user.badJwt))) {
      lines.push('The verification endpoint did not reject the deliberately invalid test token as expected. Check the server project API URL and provider status.')
      return { ok: false, lines }
    }
    lines.push('The server can reach Supabase account verification. No user session was used or accepted; no account was changed.')
    return { ok: true, lines }
  } catch (error) {
    lines.push(connectionFailure(error))
    return { ok: false, lines }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await checkAuthConnection()
  console.log(result.lines.join('\n'))
  process.exitCode = result.ok ? 0 : 1
}
