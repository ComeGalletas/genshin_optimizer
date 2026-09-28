/**
 * The MCP server (TODO 3.2, ADR-0031): the account, the optimizer and the
 * import history as tools for Claude Desktop, Claude Code or any MCP
 * client. The tools call the same `Services` as the HTTP API, and their
 * inputs are the API's zod schemas, so both surfaces accept and answer the
 * same things.
 *
 * Tool results are compact JSON (stats rounded to one decimal, artifacts
 * as set/slot/level/main/substats): a model reads every token of them.
 * Tools for later phases (`simulate_team`, `allocate_team`) are registered
 * when they exist, not before: a tool that always fails wastes a turn.
 * @packageDocumentation
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod';
import type { Artifact, StatVec } from '@genshin-build-lab/engine/game/types';
import { ServiceError, type Services } from '../api/services';
import { ArtifactQuery, CompareBody, OptimizeBody } from '../api/schemas';

export const MCP_INSTRUCTIONS = `Tools over the owner's own Genshin Impact account: imported artifacts, characters and weapons, an exact build optimizer, and import history.
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

/** MCP's structured content must be a JSON object, never an array or a
 *  scalar; every tool returns one. */
function ok(value: Record<string, unknown>): CallToolResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('a tool result must be a JSON object');
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

/** Run a tool body; a ServiceError is a tool error the model can read and
 *  act on, anything else is the SDK's problem to report. */
async function run(
  body: () => Record<string, unknown> | Promise<Record<string, unknown>>,
): Promise<CallToolResult> {
  try {
    return ok(await body());
  } catch (e) {
    if (e instanceof ServiceError)
      return {
        isError: true,
        content: [{ type: 'text', text: `${e.code}: ${e.message}` }],
      };
    throw e;
  }
}

const readOnly = { readOnlyHint: true, openWorldHint: false } as const;

export function createMcpServer(services: Services, version = '0.0.0') {
  const server = new McpServer(
    { name: 'genshin-build-lab', version },
    { instructions: MCP_INSTRUCTIONS },
  );

  server.registerTool(
    'get_account_summary',
    {
      title: 'Account summary',
      description:
        'What the current account holds: artifact counts (by slot, rarity, +20, equipped), characters, weapons, and which import it comes from.',
      annotations: readOnly,
    },
    () => run(() => services.accountSummary()),
  );

  server.registerTool(
    'list_characters',
    {
      title: 'List characters',
      description:
        'The owned characters: key, name, element, weapon type, level, constellation, talents, equipped weapon and how many artifacts they wear. Optional filters by element or weapon type.',
      inputSchema: {
        element: z.string().max(20).optional(),
        weaponType: z.string().max(20).optional(),
      },
      annotations: readOnly,
    },
    (args) =>
      run(() => ({
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
      })),
  );

  server.registerTool(
    'get_character',
    {
      title: 'Get a character',
      description:
        'One owned character: profile, equipped weapon and artifacts, the sheet totals those give (set bonuses included), and the default optimizer objective and constraints for them.',
      inputSchema: { characterKey: z.string().max(64) },
      annotations: readOnly,
    },
    ({ characterKey }) =>
      run(() => {
        const c = services.getCharacter(characterKey);
        return {
          ...c,
          equipped: c.equipped.map(compact),
          stats: c.stats && round(c.stats),
        };
      }),
  );

  server.registerTool(
    'query_artifacts',
    {
      title: 'Query artifacts',
      description:
        'Artifacts in the current account matching every filter given: set, slot, main stat, substat floors (e.g. {"crit_rate": 7}), level range, who wears them (a character key, "" for unequipped, "*" for anyone) and lock. Returns up to `limit` (default 30, max 200) and the total.',
      inputSchema: ArtifactQuery.shape,
      annotations: readOnly,
    },
    (args) =>
      run(() => {
        const r = services.queryArtifacts(args);
        return { ...r, artifacts: r.artifacts.map(compact) };
      }),
  );

  server.registerTool(
    'optimize_build',
    {
      title: 'Optimize a build',
      description:
        'Exact best builds for a character from the account\'s artifacts. Only characterKey is required: the weapon defaults to the equipped one, the objective and constraints to the character\'s curated targets. constraints (setRequirement, minStats like {"er_pct": 180}, mainStatLocks, critRatioTarget) replaces the defaults when given. pool "free" uses only unequipped pieces plus the character\'s own. Returns the top builds with totals, the objective value and binding constraints.',
      inputSchema: OptimizeBody.shape,
      annotations: readOnly,
    },
    (args) =>
      run(async () => {
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
      }),
  );

  server.registerTool(
    'compare_builds',
    {
      title: 'Compare two builds',
      description:
        'Two builds for one character side by side: sheet totals, the objective value of each, and the difference (b − a). Builds are lists of artifact ids from the account (as other tools return them), one per slot.',
      inputSchema: CompareBody.shape,
      annotations: readOnly,
    },
    (args) =>
      run(() => {
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
      }),
  );

  server.registerTool(
    'get_import_report',
    {
      title: 'Import report',
      description:
        "The latest import at a glance: how many snapshots, faulty scans left out, the current merge, and what the newest import changed (new, gone, upgraded, moved, lock changes, and anything it couldn't explain).",
      annotations: readOnly,
    },
    () => run(() => services.importReport()),
  );

  return server;
}
