import { Link } from 'react-router-dom';
import { ArrowUpRight, MapPin, Users } from 'lucide-react';
import { categoryLabel } from '../data/events.js';
import { formatDate, formatTime } from '../lib/format.js';
import { CategoryIcon } from './Icon.jsx';

export default function EventCard({ event }) {
  const date = formatDate(event.startsAt).split(' ');
  return <article className="event-card" data-testid="event-card">
    <Link className="event-photo" to={`/events/${event.id}`} tabIndex={-1} aria-hidden="true">
      <img src={event.image} alt="" loading="lazy" width="700" height="500" />
      <div className="date-stamp"><span>{date[0]}</span><strong>{date[1]}</strong></div>
      <span className="photo-note">Illustrative photo</span>
    </Link>
    <div className="event-card-body">
      <span className={`category-label category-${event.category}`}><CategoryIcon category={event.category} />{categoryLabel(event.category)}</span>
      <h3><Link to={`/events/${event.id}`}>{event.title}</Link></h3>
      <p className="event-location"><MapPin size={15} aria-hidden="true" />{event.city}, NC <span>·</span> {formatTime(event.startsAt)}</p>
      <p className="event-teaser">{event.highlights.slice(0, 2).join(' · ')}</p>
      <div className="event-card-footer"><span><Users size={16} aria-hidden="true" />{event.isRegistered ? 'You’re going' : `${event.participants} ${event.isSample ? 'sample participants' : 'neighbors going'}`}</span><Link className="card-detail-link" aria-label={`View details: ${event.title}`} to={`/events/${event.id}`}><ArrowUpRight size={19} aria-hidden="true" /></Link></div>
    </div>
  </article>;
}
