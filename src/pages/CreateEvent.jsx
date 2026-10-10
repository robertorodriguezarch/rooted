import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, Check, Leaf, LoaderCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { apiRequest } from '../lib/api.js';
import { sampleMode } from '../hooks/useEvents.js';
import { categories } from '../data/events.js';
import '../event-form.css';

const initialFields = {
  title: '', description: '', category: 'cleanup', startsAt: '', endsAt: '',
  city: '', location: '', address: '', capacity: '', instructions: '', image: '',
};

const fieldLabels = {
  title: 'Event name', description: 'Description', category: 'Category',
  startsAt: 'Start date and time', endsAt: 'End date and time', city: 'City',
  location: 'Meeting place', address: 'Street address or meeting directions',
  capacity: 'Participant limit', instructions: 'What to bring and know', image: 'Image URL',
};

function validate(fields) {
  const errors = {};
  const title = fields.title.trim();
  const description = fields.description.trim();
  if (title.length < 5 || title.length > 120) errors.title = 'Use 5–120 characters for the event name.';
  if (description.length < 20 || description.length > 5000) errors.description = 'Describe your event in 20–5,000 characters.';
  if (!categories.some(category => category.id !== 'all' && category.id === fields.category)) errors.category = 'Choose an event category.';

  const startsAt = new Date(fields.startsAt);
  const endsAt = new Date(fields.endsAt);
  if (!fields.startsAt || Number.isNaN(startsAt.getTime())) errors.startsAt = 'Choose a valid start date and time.';
  if (!fields.endsAt || Number.isNaN(endsAt.getTime())) errors.endsAt = 'Choose a valid end date and time.';
  if (!errors.startsAt && !errors.endsAt && endsAt <= startsAt) errors.endsAt = 'The event must end after it starts.';
  const locationLimits = { city: 120, location: 200, address: 300 };
  for (const name of ['city', 'location', 'address']) {
    if (!fields[name].trim()) errors[name] = `Enter the ${fieldLabels[name].toLowerCase()}.`;
    else if (fields[name].trim().length > locationLimits[name]) errors[name] = `Keep ${fieldLabels[name].toLowerCase()} to ${locationLimits[name]} characters or fewer.`;
  }

  const capacity = fields.capacity.trim();
  if (capacity && (!/^\d+$/.test(capacity) || !Number.isSafeInteger(Number(capacity)) || Number(capacity) < 1 || Number(capacity) > 10000)) {
    errors.capacity = 'Enter a whole number from 1 to 10,000, or leave this blank for no participant limit.';
  }
  const image = fields.image.trim();
  if (image) {
    try {
      const url = new URL(image);
      if (url.protocol !== 'https:' || url.username || url.password || image.length > 2048) throw new Error('Invalid URL');
    } catch {
      errors.image = 'Use a complete HTTPS image URL, up to 2,048 characters, without embedded credentials.';
    }
  }
  const instructions = fields.instructions.split('\n').map(line => line.trim()).filter(Boolean);
  if (instructions.length > 20) errors.instructions = 'Keep preparation instructions to 20 lines or fewer.';
  if (instructions.some(line => line.length > 500)) errors.instructions = 'Keep each instruction to 500 characters or fewer.';
  return { errors, instructions };
}

function Field({ name, errors, hint, children, optional = false }) {
  return <div className={`create-field create-field-${name}`}>
    <label htmlFor={`event-${name}`}>{fieldLabels[name]}{optional && <span>Optional</span>}</label>
    {hint && <p className="create-field-hint" id={`event-${name}-hint`}>{hint}</p>}
    {children}
    {errors[name] && <p className="create-field-error" id={`event-${name}-error`}>{errors[name]}</p>}
  </div>;
}

export default function CreateEvent() {
  const { user, session, loading, configured } = useAuth();
  const navigate = useNavigate();
  const [fields, setFields] = useState(initialFields);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const errorSummary = useRef(null);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'your device’s local timezone';

  function inputProps(name, hint = false) {
    return {
      id: `event-${name}`, name, value: fields[name],
      onChange: event => {
        setFields(current => ({ ...current, [name]: event.target.value }));
        setErrors(current => ({ ...current, [name]: undefined }));
        setServerError('');
      },
      'aria-invalid': errors[name] ? true : undefined,
      'aria-describedby': [hint && `event-${name}-hint`, errors[name] && `event-${name}-error`].filter(Boolean).join(' ') || undefined,
    };
  }

  function focusErrors() {
    requestAnimationFrame(() => errorSummary.current?.focus());
  }

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    const result = validate(fields);
    setErrors(result.errors);
    setServerError('');
    if (Object.keys(result.errors).length) {
      focusErrors();
      return;
    }
    setSubmitting(true);
    try {
      const { event: created } = await apiRequest('/api/events', {
        method: 'POST',
        body: {
          title: fields.title.trim(), description: fields.description.trim(), category: fields.category,
          startsAt: new Date(fields.startsAt).toISOString(), endsAt: new Date(fields.endsAt).toISOString(),
          city: fields.city.trim(), location: fields.location.trim(), address: fields.address.trim(),
          capacity: fields.capacity.trim() ? Number(fields.capacity) : null,
          ...(fields.image.trim() ? { image: fields.image.trim() } : {}),
          instructions: result.instructions, highlights: ['First-timers welcome'],
        },
      }, session.access_token);
      if (!created?.id) throw new Error('The event response was incomplete. Check your profile or Explore before trying again.');
      navigate(`/events/${encodeURIComponent(created.id)}`);
    } catch (error) {
      setServerError(error?.message || 'Your event could not be created. Your details are still here; please try again.');
      focusErrors();
    } finally {
      setSubmitting(false);
    }
  }

  const invalidNames = Object.keys(errors).filter(name => errors[name]);
  return <div className="page-container create-event-page">
    <header className="create-event-heading">
      <div className="eyebrow"><Leaf size={15} aria-hidden="true" />GOOD THINGS START WITH YOU</div>
      <h1>Bring your neighbors together.</h1>
      <p>A cleanup, a planting day, a little shared care. Give your community a clear time, place, and reason to come along.</p>
    </header>

    {loading ? <div className="create-account-card" role="status"><LoaderCircle className="create-spinner" size={22} aria-hidden="true" />Checking your account…</div>
      : configured === false ? <section className="create-account-card" aria-labelledby="create-setup-heading">
        <h2 id="create-setup-heading">Accounts need a little setup.</h2>
        <p>Supabase authentication has not been configured in this environment. Once it is connected, you can sign in and publish an event.</p>
        <Link className="button button-outline" to="/explore">Explore events<ArrowUpRight size={18} aria-hidden="true" /></Link>
      </section>
      : !user || !session?.access_token ? <section className="create-account-card" aria-labelledby="create-account-heading">
        <h2 id="create-account-heading">Your next good thing starts here.</h2>
        <p>Sign in or create an account to organize a real event. You’ll be its organizer, and neighbors will know who is welcoming them.</p>
        <div className="create-account-actions"><Link className="button button-primary" to="/login?next=/create">Log in<ArrowUpRight size={18} aria-hidden="true" /></Link><Link className="button button-outline" to="/signup?next=/create">Create an account</Link></div>
      </section>
      : sampleMode ? <section className="create-account-card" aria-labelledby="create-preview-heading">
        <h2 id="create-preview-heading">There’s room to grow.</h2>
        <p>You’re browsing the sample preview. Publishing is available in the connected app.</p>
        <Link className="button button-outline" to="/explore">Explore sample events<ArrowUpRight size={18} aria-hidden="true" /></Link>
      </section>
      : <div className="create-event-layout">
        <form className="create-event-form" onSubmit={submit} noValidate aria-busy={submitting}>
          {(invalidNames.length > 0 || serverError) && <div className="create-error-summary" role="alert" tabIndex={-1} ref={errorSummary}>
            {serverError ? <p>{serverError}</p> : <><strong>A few details need your attention.</strong><ul>{invalidNames.map(name => <li key={name}><a href={`#event-${name}`} onClick={event => { event.preventDefault(); document.getElementById(`event-${name}`)?.focus(); }}>{errors[name]}</a></li>)}</ul></>}
          </div>}

          <fieldset disabled={submitting}>
            <legend className="sr-only">Event details</legend>
            <section className="create-form-section" aria-labelledby="create-details-heading">
              <h2 id="create-details-heading">What are we growing?</h2>
              <Field name="title" errors={errors} hint="A clear, welcoming name helps neighbors find you."><input {...inputProps('title', true)} type="text" required minLength={5} maxLength={120} placeholder="A little care for our neighborhood creek" /></Field>
              <Field name="description" errors={errors} hint="Tell people what you’ll do together and who can join."><textarea {...inputProps('description', true)} required minLength={20} maxLength={5000} rows={5} placeholder="We’ll spend a morning caring for…" /></Field>
              <Field name="category" errors={errors}><select {...inputProps('category')} required>{categories.filter(category => category.id !== 'all').map(category => <option value={category.id} key={category.id}>{category.label}</option>)}</select></Field>
            </section>

            <section className="create-form-section" aria-labelledby="create-place-heading">
              <h2 id="create-place-heading">A time and place to meet.</h2>
              <p className="create-timezone"><CalendarDays size={17} aria-hidden="true" />Enter times in your local timezone: <strong>{timezone}</strong>. Rooted saves the exact time and displays event details in Eastern Time.</p>
              <div className="create-field-pair">
                <Field name="startsAt" errors={errors}><input {...inputProps('startsAt')} type="datetime-local" required /></Field>
                <Field name="endsAt" errors={errors}><input {...inputProps('endsAt')} type="datetime-local" required /></Field>
              </div>
              <div className="create-field-pair">
                <Field name="city" errors={errors}><input {...inputProps('city')} type="text" required maxLength={120} autoComplete="address-level2" placeholder="Chapel Hill" /></Field>
                <Field name="location" errors={errors}><input {...inputProps('location')} type="text" required maxLength={200} placeholder="Creekside trail entrance" /></Field>
              </div>
              <Field name="address" errors={errors} hint="Give enough detail to find the meeting spot. This is visible on the event page."><input {...inputProps('address', true)} type="text" required maxLength={300} placeholder="Street address, or directions to a public meeting point" /></Field>
            </section>

            <section className="create-form-section" aria-labelledby="create-welcome-heading">
              <h2 id="create-welcome-heading">Help everyone feel ready.</h2>
              <Field name="capacity" errors={errors} optional hint="Leave blank if there is no participant limit."><input {...inputProps('capacity', true)} type="number" min="1" max="10000" step="1" inputMode="numeric" placeholder="30" /></Field>
              <Field name="instructions" errors={errors} optional hint="One instruction per line, up to 20. Mention supplies, access needs, or anything useful to bring."><textarea {...inputProps('instructions', true)} rows={4} maxLength={10000} placeholder={'Wear sturdy shoes.\nBring a reusable water bottle.\nWe’ll have gloves and litter bags ready.'} /></Field>
              <Field name="image" errors={errors} optional hint="Use an HTTPS image URL you have permission to share. Leave blank for a Rooted illustration."><input {...inputProps('image', true)} type="url" maxLength={2048} placeholder="https://…" autoCapitalize="none" autoCorrect="off" spellCheck={false} /></Field>
            </section>
          </fieldset>
          <div className="create-submit-area">
            <p>Publishing makes these details visible to neighbors. Check the meeting place and time before sharing.</p>
            <button className="button button-primary" type="submit" disabled={submitting}>{submitting ? <><LoaderCircle className="create-spinner" size={18} aria-hidden="true" />Publishing your event…</> : <>Publish event<ArrowUpRight size={18} aria-hidden="true" /></>}</button>
          </div>
        </form>

        <aside className="create-event-aside" aria-labelledby="create-tips-heading">
          <span className="create-tips-icon"><Leaf size={29} strokeWidth={1.5} aria-hidden="true" /></span>
          <div className="eyebrow">A LITTLE THOUGHT GOES A LONG WAY</div>
          <h2 id="create-tips-heading">Make room for a first-timer.</h2>
          <p>Good events make the next step feel easy. A few thoughtful details can help someone decide to join.</p>
          <ul><li><Check size={17} aria-hidden="true" />Explain what people will do together.</li><li><Check size={17} aria-hidden="true" />Share a clear, public meeting place.</li><li><Check size={17} aria-hidden="true" />Mention any supplies and accessibility details.</li><li><Check size={17} aria-hidden="true" />Let neighbors know that beginners are welcome.</li></ul>
          <Link className="text-link" to="/explore">Need inspiration? Explore events<ArrowUpRight size={15} aria-hidden="true" /></Link>
        </aside>
      </div>}
  </div>;
}
