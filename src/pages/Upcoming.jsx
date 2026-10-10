import { Link } from 'react-router-dom';
import { ArrowUpRight, Sprout, HeartHandshake, Sparkles, UserRound, CirclePlus, Check } from 'lucide-react';
import { SampleNotice } from '../components/Layout.jsx';

const pages = {
  create: { icon: CirclePlus, eyebrow: 'GOOD THINGS START WITH YOU', title: 'Bring your neighbors together.', description: 'A cleanup, a planting day, a little shared care. Soon, you’ll be able to create a local event and invite your community along.', phase: 'Event creation is planned for Phase 3.', features: ['Create an event with a clear time and meeting place', 'Welcome participants and manage capacity', 'Verify attendance and contributions after the event'] },
  community: { icon: HeartHandshake, eyebrow: 'ROOTED IN EACH OTHER', title: 'A community worth growing.', description: 'Care for a creek. Share a garden. Meet the people making your corner of the world a little greener.', phase: 'Live communities and verified impact are planned for later milestones.', features: ['Discover local groups and the events they organize', 'See shared contributions, verified by event organizers', 'Recognize participation without turning it into a competition'] },
  profile: { icon: UserRound, eyebrow: 'YOUR OWN LITTLE CORNER', title: 'Your story starts outside.', description: 'Your profile will bring together the events you join, the people you meet, and the contributions verified by your organizers.', phase: 'Accounts and personal profiles are planned for Phase 2.', features: ['Create an account and tell us a little about yourself', 'Find your upcoming events in one place', 'Track completed participation once an organizer verifies it'] },
  'grow-neighbor': { icon: Sparkles, eyebrow: 'MEET GROW NEIGHBOR', title: 'A greener next step.', description: 'A little guidance can go a long way. Our planned Gemini-powered companion will help you discover real events and practical ways to care for the environment.', phase: 'Grow Neighbor is planned for Phase 4. AI responses are not active yet.', features: ['Find local events that match your interests', 'Ask practical sustainability questions', 'Get help writing an event description you approve'] },
};

export default function Upcoming({ page }) {
  const content = pages[page];
  const Icon = content.icon;
  return <div className="page-container upcoming-page"><SampleNotice compact /><div className="upcoming-layout"><div className="upcoming-copy"><div className="eyebrow">{content.eyebrow}</div><h1>{content.title}</h1><p className="upcoming-description">{content.description}</p><div className="planned-notice"><span>GROWING SOON</span><p>{content.phase}</p></div><ul className="upcoming-features">{content.features.map(item => <li key={item}><Check size={18} aria-hidden="true" />{item}</li>)}</ul><Link className="button button-primary" to="/explore">Explore sample events<ArrowUpRight size={18} aria-hidden="true" /></Link></div><div className="upcoming-art" aria-hidden="true"><div className="art-orbit art-orbit-one" /><div className="art-orbit art-orbit-two" /><div className="art-circle"><Icon size={82} strokeWidth={1} /></div><Sprout className="art-sprout" size={54} strokeWidth={1.3} /><span className="art-word">Room to grow.</span></div></div></div>;
}

export function NotFound({ event = false }) {
  return <div className="page-container not-found"><span className="empty-state-icon"><Sprout size={38} aria-hidden="true" /></span><div className="eyebrow">LET’S FIND ANOTHER PATH</div><h1>{event ? 'This event hasn’t taken root.' : 'A little off the beaten path.'}</h1><p>{event ? 'We couldn’t find that sample event. There are more opportunities to explore.' : 'This page isn’t here, but your next good thing might be.'}</p><Link className="button button-primary" to="/explore">Explore events<ArrowUpRight size={18} aria-hidden="true" /></Link></div>;
}
