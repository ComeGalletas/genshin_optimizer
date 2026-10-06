/**
 * What the server can answer, independent of how it is asked: the HTTP API
 * (ADR-0030) and the MCP tools (ADR-0031) both call these, so the two
 * surfaces can't disagree. Inputs arrive already parsed by the schemas in
 * `schemas.ts`; a problem the schema can't see (a key not in the account,
 * a weapon the character can't wield) is a `ServiceError` with an HTTP-style
 * status and a message naming it.
 * @packageDocumentation
 */

import type {
  Artifact,
  Objective,
  OptimizeRequest,
  Slot,
  StatVec,
} from '@genshin-build-lab/engine/game/types';
import { SLOTS } from '@genshin-build-lab/engine/game/types';
import {
  DISPLAY_NAMES,
  GAME_VERSION,
  GENSHIN_DB_VERSION,
  genshinAdapter,
} from '@genshin-build-lab/engine/game/genshin/adapter';
import {
  buildContext,
  passiveNotes,
} from '@genshin-build-lab/engine/optimizer/context';
import { sheetTotals } from '@genshin-build-lab/engine/optimizer/sheet';
import { ownedRefinement } from '@genshin-build-lab/engine/roster/refinement';
import {
  defaultConstraints,
  defaultObjective,
} from '@genshin-build-lab/engine/optimizer/defaults';
import { evaluateObjective } from '@genshin-build-lab/engine/optimizer/score';
import {
  currentAccount,
  currentRoster,
  diffSincePrevious,
  listMerges,
  loadSnapshot,
  mergeOrigins,
  mergeReports,
  listSnapshots,
  snapshotInfo,
  type Store,
} from '../store/store';
import { toGOODAccount } from '@genshin-build-lab/engine/good/export';
import { zeroOffElementGoblets } from '@genshin-build-lab/engine/optimizer/element';
import { SearchRunner, SearchTimeout } from '../optimize/pool';
import {
  draftRotation,
  type DraftInput,
  type RotationDeps,
} from '../sim/drafts';
import { loadRotation, RotationError, ROTATIONS_DIR } from '../sim/rotations';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseConstraintSpec,
  type ConstraintSpec,
  type SpecIssue,
} from '@genshin-build-lab/engine/constraints/spec';
import {
  specToRun,
  type SpecAccount,
  type SpecRun,
} from '@genshin-build-lab/engine/constraints/toRequest';
import { describeRun } from '@genshin-build-lab/engine/constraints/describe';
import {
  SIM_ITERATIONS,
  SIM_TOP_K,
} from '@genshin-build-lab/engine/constraints/spec';
import {
  simCharacterFromAccount,
  type SimAccount,
} from '@genshin-build-lab/engine/sim/account';
import { gcsimName } from '@genshin-build-lab/engine/sim/configgen';
import { rankBySim } from '@genshin-build-lab/engine/sim/rank';
import { setsInPlay, unsimulated } from '@genshin-build-lab/engine/sim/support';
import { GcsimError } from '../sim/gcsim';
import { TeamSimSpec } from '@genshin-build-lab/engine/sim/team';
import { describeIssues } from '@genshin-build-lab/engine/zodIssues';
import { simulateTeam, TeamSimError } from '../sim/teamsim';
import { SimPool, StoreSimCache } from '../sim/pool';
import {
  candidate,
  resolveSimTeam,
  simulateCandidates,
  type SimTeam,
} from '../sim/rerank';
import {
  emptySlotCause,
  unreachableMinStats,
} from '@genshin-build-lab/engine/optimizer/diagnostics';
import { statLabel } from '@genshin-build-lab/engine/labels-core';
import { translateRequest, translationCatalog } from '../llm/translate';
import type { LlmClient } from '../llm/client';
import type { OptimizeContext } from '@genshin-build-lab/engine/game/types';
import type {
  AllocateBody,
  ArtifactQuery,
  CompareBody,
  OptimizeBody,
} from './schemas';
import {
  allocateGreedy,
  memberFromRun,
  type AllocatedBuild,
  type AllocationMember,
  type RunOptimize,
} from '@genshin-build-lab/engine/plan/allocate';
import {
  allocateV1,
  type AllocationV1,
} from '@genshin-build-lab/engine/plan/improve';
import {
  allocateV2,
  type AllocationV2,
} from '@genshin-build-lab/engine/plan/exact';
import {
  planFarming,
  planMoves,
  planShare,
} from '@genshin-build-lab/engine/plan/output';

/** The most pieces a merge report lists per kind (counts are whole). */
export const MERGE_LIST_CAP = 100;

export class ServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Every problem, with where it is, when there are several (a spec). */
    readonly issues?: SpecIssue[],
  ) {
    super(message);
  }
}

/** Why no build fits a spec, as far as can be proven, with what to relax:
 *  a model that reads "infeasible" alone can only give up. */
function whyInfeasible(run: SpecRun, ctx: OptimizeContext): string[] {
  const pool = zeroOffElementGoblets(run.pool, run.request.characterKey);
  const empty = emptySlotCause(run.request, pool);
  if (empty)
    return [
      `${empty} Drop that main stat (mainStats {"slot": "any"}) or allow more pieces.`,
    ];
  const floors = unreachableMinStats(ctx, run.request, pool).map(
    (f) =>
      `${statLabel(f.key)} at least ${f.need} is out of reach: no build under these conditions can pass ${f.best.toFixed(1)}. Lower it, or relax the set or main stats.`,
  );
  return floors.length
    ? floors
    : [
        'No single condition is out of reach on its own; together they leave no build. Relax one at a time: the set (set {"kind": "any"}), a main stat (mainStats {"sands": "any"}), or a floor.',
      ];
}

/** A spec that failed its checks, as one error naming every problem. */
function invalidSpec(issues: SpecIssue[]): ServiceError {
  return new ServiceError(
    400,
    'invalid_spec',
    `the spec has ${issues.length === 1 ? 'a problem' : `${issues.length} problems`}: ${issues
      .map((i) => `${i.path}: ${i.message}`)
      .join('; ')}`,
    issues,
  );
}
const notFound = (m: string) => new ServiceError(404, 'not_found', m);
const badRequest = (m: string) => new ServiceError(400, 'bad_request', m);

/** Display names for the "not simulated" reasons. */

const count = <K extends string>(keys: K[]) => {
  const out = {} as Record<K, number>;
  for (const k of keys) out[k] = (out[k] ?? 0) + 1;
  return out;
};

export class Services {
  constructor(
    readonly db: Store,
    readonly searches: SearchRunner = new SearchRunner(),
    /** The rotation library, and gcsim to run simulations (TODO 5.7):
     *  given, or a function that looks for it, asked again on every request
     *  until it answers, so installing gcsim (`npm run sim:check`) while
     *  the server runs needs no restart. Without it simulating is refused,
     *  listing works. */
    readonly rotations: {
      dir?: string;
      deps?: RotationDeps | (() => RotationDeps | undefined);
    } = {},
  ) {}

  private foundDeps?: RotationDeps;

  /** gcsim, if it is installed (now or since the server started). */
  private get simDeps(): RotationDeps | undefined {
    const d = this.rotations.deps;
    if (typeof d !== 'function') return d;
    return (this.foundDeps ??= d());
  }

  health() {
    return {
      ok: true,
      genshinDbVersion: GENSHIN_DB_VERSION,
      gameVersion: GAME_VERSION,
    };
  }

  private artifacts(): Artifact[] {
    return currentAccount(this.db).map((m) => m.artifact);
  }

  private equippedBy(): Map<string, Artifact[]> {
    const by = new Map<string, Artifact[]>();
    for (const a of this.artifacts())
      if (a.location) by.set(a.location, [...(by.get(a.location) ?? []), a]);
    return by;
  }

  accountSummary() {
    const merge = listMerges(this.db).at(-1) ?? null;
    const artifacts = this.artifacts();
    const { snapshotId, roster, weapons } = currentRoster(this.db);
    return {
      merge,
      artifacts: {
        total: artifacts.length,
        bySlot: count(artifacts.map((a) => a.slot)),
        byRarity: count(artifacts.map((a) => String(a.rarity))),
        atPlus20: artifacts.filter((a) => a.level === 20).length,
        equipped: artifacts.filter((a) => a.location).length,
      },
      characters: Object.keys(roster).length,
      weapons: weapons.length,
      rosterFrom: snapshotId ?? null,
    };
  }

  /** The current account as one GOOD file (TODO 3.5): the merged
   *  artifacts with their locks, and the roster and weapons from the
   *  best-ranked snapshot, for the web app's GOOD import. */
  accountGood() {
    const merged = currentAccount(this.db);
    if (!listMerges(this.db).length)
      throw notFound(
        'no account imported yet: drop a GOOD file in imports/inbox/ and run npm run inbox',
      );
    const { roster, weapons } = currentRoster(this.db);
    // Each piece's unactivated line and source extras (first rolls, roll
    // count) from the snapshot its values came from, so the web app can
    // show the rolls (TODO 9.10).
    const snapshots = new Map<string, ReturnType<typeof loadSnapshot>>();
    const source = (m: (typeof merged)[number]) => {
      const at = m.seenIn.find((s) => s.snapshot === m.valuesFrom);
      if (!at) return undefined;
      let snap = snapshots.get(at.snapshot);
      if (!snap) {
        snap = loadSnapshot(this.db, Number(at.snapshot));
        snapshots.set(at.snapshot, snap);
      }
      return snap.pieces[at.index];
    };
    return toGOODAccount(
      {
        pieces: merged.map((m) => {
          const from = source(m);
          return {
            artifact: m.artifact,
            ...(m.lock !== undefined && { lock: m.lock }),
            ...(from?.unactivated && { unactivated: from.unactivated }),
            ...(from?.extras && { extras: from.extras }),
          };
        }),
        roster,
        weapons,
      },
      'genshin-build-lab',
    );
  }

  listCharacters(filter: { element?: string; weaponType?: string } = {}) {
    const { roster } = currentRoster(this.db);
    const equipped = this.equippedBy();
    return Object.entries(roster)
      .map(([key, entry]) => {
        const meta = genshinAdapter.character(key)!;
        return {
          ...meta,
          ...entry,
          equippedArtifacts: equipped.get(key)?.length ?? 0,
        };
      })
      .filter(
        (c) =>
          (!filter.element || c.element === filter.element) &&
          (!filter.weaponType || c.weaponType === filter.weaponType),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getCharacter(id: string) {
    const meta = genshinAdapter.character(id);
    if (!meta) throw notFound(`no character "${id}" in the dataset`);
    const current = currentRoster(this.db);
    const entry = current.roster[id];
    if (!entry) throw notFound(`${meta.name} is not in the account`);
    const equipped = this.equippedBy().get(id) ?? [];
    let stats: StatVec | null = null;
    let passives: string[] = [];
    let weaponRefinement: number | undefined;
    if (entry.weaponKey) {
      weaponRefinement = ownedRefinement(id, entry.weaponKey, current);
      const request: OptimizeRequest = {
        characterKey: id,
        weaponKey: entry.weaponKey,
        buildLevel: entry.buildLevel ?? 90,
        ...(weaponRefinement !== undefined && {
          refinement: weaponRefinement,
        }),
        constraints: {},
        objective: 'crit_value',
      };
      stats = sheetTotals(request, zeroOffElementGoblets(equipped, id)).totals;
      passives = passiveNotes(request, stats.er_pct);
    }
    return {
      ...meta,
      ...entry,
      ...(weaponRefinement !== undefined && { weaponRefinement }),
      equipped,
      /** Sheet totals with the equipped pieces, set bonuses and passives
       *  included, ER-derived passives at the build's own ER (percent stats
       *  in percent, ADR-0023, ADR-0042). */
      stats,
      /** What the weapon and character passives add, one line each. */
      passives,
      defaults: {
        objective: defaultObjective(id),
        constraints: defaultConstraints(id),
      },
    };
  }

  /** The character, weapon, refinement and build level a request resolves
   *  to. The refinement is the owner's copy's (ADR-0042) unless given. */
  private resolve(body: {
    characterKey: string;
    weaponKey?: string;
    refinement?: number;
    buildLevel?: number;
  }) {
    const character = genshinAdapter.character(body.characterKey)!;
    const current = currentRoster(this.db);
    const entry = current.roster[body.characterKey];
    const weaponKey = body.weaponKey ?? entry?.weaponKey;
    if (!weaponKey)
      throw badRequest(
        `no weapon for ${character.name}: none equipped in the account, so pass weaponKey`,
      );
    if (genshinAdapter.weapon(weaponKey)?.type !== character.weaponType)
      throw badRequest(
        `${character.name} can't wield ${genshinAdapter.weaponName(weaponKey)}`,
      );
    const buildLevel = (body.buildLevel ??
      entry?.buildLevel ??
      90) as OptimizeRequest['buildLevel'];
    const refinement =
      body.refinement ?? ownedRefinement(body.characterKey, weaponKey, current);
    return { character, weaponKey, buildLevel, refinement };
  }

  async optimize(body: OptimizeBody) {
    const { weaponKey, buildLevel, refinement } = this.resolve(body);
    const request: OptimizeRequest = {
      characterKey: body.characterKey,
      weaponKey,
      buildLevel,
      ...(refinement !== undefined && { refinement }),
      objective: (body.objective ??
        defaultObjective(body.characterKey)) as Objective,
      constraints: body.constraints ?? defaultConstraints(body.characterKey),
      topK: body.topK ?? 5,
    };
    let ctx;
    try {
      ctx = buildContext(request);
    } catch (e) {
      throw badRequest((e as Error).message);
    }
    const account = this.artifacts();
    const owned =
      body.pool === 'free'
        ? account.filter((a) => !a.location || a.location === body.characterKey)
        : account;
    return {
      request,
      pool: { kind: body.pool ?? 'all', artifacts: owned.length },
      passives: passiveNotes(request),
      ...(await this.search(request, owned, ctx)),
    };
  }

  /** The account as a spec sees it: roster and every artifact. */
  private specAccount(): SpecAccount {
    const { roster, weapons } = currentRoster(this.db);
    return { roster, weapons, artifacts: this.artifacts() };
  }

  /** Check a spec and map it onto the account, without running it: the
   *  spec, the run and the "I understood" summary (TODO 4.3). Any problem,
   *  in the spec or against the account, is one `invalid_spec` error naming
   *  them all. */
  checkSpec(
    input: unknown,
    topK?: number,
  ): {
    spec: ConstraintSpec;
    run: SpecRun;
    understood: ReturnType<typeof describeRun>;
    /** With `objective: "sim"`: the rotation and teammates (TODO 5.8). */
    simTeam?: SimTeam;
    /** Why a "sim" spec runs as the stat search alone (TODO 5.9). */
    notSimulated?: string[];
  } {
    const parsed = parseConstraintSpec(input);
    if (!parsed.ok) throw invalidSpec(parsed.issues);
    let spec = parsed.spec;
    let simTeam: SimTeam | undefined;
    let notSimulated: string[] = [];
    if (spec.objective === 'sim') {
      // A character gcsim lacks runs as the stat search, labelled (5.9):
      // there is no rotation to find for them.
      notSimulated = unsimulated(
        { characters: [spec.character], weapons: [] },
        DISPLAY_NAMES,
      );
      if (!notSimulated.length) {
        const resolved = resolveSimTeam(
          spec.character,
          spec.sim?.rotation,
          this.simAccount(),
          this.rotationsDir,
        );
        if (!resolved.ok) throw invalidSpec(resolved.issues);
        simTeam = resolved.team;
        const mates = Object.values(simTeam.teammates);
        notSimulated = unsimulated(
          {
            characters: mates.map((c) => c.key),
            weapons: mates.map((c) => c.weapon.key),
            sets: mates.flatMap((c) => setsInPlay(c.artifacts)),
          },
          DISPLAY_NAMES,
        );
        // A candidate never takes a teammate's pieces, unless asked to.
        if (spec.keepEquippedOn === undefined)
          spec = { ...spec, keepEquippedOn: mates.map((c) => c.key) };
      }
    }
    const isSim = spec.objective === 'sim';
    const mapped = specToRun(spec, this.specAccount(), {
      topK: isSim ? (spec.sim?.topK ?? SIM_TOP_K) : (topK ?? 5),
    });
    if (!mapped.ok) throw invalidSpec(mapped.issues);
    if (isSim && !notSimulated.length)
      notSimulated = unsimulated(
        { characters: [], weapons: [mapped.run.request.weaponKey] },
        DISPLAY_NAMES,
      );
    return {
      spec,
      run: mapped.run,
      understood: describeRun(
        spec,
        mapped.run,
        isSim
          ? {
              rotation: simTeam
                ? `${simTeam.rotation.meta.name}${simTeam.rotation.meta.status === 'draft' ? ' (a draft rotation)' : ''}`
                : '',
              teammates: Object.values(simTeam?.teammates ?? {}).map((c) =>
                genshinAdapter.characterName(c.key),
              ),
              ...(notSimulated.length && { notSimulated }),
            }
          : undefined,
      ),
      ...(simTeam && !notSimulated.length && { simTeam }),
      ...(notSimulated.length && { notSimulated }),
    };
  }

  /** A request in words, as a checked spec and its "I understood"
   *  summary (TODO 4.3), without running it. The model sees the spec checks
   *  and the account mapping, so it can fix what either finds. */
  async translateSpec(client: LlmClient, text: string) {
    const t = await translateRequest(
      client,
      text,
      translationCatalog(this.rotationsDir),
      (input) => {
        try {
          return { ok: true, value: this.checkSpec(input) };
        } catch (e) {
          if (e instanceof ServiceError && e.issues)
            return { ok: false, issues: e.issues };
          throw e;
        }
      },
    );
    if (!t.ok)
      throw new ServiceError(
        422,
        'not_understood',
        `${client.model} couldn't turn the request into a valid spec in ${t.attempts} tries: ${t.issues
          .map((i) => `${i.path}: ${i.message}`)
          .join('; ')}`,
        t.issues,
      );
    return {
      understood: t.value.understood.text,
      conditions: t.value.understood.conditions,
      spec: t.value.spec,
      attempts: t.attempts,
      model: client.model,
    };
  }

  /** Run a spec (TODO 4.3): checked, mapped, summarised, searched. */
  async runSpec(input: unknown, topK?: number) {
    const { spec, run, understood, simTeam, notSimulated } = this.checkSpec(
      input,
      topK,
    );
    if (simTeam) return this.runSim(spec, run, understood.text, simTeam);
    let ctx;
    try {
      ctx = buildContext(run.request, run.extras);
    } catch (e) {
      throw badRequest((e as Error).message);
    }
    const result = await this.search(run.request, run.pool, ctx);
    return {
      understood: understood.text,
      spec,
      request: run.request,
      pool: { artifacts: run.pool.length },
      passives: passiveNotes(run.request),
      ...result,
      ...(result.status === 'infeasible' && {
        why: whyInfeasible(run, ctx),
      }),
      // "sim" asked, stat search given: say why (5.9).
      ...(notSimulated && { notSimulated }),
    };
  }

  /** Share the account's artifacts out between characters (TODO 7.4,
   *  ADR-0048): each member's spec checked and mapped as a single search's,
   *  then the greedy pass, v1 or v2 (the default), and the plan's output:
   *  builds, each member's share of their best alone, the moves from what
   *  each piece is on now, and the farming list. */
  async allocate(body: AllocateBody) {
    const issues: SpecIssue[] = [];
    const members: AllocationMember[] = [];
    const understood: Record<string, string> = {};
    const seen = new Set<string>();
    for (const [i, m] of body.members.entries()) {
      const at = (path: string) => `members.${i}.${path}`;
      const objective = (m.spec as { objective?: unknown } | null)?.objective;
      if (objective === 'sim') {
        issues.push({
          path: at('objective'),
          message:
            'an allocation ranks builds by a stat objective; "sim" re-ranks one character\'s builds (optimize_build). Use the stat objective the sim would re-rank, e.g. avg_damage or crit_value.',
        });
        continue;
      }
      let checked;
      try {
        checked = this.checkSpec(m.spec, 1);
      } catch (e) {
        if (!(e instanceof ServiceError && e.issues)) throw e;
        issues.push(...e.issues.map((x) => ({ ...x, path: at(x.path) })));
        continue;
      }
      const key = checked.run.request.characterKey;
      if (seen.has(key)) {
        issues.push({
          path: at('character'),
          message: `${genshinAdapter.characterName(key)} is in the allocation twice; one spec per character.`,
        });
        continue;
      }
      seen.add(key);
      understood[key] = checked.understood.text;
      members.push(
        memberFromRun(checked.run, {
          priority: m.priority ?? i,
          ...(m.weight !== undefined && { weight: m.weight }),
        }),
      );
    }
    if (issues.length) throw invalidSpec(issues);

    const run: RunOptimize = async (req, inv, extras) => {
      try {
        return await this.searches.run(
          req,
          zeroOffElementGoblets(inv, req.characterKey),
          buildContext(req, extras),
        );
      } catch (e) {
        if (e instanceof SearchTimeout)
          throw new ServiceError(
            504,
            'timeout',
            `${genshinAdapter.characterName(req.characterKey)}'s search: ${e.message}`,
          );
        throw e;
      }
    };
    const inventory = this.artifacts();
    const mode = body.mode ?? 'exact';
    const t0 = performance.now();
    const r: Pick<AllocationV1, 'builds'> &
      Partial<Omit<AllocationV1, 'score'>> & {
        score?: AllocationV1['score'] & { exact?: number };
        solver?: AllocationV2['solver'];
      } =
      mode === 'greedy'
        ? await allocateGreedy(members, inventory, run)
        : mode === 'v1'
          ? await allocateV1(members, inventory, run)
          : await allocateV2(members, inventory, run, {
              ...(body.topM !== undefined && { topM: body.topM }),
            });
    const ms = Math.round(performance.now() - t0);
    const solo =
      r.solo && r.soloPieces
        ? { solo: r.solo, soloPieces: r.soloPieces }
        : undefined;
    const byId = new Map(inventory.map((a) => [a.id, a]));
    const memberOf = new Map(members.map((m) => [m.characterKey, m]));
    const show = (b: AllocatedBuild) => {
      const m = memberOf.get(b.characterKey)!;
      const best = b.result.status === 'ok' ? b.result.builds[0] : null;
      const share = planShare(b, solo?.solo[b.characterKey]);
      return {
        characterKey: b.characterKey,
        understood: understood[b.characterKey],
        // What the build was searched with (weapon, level, conditions), for
        // a client that shows it as a single search's (8.2).
        request: m.request,
        priority: m.priority,
        weight: m.weight,
        objective: b.objective,
        ...(share !== null && { share }),
        ...(best
          ? {
              status: 'ok' as const,
              build: {
                ...best,
                artifacts: Object.fromEntries(
                  SLOTS.map((s: Slot) => [s, byId.get(best.artifactIds[s])!]),
                ) as Record<Slot, Artifact>,
              },
            }
          : { status: 'no_build' as const }),
        // The greedy pass's notes, true of its plan only.
        ...(mode === 'greedy' &&
          b.conflicts.length && { conflicts: b.conflicts }),
      };
    };
    return {
      mode,
      ms,
      ...(r.score && { score: r.score }),
      ...(r.solver && { solver: r.solver }),
      ...(r.moves && { improvements: r.moves }),
      members: r.builds.map(show),
      moves: planMoves(r.builds, inventory),
      farming: planFarming(members, r.builds, inventory, solo),
    };
  }

  /** One exact search over `owned`, on the worker thread, its builds shown
   *  with each piece as it is. */
  private async search(
    request: OptimizeRequest,
    owned: Artifact[],
    ctx: OptimizeContext,
  ) {
    // An off-element goblet's DMG% counts for nothing (ADR-0014); the
    // builds still show each piece as it is.
    const pool = zeroOffElementGoblets(owned, request.characterKey);
    const t0 = performance.now();
    let result;
    try {
      result = await this.searches.run(request, pool, ctx);
    } catch (e) {
      if (e instanceof SearchTimeout)
        throw new ServiceError(504, 'timeout', e.message);
      throw e;
    }
    const byId = new Map(owned.map((a) => [a.id, a]));
    return {
      ms: Math.round(performance.now() - t0),
      ...(result.status === 'ok'
        ? {
            status: 'ok' as const,
            explored: result.explored,
            pruned: result.pruned,
            builds: result.builds.map((b) => ({
              ...b,
              artifacts: Object.fromEntries(
                SLOTS.map((s: Slot) => [s, byId.get(b.artifactIds[s])!]),
              ) as Record<Slot, Artifact>,
            })),
          }
        : result),
    };
  }

  /** Artifacts in the current account matching every filter given. */
  queryArtifacts(q: ArtifactQuery) {
    const matches = currentAccount(this.db).filter(
      ({ artifact: a, lock }) =>
        (!q.setKey || a.setKey === q.setKey) &&
        (!q.slot || a.slot === q.slot) &&
        (!q.mainStat || a.mainStat === q.mainStat) &&
        (q.minLevel === undefined || a.level >= q.minLevel) &&
        (q.maxLevel === undefined || a.level <= q.maxLevel) &&
        (q.locked === undefined || lock === q.locked) &&
        (q.location === undefined ||
          (q.location === ''
            ? !a.location
            : q.location === '*'
              ? !!a.location
              : a.location === q.location)) &&
        Object.entries(q.minSubstats ?? {}).every(
          ([k, min]) =>
            (a.subStats.find((s) => s.key === k)?.value ?? 0) >= min!,
        ),
    );
    const limit = q.limit ?? 30;
    return {
      total: matches.length,
      artifacts: matches
        .slice(0, limit)
        .map(({ artifact, lock }) => ({ ...artifact, lock: lock ?? null })),
      truncated: matches.length > limit,
    };
  }

  /** Two builds for one character, side by side: sheet totals, the
   *  objective's value for each, and the difference (b − a). */
  compareBuilds(body: CompareBody) {
    const { weaponKey, buildLevel, refinement } = this.resolve(body);
    const objective = (body.objective ??
      defaultObjective(body.characterKey)) as Objective;
    const request: OptimizeRequest = {
      characterKey: body.characterKey,
      weaponKey,
      buildLevel,
      ...(refinement !== undefined && { refinement }),
      constraints: {},
      objective,
    };
    const byId = new Map(this.artifacts().map((a) => [a.id, a]));
    const pieces = (ids: string[], name: string) => {
      const out = ids.map((id) => {
        const a = byId.get(id);
        if (!a)
          throw notFound(
            `build ${name}: no artifact "${id}" in the current account`,
          );
        return a;
      });
      const slots = out.map((a) => a.slot);
      if (new Set(slots).size !== slots.length)
        throw badRequest(`build ${name} has two pieces for one slot`);
      return out;
    };
    const side = (ids: string[], name: string) => {
      const build = pieces(ids, name);
      // Two concrete builds, so each is its sheet: ER-derived passives at
      // its own ER (ADR-0042).
      const { ctx, totals: t } = sheetTotals(
        request,
        zeroOffElementGoblets(build, body.characterKey),
      );
      return {
        artifacts: build,
        totals: t,
        objectiveValue: evaluateObjective(ctx, objective, t),
      };
    };
    const a = side(body.a, 'a');
    const b = side(body.b, 'b');
    const keys = new Set([...Object.keys(a.totals), ...Object.keys(b.totals)]);
    const diff: StatVec = {};
    for (const k of keys) {
      const d =
        (b.totals[k as keyof StatVec] ?? 0) -
        (a.totals[k as keyof StatVec] ?? 0);
      if (Math.abs(d) > 1e-9) diff[k as keyof StatVec] = d;
    }
    return {
      characterKey: body.characterKey,
      weaponKey,
      buildLevel,
      ...(refinement !== undefined && { refinement }),
      objective,
      a,
      b,
      diff,
      objectiveDiff: b.objectiveValue - a.objectiveValue,
    };
  }

  imports() {
    return { snapshots: listSnapshots(this.db), merges: listMerges(this.db) };
  }

  /** What a snapshot changed since the previous one of its kind, with
   *  the pieces each change names (TODO 8.1): `pieces.before` from the
   *  earlier snapshot, `pieces.after` from this one, by position. */
  changes(snapshotId: number) {
    snapshotInfo(this.db, snapshotId); // StoreError (404) when missing
    const c = diffSincePrevious(this.db, snapshotId);
    if (!c) return { changes: null };
    const d = c.diff;
    const pick = (snapshot: number, at: (number | undefined)[]) => {
      const pieces = loadSnapshot(this.db, snapshot).pieces;
      return Object.fromEntries(
        at
          .filter((i): i is number => i !== undefined)
          .map((i) => [i, pieces[i].artifact]),
      ) as Record<number, Artifact>;
    };
    const pairs = [...d.upgraded, ...d.moved, ...d.lockChanged];
    return {
      changes: {
        ...c,
        pieces: {
          before: pick(c.from, [
            ...d.removed,
            ...pairs.map((x) => x.before),
            ...d.unexplained.map((x) => x.before),
          ]),
          after: pick(c.to, [
            ...d.added,
            ...pairs.map((x) => x.after),
            ...d.unexplained.map((x) => x.after),
          ]),
        },
      },
    };
  }

  /** A merge's reconciliation reports with their pieces (TODO 8.1): per
   *  snapshot merged after the first, how its pieces paired with the
   *  account merged before it, and the pieces behind each mismatch, move
   *  and unpaired piece, each list up to `MERGE_LIST_CAP`. An account
   *  piece is shown as first read. */
  mergeReport(mergeId: number) {
    const merge = listMerges(this.db).find((m) => m.id === mergeId);
    if (!merge) throw notFound(`no merge ${mergeId}`);
    const origins = mergeOrigins(this.db, mergeId);
    const loaded = new Map<string, Artifact[]>();
    const piece = (snapshot: string, i: number) => {
      let pieces = loaded.get(snapshot);
      if (!pieces) {
        pieces = loadSnapshot(this.db, Number(snapshot)).pieces.map(
          (p) => p.artifact,
        );
        loaded.set(snapshot, pieces);
      }
      return pieces[i];
    };
    const account = (a: number) => piece(origins[a].snapshot, origins[a].index);
    const cap = <T>(xs: T[]) => xs.slice(0, MERGE_LIST_CAP);
    return {
      merge,
      listCap: MERGE_LIST_CAP,
      reports: mergeReports(this.db, mergeId).map(
        ({ snapshot, against, report: r }) => {
          const kinds = { exact: 0, fuzzy: 0, levelled: 0 };
          for (const p of r.pairs) kinds[p.kind]++;
          return {
            snapshot: Number(snapshot),
            against: against.map(Number),
            counts: {
              paired: r.pairs.length,
              ...kinds,
              mismatches: r.mismatches.length,
              moved: r.moved.length,
              onlySnapshot: r.onlyB.length,
              onlyAccount: r.onlyA.length,
            },
            mismatches: cap(r.mismatches).map((m) => ({
              account: account(m.a),
              snapshot: piece(snapshot, m.b),
              stats: m.stats,
            })),
            moved: cap(r.moved).map((m) => ({
              account: account(m.a),
              snapshot: piece(snapshot, m.b),
            })),
            onlySnapshot: cap(r.onlyB).map((b) => piece(snapshot, b)),
            onlyAccount: cap(r.onlyA).map(account),
          };
        },
      ),
    };
  }

  /** The latest import at a glance: the current merge (and what it
   *  rejected), and what the newest usable snapshot changed. */
  importReport() {
    const snapshots = listSnapshots(this.db);
    const merge = listMerges(this.db).at(-1) ?? null;
    const newest = [...snapshots].reverse().find((s) => !s.fault);
    const changes = newest
      ? (diffSincePrevious(this.db, newest.id) ?? null)
      : null;
    return {
      snapshots: snapshots.length,
      faultyScans: snapshots
        .filter((s) => s.fault)
        .map((s) => ({
          id: s.id,
          fileName: s.fileName,
          fault: s.fault,
        })),
      merge,
      newestSnapshot: newest ?? null,
      changes: changes && {
        from: changes.from,
        to: changes.to,
        added: changes.diff.added.length,
        removed: changes.diff.removed.length,
        upgraded: changes.diff.upgraded.length,
        moved: changes.diff.moved.length,
        lockChanged: changes.diff.lockChanged.length,
        unexplained: changes.diff.unexplained,
        unchanged: changes.diff.unchanged,
      },
    };
  }

  private get rotationsDir() {
    return this.rotations.dir ?? ROTATIONS_DIR;
  }

  /** The rotation library at a glance; a rotation that fails its checks
   *  is listed with why, not dropped. */
  listRotations() {
    const dir = this.rotationsDir;
    const ids = existsSync(dir)
      ? readdirSync(dir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name)
          .sort()
      : [];
    // Whether the owner can field each slot (the rotation browser, 8.2).
    const owned = new Set(Object.keys(currentRoster(this.db).roster));
    return {
      rotations: ids.map((id) => {
        try {
          const { meta } = loadRotation(id, dir);
          const missing = meta.slots
            .filter((s) => !s.characters.some((c) => owned.has(c)))
            .map((s) => s.characters.join(' or '));
          return {
            id,
            name: meta.name,
            status: meta.status,
            archetype: meta.archetype,
            characters: meta.slots.map((s) => s.characters.join(' or ')),
            source: meta.source.kind,
            ...(meta.validation && {
              dps: meta.validation.dps,
              gcsim: meta.validation.gcsim,
            }),
            reviewed: !!meta.review,
            summary: meta.summary,
            sourceTitle: meta.source.title,
            ...(meta.source.url && { sourceUrl: meta.source.url }),
            ...(meta.source.publishedDps !== undefined && {
              publishedDps: meta.source.publishedDps,
            }),
            ...(meta.validation?.offPct !== undefined && {
              offPct: meta.validation.offPct,
            }),
            ...(owned.size > 0 && { missing }),
          };
        } catch (e) {
          if (e instanceof RotationError) return { id, problems: e.issues };
          throw e;
        }
      }),
    };
  }

  /** One rotation: its meta and template (an example to draft from). */
  getRotation(id: string) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id))
      throw badRequest(`"${id}" is not a rotation id`);
    if (!existsSync(join(this.rotationsDir, id, 'meta.json')))
      throw notFound(`no rotation "${id}"`);
    try {
      const r = loadRotation(id, this.rotationsDir);
      return { meta: r.meta, template: r.template };
    } catch (e) {
      if (e instanceof RotationError)
        throw new ServiceError(422, 'invalid_rotation', e.message);
      throw e;
    }
  }

  /** The account as gcsim needs it: roster, weapons, artifacts. */
  private simAccount(): SimAccount {
    const { roster, weapons } = currentRoster(this.db);
    return { roster, weapons, artifacts: this.artifacts() };
  }

  private pool?: SimPool;

  /** `objective: "sim"` (TODO 5.8): the search's top builds, each
   *  simulated in the team rotation, ranked by mean team DPS. */
  private async runSim(
    spec: ConstraintSpec,
    run: SpecRun,
    understood: string,
    team: SimTeam,
  ) {
    const deps = this.simDeps;
    if (!deps)
      throw new ServiceError(
        503,
        'gcsim_unavailable',
        'gcsim is not installed here: run npm run sim:check (or choose a stat objective)',
      );
    let ctx;
    try {
      ctx = buildContext(run.request, run.extras);
    } catch (e) {
      throw badRequest((e as Error).message);
    }
    const head = {
      understood,
      spec,
      request: run.request,
      pool: { artifacts: run.pool.length },
      passives: passiveNotes(run.request),
    };
    const searched = await this.search(run.request, run.pool, ctx);
    if (searched.status !== 'ok')
      return {
        ...head,
        ...searched,
        ...(searched.status === 'infeasible' && {
          why: whyInfeasible(run, ctx),
        }),
      };
    const base = simCharacterFromAccount(this.simAccount(), spec.character);
    if ('problem' in base) throw badRequest(base.problem);
    const iterations = spec.sim?.iterations ?? SIM_ITERATIONS;
    this.pool ??= new SimPool(deps.runner, deps.commit ?? deps.gcsim, {
      cache: new StoreSimCache(this.db),
    });
    // A build wearing 2+ pieces of a set gcsim lacks can't run: it is left
    // out of the ranking and named, the others still run (5.9).
    const candidates = searched.builds.map((b, i) => ({
      build: b,
      statRank: i + 1,
      character: candidate(base, run.request, Object.values(b.artifacts)),
    }));
    const skipped = candidates
      .map((c) => ({
        statRank: c.statRank,
        reasons: unsimulated(
          {
            characters: [],
            weapons: [],
            sets: setsInPlay(c.character.artifacts),
          },
          DISPLAY_NAMES,
        ),
      }))
      .filter((c) => c.reasons.length);
    const runnable = candidates.filter(
      (c) => !skipped.some((s) => s.statRank === c.statRank),
    );
    const t0 = performance.now();
    let runs;
    try {
      runs = await simulateCandidates(
        team,
        runnable.map((c) => c.character),
        this.pool,
        iterations,
      );
    } catch (e) {
      if (!(e instanceof GcsimError)) throw e;
      return {
        ...head,
        ...searched,
        notSimulated: [`gcsim refused the team: ${e.message}`],
      };
    }
    const { meta } = team.rotation;
    const sim = {
      rotation: { id: meta.id, name: meta.name, status: meta.status },
      teammates: Object.values(team.teammates).map((c) => ({
        key: c.key,
        weapon: c.weapon.key,
        artifacts: c.artifacts.length,
      })),
      iterations,
      burstWaits: 'filled with attacks' as const,
      cachedRuns: runs.filter((r) => r.cached).length,
      ms: Math.round(performance.now() - t0),
    };
    const incomplete = [...new Set(runs.flatMap((r) => r.result.incomplete))];
    if (incomplete.length)
      return {
        ...head,
        ...searched,
        notSimulated: [
          `gcsim ${deps.gcsim} implements ${incomplete.join(', ')} only partly`,
        ],
      };
    const name = gcsimName(spec.character);
    const ranked = rankBySim(
      runnable.map((c, i) => ({
        item: { build: c.build, result: runs[i].result },
        statRank: c.statRank,
        dps: { ...runs[i].result.dps, iterations: runs[i].result.iterations },
      })),
    );
    return {
      ...head,
      status: 'ok' as const,
      ms: searched.ms,
      explored: searched.explored,
      pruned: searched.pruned,
      sim,
      ...(skipped.length && { skipped }),
      builds: ranked.map((r) => {
        const own = r.item.result.characters.find((c) => c.name === name);
        return {
          ...r.item.build,
          rank: r.rank,
          statRank: r.statRank,
          teamDps: { mean: r.mean, sd: r.sd, ci95: r.ci95 },
          behindPct: r.behindPct,
          tiedWithBest: r.tiedWithBest,
          ...(own && {
            characterDps: { mean: own.dps.mean, share: own.share },
          }),
          fightSec: r.item.result.durationSec,
          warnings: r.item.result.warnings,
        };
      }),
    };
  }

  /** A team in a library rotation as the owner has it, and up to five
   *  variants, simulated side by side and compared (TODO 6.1). */
  async simulateTeam(input: unknown) {
    const parsed = TeamSimSpec.safeParse(input);
    if (!parsed.success) {
      const issues = describeIssues(parsed.error.issues, '');
      throw new ServiceError(
        400,
        'invalid_request',
        `the request has ${issues.length === 1 ? 'a problem' : `${issues.length} problems`}: ${issues
          .map((i) => `${i.path || 'request'}: ${i.message}`)
          .join('; ')}`,
        issues,
      );
    }
    const deps = this.simDeps;
    if (!deps)
      throw new ServiceError(
        503,
        'gcsim_unavailable',
        'gcsim is not installed here: run npm run sim:check',
      );
    this.pool ??= new SimPool(deps.runner, deps.commit ?? deps.gcsim, {
      cache: new StoreSimCache(this.db),
    });
    const t0 = performance.now();
    try {
      const r = await simulateTeam(parsed.data, {
        account: this.simAccount(),
        dir: this.rotationsDir,
        pool: this.pool,
        gcsim: deps.gcsim,
        bestBuild: async (character, weapon, conditions, keepOn) => {
          try {
            const run = await this.runSpec(
              { character, weapon, ...conditions, keepEquippedOn: keepOn },
              1,
            );
            if (run.status === 'ok' && 'builds' in run && run.builds.length)
              return Object.values(run.builds[0].artifacts);
            return {
              problem:
                run.status === 'infeasible'
                  ? 'no build fits those conditions'
                  : `the search ended ${run.status}`,
            };
          } catch (e) {
            if (e instanceof ServiceError) return { problem: e.message };
            throw e;
          }
        },
      });
      return { ...r, ms: Math.round(performance.now() - t0) };
    } catch (e) {
      if (e instanceof TeamSimError)
        throw new ServiceError(400, 'invalid_team', e.message, e.issues);
      throw e;
    }
  }

  /** Draft a rotation for characters the owner has (TODO 5.7): saved only
   *  as a draft, and only once gcsim runs it cleanly on their builds. */
  async draftRotation(input: DraftInput) {
    const deps = this.simDeps;
    if (!deps)
      throw new ServiceError(
        503,
        'gcsim_unavailable',
        'gcsim is not installed here: run npm run sim:check',
      );
    return draftRotation(input, this.simAccount(), {
      ...deps,
      dir: this.rotationsDir,
    });
  }
}
