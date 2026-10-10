import { LoaderCircle, Sprout } from 'lucide-react';

export default function RequestState({ loading, error, retry }) {
  if (loading) return <div className="request-state" role="status"><LoaderCircle size={25} className="loading-spinner" aria-hidden="true" /><p>Finding your next good thing…</p></div>;
  if (error) return <div className="request-state request-error" role="alert"><Sprout size={28} aria-hidden="true" /><h2>Let’s try again.</h2><p>{error}</p>{retry && <button className="button button-outline" onClick={retry}>Try again</button>}</div>;
  return null;
}
