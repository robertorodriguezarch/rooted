import { handleApi } from '../server/router.js'

// vercel.json explicitly routes every API depth to this function. Standalone
// Vercel's bracket-file convention matches one segment, unlike Next.js
// catch-all routes. Vercel preserves the incoming req.url for Node handlers.
export default handleApi
