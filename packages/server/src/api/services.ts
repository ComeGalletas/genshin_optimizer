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
import { buildContext } from '@genshin-build-lab/engine/optimizer/context';
import {
  defaultConstraints,
  defaultObjective,
} from '@genshin-build-lab/engine/optimizer/defaults';
import {
  evaluateObjective,
  totals,
} from '@genshin-build-lab/engine/optimizer/score';
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
import { SearchRunner, SearchTimeout } from '../optimize/pool';
import type { ArtifactQuery, CompareBody, OptimizeBody } from './schemas';

export class ServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
const notFound = (m: string) => new ServiceError(404, 'not_found', m);
const badRequest = (m: string) => new ServiceError(400, 'bad_request', m);

const count = <K extends string>(keys: K[]) => {
  const out = {} as Record<K, number>;
  for (const k of keys) out[k] = (out[k] ?? 0) + 1;
  return out;
};

export class Services {
  constructor(
    readonly db: Store,
    readonly searches: SearchRunner = new SearchRunner(),
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
    const entry = currentRoster(this.db).roster[id];
    if (!entry) throw notFound(`${meta.name} is not in the account`);
    const equipped = this.equippedBy().get(id) ?? [];
    let stats: StatVec | null = null;
    if (entry.weaponKey)
      stats = totals(
        buildContext({
          characterKey: id,
          weaponKey: entry.weaponKey,
          buildLevel: entry.buildLevel ?? 90,
          constraints: {},
          objective: 'crit_value',
        }),
        equipped,
      );
    return {
      ...meta,
      ...entry,
      equipped,
      /** Sheet totals with the equipped pieces, set bonuses included
       *  (percent stats in percent, ADR-0023). */
      stats,
      defaults: {
        objective: defaultObjective(id),
        constraints: defaultConstraints(id),
      },
    };
  }

  /** The character, weapon and build level a request resolves to. */
  private resolve(body: {
    characterKey: string;
    weaponKey?: string;
    buildLevel?: number;
  }) {
    const character = genshinAdapter.character(body.characterKey)!;
    const entry = currentRoster(this.db).roster[body.characterKey];
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
    return { character, weaponKey, buildLevel };
  }

  async optimize(body: OptimizeBody) {
    const { weaponKey, buildLevel } = this.resolve(body);
    const request: OptimizeRequest = {
      characterKey: body.characterKey,
      weaponKey,
      buildLevel,
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
    const pool =
      body.pool === 'free'
        ? account.filter((a) => !a.location || a.location === body.characterKey)
        : account;
    const t0 = performance.now();
    let result;
    try {
      result = await this.searches.run(request, pool, ctx);
    } catch (e) {
      if (e instanceof SearchTimeout)
        throw new ServiceError(504, 'timeout', e.message);
      throw e;
    }
    const byId = new Map(pool.map((a) => [a.id, a]));
    return {
      request,
      pool: { kind: body.pool ?? 'all', artifacts: pool.length },
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
    const { weaponKey, buildLevel } = this.resolve(body);
    const objective = (body.objective ??
      defaultObjective(body.characterKey)) as Objective;
    const ctx = buildContext({
      characterKey: body.characterKey,
      weaponKey,
      buildLevel,
      constraints: {},
      objective,
    });
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
      const t = totals(ctx, build);
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
}
