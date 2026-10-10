import { useCallback, useEffect, useState } from 'react';
import { events as sampleEvents, getEventById } from '../data/events.js';
import { authConfigured } from '../lib/supabase.js';
import { apiRequest } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export const dataMode = import.meta.env.VITE_DATA_MODE || (authConfigured ? 'live' : 'sample');
export const sampleMode = dataMode === 'sample';

export function useEvents(id) {
  const { session } = useAuth();
  const [revision, setRevision] = useState(0);
  const initial = sampleMode ? (id ? getEventById(id) ?? null : sampleEvents) : (id ? null : []);
  const [data, setData] = useState(initial);
  const [dataKey, setDataKey] = useState(id);
  const [loading, setLoading] = useState(!sampleMode);
  const [error, setError] = useState('');
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (sampleMode) { setData(id ? getEventById(id) ?? null : sampleEvents); setError(''); setLoading(false); return; }
    if (dataMode !== 'live') { setError('Event configuration needs attention. Please try again later.'); setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true); setError('');
    apiRequest(id ? `/api/events/${encodeURIComponent(id)}` : '/api/events', { signal: controller.signal }, session?.access_token)
      .then(result => { if (!controller.signal.aborted) { setData(id ? result.event : result.events); setDataKey(id); } })
      .catch(failure => { if (!controller.signal.aborted) { setData(id ? null : []); setDataKey(id); if (!(id && failure.status === 404)) setError(failure.message); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, session?.access_token, revision]);
  return { data: sampleMode ? (id ? getEventById(id) ?? null : sampleEvents) : dataKey === id ? data : (id ? null : []), loading: !sampleMode && (loading || dataKey !== id), error, refresh, sampleMode };
}
