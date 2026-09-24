# Runbook: running and extending the test suite

How to run the test suite locally, what each script actually checks, and
where to look when something in CI's test/quality gate goes red. Written
from `package.json`'s scripts and the 2026-09 testing-strategy audit
(`docs/research/audit-2026-09/testing-strategy.md`), which has the full
module-by-module coverage breakdown and a prioritized list of tests worth
adding — this runbook is the "how do I run things" companion to that
report's "what's missing."

## Prerequisites

Node ≥ 22 (`engines.node` in `package.json`), dependencies installed
(`npm install`).

## Everyday commands

| Command                 | What it does                                                                                                        | When to use it                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `npm test`              | Runs the full Vitest suite once (jsdom environment).                                                                | Before committing; what CI's `test` step runs.                                                           |
| `npm run test:watch`    | Vitest in watch mode, reruns on file save.                                                                          | While writing or fixing a test.                                                                          |
| `npm run test:coverage` | Full suite with a coverage report (`coverage/coverage-summary.json` + HTML in `coverage/`).                         | Before touching a module with low coverage, or when asked "is X tested."                                 |
| `npm run typecheck`     | `tsc -b` (strict, project references) plus a separate check for `tsconfig.scripts.json`.                            | Catches type errors `npm test` won't — the tooling (`scripts/`) project isn't compiled by the app build. |
| `npm run lint`          | ESLint over the whole repo.                                                                                         | Same cadence as typecheck.                                                                               |
| `npm run docs:check`    | ADR numbering/contiguity, dead internal links, knowledge-bundle freshness, OKF line caps (`scripts/check-docs.ts`). | After editing anything in `docs/adr/`, `CONTEXT.md`, or `knowledge/`.                                    |

Run `npm test`, `npm run lint`, and `npm run typecheck` before every commit —
this is the project-wide workflow rule in `CONTRIBUTING.md`, not specific to
this runbook.

## The brute-force oracle test

`packages/engine/src/optimizer/search.test.ts` is the load-bearing test in the repo: it runs
a brute-force enumeration (`bruteForce`, the reference implementation at the
bottom of `packages/engine/src/optimizer/search.ts`) over small synthetic artifact pools and
asserts the real branch-and-bound search returns the identical top-K set.
This is what makes "provably optimal" (README, ADR-0004) a tested claim
rather than a slogan — the search's pruning bounds are only ever exact if
they never discard a branch the oracle would have kept.

- It runs as part of `npm test` / `test:coverage` like any other test — there
  is no separate command for it.
- If you touch `packages/engine/src/optimizer/search.ts`, `score.ts`, or `context.ts`, re-run
  `npm test` and specifically confirm `search.test.ts` passes; a failure here
  means the optimiser is no longer exact, which is a correctness regression,
  not a flaky test.
- If you need to extend it (e.g. a new constraint type), add new synthetic
  pools to `search.test.ts` rather than relying on existing cases to
  incidentally exercise the new branch — the whole point of the oracle is
  exhaustive comparison, not spot-checking.

## The benchmark and `bench:check`

| Command               | What it does                                                                                                                                                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run bench`       | Regenerates `docs/speed-report.md` by timing the optimiser (`scripts/benchmark.ts`) against realistic and worst-case inventories.                                                                                                                                                 |
| `npm run bench:check` | `scripts/check-bench.ts` — fails if `packages/engine/src/optimizer/search.ts`, `score.ts`, `benchmark.ts`, `context.ts`, `packages/engine/src/damage/setBonuses.ts`, or `packages/engine/src/damage/profiles.ts` changed since the base commit but `docs/speed-report.md` didn't. |

`bench:check` reads its base commit from `BENCH_BASE_SHA` (set by CI to the
PR base SHA, or the previous commit on a push to `main`) and is a **no-op
locally** unless you export that variable yourself — so a local `npm test`
run passing does not mean `bench:check` will pass in CI. If your PR touches
any of the files above, run `npm run bench` and commit the regenerated
`docs/speed-report.md` in the same commit, or CI's `bench:check` step will
fail even though every other check is green.

## Coverage

`npm run test:coverage` reports statement/branch/function/line coverage via
`@vitest/coverage-v8`. As of the #94 coverage pass (2026-09) the whole-repo
numbers are roughly 95.2% statements / 88.6% branches / 96.1% functions /
96.7% lines (59 test files, 624 tests) — see the testing-strategy report for
the module-by-module breakdown of where the remaining gaps are (damage
formula level-interpolation edge cases, `meta/gap.ts`'s 2pc branches,
`invest/advise.ts`'s `craftableFor`, and others).

**A coverage floor is enforced** — `vitest.config.ts`'s `test.coverage.thresholds`
sets statements/branches/functions/lines floors (94% / 87% / 95% / 95%),
about a point under the current whole-repo numbers, so `npm run test:coverage`
fails CI on a real regression instead of only showing it in the report (closes
tech-debt TD-6 in `docs/research/audit-2026-09/tech-debt.md`; TD-7's specific
low-branch-coverage files — `Drawer.tsx`, `ArtifactForm.tsx`, `landing.tsx` —
were brought up before the floor was set). Raise the thresholds as coverage
improves; don't lower them to make a PR pass — add tests instead.

The coverage badge in `README.md` is regenerated by
`.github/workflows/coverage-badge.yml` on every push to `main` — it is CI
automation, not something to run locally.

## Where to look when a check fails

| Failure                                                | Likely cause                                                                                         | Where to look                                                                                      |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `npm test` fails on `search.test.ts`                   | Optimiser no longer matches brute force                                                              | `packages/engine/src/optimizer/search.ts`, `score.ts` — treat as a correctness bug, not a test bug |
| `npm test` fails elsewhere                             | A behavior change without a matching test update                                                     | The failing test's source file; check whether the change was intentional                           |
| `npm run typecheck` fails only on the scripts project  | A change under `scripts/` broke a type the app build doesn't check                                   | `tsconfig.scripts.json` scope                                                                      |
| `npm run docs:check` fails                             | ADR numbering gap, a dead relative link in `CONTEXT.md`/an ADR, or a stale `knowledge/` bundle entry | The script's own error message names the file and line                                             |
| CI's `bench:check` fails but local `npm test` is green | `docs/speed-report.md` wasn't regenerated for a change to the files it gates                         | Run `npm run bench` (see above) and commit the result                                              |
| `format:check` is green in CI but fails locally        | Windows/CRLF — `core.autocrlf` reformats line endings repo-wide                                      | Format only the files you changed: `npx prettier --write path/to/file` (per `CONTRIBUTING.md`)     |

## Adding new tests

Follow the existing pattern for the module you're extending — Vitest +
Testing Library, colocated `*.test.ts`/`*.test.tsx` next to the source file.
`packages/web/src/ai/explainShared.test.ts` (the untrusted explain payload)
and `packages/engine/src/share/url.test.ts` (the untrusted `?b=` share link)
are good reference examples for testing boundary conditions systematically:
each rejection path gets its own case. Model new boundary-condition tests on
those rather than writing one broad happy-path test. (Upstream's strongest
examples, `api/explain.test.ts` and `api/_ratelimit.test.ts`, went with the
Vercel removal in TODO 0.7.)

For what to prioritize adding next, see the prioritized list (ordered by
risk × silence, not raw coverage percentage) in
`docs/research/audit-2026-09/testing-strategy.md` §5 — it is kept there
rather than duplicated here because it reflects a point-in-time audit and
will go stale faster than this runbook's command reference.
