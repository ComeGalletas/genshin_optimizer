# 0036. ConstraintSpec: a strict, versioned request format that extends the curated defaults

- Status: Accepted
- Date: 2026-09-30

## Context

Phase 4 turns natural-language requests ("Furina with at least 180% ER,
keep Neuvillette's gear") into something the optimizer can run. CLAUDE.md
makes the LLM the interface, not the solver: it writes a `ConstraintSpec`,
the spec is validated, and only a valid spec reaches the optimizer. PLAN
lists its fields: set requirements, main stats, min and max stats, the
objective (stat weights, crit value, later `sim`), exclusions,
`keepEquippedOn`, team buffs and the enemy. ADR-0022 puts engine
validation on `zod/mini`; ADR-0023 keeps stats in percent.

The Phase 3 acceptance showed the cost of the existing request shape:
`optimize_build`'s `constraints` replace the character's curated defaults,
so "best Furina with ≥ 180% ER" became an unconstrained search that ran
into the 120 s limit for a local model, while Claude read the defaults
first and merged them. A model also invented fields (`pool` inside
`constraints`) that a lenient schema would have ignored.

## Decision

1. **`packages/engine/src/constraints/spec.ts`**, pure, `zod/mini`:
   `version` (1), `character`, `weapon`, `buildLevel`, `defaults`, `set`
   (`4pc`, `2pc`, `2+2`, or `any` to clear a default), `mainStats` for
   sands, goblet and circlet (a stat or `any`), `minStats`, `maxStats`,
   `objective` (`crit_value`, `avg_damage`, a stat, or `{ weights }`),
   `keepEquippedOn` (characters, or `all` for unequipped pieces only),
   `excludeArtifacts`, `teamBuffs`, `enemy` (`level`, `res`).
2. **Extend by default.** `defaults: "extend"` (the default) starts from
   the character's curated objective and constraints and applies the spec
   on top, field by field; `"replace"` starts from nothing. What a person
   means by "with at least 180% ER" is the usual build plus that floor.
3. **Percent everywhere**, enemy resistance included (10 means 10%). PLAN's
   `er >= 1.8` example predates ADR-0023; the spec writes 180. The
   conversion to the damage engine's fractions happens in the mapping
   (4.2), and is tested there.
4. **Strict and versioned.** Unknown fields are errors at every level. A
   missing `version` means the current one; another version is refused.
   A future version comes with a migration, and version 1 keeps its
   meaning.
5. **Two checks, all problems at once.** `parseConstraintSpec` checks the
   shape, then the meaning against the dataset: keys exist (with the
   closest key suggested for a typo), the weapon suits the character, a
   2+2 names two sets, each main stat can roll on its slot, no minimum
   above its maximum, `avg_damage` only where a damage profile exists,
   stat weights not all zero. It returns every issue with a path and a
   message written for a model to act on (zod/mini carries no English
   messages, so the spec writes its own), so one retry can fix them all.
6. **Not in version 1:** the `sim` objective (added with Phase 5, as a new
   version if its shape needs one), and account checks (does the owner
   have this character, this artifact id): those need the account, and
   the mapping (4.2) does them where the account is.

## Consequences

- 4.2 maps a spec to an `OptimizeRequest`, which needs engine support the
  optimizer lacks today: `maxStats`, a stat-weight objective, exclusions,
  team buffs and the enemy override. Each goes through the brute-force
  oracle tests like any optimizer change.
- 4.3's translator prompt can hand the model this schema and the issue
  messages; 4.5 tests that no invalid spec reaches the optimizer.
- The MCP `optimize_build` tool can move to the spec (keeping
  "extend the defaults" as its behavior), which removes the Phase 3
  timeout for every client.

## Rejected alternatives

- **Replace the defaults unless told otherwise** (today's API). It made
  the most common request the slowest and least correct one.
- **The full zod API in the engine.** Its English messages would be free,
  but ADR-0022 measured it at four times the size; the spec's own
  messages are better for a model anyway.
- **Fractions for ER and resistance** (PLAN's first sketch). Two unit
  systems in one app is where conversion bugs come from; ADR-0023 chose
  percent.
