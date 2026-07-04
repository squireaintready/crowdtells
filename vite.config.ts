import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Served at the crowdtells.com root (and Cloudflare Pages). CI always sets
// BASE_PATH=/; default to the root so a manual `npm run build` is never broken.
// (Legacy: the old GitHub Pages project site lived under /prenews/.)
// `||` (not `??`) so an empty CI var still falls back to the default.
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // react/react-dom in their own chunk: its hash only changes on a React
        // upgrade, so returning readers keep the framework cached across
        // deploys instead of re-downloading it inside the app bundle.
        manualChunks(id: string) {
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
  },
});
