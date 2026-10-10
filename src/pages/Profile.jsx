import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Check, Clock, Leaf, LogOut, MapPin, Sprout, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { apiRequest } from '../lib/api.js';
import { categories } from '../data/events.js';
import EventCard from '../components/EventCard.jsx';
import '../auth.css';

const interestOptions = categories.filter((category) => category.id !== 'all');

function message(error) {
  return error?.message || 'We couldn’t load your profile. Please try again.';
}

function fieldsFrom(profile) {
  return {
    displayName: profile?.displayName ?? '',
    city: profile?.city ?? '',
    interests: profile?.interests ?? [],
    bio: profile?.bio ?? '',
    avatarUrl: profile?.avatarUrl ?? '',
  };
}

function ProfileEditor({ profile, token, onSaved }) {
  const [fields, setFields] = useState(() => fieldsFrom(profile));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => { setFields(fieldsFrom(profile)); }, [profile]);

  function change(key, value) {
    setFields((previous) => ({ ...previous, [key]: value }));
    setSuccess(false);
  }

  function toggleInterest(id) {
    change('interests', fields.interests.includes(id) ? fields.interests.filter((interest) => interest !== id) : [...fields.interests, id]);
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSuccess(false);
    const values = { ...fields, displayName: fields.displayName.trim(), city: fields.city.trim(), bio: fields.bio.trim(), avatarUrl: fields.avatarUrl.trim() };
    if (values.displayName.length < 2 || values.displayName.length > 80) return setError('Choose a display name between 2 and 80 characters.');
    if (values.city.length > 100 || values.bio.length > 500) return setError('Keep your city within 100 characters and your bio within 500 characters.');
    if (values.avatarUrl) {
      try {
        const url = new URL(values.avatarUrl);
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
      } catch {
        setError('Use a complete HTTPS URL for your profile photo, or leave it blank.');
        return;
      }
    }
    setPending(true);
    try {
      const result = await apiRequest('/api/me', { method: 'PATCH', body: values }, token);
      onSaved(result.profile);
      setSuccess(true);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setPending(false);
    }
  }

  return <section className="rooted-account-panel rooted-profile-editor" aria-labelledby="profile-edit-title">
    <div className="eyebrow">MAKE YOURSELF AT HOME</div><h2 id="profile-edit-title">A little about you.</h2>
    <p className="rooted-profile-description">Share only what you’re comfortable sharing. Your display name helps your neighbors recognize you.</p>
    <form className="rooted-account-form" onSubmit={submit}>
      <div className="rooted-profile-field-pair"><label htmlFor="profile-display-name">Display name<input id="profile-display-name" name="displayName" type="text" autoComplete="nickname" required minLength={2} maxLength={80} value={fields.displayName} onChange={(event) => change('displayName', event.target.value)} disabled={pending} /></label><label htmlFor="profile-city">City <span className="rooted-optional">optional</span><input id="profile-city" name="city" type="text" autoComplete="address-level2" maxLength={100} value={fields.city} onChange={(event) => change('city', event.target.value)} disabled={pending} /></label></div>
      <fieldset className="rooted-interest-fieldset" disabled={pending}><legend>What do you care about? <span className="rooted-optional">optional</span></legend><p className="rooted-field-hint">Choose the interests that feel like you.</p><div className="rooted-interest-options">{interestOptions.map((interest) => <label key={interest.id} className={fields.interests.includes(interest.id) ? 'selected' : ''}><input type="checkbox" name="interests" value={interest.id} checked={fields.interests.includes(interest.id)} onChange={() => toggleInterest(interest.id)} /><span>{interest.label}</span></label>)}</div></fieldset>
      <label htmlFor="profile-bio">Your story <span className="rooted-optional">optional</span><textarea id="profile-bio" name="bio" rows={4} maxLength={500} value={fields.bio} onChange={(event) => change('bio', event.target.value)} disabled={pending} /><span className="rooted-field-hint">A few words about you. {fields.bio.length}/500 characters.</span></label>
      <label htmlFor="profile-avatar">Profile photo URL <span className="rooted-optional">optional</span><input id="profile-avatar" name="avatarUrl" type="url" inputMode="url" maxLength={2000} value={fields.avatarUrl} onChange={(event) => change('avatarUrl', event.target.value)} disabled={pending} placeholder="https://…" /><span className="rooted-field-hint">A public HTTPS image link. Leave blank to keep your initials.</span></label>
      {error && <p className="rooted-account-error" role="alert">{error}</p>}
      {success && <p className="rooted-inline-success" role="status"><Check size={17} aria-hidden="true" />Your profile has been saved.</p>}
      <button className="button button-primary" type="submit" disabled={pending}>{pending ? 'Saving your profile…' : 'Save profile'}{!pending && <Check size={17} aria-hidden="true" />}</button>
    </form>
  </section>;
}

function Activity({ title, description, emptyTitle, emptyDescription, events }) {
  return <section className="rooted-profile-activity" aria-label={title}><div className="rooted-profile-section-heading"><h2>{title}</h2><p>{description}</p></div>{events?.length ? <div className="event-grid">{events.map((event) => <EventCard key={event.id} event={event} />)}</div> : <div className="rooted-profile-empty"><Sprout size={28} strokeWidth={1.4} aria-hidden="true" /><div><h3>{emptyTitle}</h3><p>{emptyDescription}</p></div></div>}</section>;
}

function ProfileAvatar({ profile }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [profile.avatarUrl]);
  return <span className="rooted-profile-avatar" aria-hidden="true">{profile.avatarUrl?.startsWith('https://') && !failed ? <img src={profile.avatarUrl} alt="" width="65" height="65" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : profile.displayName?.trim().slice(0, 1).toLocaleUpperCase() || <UserRound size={31} />}</span>;
}

export default function Profile() {
  const { user, session, loading: authLoading, configured, signOut } = useAuth();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');

  useEffect(() => {
    let canceled = false;
    setData(null);
    setError('');
    if (!user || !session?.access_token) return;
    setLoading(true);
    apiRequest('/api/me', {}, session.access_token)
      .then((result) => { if (!canceled) setData(result); })
      .catch((caught) => { if (!canceled) setError(message(caught)); })
      .finally(() => { if (!canceled) setLoading(false); });
    return () => { canceled = true; };
  }, [user?.id, session?.access_token, reload]);

  async function logout() {
    setSigningOut(true);
    setSignOutError('');
    try { await signOut(); } catch (caught) { setSignOutError(message(caught)); } finally { setSigningOut(false); }
  }

  if (!authLoading && !user) return <div className="page-container rooted-account-page rooted-signed-out"><div className="rooted-signed-out-copy"><span className="rooted-account-icon"><UserRound size={29} aria-hidden="true" /></span><div className="eyebrow">YOUR OWN LITTLE CORNER</div><h1>Your story starts outside.</h1><p className="rooted-account-lead">Create an account to save your profile and, as Rooted grows, bring your participation together in one place.</p>{!configured && <div className="rooted-account-notice"><strong>Accounts are waiting to be connected.</strong><p>This environment’s Supabase project hasn’t been configured yet. Account forms will become available once setup is complete.</p></div>}<div className="rooted-account-actions"><Link className="button button-primary" to="/signup">Create account<ArrowRight size={17} aria-hidden="true" /></Link><Link className="button button-outline" to="/login">Log in</Link></div><Link className="text-link" to="/explore">Explore events<ArrowRight size={16} aria-hidden="true" /></Link></div><div className="rooted-profile-welcome-art" aria-hidden="true"><Sprout size={110} strokeWidth={.9} /><p>Room to grow.</p></div></div>;

  const profile = data?.profile;
  const impact = [
    { key: 'completedEvents', label: 'Completed events' },
    { key: 'volunteerHours', label: 'Volunteer hours' },
    { key: 'wasteKg', label: 'Kilograms collected' },
    { key: 'treesPlanted', label: 'Trees planted' },
  ].filter((metric) => Number(data?.stats?.[metric.key]) > 0);

  return <div className="page-container rooted-profile-page">
    <div className="rooted-profile-heading"><div><div className="eyebrow"><Leaf size={14} aria-hidden="true" />YOUR OWN LITTLE CORNER</div><h1>{profile?.displayName ? `Welcome, ${profile.displayName}.` : 'Your profile.'}</h1><p className="rooted-account-lead">A little about you, and the good you grow together.</p></div>{user && <button className="button button-outline" onClick={logout} disabled={signingOut}><LogOut size={16} aria-hidden="true" />{signingOut ? 'Logging out…' : 'Log out'}</button>}</div>
    {location.state?.notice && <p className="rooted-inline-success" role="status"><Check size={17} aria-hidden="true" />{location.state.notice}</p>}
    {signOutError && <p className="rooted-account-error" role="alert">{signOutError}</p>}
    {(authLoading || loading) && <div className="rooted-account-panel rooted-profile-loading" role="status"><Sprout size={32} aria-hidden="true" /><p>Gathering your profile…</p></div>}
    {!authLoading && !loading && error && <div className="rooted-account-panel rooted-profile-error"><h2>Your profile needs a moment.</h2><p className="rooted-account-error" role="alert">{error}</p><p>Your account is signed in. Your profile and activity can load once the connected data service is available.</p><button className="button button-primary" onClick={() => setReload((previous) => previous + 1)}>Try again<ArrowRight size={17} aria-hidden="true" /></button></div>}
    {!loading && profile && <>
      <div className="rooted-profile-overview"><div className="rooted-profile-summary"><ProfileAvatar profile={profile} /><div><h2>{profile.displayName}</h2>{profile.city && <p><MapPin size={14} aria-hidden="true" />{profile.city}</p>}<p className="rooted-profile-private">Your personal profile</p></div></div><div className="rooted-profile-impact"><div className="eyebrow"><Check size={14} aria-hidden="true" />VERIFIED CONTRIBUTIONS</div>{impact.length ? <div className="rooted-profile-metrics">{impact.map((metric) => <div key={metric.key}><strong>{Number(data.stats[metric.key]).toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong><span>{metric.label}</span></div>)}</div> : <p><Clock size={16} aria-hidden="true" />Your impact will appear after an organizer verifies completed participation. Joining an event alone doesn’t add impact.</p>}</div></div>
      <ProfileEditor profile={profile} token={session.access_token} onSaved={(saved) => setData((previous) => ({ ...previous, profile: saved }))} />
      <Activity title="Your upcoming events" description="A little shared care to look forward to." events={data.upcomingEvents} emptyTitle="Your next good thing is ahead." emptyDescription="You haven’t joined any events yet. Explore an event and join when you find something that feels right." />
      <Activity title="Your participation history" description="The moments you’ve shared with your community." events={data.attendedEvents} emptyTitle="There’s room for your first chapter." emptyDescription="No participation has been recorded yet. Organizer-verified completion will bring your contributions here." />
      <Link className="text-link" to="/explore">Discover your next event<ArrowRight size={17} aria-hidden="true" /></Link>
    </>}
  </div>;
}
