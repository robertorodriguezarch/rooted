import { getAuthConfiguration } from './config.js'
import { getPool, withTransaction } from './db.js'
import { ensureProfile, readAccessToken, uuidPattern, verifyAccessToken } from './auth.js'
import { ApiError, publicError } from './errors.js'
import { validateEvent, validateProfile } from './validation.js'
import { getGeminiConfiguration, recommendEvents, validateRecommendations } from './gemini.js'
import { validateAssistantQuestion, reserveAssistantRequest, recordAssistantActivity, readAssistantActivity } from './grow-neighbor.js'

const eventSelect = `SELECT e.*, p.display_name AS organizer_name, c.name AS community_name,
  (SELECT count(*)::integer FROM event_registrations r WHERE r.event_id = e.id AND r.status = 'registered') AS participants,
  EXISTS(SELECT 1 FROM event_registrations r WHERE r.event_id = e.id AND r.user_id = $1::uuid AND r.status = 'registered') AS is_registered
  FROM events e JOIN profiles p ON p.user_id = e.organizer_id
  LEFT JOIN communities c ON c.id = e.community_id`

function eventDto(row) {
  return {
    id: row.id, title: row.title, description: row.description, category: row.category,
    startsAt: new Date(row.starts_at).toISOString(), endsAt: new Date(row.ends_at).toISOString(),
    city: row.city, location: row.location, address: row.address,
    organizer: row.organizer_name, organizerId: row.organizer_id, organizerDescription: row.organizer_description,
    participants: Number(row.participants), capacity: row.capacity,
    image: row.image, imageAlt: row.image_alt, instructions: row.instructions, highlights: row.highlights,
    community: row.community_name ?? null, featured: row.featured, difficulty: row.difficulty,
    isSample: row.is_sample, status: row.status, isRegistered: Boolean(row.is_registered),
  }
}

function profileDto(row) {
  return { userId: row.user_id, displayName: row.display_name, city: row.city, interests: row.interests, bio: row.bio, avatarUrl: row.avatar_url }
}

function reply(response, status, body) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.end(JSON.stringify(body))
}

async function readBody(request) {
  let body = request.body
  if (body === undefined) {
    const chunks = []
    let size = 0
    for await (const chunk of request) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += bytes.byteLength
      if (size > 32_768) throw new ApiError(413, 'This request is too large.', 'request_too_large')
      chunks.push(bytes)
    }
    body = Buffer.concat(chunks).toString('utf8')
  }
  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    if (Buffer.byteLength(body) > 32_768) throw new ApiError(413, 'This request is too large.', 'request_too_large')
    try { body = JSON.parse(body.toString()) } catch { throw new ApiError(400, 'Send a valid JSON request.', 'invalid_json') }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'Send a JSON object.', 'invalid_json')
  if (Buffer.byteLength(JSON.stringify(body)) > 32_768) throw new ApiError(413, 'This request is too large.', 'request_too_large')
  return body
}

function eventId(path) {
  if (!uuidPattern.test(path)) throw new ApiError(404, 'This event could not be found.', 'event_not_found')
  return path
}

async function findEvent(pool, id, userId = null) {
  const { rows } = await pool.query(`${eventSelect} WHERE e.id = $2`, [userId, id])
  if (!rows[0]) throw new ApiError(404, 'This event could not be found.', 'event_not_found')
  return rows[0]
}

async function personalData(pool, userId, now) {
  const [profileResult, upcomingResult, attendedResult, statsResult] = await Promise.all([
    pool.query('SELECT * FROM profiles WHERE user_id = $1', [userId]),
    pool.query(`${eventSelect} WHERE e.status = 'published' AND e.starts_at > $2
      AND EXISTS (SELECT 1 FROM event_registrations r WHERE r.event_id = e.id AND r.user_id = $1 AND r.status = 'registered')
      ORDER BY e.starts_at, e.id LIMIT 100`, [userId, new Date(now)]),
    pool.query(`${eventSelect} WHERE EXISTS (SELECT 1 FROM event_attendance a
      WHERE a.event_id = e.id AND a.user_id = $1 AND a.attendance_status = 'present' AND a.verified_at IS NOT NULL)
      ORDER BY e.starts_at DESC, e.id LIMIT 100`, [userId]),
    pool.query(`SELECT count(DISTINCT a.event_id)::integer AS completed_events,
      COALESCE(sum(c.amount) FILTER (WHERE c.metric = 'volunteer_hours'), 0) AS volunteer_hours,
      COALESCE(sum(c.amount) FILTER (WHERE c.metric = 'waste_kg'), 0) AS waste_kg,
      COALESCE(sum(c.amount) FILTER (WHERE c.metric = 'trees_planted'), 0) AS trees_planted
      FROM event_attendance a JOIN events e ON e.id = a.event_id
      LEFT JOIN environmental_contributions c ON c.attendance_id = a.id
      WHERE a.user_id = $1 AND a.completed = true AND a.verified_at IS NOT NULL AND a.verified_by IS NOT NULL AND e.is_sample = false`, [userId]),
  ])
  const stats = statsResult.rows[0]
  return {
    profile: profileDto(profileResult.rows[0]),
    upcomingEvents: upcomingResult.rows.map(eventDto), attendedEvents: attendedResult.rows.map(eventDto),
    stats: { completedEvents: Number(stats.completed_events), volunteerHours: Number(stats.volunteer_hours), wasteKg: Number(stats.waste_kg), treesPlanted: Number(stats.trees_planted) },
  }
}

export function createApiHandler(options = {}) {
  const poolProvider = options.pool ? () => options.pool : options.getPool ?? getPool
  const verify = options.verifyUser ?? verifyAccessToken
  const clock = options.now ?? Date.now
  const authentication = async (request, required = true) => {
    const token = readAccessToken(request, required)
    if (!token) return null
    const user = await verify(token)
    if (!user || !uuidPattern.test(user.id)) throw new ApiError(401, 'Please sign in again to continue.', 'invalid_session')
    return user
  }

  return async function apiHandler(request, response) {
    try {
      const url = new URL(request.url, 'http://rooted.local')
      const path = url.pathname.replace(/\/+$/, '')
      const method = request.method?.toUpperCase() ?? 'GET'

      if (path === '/api/grow-neighbor/activity' && method === 'GET') {
        const user = await authentication(request)
        return reply(response, 200, await readAssistantActivity(poolProvider(), user.id, clock()))
      }

      if (path === '/api/grow-neighbor' && method === 'POST') {
        const user = await authentication(request)
        const question = validateAssistantQuestion(await readBody(request))
        const configuration = options.recommend ? { model: 'test-model' } : getGeminiConfiguration()
        if (!configuration) throw new ApiError(503, 'Grow Neighbor is waiting for its Gemini connection. Configure GEMINI_API_KEY on the server.', 'ai_unconfigured')
        const pool = poolProvider()
        await ensureProfile(pool, user)
        await reserveAssistantRequest(pool, user.id, clock())
        const started = Date.now()
        let completed = false
        try {
          const { rows } = await pool.query(`${eventSelect} WHERE e.status='published' AND e.is_sample=false AND e.starts_at > $2
            AND ($3='' OR lower(e.city)=lower($3))
            AND (e.capacity IS NULL OR e.capacity > (SELECT count(*) FROM event_registrations r WHERE r.event_id=e.id AND r.status='registered'))
            ORDER BY e.starts_at, e.id LIMIT 30`, [user.id, new Date(clock()), question.city])
          const candidates = rows.map(eventDto)
          const generated = await (options.recommend ?? recommendEvents)({ ...question, events: candidates })
          const result = validateRecommendations(generated, candidates)
          // Recheck availability after the model responds. Cards always use
          // database fields, never model-supplied titles, dates or URLs.
          const { rows: current } = result.eventIds.length ? await pool.query(`${eventSelect}
            WHERE e.id=ANY($2::uuid[]) AND e.status='published' AND e.is_sample=false AND e.starts_at > $3
            AND (e.capacity IS NULL OR e.capacity > (SELECT count(*) FROM event_registrations r WHERE r.event_id=e.id AND r.status='registered'))`,
          [user.id, result.eventIds, new Date(clock())]) : { rows: [] }
          const available = new Map(current.map((row) => [row.id, eventDto(row)]))
          const recommendations = result.eventIds.flatMap((id) => available.has(id) ? [available.get(id)] : [])
          await recordAssistantActivity(pool, { userId: user.id, model: configuration.model, now: clock(), latencyMs: Date.now() - started, success: true, recommendationCount: recommendations.length })
          completed = true
          return reply(response, 200, { answer: result.answer, recommendations, model: result.model || configuration.model })
        } catch (error) {
          if (!completed) await recordAssistantActivity(pool, { userId: user.id, model: configuration.model, now: clock(), latencyMs: Date.now() - started, success: false, recommendationCount: 0, errorCode: publicError(error).code }).catch(() => {})
          throw error
        }
      }

      if (path === '/api/health' && method === 'GET') {
        const auth = options.authConfigured ?? Boolean(getAuthConfiguration())
        const configured = options.databaseConfigured ?? Boolean(options.pool || process.env.DATABASE_URL)
        let database = false
        if (configured) {
          try {
            const { rows } = await poolProvider().query(`SELECT
              to_regclass('profiles') IS NOT NULL AND
              to_regclass('events') IS NOT NULL AND
              to_regclass('event_registrations') IS NOT NULL AND
              to_regclass('ai_request_activity') IS NOT NULL AND
              to_regclass('ai_request_limits') IS NOT NULL AS ready`)
            database = Boolean(rows[0]?.ready)
          } catch { /* Health reports only readiness, never connection details. */ }
        }
        const status = !configured || !auth ? 'unconfigured' : database ? 'ready' : 'degraded'
        const body = { status, database, auth }
        if (url.searchParams.get('diagnostics') === 'auth') {
          const environment = options.authEnvironment ?? process.env
          const server = getAuthConfiguration(environment)
          const frontend = getAuthConfiguration({
            VITE_SUPABASE_URL: environment.VITE_SUPABASE_URL,
            VITE_SUPABASE_PUBLISHABLE_KEY: environment.VITE_SUPABASE_PUBLISHABLE_KEY,
          })
          const normalize = (value) => value.replace(/\/+$/, '')
          const configuredUrl = server ? new URL(server.url) : null
          body.authentication = {
            matchesFrontend: server && frontend ? normalize(server.url) === normalize(frontend.url) && server.key === frontend.key : null,
            urlIsOrigin: configuredUrl ? configuredUrl.pathname === '/' && !configuredUrl.search && !configuredUrl.hash && !configuredUrl.username && !configuredUrl.password : null,
          }
        }
        return reply(response, status === 'ready' ? 200 : 503, body)
      }

      if (path === '/api/events' && method === 'GET') {
        const user = await authentication(request, false)
        const q = (url.searchParams.get('q') ?? '').trim().slice(0, 200).toLocaleLowerCase('en-US')
        const category = url.searchParams.get('category') ?? 'all'
        const location = (url.searchParams.get('location') ?? 'all').trim().slice(0, 120).toLocaleLowerCase('en-US')
        const { rows } = await poolProvider().query(`${eventSelect} WHERE e.status = 'published' AND e.starts_at > $5
          AND ($2 = '' OR strpos(lower(concat_ws(' ', e.title, e.description, p.display_name, e.location, e.city)), $2) > 0)
          AND ($3 = 'all' OR e.category = $3) AND ($4 = 'all' OR lower(e.city) = $4)
          ORDER BY e.starts_at, e.id LIMIT 200`, [user?.id ?? null, q, category, location, new Date(clock())])
        return reply(response, 200, { events: rows.map(eventDto) })
      }

      const detail = path.match(/^\/api\/events\/([^/]+)$/)
      if (detail && method === 'GET') {
        const user = await authentication(request, false)
        const event = await findEvent(poolProvider(), eventId(detail[1]), user?.id)
        if (event.status === 'draft' && event.organizer_id !== user?.id) throw new ApiError(404, 'This event could not be found.', 'event_not_found')
        return reply(response, 200, { event: eventDto(event) })
      }

      if (path === '/api/me' && ['GET', 'PATCH'].includes(method)) {
        const user = await authentication(request)
        const pool = poolProvider()
        await ensureProfile(pool, user)
        if (method === 'PATCH') {
          const fields = validateProfile(await readBody(request))
          const entries = Object.entries(fields)
          await pool.query(`UPDATE profiles SET ${entries.map(([name], index) => `${name} = $${index + 2}`).join(', ')}, updated_at = now() WHERE user_id = $1`, [user.id, ...entries.map(([, value]) => value)])
        }
        return reply(response, 200, await personalData(pool, user.id, clock()))
      }

      if (path === '/api/events' && method === 'POST') {
        const user = await authentication(request)
        const fields = validateEvent(await readBody(request), { now: clock() })
        const pool = poolProvider()
        await ensureProfile(pool, user)
        const entries = Object.entries(fields)
        const { rows } = await pool.query(`INSERT INTO events (organizer_id, ${entries.map(([name]) => name).join(', ')})
          VALUES ($1, ${entries.map((_, index) => `$${index + 2}`).join(', ')}) RETURNING id`, [user.id, ...entries.map(([, value]) => value)])
        return reply(response, 201, { event: eventDto(await findEvent(pool, rows[0].id, user.id)) })
      }

      if (detail && method === 'PATCH') {
        const user = await authentication(request)
        const id = eventId(detail[1])
        const fields = validateEvent(await readBody(request), { partial: true, now: clock() })
        const pool = poolProvider()
        await withTransaction(pool, async (client) => {
          const { rows } = await client.query('SELECT * FROM events WHERE id = $1 FOR UPDATE', [id])
          const existing = rows[0]
          if (!existing) throw new ApiError(404, 'This event could not be found.', 'event_not_found')
          if (existing.organizer_id !== user.id) throw new ApiError(403, 'Only this event’s organizer can change it.', 'forbidden')
          if (existing.is_sample || existing.status === 'completed') throw new ApiError(409, 'This event cannot be edited.', 'event_locked')
          const start = Date.parse(fields.starts_at ?? existing.starts_at)
          const end = Date.parse(fields.ends_at ?? existing.ends_at)
          if (start <= clock()) throw new ApiError(409, 'An event that has already started cannot be edited.', 'event_started')
          if (end <= start) throw new ApiError(400, 'The event must end after it starts.', 'invalid_input')
          if (fields.capacity != null) {
            const { rows: counts } = await client.query("SELECT count(*)::integer AS total FROM event_registrations WHERE event_id = $1 AND status = 'registered'", [id])
            if (fields.capacity < counts[0].total) throw new ApiError(409, 'Capacity cannot be lower than the current registration count.', 'capacity_below_registrations')
          }
          const entries = Object.entries(fields)
          await client.query(`UPDATE events SET ${entries.map(([name], index) => `${name} = $${index + 2}`).join(', ')}, updated_at = now() WHERE id = $1`, [id, ...entries.map(([, value]) => value)])
        })
        return reply(response, 200, { event: eventDto(await findEvent(pool, id, user.id)) })
      }

      const registration = path.match(/^\/api\/events\/([^/]+)\/registration$/)
      if (registration && ['POST', 'DELETE'].includes(method)) {
        const user = await authentication(request)
        const id = eventId(registration[1])
        const pool = poolProvider()
        await ensureProfile(pool, user)
        const result = await withTransaction(pool, async (client) => {
          const { rows } = await client.query('SELECT * FROM events WHERE id = $1 FOR UPDATE', [id])
          const event = rows[0]
          if (!event) throw new ApiError(404, 'This event could not be found.', 'event_not_found')
          if (event.is_sample) throw new ApiError(409, 'Sample events are for exploring Rooted; choose a live event to register.', 'sample_event')
          if (method === 'POST' && (event.status !== 'published' || new Date(event.starts_at).getTime() <= clock())) throw new ApiError(409, 'Registration is closed for this event.', 'registration_closed')
          const { rows: existing } = await client.query('SELECT status FROM event_registrations WHERE event_id = $1 AND user_id = $2', [id, user.id])
          const { rows: counts } = await client.query("SELECT count(*)::integer AS total FROM event_registrations WHERE event_id = $1 AND status = 'registered'", [id])
          const wasRegistered = existing[0]?.status === 'registered'
          const join = method === 'POST'
          if (join && !wasRegistered && event.capacity !== null && counts[0].total >= event.capacity) throw new ApiError(409, 'This event is full. Please choose another event.', 'event_full')
          if (join) await client.query(`INSERT INTO event_registrations (event_id, user_id, status) VALUES ($1, $2, 'registered')
            ON CONFLICT (event_id, user_id) DO UPDATE SET status = 'registered', updated_at = now()`, [id, user.id])
          else await client.query("UPDATE event_registrations SET status = 'canceled', updated_at = now() WHERE event_id = $1 AND user_id = $2 AND status = 'registered'", [id, user.id])
          return { registered: join, participants: counts[0].total + (join && !wasRegistered ? 1 : !join && wasRegistered ? -1 : 0) }
        })
        return reply(response, 200, result)
      }

      const allowed = path === '/api/grow-neighbor' ? ['POST'] : path === '/api/grow-neighbor/activity' ? ['GET'] : path === '/api/health' ? ['GET']
        : path === '/api/events' ? ['GET', 'POST']
          : path === '/api/me' ? ['GET', 'PATCH']
            : detail ? ['GET', 'PATCH'] : registration ? ['POST', 'DELETE'] : null
      if (allowed) {
        response.setHeader('Allow', allowed.join(', '))
        throw new ApiError(405, 'This request method is not supported here.', 'method_not_allowed')
      }
      throw new ApiError(404, 'This API route could not be found.', 'route_not_found')
    } catch (error) {
      const safe = publicError(error)
      reply(response, safe.status, { error: { code: safe.code, message: safe.message, ...(safe.reason ? { reason: safe.reason } : {}) } })
    }
  }
}

export const handleApi = createApiHandler()
