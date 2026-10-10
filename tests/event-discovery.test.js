import test from 'node:test'
import assert from 'node:assert/strict'
import { categories, events, filterEvents, getEventById } from '../src/data/events.js'

test('sample events have unique, addressable IDs and valid upcoming dates', () => {
  assert.equal(new Set(events.map((event) => event.id)).size, events.length)
  const categoryIds = new Set(categories.map((category) => category.id))

  for (const event of events) {
    assert.equal(getEventById(event.id), event)
    assert.equal(event.isSample, true)
    assert.ok(categoryIds.has(event.category))
    assert.ok(Date.parse(event.startsAt) > Date.parse('2026-10-10T23:59:59Z'))
    assert.ok(Date.parse(event.endsAt) > Date.parse(event.startsAt))
    assert.ok(event.participants >= 0 && event.participants <= event.capacity)
    assert.ok(event.instructions.length > 0)
    assert.ok(event.highlights.length > 0)
  }
})

test('discovery returns all events by default without mutating the source', () => {
  const originalIds = events.map((event) => event.id)
  const result = filterEvents(events)
  assert.deepEqual(result.map((event) => event.id), originalIds)
  assert.notEqual(result, events)
  assert.deepEqual(events.map((event) => event.id), originalIds)
})

test('query, category, and city filters combine', () => {
  assert.deepEqual(
    filterEvents(events, { query: 'TRAIL', category: 'cleanup', location: '  carrboro  ' })
      .map((event) => event.id),
    ['sunday-trail-care'],
  )
  assert.deepEqual(
    filterEvents(events, { query: 'TRAIL', category: 'planting', location: 'Carrboro' }),
    [],
  )
})

test('search trims whitespace and matches every documented field without case sensitivity', () => {
  const fixture = [{
    title: 'Sunflower gathering',
    description: 'Learn about native seeds',
    organizer: 'Kind Neighbors',
    location: 'North Meadow',
    city: 'Example Town',
    category: 'education',
  }]

  for (const query of [' SUNFLOWER ', ' NATIVE ', ' KIND ', ' MEADOW ', ' EXAMPLE ']) {
    assert.equal(filterEvents(fixture, { query }).length, 1, query)
  }
  assert.equal(filterEvents(fixture, { query: '   ' }).length, 1)
})

test('unmatched searches, categories, and cities produce an empty result', () => {
  assert.deepEqual(filterEvents(events, { query: 'volcano expedition' }), [])
  assert.deepEqual(filterEvents(events, { category: 'unknown' }), [])
  assert.deepEqual(filterEvents(events, { location: 'Raleigh' }), [])
  assert.deepEqual(filterEvents([], { query: 'garden' }), [])
})

test('event detail lookup returns undefined for an unknown route', () => {
  assert.equal(getEventById('does-not-exist'), undefined)
  assert.equal(getEventById(undefined), undefined)
})
