# 0001. Client-side-only architecture, no backend

- Status: Superseded by [0021](0021-local-first-server-architecture.md) (this fork adds a local server; the web app still runs client-only)
- Date: 2026-06-06

## Context

The app optimises a Genshin character's artifact build from a player's own inventory and lets them share a result. We must decide whether any server component is required (for storage, accounts, data APIs, or the optimisation itself).

## Decision

Ship a **100% client-side single-page app** (Vite + React + TS, deployed static). No backend, no database, no accounts. All computation runs in the browser; the heavy optimisation runs in a **Web Worker**. The only network calls are to public, CORS-friendly third-party services (Enka.Network for UID import — see [0006]), and even those are optional/guarded.

## Consequences

- No secrets, no server to operate, free static hosting — strong fit for a portfolio piece.
- Sharing must be **link-based and self-contained** (see [0005]), since there is nothing to store server-side.
- Reference and meta data must be **bundled snapshots** (see [0002], [0007]), since there is no server to proxy live data.
- A future "live meta" or "build gallery" feature would require introducing a backend — explicitly out of scope, flagged as v2.
- Any third-party API used at runtime must support browser cross-origin requests, or it cannot be used without breaking this decision.
