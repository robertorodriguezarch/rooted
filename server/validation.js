import { ApiError } from './errors.js'

const categories = new Set(['cleanup', 'planting', 'conservation', 'gardening', 'recycling', 'transport', 'education', 'energy'])
const localImages = new Set(['/images/forest.jpg', '/images/woodland.jpg', '/images/mountains.jpg'])
const invalid = (message) => { throw new ApiError(400, message, 'invalid_input') }

export function textField(value, name, maximum, { required = false } = {}) {
  if (typeof value !== 'string') invalid(`${name} must be text.`)
  const clean = value.trim()
  if (required && !clean) invalid(`${name} is required.`)
  if (clean.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(clean)) invalid(`${name} is too long or contains unsupported characters.`)
  return clean
}

function stringList(value, name, maximumItems = 12, maximumLength = 240) {
  if (!Array.isArray(value) || value.length > maximumItems) invalid(`${name} must be a list of at most ${maximumItems} items.`)
  return [...new Set(value.map((item) => textField(item, name, maximumLength, { required: true })))]
}

function imageUrl(value, allowLocal = false) {
  if (value === null || value === '') return null
  if (typeof value !== 'string' || value.length > 2048) invalid('Use a valid HTTPS image URL.')
  if (allowLocal && localImages.has(value)) return value
  try {
    const parsed = new URL(value)
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) return parsed.href
  } catch { /* Return a readable validation error below. */ }
  invalid('Use a valid HTTPS image URL.')
}

export function validateProfile(body) {
  const result = {}
  if ('displayName' in body) result.display_name = textField(body.displayName, 'Display name', 80, { required: true })
  if ('city' in body) result.city = textField(body.city, 'City', 100)
  if ('bio' in body) result.bio = textField(body.bio, 'Biography', 1000)
  if ('interests' in body) result.interests = stringList(body.interests, 'Interests', 12)
  if ('avatarUrl' in body) result.avatar_url = imageUrl(body.avatarUrl)
  if (!Object.keys(result).length) invalid('Choose at least one profile field to update.')
  return result
}

export function validateEvent(body, { partial = false, now = Date.now() } = {}) {
  const result = {}
  const fields = [['title', 'title', 120], ['description', 'description', 6000], ['city', 'city', 120], ['location', 'location', 200], ['address', 'address', 300]]
  for (const [input, column, maximum] of fields) {
    if (!partial || input in body) result[column] = textField(body[input], input[0].toUpperCase() + input.slice(1), maximum, { required: true })
  }
  if (!partial || 'category' in body) {
    if (!categories.has(body.category)) invalid('Choose a supported event category.')
    result.category = body.category
  }
  for (const [input, column] of [['startsAt', 'starts_at'], ['endsAt', 'ends_at']]) {
    if (!partial || input in body) {
      if (typeof body[input] !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(body[input]) || !Number.isFinite(Date.parse(body[input]))) invalid(`${input} must be a valid date and time.`)
      result[column] = new Date(body[input]).toISOString()
    }
  }
  if (!partial && Date.parse(result.starts_at) <= now) invalid('Choose a start time in the future.')
  if (result.starts_at && result.ends_at && Date.parse(result.ends_at) <= Date.parse(result.starts_at)) invalid('The event must end after it starts.')
  if (!partial || 'capacity' in body) {
    const capacity = body.capacity ?? null
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 10_000)) invalid('Capacity must be a whole number between 1 and 10,000, or empty.')
    result.capacity = capacity
  }
  for (const name of ['instructions', 'highlights']) {
    if (!partial || name in body) result[name] = name === 'instructions' ? stringList(body[name] ?? [], name, 20, 500) : stringList(body[name] ?? [], name)
  }
  if (!partial || 'image' in body) result.image = imageUrl(body.image ?? '/images/forest.jpg', true) || '/images/forest.jpg'
  if (!partial || 'imageAlt' in body) result.image_alt = textField(body.imageAlt ?? 'Illustrative nature landscape', 'Image description', 240)
  if (!partial || 'organizerDescription' in body) result.organizer_description = textField(body.organizerDescription ?? '', 'Organizer description', 1000)
  if (partial && 'status' in body) {
    if (!['published', 'canceled'].includes(body.status)) invalid('Choose published or canceled event status.')
    result.status = body.status
  }
  // Organizer identity, community ownership, sample status, and impact are never client controlled.
  if (!Object.keys(result).length) invalid('Choose at least one event field to update.')
  return result
}
