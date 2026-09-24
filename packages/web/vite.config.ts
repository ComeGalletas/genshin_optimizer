import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Dev server and production build for the app. Tests are configured at the
// repo root (vitest.config.ts), which runs every workspace package.
export default defineConfig({
  plugins: [react()],
  // `.env` files stay at the repo root, next to the server-side ones.
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  server: {
    // Pin the dev server port so it doesn't collide with sibling repos
    // checked out on the same machine. See #65.
    port: 5199,
    strictPort: true,
  },
});
