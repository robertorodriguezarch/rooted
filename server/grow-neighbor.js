import { randomUUID } from 'node:crypto'
import { withTransaction } from './db.js'
import { ApiError } from './errors.js'

export function validateAssistantQuestion(body) {
  if (typeof body.message !== 'string' || !body.message.trim() || body.message.trim().length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body.message)) {
    throw new ApiError(400, 'Ask a question between 1 and 1,000 characters.', 'invalid_input')
  }
  if (body.city !== undefined && (typeof body.city !== 'string' || body.city.length > 100 || /[\u0000-\u001f]/.test(body.city))) {
    throw new ApiError(400, 'Use a city name of up to 100 characters.', 'invalid_input')
  }
  return { message: body.message.trim(), city: body.city?.trim() || '' }
}

// Atomic, shared database limits work across serverless instances. Failed
// provider attempts also consume the reservation to prevent retry storms.
export async function reserveAssistantRequest(pool, userId, now) {
  await withTransaction(pool, async (client) => {
    for (const [seconds, limit] of [[60, 5], [3600, 30]]) {
      const window = new Date(Math.floor(now / (seconds * 1000)) * seconds * 1000)
      const { rowCount } = await client.query(`INSERT INTO ai_request_limits (user_id, window_at, window_seconds, requests)
        VALUES ($1, $2, $3, 1) ON CONFLICT (user_id, window_at, window_seconds)
        DO UPDATE SET requests = ai_request_limits.requests + 1 WHERE ai_request_limits.requests < $4 RETURNING requests`,
      [userId, window, seconds, limit])
      if (!rowCount) throw new ApiError(429, 'You’ve reached the assistant request limit. Please try again later.', 'ai_rate_limited')
    }
  })
}

export async function recordAssistantActivity(pool, { userId, model, now, latencyMs, success, recommendationCount, errorCode = null }) {
  await pool.query(`INSERT INTO ai_request_activity (id, user_id, recorded_at, model, latency_ms, success, recommendation_count, error_code)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [randomUUID(), userId, new Date(now), model, Math.max(0, Math.round(latencyMs)), success, recommendationCount, errorCode])
}

export async function readAssistantActivity(pool, userId, now) {
  // Resolve extension-owned functions through their actual schema and verify
  // this particular table is a hypertable before advertising Timescale.
  const { rows: extensions } = await pool.query(`SELECT n.nspname AS schema FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'timescaledb'`)
  let engine = 'postgres'
  let bucket = "date_trunc('hour', recorded_at)"
  if (extensions.length) {
    const { rows } = await pool.query(`SELECT EXISTS(SELECT 1 FROM timescaledb_information.hypertables
      WHERE hypertable_schema = current_schema() AND hypertable_name = 'ai_request_activity') AS enabled`)
    if (rows[0].enabled) {
      const schema = '"' + extensions[0].schema.replaceAll('"', '""') + '"'
      bucket = `${schema}.time_bucket(INTERVAL '1 hour', recorded_at)`
      engine = 'timescale'
    }
  }
  const { rows } = await pool.query(`SELECT ${bucket} AS hour, count(*)::integer AS requests,
    count(*) FILTER (WHERE success)::integer AS successful_requests, COALESCE(round(avg(latency_ms)), 0)::integer AS average_latency_ms
    FROM ai_request_activity WHERE user_id=$1 AND recorded_at >= $2 AND recorded_at <= $3
    GROUP BY 1 ORDER BY 1`, [userId, new Date(now - 24 * 3600_000), new Date(now)])
  const buckets = rows.map((row) => ({ hour: new Date(row.hour).toISOString(), requests: row.requests, successfulRequests: row.successful_requests, averageLatencyMs: row.average_latency_ms }))
  const requests = buckets.reduce((sum, row) => sum + row.requests, 0)
  const successfulRequests = buckets.reduce((sum, row) => sum + row.successfulRequests, 0)
  const averageLatencyMs = requests ? Math.round(buckets.reduce((sum, row) => sum + row.averageLatencyMs * row.requests, 0) / requests) : 0
  return { engine, hours: 24, summary: { requests, successfulRequests, averageLatencyMs }, buckets }
}
