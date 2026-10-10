import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Leaf, Mail, Sprout } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import '../auth.css';

const content = {
  login: { eyebrow: 'WELCOME BACK, NEIGHBOR', title: 'Good to see you again.', description: 'Make yourself at home. Your next little act of care starts here.', submit: 'Log in' },
  signup: { eyebrow: 'A LITTLE ROOM TO GROW', title: 'Put down your roots.', description: 'Find your people, share what matters to you, and make a little difference together.', submit: 'Create account' },
  forgot: { eyebrow: 'LET’S FIND YOUR WAY BACK', title: 'A fresh start.', description: 'Enter your account email and we’ll send you a link to reset your password.', submit: 'Send reset link' },
  reset: { eyebrow: 'YOUR NEXT CHAPTER', title: 'Choose a new password.', description: 'Give your account a fresh start with a password you haven’t used before.', submit: 'Save new password' },
  callback: { eyebrow: 'WELCOME TO ROOTED', title: 'One step closer.', description: 'We’re checking your email confirmation so you can settle in.' },
};

// Redirects stay inside this app, even when a URL is shared from elsewhere.
function nextPath(search) {
  const next = new URLSearchParams(search).get('next');
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\') || /[\u0000-\u001f]/.test(next)) return '/profile';
  if (/^\/(login|signup|forgot-password|reset-password|auth)(\/|\?|$)/.test(next)) return '/profile';
  return next;
}

function errorMessage(error) {
  return (typeof error === 'string' ? error : error?.message) || 'We couldn’t complete that request. Please try again.';
}

export default function Auth({ mode = 'login' }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const destination = nextPath(location.search);
  const accountLink = (path) => destination === '/profile' ? path : `${path}?next=${encodeURIComponent(destination)}`;
  const copy = content[mode] ?? content.login;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setPassword('');
    setConfirmPassword('');
    setError('');
    setSuccess('');
  }, [mode]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!auth.configured) return;
    if (mode === 'signup' && (displayName.trim().length < 2 || displayName.trim().length > 80)) {
      setError('Choose a display name between 2 and 80 characters.');
      return;
    }
    if (mode !== 'forgot' && password.length < 8) {
      setError('Use at least 8 characters for your password.');
      return;
    }
    if (mode === 'reset' && password !== confirmPassword) {
      setError('Your passwords don’t match. Please try again.');
      return;
    }
    setPending(true);
    try {
      if (mode === 'signup') {
        const result = await auth.signUp({ email: email.trim(), password, displayName: displayName.trim() });
        setPassword('');
        if (result.session) navigate(destination, { replace: true });
        else setSuccess('Check your inbox for a confirmation email. Follow its link to verify your address, then log in to Rooted.');
      } else if (mode === 'forgot') {
        await auth.requestPasswordReset(email.trim());
        setSuccess('If an account uses that email, you’ll receive a password reset link. Check your inbox and spam folder.');
      } else if (mode === 'reset') {
        if (!auth.recoveryReady || !auth.session) throw new Error('Open the password reset link in your email before choosing a new password.');
        await auth.updatePassword(password);
        setPassword('');
        setConfirmPassword('');
        navigate('/profile', { replace: true, state: { notice: 'Your password has been updated.' } });
      } else {
        await auth.signIn({ email: email.trim(), password });
        setPassword('');
        navigate(destination, { replace: true });
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  const resetReady = mode !== 'reset' || (auth.recoveryReady && auth.session);
  const blocked = !auth.configured || auth.loading || pending || !resetReady;
  const existingAccount = auth.user && ['login', 'signup'].includes(mode);

  return <div className="page-container rooted-account-page">
    <div className="rooted-auth-layout">
      <div className="rooted-auth-story">
        <div className="eyebrow"><Leaf size={15} aria-hidden="true" />{copy.eyebrow}</div>
        <h1>{copy.title}</h1>
        <p className="rooted-account-lead">{copy.description}</p>
        <div className="rooted-auth-art" aria-hidden="true"><div className="rooted-auth-ring" /><div className="rooted-auth-ring second" /><Sprout size={85} strokeWidth={1.1} /><span>Good things grow together.</span></div>
        <Link className="text-link" to="/explore">Keep exploring events<ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
      <section className="rooted-account-panel" aria-label="Your Rooted account">
        {!auth.configured && <div className="rooted-account-notice" role="status"><strong>Accounts are waiting to be connected.</strong><p>The Supabase project hasn’t been configured for this environment yet. You can still explore events while account setup is completed.</p></div>}
        {auth.loading && <p className="rooted-account-status" role="status">Checking your account…</p>}
        {auth.error && <p className="rooted-account-error" role="alert">{errorMessage(auth.error)}</p>}
        {mode === 'callback' ? <div className="rooted-auth-confirmation">
          <span className="rooted-account-icon"><Mail size={27} aria-hidden="true" /></span>
          <h2>{auth.loading ? 'Checking your confirmation…' : auth.user ? 'You’re ready to grow.' : 'Let’s finish getting you in.'}</h2>
          {!auth.loading && <><p>{auth.user ? 'Your email has been confirmed and you’re signed in. Add a few details to make your profile your own.' : 'If your email was confirmed, log in to continue. If the link expired, try signing up again to request a new confirmation.'}</p><Link className="button button-primary" to={auth.user ? destination : accountLink('/login')}>{auth.user ? (destination === '/profile' ? 'Go to your profile' : 'Continue') : 'Log in'}<ArrowRight size={17} aria-hidden="true" /></Link></>}
        </div> : existingAccount ? <div className="rooted-auth-confirmation"><span className="rooted-account-icon"><Check size={27} aria-hidden="true" /></span><h2>You’re already at home.</h2><p>You’re signed in. Head to your profile or continue where you left off.</p><Link className="button button-primary" to={destination}>{destination === '/profile' ? 'Go to your profile' : 'Continue'}<ArrowRight size={17} aria-hidden="true" /></Link></div> : <>
          <h2>{mode === 'signup' ? 'Meet your neighbors.' : mode === 'forgot' ? 'Reset your password' : mode === 'reset' ? 'Make it a fresh one.' : 'Your little corner awaits.'}</h2>
          {mode === 'reset' && !auth.loading && !resetReady && <div className="rooted-account-notice" role="status"><p>Open the password reset link from your email to continue. An expired link needs a fresh request.</p><Link className="text-link" to="/forgot-password">Request a new reset link<ArrowRight size={15} aria-hidden="true" /></Link></div>}
          {success ? <div className="rooted-account-success" role="status"><Check size={20} aria-hidden="true" /><div><strong>{mode === 'signup' ? 'Check your email.' : 'Look out for a link.'}</strong><p>{success}</p><Link className="text-link" to={accountLink('/login')}>Back to log in<ArrowRight size={15} aria-hidden="true" /></Link></div></div> : <form className="rooted-account-form" onSubmit={submit}>
            {mode === 'signup' && <label htmlFor="auth-display-name">Display name<input id="auth-display-name" name="displayName" type="text" autoComplete="nickname" required minLength={2} maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} disabled={pending} /><span className="rooted-field-hint">The name your neighbors will see.</span></label>}
            {mode !== 'reset' && <label htmlFor="auth-email">Email address<input id="auth-email" name="email" type="email" autoComplete="email" inputMode="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} /></label>}
            {mode !== 'forgot' && <label htmlFor="auth-password">{mode === 'reset' ? 'New password' : 'Password'}<input id="auth-password" name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} /><span className="rooted-field-hint">Use at least 8 characters.</span></label>}
            {mode === 'reset' && <label htmlFor="auth-confirm-password">Confirm new password<input id="auth-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} disabled={pending} /></label>}
            {mode === 'login' && <Link className="rooted-form-link" to={accountLink('/forgot-password')}>Forgot your password?</Link>}
            {error && <p className="rooted-account-error" role="alert">{error}</p>}
            <button className="button button-primary" type="submit" disabled={blocked}>{pending ? 'One moment…' : copy.submit}{!pending && <ArrowRight size={17} aria-hidden="true" />}</button>
          </form>}
          {mode === 'login' && <p className="rooted-auth-switch">New around here? <Link to={accountLink('/signup')}>Create an account</Link></p>}
          {mode === 'signup' && <p className="rooted-auth-switch">Already part of the neighborhood? <Link to={accountLink('/login')}>Log in</Link></p>}
          {['forgot', 'reset'].includes(mode) && !success && <p className="rooted-auth-switch"><Link to={accountLink('/login')}>Back to log in</Link></p>}
        </>}
      </section>
    </div>
  </div>;
}
