import { Suspense, useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ArrowUpRight, CirclePlus, Compass, Home, MapPin, Sprout, Users, UserRound, Sparkles } from 'lucide-react';

const navigation = [{ to: '/', label: 'Home', icon: Home }, { to: '/explore', label: 'Explore', icon: Compass }, { to: '/create', label: 'Create', icon: CirclePlus }, { to: '/community', label: 'Community', icon: Users }, { to: '/profile', label: 'Profile', icon: UserRound }];

function RouteEffects() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    const title = pathname === '/' ? 'Grow your community' : pathname.split('/')[1].replaceAll('-', ' ');
    document.title = `Rooted — ${title[0]?.toUpperCase()}${title.slice(1)}`;
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}

export function SampleNotice({ compact = false }) {
  return <div className={`sample-notice ${compact ? 'compact' : ''}`}><span className="sample-dot" aria-hidden="true" /><p><strong>Sample events</strong><span>{compact ? ' · Fictional preview' : ' — fictional examples for exploring Rooted. Sample events cannot be joined and never earn impact.'}</span></p></div>;
}

export default function Layout() {
  return <>
    <RouteEffects />
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="site-header"><div className="header-inner">
      <Link className="brand" to="/" aria-label="Rooted home"><span className="brand-mark"><Sprout size={25} strokeWidth={1.8} aria-hidden="true" /></span>rooted<span className="brand-period">.</span></Link>
      <nav className="desktop-navigation" aria-label="Desktop navigation">{navigation.map(({ to, label }) => <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>)}</nav>
      <div className="header-actions"><span className="local-tag"><MapPin size={15} aria-hidden="true" />The Triangle, NC</span><Link className="header-assistant" to="/grow-neighbor"><Sparkles size={16} aria-hidden="true" /><span>Grow Neighbor</span></Link></div>
    </div></header>
    <main id="main-content" tabIndex={-1}><Suspense fallback={<div className="page-container"><div className="request-state" role="status">Opening Rooted…</div></div>}><Outlet /></Suspense></main>
    <footer className="site-footer"><div className="footer-inner"><Link className="brand footer-brand" to="/"><Sprout size={21} aria-hidden="true" />rooted.</Link><p>A little closer to nature. A little closer to each other.</p><span>Made for HackNC 2026 <ArrowUpRight size={13} aria-hidden="true" /></span></div></footer>
    <nav className="mobile-navigation" aria-label="Primary navigation">{navigation.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'}><Icon size={21} strokeWidth={1.7} aria-hidden="true" /><span>{label}</span></NavLink>)}</nav>
  </>;
}
