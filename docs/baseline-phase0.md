# Phase 0 baseline

Numbers for the untouched fork, recorded before the monorepo restructure. Phase 0 is accepted only if the restructured repo reproduces them (see [TODO.md](TODO.md) 0.1 and the Phase 0 Accept line).

## Environment

| Item      | Value                                                         |
| --------- | ------------------------------------------------------------- |
| Date      | 2026-09-24                                                    |
| Commit    | `a9fa5cb` (source identical to upstream `f4ff151`)            |
| Machine   | AMD Ryzen 7 9800X3D (8 cores / 16 threads), 31 GB RAM         |
| OS        | Windows 11 Pro 10.0.26200, locale `es-CO`                     |
| Toolchain | Node v24.17.0, npm 11.13.0 (CI uses Node 22 on ubuntu-latest) |
| Data      | `genshin-db` 5.2.13, data patch 6.7                           |

## CI steps, run locally

| Step                                        | Result                                                          |
| ------------------------------------------- | --------------------------------------------------------------- |
| `npm run typecheck`                         | pass                                                            |
| `npm run lint`                              | pass (0 problems)                                               |
| `npm run docs:check`                        | pass: 20 ADRs, contiguous, indexed, links resolve               |
| `npm run format:check`                      | pass                                                            |
| `npm test`                                  | **659 / 661 pass**, 62 files (2 locale failures, see below)     |
| Coverage (lines / branches / funcs / stmts) | 97.54% / 90.46% / 97.26% / 96.46%                               |
| `npm run build`                             | pass, 153 modules                                               |
| `npm run size:check`                        | pass: 162,619 B gzip (baseline file 165,808 B, limit 174,098 B) |
| `npm run build:data` + drift check          | pass: no diff in `data.generated.json`                          |

### Known test failures (environment, not code)

`src/components/App.test.tsx` and `src/components/OptimizePanel.test.tsx` fail their progress-counter assertions. Both assert `12,345`-style numbers, but `toLocaleString()` without an explicit locale follows the OS locale, and `es-CO` renders `12.345`. CI (en-US) passes. Fixing this is TODO 0.1b. Until then, "identical test results" means the same 659 pass and the same 2 fail.

## Build output

| Chunk                | Raw       | Gzip      |
| -------------------- | --------- | --------- |
| `index.js`           | 470.97 kB | 128.43 kB |
| `RosterView.js`      | 76.62 kB  | 24.00 kB  |
| `PlanView.js`        | 14.52 kB  | 5.49 kB   |
| `optimize.worker.js` | 9.09 kB   | n/a       |
| `TeamsView.js`       | 2.62 kB   | 1.10 kB   |
| `recommend.js`       | 1.41 kB   | 0.68 kB   |
| `Badge.js`           | 0.24 kB   | 0.20 kB   |
| `index.css`          | 33.91 kB  | 7.01 kB   |
| `index.html`         | 1.44 kB   | 0.74 kB   |

## Benchmark (`npm run bench`)

Two back-to-back runs. Each time is the script's own median of 3. The explored and pruned counts are deterministic and matched across both runs.

| Inventory | Scenario   |    Naive builds | Explored |    Pruned | Reduction | Run 1 (ms) | Run 2 (ms) |
| --------- | ---------- | --------------: | -------: | --------: | --------: | ---------: | ---------: |
| 50        | crit_value |         100,000 |      270 |       118 |      370× |        3.0 |        1.9 |
| 100       | crit_value |       3,200,000 |      580 |       599 |    5,517× |        2.8 |        2.8 |
| 200       | crit_value |     102,400,000 |      640 |       648 |  160,000× |        3.1 |        4.3 |
| 400       | crit_value |   3,276,800,000 |   22,160 |   112,852 |  147,870× |       71.1 |       65.3 |
| 800       | crit_value | 104,857,600,000 |  285,280 | 2,193,690 |  367,560× |      949.1 |      898.4 |
| 50        | er_pct     |         100,000 |      170 |       164 |      588× |        0.9 |        1.5 |
| 100       | er_pct     |       3,200,000 |    9,260 |    23,250 |      346× |       46.8 |       45.8 |
| 200       | er_pct     |     102,400,000 |    8,840 |   133,277 |   11,584× |       35.6 |       49.0 |
| 400       | er_pct     |   3,276,800,000 |  246,880 |   881,794 |   13,273× |     1046.8 |     1035.3 |

How to apply the Phase 0 "bench within ±10%" check:

- **Explored and pruned counts must match exactly.** They're deterministic, so any change means the search itself changed.
- **Time ±10% applies only to rows of about 35 ms or more.** Those are 400 and 800 `crit_value`, and 100, 200 and 400 `er_pct`. Rows under 10 ms swing by more than 50% between runs, which is timer noise. Even the 200 `er_pct` row moved by 38% between these two runs, so compare its median over several runs.

### The committed speed report is stale

`docs/speed-report.md` was last regenerated in `22b7080` (2026-08-29). Commit `105114f` (2026-08-31) then changed `src/optimizer`, and its explored and pruned counts no longer match the current code. For example, 200 `crit_value` explored is 680 in the report and 640 now. `bench:check` only runs against a PR base SHA, so it didn't catch this. The table above is the reference for Phase 0. The report gets regenerated as part of the restructure.
