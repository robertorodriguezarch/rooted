import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const api = {
  name: 'rooted-local-api',
  async configureServer(server) {
    const { handleApi } = await import('./server/router.js');
    server.middlewares.use((request, response, next) => {
      if (request.url?.split('?')[0] === '/api' || request.url?.startsWith('/api/')) return handleApi(request, response);
      next();
    });
  },
};

export default defineConfig({ plugins: [react(), tailwindcss(), api] });
