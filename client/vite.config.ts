import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * `vite build --mode demo` produces a static build whose backend runs in the
 * page (browser storage, tabs synced over BroadcastChannel), so it can be
 * hosted without the Node server. The normal build talks to the real API.
 */
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  return {
    plugins: [react()],
    base: demo ? './' : '/',
    define: { 'import.meta.env.VITE_DEMO': JSON.stringify(demo) },
    resolve: {
      alias: {
        '@backend': fileURLToPath(new URL(demo ? './src/backend/demo.ts' : './src/backend/http.ts', import.meta.url)),
      },
    },
    build: { outDir: demo ? 'dist-demo' : 'dist' },
    server: {
      port: 5173,
      proxy: { '/api': 'http://localhost:3001' },
    },
  };
});
