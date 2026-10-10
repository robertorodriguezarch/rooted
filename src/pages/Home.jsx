import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, MapPin, Sprout, HeartHandshake, Sparkles, Leaf } from 'lucide-react';
import { categories } from '../data/events.js';
import { useEvents } from '../hooks/useEvents.js';
import RequestState from '../components/RequestState.jsx';
import EventCard from '../components/EventCard.jsx';
import { CategoryIcon } from '../components/Icon.jsx';
import { SampleNotice } from '../components/Layout.jsx';

export default function Home() {
  const { data: events, loading, error, refresh, sampleMode } = useEvents();
  const featured = events.filter(event => event.featured);
  const highlights = (featured.length ? featured : events).slice(0, 3);
  return <div className="home-page">
    <section className="hero page-container">
      <div className="hero-copy"><div className="eyebrow"><span className="eyebrow-line" />GET OUTSIDE. COME TOGETHER.</div>
        <h1>Small acts.<br /><em>Stronger roots.</em></h1>
        <p>Find your people. Care for your corner of the planet. Good things happen when we grow together.</p>
        <div className="hero-actions"><Link className="button button-primary" to="/explore">Explore events<ArrowUpRight size={19} aria-hidden="true" /></Link><Link className="text-link" to="/community">Meet your community <ArrowRight size={16} aria-hidden="true" /></Link></div>
        <div className="hero-note"><span className="mini-leaf"><Leaf size={18} aria-hidden="true" /></span><span>A little time outdoors. A lasting connection.</span></div>
      </div>
      <div className="hero-visual"><img src="/images/forest.jpg" alt="Misty forested mountains, an illustrative landscape" fetchPriority="high" width="1900" height="1188" /><div className="hero-image-shade" /><span className="hero-image-tag"><MapPin size={14} aria-hidden="true" />Rooted in the Triangle</span><div className="hero-image-caption"><span>MORE THAN A PLACE.</span><p>A place to belong.</p></div><div className="hero-card"><span className="hero-card-icon"><HeartHandshake size={23} aria-hidden="true" /></span><div><strong>Better, together.</strong><p>Your next connection starts outside.</p></div><ArrowUpRight size={20} aria-hidden="true" /></div></div>
    </section>
    <section className="values-strip page-container" aria-label="Our approach"><div><Sprout size={22} aria-hidden="true" /><span>Small actions,<strong>meaningful impact</strong></span></div><div><HeartHandshake size={22} aria-hidden="true" /><span>Real people,<strong>real connection</strong></span></div><div><Leaf size={22} aria-hidden="true" /><span>Local places,<strong>a little more care</strong></span></div></section>
    <section className="page-container home-events"><div className="section-heading"><div><div className="eyebrow">MAKE A LITTLE ROOM FOR GOOD</div><h2>Find your next good thing.</h2><p>A morning outdoors can turn into something more.</p></div><Link className="text-link" to="/explore">View all events<ArrowRight size={17} aria-hidden="true" /></Link></div>
      {(sampleMode || events.some(event => event.isSample)) && <SampleNotice compact />}
      <RequestState loading={loading} error={error} retry={refresh} />
      {!loading && !error && (highlights.length ? <div className="event-grid">{highlights.map(event => <EventCard key={event.id} event={event} />)}</div> : <div className="empty-state"><h2>Good things have room to grow.</h2><p>No upcoming events yet. You could help start something meaningful.</p><Link className="button button-primary" to="/create">Create an event<ArrowUpRight size={17} aria-hidden="true" /></Link></div>)}
    </section>
    <section className="page-container interests-section"><div className="section-heading"><div><div className="eyebrow">THERE’S A PLACE FOR EVERYONE</div><h2>Follow what moves you.</h2></div><p>You don’t need experience.<br />Just a little curiosity.</p></div><div className="interest-grid">{categories.filter(category => category.id !== 'all').map(category => <Link key={category.id} to={`/explore?category=${category.id}`}><span><CategoryIcon category={category.id} size={24} /></span><strong>{category.label}</strong><ArrowUpRight size={16} aria-hidden="true" /></Link>)}</div></section>
    <section className="page-container"><div className="neighbor-banner"><div className="neighbor-illustration" aria-hidden="true"><Sprout size={68} strokeWidth={1.1} /><span className="orbit orbit-one" /><span className="orbit orbit-two" /></div><div className="neighbor-copy"><div className="eyebrow"><Sparkles size={14} aria-hidden="true" /> MEET GROW NEIGHBOR</div><h2>A little guidance.<br />A greener tomorrow.</h2><p>Our planned sustainability companion will help you find local opportunities and take your next small step.</p></div><Link className="button button-outline" to="/grow-neighbor">Meet your future neighbor<ArrowUpRight size={18} aria-hidden="true" /></Link></div></section>
  </div>;
}
