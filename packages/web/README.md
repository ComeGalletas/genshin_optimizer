# packages/web

The React app from the fork. It still runs fully client-only; talking to the
local server comes in Phase 3.

- `index.html`, `public/` and `src/` (entry point `src/main.tsx`).
- `vite.config.ts` drives `npm run dev` (port 5199), `build` (output in
  `dist/`) and `preview`. The root scripts of the same names delegate here.
  `.env` files are read from the repo root.
- `tailwind.config.js` and `postcss.config.js`. Tailwind also scans
  `../engine/src`, because engine display copy carries class names.
- Tests run from the root `vitest.config.ts` (project `app`, jsdom).
- Engine code is imported by subpath, for example
  `@genshin-build-lab/engine/optimizer/search`, not through the package root,
  so each bundle only pulls in what it uses. `src/bundleBoundaries.test.ts`
  keeps the ~320 KB dataset out of the worker and serverless bundles.
