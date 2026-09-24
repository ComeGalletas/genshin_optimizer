import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Test runner only. The app's dev server and build are configured in
// packages/web/vite.config.ts.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    // Ignore local git worktrees (e.g. .worktrees/*) so a checked-out copy of
    // the repo isn't scanned and run with a second, conflicting React instance.
    exclude: [...configDefaults.exclude, '**/.worktrees/**'],
    // One `npm test` fans out to every workspace package, each in the
    // environment it actually runs in, and CI gets a single coverage report.
    projects: [
      {
        extends: true,
        test: {
          name: 'app',
          include: ['packages/web/src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['./packages/web/src/test-setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'engine',
          include: ['packages/engine/src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'server',
          include: ['packages/server/src/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
    coverage: {
      provider: 'v8',
      // json-summary feeds the coverage-badge workflow.
      reporter: ['text', 'html', 'json-summary'],
      // Floors set ~1pt under the whole-repo numbers as of 2026-09 (95.2%
      // statements / 88.6% branches / 96.1% functions / 96.7% lines — see
      // docs/runbooks/testing.md and tech-debt TD-6/TD-7) so a real
      // regression fails CI, but normal noise (a line or two shifting as
      // code changes) doesn't. Raise these as coverage improves; never lower
      // them to make a PR pass.
      thresholds: {
        statements: 94,
        branches: 87,
        functions: 95,
        lines: 95,
      },
    },
  },
});
