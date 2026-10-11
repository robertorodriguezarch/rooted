import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Clock, LoaderCircle, MapPin, Sparkles, Sprout } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { apiRequest } from '../lib/api.js';
import EventCard from '../components/EventCard.jsx';
import '../grow-neighbor.css';

const prompts = [
  'Find a beginner-friendly cleanup.',
  'Help me find a gardening event.',
  'Where can I volunteer outdoors?',
];

function readableError(error) {
  return error?.message || 'Grow Neighbor couldn’t answer just yet. Please try again.';
}

function number(value) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function Activity({ data, loading, error, refresh }) {
  const recent = (data?.buckets || []).filter(bucket => bucket.requests > 0).slice(-6);
  return <section className="grow-activity" aria-label="Recommendation activity">
    <details>
      <summary><span><Clock size={17} aria-hidden="true" />Recommendation activity</span><span className="grow-activity-summary">Last 24 hours</span></summary>
      <div className="grow-activity-body">
        <p className="grow-activity-intro">See the requests recorded as Grow Neighbor helps you explore.</p>
        {loading && <p className="grow-activity-status" role="status">Loading request activity…</p>}
        {error && <div className="grow-activity-error"><p role="status">{error}</p><button type="button" className="text-link" onClick={refresh} disabled={loading}>Retry activity<ArrowRight size={15} aria-hidden="true" /></button></div>}
        {data && <>
          <p className={`grow-activity-engine ${data.engine === 'timescale' ? 'is-timescale' : ''}`}>{data.engine === 'timescale' ? 'Timescale hypertable · Hourly request totals' : 'PostgreSQL storage · Timescale is not enabled.'}</p>
          <dl className="grow-activity-metrics"><div><dt>Requests</dt><dd>{number(data.summary.requests)}</dd></div><div><dt>Successful requests</dt><dd>{number(data.summary.successfulRequests)}</dd></div><div><dt>Average response</dt><dd>{number(data.summary.averageLatencyMs)} <span>ms</span></dd></div></dl>
          {recent.length ? <div className="grow-activity-table-wrap"><table><caption>Latest hours with requests</caption><thead><tr><th scope="col">Hour</th><th scope="col">Requests</th><th scope="col">Successful</th></tr></thead><tbody>{recent.map(bucket => <tr key={bucket.hour}><th scope="row"><time dateTime={bucket.hour}>{new Date(bucket.hour).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric' })}</time></th><td>{number(bucket.requests)}</td><td>{number(bucket.successfulRequests)}</td></tr>)}</tbody></table></div> : <p className="grow-activity-status">No requests recorded in the last 24 hours yet.</p>}
        </>}
        <p className="grow-activity-note">This measures assistant activity. Environmental impact appears after organizer verification.</p>
      </div>
    </details>
  </section>;
}

function NeighborAssistant({ accessToken }) {
  const [message, setMessage] = useState('');
  const [city, setCity] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [question, setQuestion] = useState('');
  const [activity, setActivity] = useState(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState('');
  const questionInput = useRef(null);
  const requestController = useRef(null);
  const activityController = useRef(null);

  const refreshActivity = useCallback(async () => {
    activityController.current?.abort();
    const controller = new AbortController();
    activityController.current = controller;
    setActivityLoading(true);
    setActivityError('');
    try {
      const response = await apiRequest('/api/grow-neighbor/activity', { signal: controller.signal }, accessToken);
      if (!controller.signal.aborted) setActivity(response);
    } catch (caught) {
      if (!controller.signal.aborted) setActivityError(caught?.message || 'Request activity couldn’t load. Please try again.');
    } finally {
      if (!controller.signal.aborted) setActivityLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    refreshActivity();
    return () => { activityController.current?.abort(); };
  }, [refreshActivity]);

  useEffect(() => () => { requestController.current?.abort(); }, []);

  async function ask(event) {
    event?.preventDefault();
    if (pending) return;
    const values = { message: message.trim(), ...(city.trim() ? { city: city.trim() } : {}) };
    if (!values.message || values.message.length > 1000) {
      setError('Ask a question between 1 and 1,000 characters.');
      questionInput.current?.focus();
      return;
    }
    if (values.city?.length > 100) return setError('Keep your city within 100 characters.');
    const controller = new AbortController();
    requestController.current = controller;
    setPending(true);
    setError('');
    setResult(null);
    setQuestion(values.message);
    try {
      const response = await apiRequest('/api/grow-neighbor', { method: 'POST', body: values, signal: controller.signal }, accessToken);
      if (typeof response?.answer !== 'string' || !Array.isArray(response.recommendations)) throw new Error('Grow Neighbor returned an incomplete answer. Please try again.');
      if (!controller.signal.aborted) setResult(response);
    } catch (caught) {
      if (!controller.signal.aborted) setError(readableError(caught));
    } finally {
      if (!controller.signal.aborted) {
        setPending(false);
        refreshActivity();
      }
    }
  }

  function choosePrompt(prompt) {
    setMessage(prompt);
    setError('');
    questionInput.current?.focus();
  }

  return <>
    <section className="grow-question-panel" aria-labelledby="grow-question-title">
      <div className="grow-panel-heading"><span className="grow-panel-icon"><Sprout size={23} aria-hidden="true" /></span><div><h2 id="grow-question-title">What would you like to grow?</h2><p>A little curiosity is a good place to start.</p></div></div>
      <div className="grow-prompts" aria-label="Question ideas">{prompts.map(prompt => <button type="button" key={prompt} onClick={() => choosePrompt(prompt)} disabled={pending}>{prompt}</button>)}</div>
      <form className="grow-question-form" onSubmit={ask} aria-busy={pending}>
        <label htmlFor="grow-question">Your question<textarea ref={questionInput} id="grow-question" name="message" rows={4} required maxLength={1000} value={message} onChange={event => { setMessage(event.target.value); setError(''); }} disabled={pending} placeholder="I’m new to volunteering. What could I join near me?" aria-describedby="grow-question-hint" /></label>
        <p id="grow-question-hint" className="grow-field-hint"><span>Questions are sent to Gemini to find your next step.</span><span>{message.length}/1,000</span></p>
        <div className="grow-form-bottom"><label htmlFor="grow-city"><MapPin size={15} aria-hidden="true" />City (optional)<input id="grow-city" name="city" type="text" autoComplete="address-level2" maxLength={100} value={city} onChange={event => { setCity(event.target.value); setError(''); }} disabled={pending} placeholder="e.g. Chapel Hill" /></label><button className="button button-primary" type="submit" disabled={pending}>{pending ? 'Finding your next step…' : 'Ask Grow Neighbor'}{pending ? <LoaderCircle size={18} className="loading-spinner" aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}</button></div>
        {error && <div className="grow-error" role="alert"><p>{error}</p><button type="button" className="text-link" onClick={ask}>Try again<ArrowRight size={15} aria-hidden="true" /></button></div>}
      </form>
    </section>
    {pending && <div className="grow-thinking" role="status"><LoaderCircle size={21} className="loading-spinner" aria-hidden="true" /><p>Looking at real events and finding a little guidance…</p></div>}
    {result && <section className="grow-answer" aria-label="Grow Neighbor answer"><div className="eyebrow"><Sparkles size={15} aria-hidden="true" />A LITTLE GUIDANCE FROM GEMINI</div><h2>Your greener next step.</h2><p className="grow-asked">You asked: {question}</p><p className="grow-answer-text">{result.answer}</p><p className="grow-answer-note">AI guidance can make mistakes. Check the event details before you join.</p>{result.recommendations.length > 0 && <div className="grow-recommendations"><div className="grow-recommendation-heading"><h3>Events to explore</h3><p>Open an event to see the meeting place, availability and how to join.</p></div><div className="event-grid">{result.recommendations.map(event => <EventCard key={event.id} event={event} />)}</div></div>}{!result.recommendations.length && <Link className="text-link" to="/explore">Browse all events<ArrowRight size={17} aria-hidden="true" /></Link>}</section>}
    <Activity data={activity} loading={activityLoading} error={activityError} refresh={refreshActivity} />
  </>;
}

export default function GrowNeighbor() {
  const { user, session, loading, configured, error } = useAuth();
  return <div className="page-container grow-neighbor-page">
    <header className="grow-intro"><div className="eyebrow"><Sparkles size={15} aria-hidden="true" />MEET GROW NEIGHBOR</div><h1>A greener next step.</h1><p>Find real local events with a little help from Gemini. Tell us what you care about, then choose a small action that feels right for you.</p></header>
    {loading ? <div className="grow-thinking" role="status"><LoaderCircle size={22} className="loading-spinner" aria-hidden="true" /><p>Checking your account…</p></div> : user && session?.access_token ? <NeighborAssistant key={user.id} accessToken={session.access_token} /> : <section className="grow-welcome" aria-labelledby="grow-welcome-title"><span className="grow-welcome-icon"><Sprout size={41} strokeWidth={1.3} aria-hidden="true" /></span><h2 id="grow-welcome-title">Good things start with a question.</h2><p>Sign in to ask Grow Neighbor for local opportunities and open the events that catch your eye.</p>{!configured ? <p className="grow-configuration-note">Accounts aren’t connected in this environment yet. Grow Neighbor will be available once Supabase is configured.</p> : <Link className="button button-primary" to="/login?next=/grow-neighbor">Log in to ask Grow Neighbor<ArrowUpRight size={17} aria-hidden="true" /></Link>}{error && <p className="grow-configuration-note" role="status">{error}</p>}<Link className="text-link" to="/explore">Explore events<ArrowRight size={16} aria-hidden="true" /></Link></section>}
  </div>;
}
