import { recommendEvents } from '../server/gemini.js'

try {
  const result = await recommendEvents({ message: 'Give one short, practical tip for reducing food waste at home. Do not recommend any events.', city: '', events: [] })
  if (!result.answer || result.eventIds.length) throw new Error('Unexpected response')
  console.log(`Live Gemini API responded using ${result.model}. No mock response or database fallback was used.`)
} catch (error) {
  console.error(error?.code?.startsWith('ai_') ? error.message : 'Live Gemini check failed. Verify the server key, model, network access and provider quota.')
  process.exitCode = 1
}
