import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
let client = null;
let configurationError = '';
if (url && key) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) throw new Error('Invalid URL');
    client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } });
  } catch {
    configurationError = 'Account configuration needs attention. You can still explore sample events.';
  }
} else if (url || key) configurationError = 'Account configuration is incomplete. You can still explore sample events.';

export const supabase = client;
export const authConfigured = Boolean(client);
export const authConfigurationError = configurationError;
