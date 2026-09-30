/**
 * The account tools (TODO 3.2, ADR-0031; shared with the chat in 3.6,
 * ADR-0035): each one a name, a description, a zod input shape and a body
 * over `Services`. The MCP server registers them, and the chat loop offers
 * the same list to the configured model, so the two surfaces can't drift.
 *
 * Results are compact JSON objects (stats rounded to one decimal,
 * artifacts as set/slot/level/main/substats): a model reads every token of
 * them. Tools for later phases (`simulate_team`, `allocate_team`) are added
 * when they exist, not before: a tool that always fails wastes a turn.
 * @packageDocumentation
 */

import * as z from 'zod';
import type { Artifact, StatVec } from '@genshin-build-lab/engine/game/types';
import { ELEMENTS, WEAPON_TYPES } from '@genshin-build-lab/engine/game/types';
import type { Services } from '../api/services';
import { ArtifactQuery, CompareBody, OptimizeBody } from '../api/schemas';

export const TOOL_INSTRUCTIONS = `Tools over the owner's own Genshin Impact account: imported artifacts, characters and weapons, an exact build optimizer, and import history.
- Every number you give the owner must come from a tool result. If a tool fails, say so; never estimate.
- Stats are in percent where the game shows percent (crit_rate 62.3 means 62.3%). Stat keys: hp, hp_pct, atk, atk_pct, def, def_pct, em, er_pct, crit_rate, crit_dmg, elemental_dmg, physical_dmg, healing.
- Character, weapon and set keys are dataset keys (furina, splendor_of_tranquil_waters, GoldenTroupe); list_characters and get_character show them.
- optimize_build is exact and can take tens of seconds on a large account; narrow it (a set requirement, main stats, or pool "free") when you can.`;

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
  run: (args: never) => ToolResult | Promise<ToolResult>;
}

/** Types a tool's `run` from its own input shape. */
function tool<S extends z.ZodRawShape = Record<never, never>>(def: {
  name: string;
  title: string;
  description: string;
  input?: S;
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
        'One owned character by dataset key (lowercase, e.g. furina, raiden_shogun, kaedehara_kazuha): profile, equipped weapon and artifacts, the sheet totals those give (set bonuses included), and the default optimizer objective and constraints for them.',
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
        'Exact best builds for a character from the account\'s artifacts. Only characterKey is required: the weapon defaults to the equipped one, the objective and constraints to the character\'s curated targets. constraints (setRequirement, minStats like {"er_pct": 180}, mainStatLocks, critRatioTarget) replaces the defaults entirely when given: to add a condition (an ER floor, say) and keep the curated set and main stats, call get_character first and pass its defaults.constraints with your addition merged in. Leave objective out unless the owner asks for a different one. pool "free" uses only unequipped pieces plus the character\'s own. Returns the top builds with totals, the objective value and binding constraints.',
      input: OptimizeBody.shape,
      run: async (args) => {
        const r = await services.optimize(args);
        if (r.status !== 'ok') return r;
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
  ];
}
