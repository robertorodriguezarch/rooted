import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, authConfigured, authConfigurationError } from '../lib/supabase.js';

const AuthContext = createContext(null);
function requireClient() {
  if (!supabase) throw new Error('Accounts aren’t connected yet. Please explore the sample events for now.');
  return supabase;
}
async function unwrap(request) {
  const { data, error } = await request;
  if (error) throw error;
  return data;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(authConfigured);
  const [error, setError] = useState(authConfigurationError);
  const [recoveryReady, setRecoveryReady] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') setRecoveryReady(true);
      if (event === 'SIGNED_OUT') setRecoveryReady(false);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      setSession(data.session);
      if (sessionError) setError('We couldn’t restore your session. Please sign in again.');
      setLoading(false);
    }).catch(() => {
      if (active) { setError('We couldn’t restore your session. Please sign in again.'); setLoading(false); }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  const value = useMemo(() => ({
    session, user: session?.user ?? null, loading, configured: authConfigured, error, recoveryReady,
    signUp: ({ email, password, displayName }) => unwrap(requireClient().auth.signUp({ email, password, options: { data: { display_name: displayName }, emailRedirectTo: `${window.location.origin}/auth/callback` } })),
    signIn: ({ email, password }) => unwrap(requireClient().auth.signInWithPassword({ email, password })),
    signOut: async () => { const { error } = await requireClient().auth.signOut({ scope: 'local' }); if (error) throw error; },
    requestPasswordReset: email => unwrap(requireClient().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })),
    updatePassword: async password => { const result = await unwrap(requireClient().auth.updateUser({ password })); setRecoveryReady(false); return result; },
  }), [session, loading, error, recoveryReady]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
