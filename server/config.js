import { resolve } from 'node:path'
import dotenv from 'dotenv'

export function loadServerEnvironment(directory = process.cwd()) {
  // Injected platform values win over local development files.
  dotenv.config({ path: resolve(directory, '.env.local'), quiet: true })
  dotenv.config({ path: resolve(directory, '.env'), quiet: true })
}

loadServerEnvironment()

export function getAuthConfiguration(environment = process.env) {
  const url = (environment.SUPABASE_URL || environment.VITE_SUPABASE_URL)?.trim()
  const key = (environment.SUPABASE_PUBLISHABLE_KEY || environment.VITE_SUPABASE_PUBLISHABLE_KEY)?.trim()
  if (!url || !key) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && !(['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) && parsed.protocol === 'http:')) return null
    return { url, key }
  } catch {
    return null
  }
}
