import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = Number(env.VITE_PORT || env.PORT || 3000);
  const apiPort = Number(env.API_PORT || 3001);
  return {
    root: 'src/dashboard',
    publicDir: '../../public',
    plugins: [
      react(),
      {
        name: 'kestrel-homepage-route',
        configureServer(server) {
          server.middlewares.use((req, _res, next) => {
            const url = new URL(req.url || '/', 'http://localhost');
            if (url.pathname === '/') req.url = `/home.html${url.search}`;
            next();
          });
        },
      },
    ],
    build: { outDir: '../../dist', emptyOutDir: true, chunkSizeWarningLimit: 800 },
    server: {
      port,
      strictPort: true,
      proxy: { '/api': `http://127.0.0.1:${apiPort}` },
    },
  };
});
