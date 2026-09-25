# 0022. Runtime validation at every boundary, with zod

- Status: Accepted
- Date: 2026-09-25

## Context

Everything the app does starts from data it didn't produce: GOOD files written
by external scanners, `?b=` share links, Enka.Network responses, state
persisted in the browser, and soon the local server's HTTP and MCP inputs, an
LLM's `ConstraintSpec` (Phase 4), and gcsim's JSON output (Phase 5). TypeScript
types say nothing about any of it at runtime.

The fork validates each of these by hand, each in its own style:
`parseGOOD`/`parseGOODRoster` (`import/good.ts`), `parseBuildSnapshot`
(`share/url.ts`), `parseEnkaResponse` (`import/enka.ts`), `isPersistedArtifact`
and `validateArtifactDraft` (`game/artifactValidation.ts`), and
`parseExplainPayload` (`web/src/ai/explainShared.ts`). They work and are tested,
but every one re-implements "is this an object, is this key a string, is this
number in range", and nothing ties a validator to the type it checks. Phase 2
adds several more boundaries at once (GOOD normalization, sidecars, snapshots),
and CLAUDE.md's third principle needs a hard guarantee that an invalid spec
never reaches the optimizer.

The engine had no runtime dependencies until now, and it ships to the browser,
where the bundle has a size budget (`size:check`: +5% over the baseline, about
11 KB gzip of headroom today).

## Decision

1. **zod (v4) is the runtime validation library.** Schemas live in the engine,
   next to the types they check; zod does no I/O, so they stay pure. Where a
   schema is the source of truth, the type is derived from it (`z.infer`)
   rather than written twice.
2. **Parse once, at the boundary.** Untrusted input goes through `safeParse`
   and comes out either as a typed value or as a structured error the caller
   reports. Code past the boundary trusts the types and doesn't re-check.
   Validation never repairs or guesses: normalization (key, unit and location
   mapping, 2.2) is a separate, explicit step, and a value that fails
   validation is reported, not coerced into something plausible.
3. **Engine code imports `zod/mini` only.** Measured on the same GOOD-artifact
   schema, minified and gzipped: 26.1 KB with the full `zod` API, 6.0 KB with
   `zod/mini`. The full API alone would exceed the bundle's headroom.
   `boundaries.test.ts` enforces it: `zod/mini` is the one third-party module
   engine source may import, and the engine's declared dependencies must match
   that allowlist exactly. Server-only code runs under Node, where bundle size
   doesn't matter, so it may use the full API where a library expects it (the
   MCP TypeScript SDK declares tool inputs with zod schemas).
4. **Boundaries adopt it as they are built or next touched,** not in a
   big-bang rewrite:
   - GOOD import and normalization (2.2), sidecars (2.3), snapshot records (2.6)
   - server HTTP and MCP inputs (Phase 3)
   - `ConstraintSpec` produced by an LLM (Phase 4): validated before it
     reaches the optimizer, always
   - gcsim JSON output (Phase 5)

   The existing hand validators (share link, Enka, persisted state, artifact
   drafts, explain payload) keep working and keep their tests. Each moves to a
   schema when its code next changes for another reason, and its existing tests
   are the proof that behaviour didn't change.

## Consequences

- The engine gains its first runtime dependency. Adding another now means
  declaring it in `packages/engine/package.json` and allowlisting it in
  `boundaries.test.ts`, which makes it a visible, reviewed change.
- The browser bundle grows by roughly 6 KB gzip once a schema ships in the web
  app (from 2.2 on). `size:check` keeps measuring it.
- `zod/mini`'s API is functional (`z.number().check(z.int(), z.minimum(0))`
  instead of `z.number().int().min(0)`), a little more verbose to write.
- One validation vocabulary across engine, server and LLM output, with
  structured error paths the server and MCP layer can return as they are.

## Rejected alternatives

- **Full `zod` in the engine.** Same library, 20 KB gzip more in the browser
  for method chaining.
- **Keep hand-written validators.** The status quo: correct today, but each new
  boundary re-implements the same checks, and types and checks drift apart.
- **JSON Schema with a validator such as ajv.** Separate schema files and either
  code generation or a larger runtime, for no gain here.
- **valibot.** Comparable size to `zod/mini`, but the plan and CLAUDE.md
  already name zod, and the MCP SDK the server will use speaks zod.
