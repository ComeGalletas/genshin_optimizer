# packages/web

The React app from the fork, reworked into views in Phase 9 (ADR-0053). It
runs fully client-only, and uses the local server (`packages/server`) when it
runs (ADR-0034): the account, simulations, comparisons, imports and chat.

- `index.html`, `public/` and `src/` (entry point `src/main.tsx`).
- `vite.config.ts` drives this package's `dev` (port 5199), `build` (output
  in `dist/`) and `preview`. The root `npm run dev:web`, `build` and `preview`
  delegate here; the root `npm run dev` (`scripts/dev.ts`) starts this and the
  local server together.
  `.env` files are read from the repo root.
- `tailwind.config.js` and `postcss.config.js`. Tailwind also scans
  `../engine/src`, because engine display copy carries class names.
- Tests run from the root `vitest.config.ts` (project `app`, jsdom).
- Engine code is imported by subpath, for example
  `@genshin-build-lab/engine/optimizer/search`, not through the package root,
  so each bundle only pulls in what it uses. `src/bundleBoundaries.test.ts`
  keeps the ~350 KB dataset out of the worker bundle.
