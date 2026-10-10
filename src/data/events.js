// These fictional events support the Phase 1 preview. No record is live activity.
export const categories = [
  { id: 'all', label: 'All events' },
  { id: 'cleanup', label: 'Cleanups' },
  { id: 'planting', label: 'Tree planting' },
  { id: 'conservation', label: 'Conservation' },
  { id: 'gardening', label: 'Community gardens' },
  { id: 'recycling', label: 'Recycling' },
  { id: 'transport', label: 'Sustainable travel' },
  { id: 'education', label: 'Learning' },
  { id: 'energy', label: 'Clean energy' },
]

export const events = [
  {
    id: 'creekside-cleanup',
    title: 'A little care for our creek',
    description:
      'Spend a slow Saturday morning walking a creekside trail and collecting litter with your neighbors. We will work in small groups, keep to the public path, and finish with a short conversation about protecting our waterways. This is a fictional sample event for the Rooted preview.',
    category: 'cleanup',
    startsAt: '2026-10-17T09:00:00-04:00',
    endsAt: '2026-10-17T11:00:00-04:00',
    city: 'Chapel Hill',
    location: 'Creekside trail meeting point',
    address: 'Sample location · Chapel Hill, NC',
    organizer: 'Creek Care Collective',
    organizerDescription:
      'A fictional neighborhood group that brings people together to care for local waterways.',
    participants: 18,
    capacity: 30,
    image: '/images/forest.jpg',
    imageAlt: 'Illustrative misty woodland landscape',
    instructions: [
      'Wear closed-toe shoes and clothes that can get muddy.',
      'Bring a reusable water bottle. Gloves and litter bags would be provided.',
      'Meet at the sample trail entrance ten minutes before the start.',
    ],
    highlights: ['Supplies provided', 'First-timers welcome', 'Gentle outdoor activity'],
    community: 'Chapel Hill Creek Neighbors',
    featured: true,
    difficulty: 'Easy',
    isSample: true,
  },
  {
    id: 'roots-for-tomorrow',
    title: 'Plant roots for tomorrow',
    description:
      'Help plant native saplings and learn how to give young trees a healthy start. A sample volunteer lead will demonstrate planting depth, mulching, and watering before teams work together. This fictional event shows how a planting day could appear on Rooted.',
    category: 'planting',
    startsAt: '2026-10-18T10:00:00-04:00',
    endsAt: '2026-10-18T13:00:00-04:00',
    city: 'Durham',
    location: 'Neighborhood green space',
    address: 'Sample location · Durham, NC',
    organizer: 'Tomorrow Tree Circle',
    organizerDescription:
      'A fictional community collective focused on native trees and cooler neighborhoods.',
    participants: 12,
    capacity: 24,
    image: '/images/woodland.jpg',
    imageAlt: 'Illustrative forested mountain landscape',
    instructions: [
      'Wear sturdy shoes and bring gardening gloves if you have them.',
      'Bring water and sun protection. Shared planting tools would be available.',
      'Tell a volunteer lead if you would prefer a lighter task.',
    ],
    highlights: ['Native trees', 'Tools provided', 'Learn as you plant'],
    community: 'Durham Green Neighbors',
    featured: true,
    difficulty: 'Moderate',
    isSample: true,
  },
  {
    id: 'garden-together',
    title: 'Good things grow together',
    description:
      'Make room for a new season at a community garden. Choose from clearing beds, turning compost, or sowing cool-weather greens, then share a few gardening tips over tea. All details and participation counts belong to this fictional preview event.',
    category: 'gardening',
    startsAt: '2026-10-18T14:00:00-04:00',
    endsAt: '2026-10-18T16:00:00-04:00',
    city: 'Carrboro',
    location: 'Shared garden gathering area',
    address: 'Sample location · Carrboro, NC',
    organizer: 'The Shared Patch',
    organizerDescription:
      'A fictional group connecting neighbors through food, soil, and shared growing spaces.',
    participants: 8,
    capacity: 16,
    image: '/images/forest.jpg',
    imageAlt: 'Illustrative misty woodland landscape',
    instructions: [
      'Bring a reusable cup and gardening gloves if available.',
      'Wear clothes suitable for working with soil.',
      'Choose a task at the welcome table; seated seed sorting would be available.',
    ],
    highlights: ['Beginner friendly', 'Flexible tasks', 'Connect over tea'],
    community: 'Carrboro Garden Circle',
    featured: true,
    difficulty: 'Easy',
    isSample: true,
  },
  {
    id: 'pollinator-walk',
    title: 'A home for our pollinators',
    description:
      'Join a gentle guided walk to identify native plants and discover how small habitat choices help bees and butterflies. After the walk, help prepare a sample pollinator bed by removing litter and spreading mulch. This is a fictional conservation event.',
    category: 'conservation',
    startsAt: '2026-10-20T16:30:00-04:00',
    endsAt: '2026-10-20T18:00:00-04:00',
    city: 'Chapel Hill',
    location: 'Meadow path entrance',
    address: 'Sample location · Chapel Hill, NC',
    organizer: 'Wildflower Neighbors',
    organizerDescription:
      'A fictional volunteer circle learning about native habitats and local biodiversity.',
    participants: 9,
    capacity: 20,
    image: '/images/woodland.jpg',
    imageAlt: 'Illustrative forested mountain landscape',
    instructions: [
      'Wear comfortable walking shoes and bring drinking water.',
      'Bring a notebook or a phone for plant observations if you wish.',
      'Stay on the marked path and leave flowers for the pollinators.',
    ],
    highlights: ['Guided nature walk', 'Native plant learning', 'Small habitat tasks'],
    community: 'Chapel Hill Creek Neighbors',
    featured: false,
    difficulty: 'Easy',
    isSample: true,
  },
  {
    id: 'repair-and-reuse',
    title: 'Repair, reuse, reconnect',
    description:
      'Give everyday items another chance at a neighborhood reuse afternoon. Learn a simple clothing repair, sort clean reusable supplies, and explore what belongs in local recycling. This fictional sample does not offer an actual repair or drop-off service.',
    category: 'recycling',
    startsAt: '2026-10-21T17:00:00-04:00',
    endsAt: '2026-10-21T19:00:00-04:00',
    city: 'Durham',
    location: 'Community workshop room',
    address: 'Sample location · Durham, NC',
    organizer: 'Second Life Studio',
    organizerDescription:
      'A fictional community workshop helping neighbors learn practical reuse skills.',
    participants: 14,
    capacity: 25,
    image: '/images/mountains.jpg',
    imageAlt: 'Illustrative rocky mountain landscape',
    instructions: [
      'Bring one clean fabric item if you want to practice a basic repair.',
      'Check the sample collection guidance before bringing reusable materials.',
      'Do not bring batteries, chemicals, or broken electronics.',
    ],
    highlights: ['Simple repair skills', 'Reuse ideas', 'Indoor gathering'],
    community: 'Durham Green Neighbors',
    featured: false,
    difficulty: 'Easy',
    isSample: true,
  },
  {
    id: 'neighbor-bike-ride',
    title: 'Take the scenic way together',
    description:
      'Explore a short neighborhood cycling route at a relaxed, conversational pace. Practice a quick bike check and trade tips for everyday journeys without a car. This is a fictional sample ride; the route and gathering place are illustrative.',
    category: 'transport',
    startsAt: '2026-10-23T16:00:00-04:00',
    endsAt: '2026-10-23T17:30:00-04:00',
    city: 'Carrboro',
    location: 'Neighborhood trail gathering point',
    address: 'Sample location · Carrboro, NC',
    organizer: 'Slow Wheels Collective',
    organizerDescription:
      'A fictional group supporting relaxed cycling and everyday active travel.',
    participants: 6,
    capacity: 15,
    image: '/images/mountains.jpg',
    imageAlt: 'Illustrative rocky mountain landscape',
    instructions: [
      'Bring a working bike, helmet, and lights.',
      'Arrive early for a simple tire and brake check.',
      'The sample route would be about four miles with regular regrouping stops.',
    ],
    highlights: ['Relaxed pace', 'Bike check tips', 'Everyday travel ideas'],
    community: 'Carrboro Garden Circle',
    featured: false,
    difficulty: 'Moderate',
    isSample: true,
  },
  {
    id: 'compost-cafe',
    title: 'Small habits, healthier soil',
    description:
      'Start with the basics of home composting in a welcoming, hands-on learning session. Explore what to add, what to leave out, and how to keep a small bin healthy. This fictional workshop is a preview of community learning on Rooted.',
    category: 'education',
    startsAt: '2026-10-24T10:00:00-04:00',
    endsAt: '2026-10-24T11:30:00-04:00',
    city: 'Chapel Hill',
    location: 'Neighborhood learning room',
    address: 'Sample location · Chapel Hill, NC',
    organizer: 'Soil & Stories',
    organizerDescription:
      'A fictional learning circle sharing approachable ways to care for the environment.',
    participants: 11,
    capacity: 20,
    image: '/images/forest.jpg',
    imageAlt: 'Illustrative misty woodland landscape',
    instructions: [
      'Bring your questions; no composting experience is needed.',
      'Bring a reusable mug for the sample tea station.',
      'Materials would be provided, so there is no need to bring food scraps.',
    ],
    highlights: ['Hands-on demonstration', 'No experience needed', 'Take-home tips'],
    community: 'Chapel Hill Creek Neighbors',
    featured: false,
    difficulty: 'Easy',
    isSample: true,
  },
  {
    id: 'energy-at-home',
    title: 'A brighter, lighter home',
    description:
      'Learn a few simple ways to reduce energy use at home, from spotting drafts to understanding a utility bill. Share questions with neighbors and make a personal list of small changes to try. This fictional session is educational, with no product sales or live service.',
    category: 'energy',
    startsAt: '2026-10-24T14:00:00-04:00',
    endsAt: '2026-10-24T15:30:00-04:00',
    city: 'Durham',
    location: 'Community learning space',
    address: 'Sample location · Durham, NC',
    organizer: 'Brighter Blocks',
    organizerDescription:
      'A fictional neighborhood group sharing practical, accessible energy-saving ideas.',
    participants: 7,
    capacity: 18,
    image: '/images/woodland.jpg',
    imageAlt: 'Illustrative forested mountain landscape',
    instructions: [
      'Bring a notebook and any general energy questions.',
      'Avoid sharing account numbers or personal utility information.',
      'All sample activities would take place indoors with seated options.',
    ],
    highlights: ['Practical home ideas', 'Seated workshop', 'Neighbor conversations'],
    community: 'Durham Green Neighbors',
    featured: false,
    difficulty: 'Easy',
    isSample: true,
  },
  {
    id: 'sunday-trail-care',
    title: 'A fresh start for the trail',
    description:
      'Make time for a little neighborhood care with a short Sunday litter walk. Work with a partner along a sample trail, separate recyclable items, and leave the path a little more welcoming. This is a fictional preview event, including its attendance numbers.',
    category: 'cleanup',
    startsAt: '2026-10-25T09:30:00-04:00',
    endsAt: '2026-10-25T11:00:00-04:00',
    city: 'Carrboro',
    location: 'Community trail welcome point',
    address: 'Sample location · Carrboro, NC',
    organizer: 'Trail Together',
    organizerDescription:
      'A fictional group making local outdoor spaces more welcoming through shared care.',
    participants: 5,
    capacity: 18,
    image: '/images/forest.jpg',
    imageAlt: 'Illustrative misty woodland landscape',
    instructions: [
      'Wear closed-toe shoes and bring water.',
      'Gloves and collection bags would be provided.',
      'Leave sharp or unfamiliar objects in place and tell a sample volunteer lead.',
    ],
    highlights: ['Short morning activity', 'Supplies provided', 'Bring a neighbor'],
    community: 'Carrboro Garden Circle',
    featured: false,
    difficulty: 'Easy',
    isSample: true,
  },
]

export function categoryLabel(id) {
  return categories.find((category) => category.id === id)?.label ?? 'Community event'
}

export function getEventById(id) {
  return events.find((event) => event.id === id)
}

export function filterEvents(source, { query = '', category = 'all', location = 'all' } = {}) {
  const search = query.trim().toLocaleLowerCase('en-US')
  const city = location.trim().toLocaleLowerCase('en-US')

  return source.filter((event) => {
    if (category !== 'all' && event.category !== category) return false
    if (city !== 'all' && event.city.toLocaleLowerCase('en-US') !== city) return false
    if (!search) return true

    return [event.title, event.description, event.organizer, event.location, event.city]
      .some((value) => value.toLocaleLowerCase('en-US').includes(search))
  })
}
