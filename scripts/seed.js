import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { events } from '../src/data/events.js'

// Stable namespaced UUIDs prevent repeated setup from duplicating samples.
// These fictional organizer identities cannot sign in through Supabase.
export function sampleId(kind, value) {
  const bytes = createHash('sha256').update(`rooted:sample:${kind}:${value}`).digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export async function seed(pool) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock($1)', [1876439202])
    for (const event of events) {
      const organizerId = sampleId('organizer', event.organizer)
      const communityId = sampleId('community', event.community)
      await client.query(`INSERT INTO profiles (user_id, display_name, city, bio, is_sample)
        VALUES ($1, $2, $3, $4, true) ON CONFLICT (user_id) DO NOTHING`,
      [organizerId, event.organizer, event.city, event.organizerDescription])
      await client.query(`INSERT INTO communities (id, name, description, city, is_sample)
        VALUES ($1, $2, $3, $4, true) ON CONFLICT (id) DO NOTHING`,
      [communityId, event.community, 'Fictional sample community for the Rooted preview.', event.city])
      await client.query(`INSERT INTO events (
        id, title, description, category, starts_at, ends_at, city, location, address,
        organizer_id, organizer_description, capacity, image, image_alt, instructions,
        highlights, community_id, featured, difficulty, is_sample, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17, $18, $19, true, 'published'
      ) ON CONFLICT (id) DO NOTHING`, [
        sampleId('event', event.id), event.title, event.description, event.category,
        event.startsAt, event.endsAt, event.city, event.location, event.address,
        organizerId, event.organizerDescription, event.capacity, event.image,
        event.imageAlt, event.instructions, event.highlights, communityId,
        event.featured, event.difficulty,
      ])
    }
    // The fictional Phase 1 participation counts are deliberately not seeded:
    // registrations, attendance and environmental impact start with real data.
    await client.query('COMMIT')
    return events.map((event) => sampleId('event', event.id))
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

async function main() {
  let pool
  try {
    const { createPool } = await import('../server/db.js')
    pool = createPool()
    const ids = await seed(pool)
    console.log(`Ensured ${ids.length} fictional sample events exist. No participation or impact records were added.`)
  } catch {
    console.error('Database sample seed failed. Apply migrations and check DATABASE_URL, connectivity, and database permissions.')
    process.exitCode = 1
  } finally {
    await pool?.end()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
