import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const api = {
  name: 'rooted-local-api',
  async configureServer(server) {
    // Local API verification must use the same project as the browser, including
    // Vite mode files. Keep dotenv from restoring stale base-file public values.
    process.env.VITE_SUPABASE_URL = server.config.env.VITE_SUPABASE_URL?.trim() || '';
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = server.config.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || '';
    process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const { handleApi } = await import('./server/router.js');
    server.middlewares.use((request, response, next) => {
      if (request.url?.split('?')[0] === '/api' || request.url?.startsWith('/api/')) return handleApi(request, response);
      next();
    });
  },
};

export default defineConfig({ plugins: [react(), tailwindcss(), api] });
