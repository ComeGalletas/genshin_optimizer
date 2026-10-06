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
import type { ArtifactQuery, CompareBody, OptimizeBody } from './schemas';

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
const SIM_NAMES = {
  character: (k: string) => genshinAdapter.character(k)?.name ?? k,
  weapon: (k: string) => genshinAdapter.weapon(k)?.name ?? k,
  set: (k: string) => genshinAdapter.sets().find((s) => s.key === k)?.name ?? k,
};

const count = <K extends string>(keys: K[]) => {
  const out = {} as Record<K, number>;
  for (const k of keys) out[k] = (out[k] ?? 0) + 1;
  return out;
};

export class Services {
  constructor(
    readonly db: Store,
    readonly searches: SearchRunner = new SearchRunner(),
    /** The rotation library, and gcsim to run drafts (TODO 5.7); without
     *  `deps` (gcsim not installed) drafting is refused, listing works. */
    readonly rotations: { dir?: string; deps?: RotationDeps } = {},
  ) {}

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
    return toGOODAccount(
      {
        pieces: merged.map((m) => ({
          artifact: m.artifact,
          ...(m.lock !== undefined && { lock: m.lock }),
        })),
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
        `${character.name} can't wield ${genshinAdapter.weapon(weaponKey)?.name ?? weaponKey}`,
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
        SIM_NAMES,
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
          SIM_NAMES,
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
        SIM_NAMES,
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
              teammates: Object.values(simTeam?.teammates ?? {}).map(
                (c) => genshinAdapter.character(c.key)?.name ?? c.key,
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

  changes(snapshotId: number) {
    snapshotInfo(this.db, snapshotId); // StoreError (404) when missing
    return { changes: diffSincePrevious(this.db, snapshotId) ?? null };
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
    return {
      rotations: ids.map((id) => {
        try {
          const { meta } = loadRotation(id, dir);
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
    const deps = this.rotations.deps;
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
          SIM_NAMES,
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

  /** Draft a rotation for characters the owner has (TODO 5.7): saved only
   *  as a draft, and only once gcsim runs it cleanly on their builds. */
  async draftRotation(input: DraftInput) {
    const deps = this.rotations.deps;
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
