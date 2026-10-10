import { useSearchParams } from 'react-router-dom';
import { Search, MapPin, SlidersHorizontal, Leaf, X } from 'lucide-react';
import { categories, filterEvents } from '../data/events.js';
import { useEvents } from '../hooks/useEvents.js';
import RequestState from '../components/RequestState.jsx';
import { CategoryIcon } from '../components/Icon.jsx';
import EventCard from '../components/EventCard.jsx';
import { SampleNotice } from '../components/Layout.jsx';

export default function Explore() {
  const { data: events, loading, error, refresh, sampleMode } = useEvents();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') || '';
  const category = params.get('category') || 'all';
  const location = params.get('location') || 'all';
  const filtered = filterEvents(events, { query, category, location });
  const hasFilters = Boolean(query || category !== 'all' || location !== 'all');
  function updateFilter(key, value) {
    const next = new URLSearchParams(params);
    if (!value || value === 'all') next.delete(key); else next.set(key, value);
    setParams(next, { replace: true });
  }
  return <div className="page-container explore-page"><div className="page-intro"><div className="eyebrow">A LITTLE CURIOSITY GOES A LONG WAY</div><h1>Find your next good thing.</h1><p>Fresh air. Friendly faces. Something worth showing up for.</p></div>
    <div className="search-panel"><label className="search-field"><Search size={20} aria-hidden="true" /><span className="sr-only">Search events</span><input type="search" name="search" value={query} onChange={e => updateFilter('q', e.target.value)} placeholder="Try cleanups, gardening, or a neighborhood…" /></label><label className="location-field"><MapPin size={19} aria-hidden="true" /><span className="sr-only">Location</span><select value={location} onChange={e => updateFilter('location', e.target.value)}><option value="all">All locations</option>{[...new Set(events.map(event => event.city))].sort().map(city => <option key={city}>{city}</option>)}</select></label></div>
    <div className="filter-label"><SlidersHorizontal size={15} aria-hidden="true" />Find your kind of good</div><div className="category-filters" aria-label="Event categories">{categories.map(item => <button className={`category-chip ${category === item.id ? 'selected' : ''}`} key={item.id} aria-pressed={category === item.id} onClick={() => updateFilter('category', item.id)}><CategoryIcon category={item.id} />{item.label}</button>)}</div>
    {(sampleMode || events.some(event => event.isSample)) && <SampleNotice />}
    <RequestState loading={loading} error={error} retry={refresh} />
    {!loading && !error && <><div className="results-heading"><p aria-live="polite" aria-atomic="true"><strong>{filtered.length}</strong> {sampleMode ? 'sample ' : ''}{filtered.length === 1 ? 'event' : 'events'} to explore</p>{hasFilters && filtered.length > 0 && <button className="clear-filters" onClick={() => setParams({})}><X size={15} aria-hidden="true" />Clear filters</button>}</div>
    {filtered.length > 0 ? <div className="event-grid explore-grid">{filtered.map(event => <EventCard key={event.id} event={event} />)}</div> : <div className="empty-state"><span className="empty-state-icon"><Leaf size={32} aria-hidden="true" /></span><h2>A little room to explore.</h2><p>No {sampleMode ? 'sample ' : ''}events match these filters. Try another search or explore all the opportunities.</p>{hasFilters && <button className="button button-primary" onClick={() => setParams({})}>Clear filters<ArrowIcon /></button>}</div>}</>}
    <div className="explore-end"><SproutIcon /><p>Sometimes the best plans start with a small step outside.</p></div>
  </div>;
}
function ArrowIcon() { return <span aria-hidden="true">↗</span>; }
function SproutIcon() { return <Leaf size={18} aria-hidden="true" />; }
