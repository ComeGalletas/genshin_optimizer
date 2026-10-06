/**
 * The account tools (TODO 3.2, ADR-0031; shared with the chat in 3.6,
 * ADR-0035): each one a name, a description, a zod input shape and a body
 * over `Services`. The MCP server registers them, and the chat loop offers
 * the same list to the configured model, so the two surfaces can't drift.
 *
 * Results are compact JSON objects (stats rounded to one decimal,
 * artifacts as set/slot/level/main/substats): a model reads every token of
 * them. Tools for later phases were added when they existed, not before
 * (`simulate_team` in 6.2, `allocate_team` in 7.4): a tool that always
 * fails wastes a turn.
 * @packageDocumentation
 */

import * as z from 'zod';
import type { Artifact, StatVec } from '@genshin-build-lab/engine/game/types';
import { ELEMENTS, WEAPON_TYPES } from '@genshin-build-lab/engine/game/types';
import type { Services } from '../api/services';
import { ArtifactQuery, CompareBody } from '../api/schemas';
import { ConstraintSpecSchema } from '@genshin-build-lab/engine/constraints/spec';
import { DraftInput } from '../sim/drafts';
import { TeamSimSpec } from '@genshin-build-lab/engine/sim/team';

export const TOOL_INSTRUCTIONS = `Tools over the owner's own Genshin Impact account: imported artifacts, characters and weapons, an exact build optimizer, and import history.
- Every number you give the owner must come from a tool result. If a tool fails, say so; never estimate.
- Stats are in percent where the game shows percent (crit_rate 62.3 means 62.3%). Stat keys: hp, hp_pct, atk, atk_pct, def, def_pct, em, er_pct, crit_rate, crit_dmg, elemental_dmg, physical_dmg, healing.
- Character, weapon and set keys are dataset keys (furina, splendor_of_tranquil_waters, GoldenTroupe); list_characters and get_character show them.
- optimize_build takes a ConstraintSpec that extends the character's curated defaults: pass only what the owner asked for. It is exact and can take tens of seconds on a large account; when it times out, narrow the spec (a set, main stats, or keepEquippedOn "all").
- When you report builds, start with optimize_build's "understood" sentence, so the owner can check the request was read right.
- simulate_team compares team variants with a base. Cite each variant as "<label>: <vsBase.text> team DPS", copying vsBase.text exactly (sign, digits and the ± interval: "Kazuha swap: +7.4% ± 1.2% team DPS"); never round it or move an interval to another variant. A variant whose withinNoise is true is no different from the base: say so, whatever its sign. A run with problems or notSimulated has no numbers: say why.
- allocate_team shares the artifacts out between several characters, no piece twice. Report each member's build and sharePct (their share of their best build alone), then the moves in order and the farming list as given.
- Rotations (gcsim action lists for a team) are in list_rotations and get_rotation. draft_rotation saves a new one only as a draft; tell the owner it needs their review (npm run rotations -- review <id>) before it counts, and never call a draft validated.`;

const r1 = (x: number) => Math.round(x * 10) / 10;
const round = (v: StatVec) =>
  Object.fromEntries(Object.entries(v).map(([k, x]) => [k, r1(x!)]));

/** An artifact as a model needs it. */
export const compact = (a: Artifact & { lock?: boolean | null }) => ({
  id: a.id,
  set: a.setKey,
  slot: a.slot,
  level: a.level,
  rarity: a.rarity,
  main: a.element ? `${a.element}_dmg` : a.mainStat,
  mainValue: r1(a.mainStatValue),
  subs: Object.fromEntries(a.subStats.map((s) => [s.key, r1(s.value)])),
  ...(a.location && { wornBy: a.location }),
  ...(a.lock !== undefined && a.lock !== null && { locked: a.lock }),
});

export type ToolResult = Record<string, unknown>;

/** One tool. `input` is a zod object shape (what MCP's `registerTool`
 *  takes); no `input` means the tool takes no arguments. `run` gets the
 *  arguments already parsed with `input`. */
export interface ToolDef {
  name: string;
  title: string;
  description: string;
  input?: z.ZodRawShape;
  /** The tool changes something (saves a file); every other tool only
   *  reads. */
  writes?: true;
  run: (args: never) => ToolResult | Promise<ToolResult>;
}

/** Types a tool's `run` from its own input shape. */
function tool<S extends z.ZodRawShape = Record<never, never>>(def: {
  name: string;
  title: string;
  description: string;
  input?: S;
  writes?: true;
  run: (args: z.output<z.ZodObject<S>>) => ToolResult | Promise<ToolResult>;
}): ToolDef {
  return def as ToolDef;
}

export function accountTools(services: Services): ToolDef[] {
  return [
    tool({
      name: 'get_account_summary',
      title: 'Account summary',
      description:
        'What the current account holds: artifact counts (by slot, rarity, +20, equipped), characters, weapons, and which import it comes from.',
      run: () => services.accountSummary(),
    }),
    tool({
      name: 'list_characters',
      title: 'List characters',
      description:
        'The owned characters: key, name, element, weapon type, level, constellation, talents, equipped weapon and how many artifacts they wear. Optional filters by element or weapon type. For one character the owner names, call get_character instead.',
      // Enums, so a guess ("water", "Hydro") is an error naming the valid
      // values rather than an empty list the model reads as "not owned".
      input: {
        element: z.enum([...ELEMENTS, 'physical']).optional(),
        weaponType: z.enum(WEAPON_TYPES).optional(),
      },
      run: (args) => ({
        characters: services.listCharacters(args).map((c) => ({
          key: c.key,
          name: c.name,
          element: c.element,
          weaponType: c.weaponType,
          level: c.level,
          constellation: c.constellation,
          talents: c.talents,
          weapon: c.weaponKey,
          weaponLevel: c.weaponLevel,
          equippedArtifacts: c.equippedArtifacts,
        })),
      }),
    }),
    tool({
      name: 'get_character',
      title: 'Get a character',
      description:
        'One owned character by dataset key (lowercase, e.g. furina, raiden_shogun, kaedehara_kazuha): profile, equipped weapon and artifacts, the sheet totals those give (set bonuses and the weapon and character passives included; `passives` says what each one counts), and the default optimizer objective and constraints for them.',
      input: { characterKey: z.string().max(64) },
      run: ({ characterKey }) => {
        const c = services.getCharacter(characterKey);
        return {
          ...c,
          equipped: c.equipped.map(compact),
          stats: c.stats && round(c.stats),
        };
      },
    }),
    tool({
      name: 'query_artifacts',
      title: 'Query artifacts',
      description:
        'Artifacts in the current account matching every filter given: set, slot, main stat, substat floors (e.g. {"crit_rate": 7}), level range, who wears them (a character key, "" for unequipped, "*" for anyone) and lock. Returns up to `limit` (default 30, max 200) and the total.',
      input: ArtifactQuery.shape,
      run: (args) => {
        const r = services.queryArtifacts(args);
        return { ...r, artifacts: r.artifacts.map(compact) };
      },
    }),
    tool({
      name: 'optimize_build',
      title: 'Optimize a build',
      description:
        'Exact best builds for one character from the account\'s artifacts, from a ConstraintSpec (ADR-0036). Only `character` is required. The spec EXTENDS the character\'s curated defaults (their usual set, main stats, ER floor and objective), so give only what the owner asked for: "best Furina with at least 180% ER" is {"character":"furina","minStats":{"er_pct":180}}. Fields: set ({"kind":"4pc"|"2pc","setKey"}, {"kind":"2+2","setKeys":[a,b]}, or {"kind":"any"} to drop the default set), mainStats ({"sands"|"goblet"|"circlet": a stat, or "any"}), minStats and maxStats (percent where the game shows percent), objective ("avg_damage", "crit_value", a stat, or {"weights":{stat:weight}}; or "sim" to rank the top builds by simulated team DPS in a gcsim rotation from the library, with the owner\'s teammates: sim {"rotation" (an id; the character\'s one when left out), "by" (the stat objective that picks the candidates, the usual one when left out), "topK" (default 20), "iterations" (default 500)}; it takes tens of seconds and reports each build\'s team DPS with a 95% interval and which builds the noise can\'t separate from the best, so say "tied" for those; when gcsim lacks the character, a teammate, the weapon or a set, the builds come in the stat search\'s order with `notSimulated` saying why, and you must tell the owner they were not simulated), keepEquippedOn (character keys whose pieces stay put, or "all" for unequipped pieces only), excludeArtifacts (artifact ids), teamBuffs (stats teammates add), enemy ({"level", "res" in percent}), weapon and buildLevel (else the equipped ones), defaults ("replace" to ignore the curated ones), topK. Returns `understood`, the plain-words reading of the spec (tell it to the owner), then `passives` (what the weapon and character passives add to every build, at the refinement the owner has and, for ER-based ones, at the ER floor), then the top builds with totals, objective value and binding constraints. Problems come back all at once, each with where it is.',
      input: {
        ...ConstraintSpecSchema.shape,
        topK: z.number().int().min(1).max(20).optional(),
      },
      run: async ({ topK, ...spec }) => {
        const r = await services.runSpec(spec, topK);
        if (r.status !== 'ok') return r;
        if ('sim' in r)
          return {
            ...r,
            builds: r.builds.map((b) => ({
              rank: b.rank,
              statRank: b.statRank,
              teamDps: Math.round(b.teamDps.mean),
              teamDpsCi95: b.teamDps.ci95.map(Math.round),
              behindPct: r1(b.behindPct),
              tiedWithBest: b.tiedWithBest,
              ...(b.characterDps && {
                characterDps: Math.round(b.characterDps.mean),
                characterShare: r1(100 * b.characterDps.share),
              }),
              fightSec: r1(b.fightSec),
              objectiveValue: r1(b.objectiveValue),
              totals: round(b.totals),
              artifacts: Object.fromEntries(
                Object.entries(b.artifacts).map(([s, a]) => [s, compact(a)]),
              ),
            })),
          };
        return {
          ...r,
          builds: r.builds.map((b) => ({
            score: r1(b.score),
            objectiveValue: r1(b.objectiveValue),
            totals: round(b.totals),
            bindingConstraints: b.diagnostics.bindingConstraints,
            artifacts: Object.fromEntries(
              Object.entries(b.artifacts).map(([s, a]) => [s, compact(a)]),
            ),
          })),
        };
      },
    }),
    tool({
      name: 'compare_builds',
      title: 'Compare two builds',
      description:
        'Two builds for one character side by side: sheet totals, the objective value of each, and the difference (b − a). Builds are lists of artifact ids from the account (as other tools return them), one per slot.',
      input: CompareBody.shape,
      run: (args) => {
        const c = services.compareBuilds(args);
        const side = (s: typeof c.a) => ({
          artifacts: s.artifacts.map(compact),
          totals: round(s.totals),
          objectiveValue: r1(s.objectiveValue),
        });
        return {
          ...c,
          a: side(c.a),
          b: side(c.b),
          diff: round(c.diff),
          objectiveDiff: r1(c.objectiveDiff),
        };
      },
    }),
    tool({
      name: 'get_import_report',
      title: 'Import report',
      description:
        "The latest import at a glance: how many snapshots, faulty scans left out, the current merge, and what the newest import changed (new, gone, upgraded, moved, lock changes, and anything it couldn't explain).",
      run: () => services.importReport(),
    }),
    tool({
      name: 'simulate_team',
      title: 'Simulate and compare teams',
      description:
        'Simulate a team in a library rotation (list_rotations) with the owner\'s characters as equipped, and up to five variants of it, side by side. A variant has a label and changes any of: swap ({"kaedehara_kazuha": "sucrose"}: only to a character the rotation\'s slot takes; otherwise use another rotation), weapons ({"raiden_shogun": {"weapon": "the_catch", "refinement": 5}}), builds ({"raiden_shogun": {"set": {"kind": "4pc", "setKey": "ThunderingFury"}}}: conditions the optimizer fills from the account, teammates\' pieces left alone; or {"artifacts": [ids]}), rotation (another id), enemy ({"level", "res" in percent, "count" of targets}). Returns each run\'s team DPS with its 95% interval, per character DPS, share, field time and energy waits, reactions and warnings, and for each variant `vsBase.text` ("+7.4% ± 1.2%"): cite that text as it is, and call a variant whose `withinNoise` is true no different from the base. A variant that can\'t be built says why; one gcsim can\'t simulate is `notSimulated`. Takes seconds; repeats come from a cache.',
      input: TeamSimSpec.shape,
      run: async (args) => {
        const r = await services.simulateTeam(args);
        const n = (x: number) => Math.round(x);
        return {
          iterations: r.iterations,
          burstWaits: r.burstWaits,
          runs: r.runs.map((run) => ({
            ...run,
            ...(run.dps && {
              dps: n(run.dps.mean),
              dpsCi95: run.dps.ci95.map(n),
            }),
            ...(run.fightSec !== undefined && {
              fightSec: r1(run.fightSec),
            }),
            ...(run.characters && {
              characters: run.characters.map((c) => ({
                character: c.character,
                dps: n(c.dps),
                sharePct: r1(100 * c.share),
                fieldSec: r1(c.fieldSec),
                energyWaitSec: r1(c.energyWaitSec),
              })),
            }),
            ...(run.reactions && {
              reactions: Object.fromEntries(
                Object.entries(run.reactions).map(([k, v]) => [k, r1(v)]),
              ),
            }),
            ...(run.vsBase && {
              vsBase: {
                text: run.vsBase.text,
                pct: r1(run.vsBase.pct),
                ci95Pct: r1(run.vsBase.ci95Pct),
                withinNoise: run.vsBase.withinNoise,
              },
            }),
          })),
        };
      },
    }),
    tool({
      name: 'list_rotations',
      title: 'List rotations',
      description:
        'The gcsim rotation library (ADR-0041): each rotation\'s id, name, status ("validated": reproduces a published config or the owner reviewed it; "draft": not reviewed yet), curated archetype, characters, source and the DPS of its last check on its reference builds.',
      run: () => services.listRotations(),
    }),
    tool({
      name: 'get_rotation',
      title: 'Get a rotation',
      description:
        'One rotation by id: its meta (slots, fight, source, validation) and its template, the gcsim action list with {{slot}} placeholders. Read one or two before drafting: they show the syntax that works.',
      input: { id: z.string().max(60) },
      run: ({ id }) => services.getRotation(id),
    }),
    tool({
      name: 'allocate_team',
      title: 'Share artifacts between characters',
      description:
        'Builds for several characters at once (up to 12) from the account\'s artifacts, no piece used twice: the joint answer to "build my Mualani team" when one-at-a-time optimize_build would hand the same pieces to two characters. Each member is a ConstraintSpec as optimize_build takes it (except objective "sim"), with an optional priority (lower picks first in the greedy start; their order otherwise) and weight (how much their build counts when two want the same pieces; by default by role: on-field DPS 2, off-field DPS 1.5, others 1). mode "exact" (default) is the best plan within each member\'s topM builds (default 20), proven by a branch and bound; "v1" a local search from the greedy pass; "greedy" the fastest, each member in turn over what is left. Returns per member the "understood" sentence, the build, and sharePct (their build as a percent of their best build alone, when nobody else wants a piece); the plan\'s score (the weighted mean share); the moves in order (who to equip with which piece, from whom, following the game\'s swaps) and how many pieces are already in place; and the farming list (meta-target gaps, shares below 100% with who holds the missing pieces, members without a build and why). Takes a search per member and, for exact, a top-M search per member: up to a minute or two on a large account.',
      input: {
        members: z
          .array(
            z
              .object({
                spec: ConstraintSpecSchema,
                priority: z.number().int().min(0).max(100).optional(),
                weight: z.number().positive().max(10).optional(),
              })
              .strict(),
          )
          .min(1)
          .max(12),
        mode: z.enum(['greedy', 'v1', 'exact']).optional(),
        topM: z.number().int().min(1).max(50).optional(),
      },
      run: async (args) => {
        const r = await services.allocate(args);
        const pct = (x: number) => r1(100 * x);
        return {
          mode: r.mode,
          ...(r.score && {
            planScorePct: Object.fromEntries(
              Object.entries(r.score).map(([k, v]) => [k, pct(v)]),
            ),
          }),
          ...(r.solver && { solver: r.solver }),
          members: r.members.map((m) => ({
            character: m.characterKey,
            understood: m.understood,
            weight: m.weight,
            ...(m.share !== undefined && { sharePct: pct(m.share) }),
            ...(m.status === 'ok'
              ? {
                  build: {
                    score: r1(m.build.score),
                    objectiveValue: r1(m.build.objectiveValue),
                    totals: round(m.build.totals),
                    artifacts: Object.fromEntries(
                      Object.entries(m.build.artifacts).map(([s, a]) => [
                        s,
                        compact(a),
                      ]),
                    ),
                  },
                }
              : { build: null }),
          })),
          moves: r.moves.moves.map((m) => m.text),
          piecesInPlace: r.moves.inPlace,
          farming: r.farming,
        };
      },
    }),
    tool({
      name: 'draft_rotation',
      title: 'Draft a rotation',
      description:
        'Draft a gcsim rotation for a team the owner has, when the library has none for it. The template is a gcsim action list with {{slot}} wherever a character acts ("{{raiden}} burst, attack:4, dash;"), as get_rotation shows; loops ("for let i = 0; i < 4; i = i + 1 { … }"), "if .{{x}}.burst.ready { … }" and fn are gcsim\'s own. The fight is KQM\'s standard: one target too big to die, so the run lasts as long as the action list, which must end (a for loop of 4 or 5 rotations, never while 1). It runs on the owner\'s equipped builds, which become its reference builds. It is saved only if it passes the library\'s checks and gcsim runs it cleanly; otherwise the problems come back (gcsim\'s own error message included) to fix and try again. It is always saved as a draft: only the owner can promote it, after reviewing it. Burst waits are filled with attacks unless energyWait is "idle". Never replaces a rotation that isn\'t an LLM draft.',
      input: DraftInput.shape,
      writes: true,
      run: (args) => services.draftRotation(args),
    }),
  ];
}
