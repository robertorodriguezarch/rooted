import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Clock3, MapPin, Users, Check, ArrowUpRight, Sprout, Info } from 'lucide-react';
import { categoryLabel } from '../data/events.js';
import { useEvents } from '../hooks/useEvents.js';
import { useAuth } from '../context/AuthContext.jsx';
import { apiRequest } from '../lib/api.js';
import { formatFullDate, formatTime } from '../lib/format.js';
import { CategoryIcon } from '../components/Icon.jsx';
import { SampleNotice } from '../components/Layout.jsx';
import RequestState from '../components/RequestState.jsx';
import { NotFound } from './Upcoming.jsx';

export default function EventDetail() {
  const { id } = useParams();
  const { data: event, loading, error, refresh, sampleMode } = useEvents(id);
  const { user, session, loading: authLoading, configured } = useAuth();
  const [copied, setCopied] = useState('');
  const [joining, setJoining] = useState(false);
  const [registrationMessage, setRegistrationMessage] = useState('');
  const [registrationError, setRegistrationError] = useState('');
  useEffect(() => { setCopied(''); setRegistrationMessage(''); setRegistrationError(''); }, [id]);

  async function share() {
    try { await navigator.clipboard.writeText(window.location.href); setCopied('Event link copied.'); }
    catch { setCopied('Copy this page’s address from your browser to share it.'); }
  }
  async function register() {
    if (!session?.access_token || joining) return;
    setJoining(true); setRegistrationError(''); setRegistrationMessage('');
    try {
      const result = await apiRequest('/api/events/' + encodeURIComponent(event.id) + '/registration', { method: event.isRegistered ? 'DELETE' : 'POST' }, session.access_token);
      setRegistrationMessage(result.registered ? 'You’re registered. Find this event in your profile. Joining does not add verified impact.' : 'You’ve left the event. You can join again while registration is open.');
      refresh();
    } catch (failure) { setRegistrationError(failure.message); }
    finally { setJoining(false); }
  }

  if (loading || error) return <div className="page-container detail-page"><Link className="back-link" to="/explore"><ArrowLeft size={17} aria-hidden="true" />Back to events</Link><RequestState loading={loading} error={error} retry={refresh} /></div>;
  if (!event) return <NotFound event />;
  const isSample = sampleMode || event.isSample;
  const closed = !isSample && (event.status !== 'published' || Date.parse(event.startsAt) <= Date.now());
  const full = event.capacity !== null && event.participants >= event.capacity;
  const canRegister = event.isRegistered || (!closed && !full);

  return <div className="page-container detail-page">
    <Link className="back-link" to="/explore"><ArrowLeft size={17} aria-hidden="true" />Back to events</Link>
    {isSample && <SampleNotice />}
    <div className="detail-hero"><img src={event.image} alt={event.imageAlt || 'Environmental event illustration'} referrerPolicy="no-referrer" width="700" height="500" /><div className="detail-hero-shade" /><span className="detail-category"><CategoryIcon category={event.category} />{categoryLabel(event.category)}</span>{isSample && <span className="photo-note">Illustrative landscape · sample event</span>}</div>
    <div className="detail-layout"><div className="detail-copy">
      <div className="eyebrow">A LITTLE TIME. A SHARED PURPOSE.</div><h1>{event.title}</h1><p className="organized-by">Hosted by <strong>{event.organizer}</strong></p>
      <div className="detail-highlights">{event.highlights.map(item => <span key={item}><Check size={14} aria-hidden="true" />{item}</span>)}</div>
      <section className="detail-section"><h2>A good way to spend your day.</h2><p>{event.description}</p></section>
      <section className="detail-section"><h2>Come as you are. Bring a little care.</h2><ul className="instruction-list">{event.instructions.map(item => <li key={item}><Check size={17} aria-hidden="true" />{item}</li>)}</ul></section>
      <section className="organizer-panel"><span className="organizer-avatar"><Sprout size={28} aria-hidden="true" /></span><div><span className="eyebrow">{isSample ? 'YOUR SAMPLE ORGANIZER' : 'YOUR ORGANIZER'}</span><h2>{event.organizer}</h2><p>{event.organizerDescription || 'Bringing neighbors together through a little shared care.'}</p><Link className="text-link" to="/community">Get to know the community<ArrowUpRight size={15} aria-hidden="true" /></Link></div></section>
    </div><aside className="event-summary">
      <h2>Make a little time.</h2><dl>
        <div><dt><CalendarDays size={21} aria-hidden="true" />Date</dt><dd>{formatFullDate(event.startsAt)}</dd></div>
        <div><dt><Clock3 size={21} aria-hidden="true" />Time</dt><dd>{formatTime(event.startsAt)} – {formatTime(event.endsAt)} ET</dd></div>
        <div><dt><MapPin size={21} aria-hidden="true" />Meeting place</dt><dd>{event.location}<small>{event.address}</small></dd></div>
        <div><dt><Users size={21} aria-hidden="true" />{isSample ? 'Sample participation' : 'Neighbors going'}</dt><dd>{event.participants}{event.capacity === null ? ' registered · no participant limit' : ' of ' + event.capacity + ' places' + (isSample ? ' shown' : '')}</dd></div>
      </dl>
      {isSample ? <div className="registration-note"><Info size={18} aria-hidden="true" /><div><strong>Sample preview — registration unavailable</strong><p>This event is fictional. Explore the details; choose a live event to join your neighbors.</p></div></div> : <div className="live-registration">
        {closed && <p className="registration-explanation">Registration is closed for this event.</p>}
        {full && !event.isRegistered && !closed && <p className="registration-explanation">This event is full. Explore another opportunity.</p>}
        {!configured ? <p className="registration-explanation">Accounts need to be connected before you can register.</p> : authLoading ? <p role="status">Checking your account…</p> : !user && canRegister ? <Link className="button button-primary full-width" to={'/login?next=' + encodeURIComponent('/events/' + event.id)}>Log in to join<ArrowUpRight size={17} aria-hidden="true" /></Link> : user && canRegister ? <button className="button button-primary full-width" onClick={register} disabled={joining}>{joining ? 'Updating registration…' : event.isRegistered ? 'Leave event' : 'Join event'}<ArrowUpRight size={17} aria-hidden="true" /></button> : null}
        {registrationError && <p className="registration-error" role="alert">{registrationError}</p>}
        {registrationMessage && <p className="registration-success" role="status">{registrationMessage}</p>}
        <p className="registration-explanation">Joining reserves your place. Contributions count only after an organizer verifies completion.</p>
      </div>}
      <button className="button button-outline full-width" onClick={share}>{isSample ? 'Copy sample event link' : 'Copy event link'}<ArrowUpRight size={17} aria-hidden="true" /></button><p className="share-status" role="status">{copied}</p>
    </aside></div>
  </div>;
}
