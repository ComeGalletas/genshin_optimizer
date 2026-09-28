/**
 * The local HTTP API (TODO 3.1, ADR-0030): the engine and the snapshot store
 * over JSON, for the web app (3.5) and anything else on this machine.
 *
 * Localhost only (ADR-0021): the server listens on 127.0.0.1, and every
 * request must name a localhost Host (so a web page can't reach it through
 * DNS rebinding) and, if it comes from a browser, a localhost Origin. Errors
 * are `{ error, message, issues? }` with a matching status code.
 * @packageDocumentation
 */

import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import * as z from 'zod';
import type {
  Artifact,
  OptimizeRequest,
  Slot,
} from '@genshin-build-lab/engine/game/types';
import { SLOTS } from '@genshin-build-lab/engine/game/types';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import { buildContext } from '@genshin-build-lab/engine/optimizer/context';
import {
  defaultConstraints,
  defaultObjective,
} from '@genshin-build-lab/engine/optimizer/defaults';
import { totals } from '@genshin-build-lab/engine/optimizer/score';
import {
  GAME_VERSION,
  GENSHIN_DB_VERSION,
} from '@genshin-build-lab/engine/game/genshin/adapter';
import {
  currentAccount,
  currentRoster,
  diffSincePrevious,
  listMerges,
  listSnapshots,
  snapshotInfo,
  StoreError,
  type Store,
} from '../store/store';
import { DEFAULT_INBOX, processInbox } from '../inbox/inbox';
import { IdParam, OptimizeBody, SnapshotParam } from './schemas';
import { SearchRunner, SearchTimeout } from '../optimize/pool';

export interface AppOptions {
  db: Store;
  inboxDir?: string;
  /** Fastify's logger; off by default (tests), on for `npm run server`. */
  logger?: boolean;
  /** Time limit for one exact search (default 120 s). */
  searchLimitMs?: number;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** The hostname part of a Host header or an Origin URL, lowercased. */
function hostnameOf(value: string, isOrigin: boolean): string | undefined {
  try {
    return new URL(isOrigin ? value : `http://${value}`).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function fail(
  reply: FastifyReply,
  status: number,
  error: string,
  message: string,
  issues?: unknown,
) {
  return reply
    .code(status)
    .send({ error, message, ...(issues !== undefined && { issues }) });
}

/** Parse with a schema, or answer 400 naming each problem. */
function parse<T>(
  schema: z.ZodType<T>,
  value: unknown,
  reply: FastifyReply,
): T | undefined {
  const r = schema.safeParse(value);
  if (r.success) return r.data;
  fail(
    reply,
    400,
    'bad_request',
    r.error.issues
      .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
      .join('; '),
    r.error.issues.map((i) => ({ path: i.path, message: i.message })),
  );
  return undefined;
}

export function buildApp(opts: AppOptions): FastifyInstance {
  const { db } = opts;
  const inboxDir = opts.inboxDir ?? DEFAULT_INBOX;
  const app = Fastify({ logger: opts.logger ?? false });
  const searches = new SearchRunner(opts.searchLimitMs);
  app.addHook('onClose', () => searches.close());

  // ---- localhost guard and CORS -----------------------------------------
  app.addHook('onRequest', async (req, reply) => {
    const host = hostnameOf(req.headers.host ?? '', false);
    if (!host || !LOCAL_HOSTS.has(host))
      return fail(
        reply,
        403,
        'forbidden',
        'this server only answers localhost',
      );
    const origin = req.headers.origin;
    if (origin !== undefined) {
      const o = hostnameOf(origin, true);
      if (!o || !LOCAL_HOSTS.has(o))
        return fail(reply, 403, 'forbidden', `origin ${origin} is not local`);
      reply
        .header('Access-Control-Allow-Origin', origin)
        .header('Vary', 'Origin');
      if (req.method === 'OPTIONS')
        return reply
          .header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
          .header('Access-Control-Allow-Headers', 'Content-Type')
          .code(204)
          .send();
    }
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof StoreError)
      return fail(reply, 404, 'not_found', err.message);
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status < 500)
      return fail(reply, status, 'bad_request', (err as Error).message);
    app.log.error(err);
    return fail(reply, 500, 'internal', 'the server hit an error; see its log');
  });
  app.setNotFoundHandler((req, reply) =>
    fail(reply, 404, 'not_found', `no route ${req.method} ${req.url}`),
  );

  // ---- health ------------------------------------------------------------
  app.get('/health', async () => ({
    ok: true,
    genshinDbVersion: GENSHIN_DB_VERSION,
    gameVersion: GAME_VERSION,
  }));

  // ---- account -----------------------------------------------------------
  app.get('/account', async () => {
    const merges = listMerges(db);
    const latest = merges.at(-1);
    const artifacts = currentAccount(db);
    const { snapshotId, roster, weapons } = currentRoster(db);
    const count = <K extends string>(keys: K[]) => {
      const out = {} as Record<K, number>;
      for (const k of keys) out[k] = (out[k] ?? 0) + 1;
      return out;
    };
    return {
      merge: latest ?? null,
      artifacts: {
        total: artifacts.length,
        bySlot: count(artifacts.map((a) => a.artifact.slot)),
        byRarity: count(artifacts.map((a) => String(a.artifact.rarity))),
        atPlus20: artifacts.filter((a) => a.artifact.level === 20).length,
        equipped: artifacts.filter((a) => a.artifact.location).length,
      },
      characters: Object.keys(roster).length,
      weapons: weapons.length,
      rosterFrom: snapshotId ?? null,
    };
  });

  // ---- characters ----------------------------------------------------------
  const equippedBy = (artifacts: { artifact: Artifact }[]) => {
    const by = new Map<string, Artifact[]>();
    for (const { artifact } of artifacts)
      if (artifact.location)
        by.set(artifact.location, [
          ...(by.get(artifact.location) ?? []),
          artifact,
        ]);
    return by;
  };

  app.get('/characters', async () => {
    const { roster } = currentRoster(db);
    const equipped = equippedBy(currentAccount(db));
    return Object.entries(roster)
      .map(([key, entry]) => ({
        key,
        name: genshinAdapter.characterName(key),
        ...entry,
        equippedArtifacts: equipped.get(key)?.length ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  app.get('/characters/:id', async (req, reply) => {
    const p = parse(IdParam, req.params, reply);
    if (!p) return;
    const meta = genshinAdapter.character(p.id);
    if (!meta)
      return fail(
        reply,
        404,
        'not_found',
        `no character "${p.id}" in the dataset`,
      );
    const entry = currentRoster(db).roster[p.id];
    if (!entry)
      return fail(
        reply,
        404,
        'not_found',
        `${meta.name} is not in the account`,
      );
    const equipped = equippedBy(currentAccount(db)).get(p.id) ?? [];
    let stats = null;
    if (entry.weaponKey) {
      const ctx = buildContext({
        characterKey: p.id,
        weaponKey: entry.weaponKey,
        buildLevel: entry.buildLevel ?? 90,
        constraints: {},
        objective: 'crit_value',
      });
      stats = totals(ctx, equipped);
    }
    return {
      ...meta, // key, name, element, weaponType
      ...entry,
      equipped,
      /** Sheet totals with the equipped pieces, set bonuses included
       *  (percent stats in percent, ADR-0023). */
      stats,
      defaults: {
        objective: defaultObjective(p.id),
        constraints: defaultConstraints(p.id),
      },
    };
  });

  // ---- optimize ------------------------------------------------------------
  app.post('/optimize', async (req, reply) => {
    const body = parse(OptimizeBody, req.body, reply);
    if (!body) return;
    const entry = currentRoster(db).roster[body.characterKey];
    const weaponKey = body.weaponKey ?? entry?.weaponKey;
    if (!weaponKey)
      return fail(
        reply,
        400,
        'bad_request',
        `no weapon for ${body.characterKey}: none equipped in the account, so pass weaponKey`,
      );
    const character = genshinAdapter.character(body.characterKey)!;
    if (genshinAdapter.weapon(weaponKey)?.type !== character.weaponType)
      return fail(
        reply,
        400,
        'bad_request',
        `${character.name} can't wield ${genshinAdapter.weapon(weaponKey)?.name ?? weaponKey}`,
      );
    const request: OptimizeRequest = {
      characterKey: body.characterKey,
      weaponKey,
      buildLevel: (body.buildLevel ??
        entry?.buildLevel ??
        90) as OptimizeRequest['buildLevel'],
      objective: (body.objective ??
        defaultObjective(body.characterKey)) as OptimizeRequest['objective'],
      constraints: body.constraints ?? defaultConstraints(body.characterKey),
      topK: body.topK ?? 5,
    };
    let ctx;
    try {
      ctx = buildContext(request);
    } catch (e) {
      return fail(reply, 400, 'bad_request', (e as Error).message);
    }
    const account = currentAccount(db).map((m) => m.artifact);
    const pool =
      body.pool === 'free'
        ? account.filter((a) => !a.location || a.location === body.characterKey)
        : account;
    const t0 = performance.now();
    let result;
    try {
      result = await searches.run(request, pool, ctx);
    } catch (e) {
      if (e instanceof SearchTimeout)
        return fail(reply, 504, 'timeout', e.message);
      throw e;
    }
    const ms = Math.round(performance.now() - t0);
    const byId = new Map(pool.map((a) => [a.id, a]));
    return {
      request,
      pool: { kind: body.pool ?? 'all', artifacts: pool.length },
      ms,
      ...(result.status === 'ok'
        ? {
            status: 'ok',
            explored: result.explored,
            pruned: result.pruned,
            builds: result.builds.map((b) => ({
              ...b,
              artifacts: Object.fromEntries(
                SLOTS.map((s: Slot) => [s, byId.get(b.artifactIds[s])]),
              ),
            })),
          }
        : result),
    };
  });

  // ---- later phases ----------------------------------------------------------
  app.post('/allocate', async (_req, reply) =>
    fail(
      reply,
      501,
      'not_implemented',
      'account-wide allocation comes in Phase 7',
    ),
  );
  app.post('/sim', async (_req, reply) =>
    fail(reply, 501, 'not_implemented', 'gcsim simulation comes in Phase 5'),
  );

  // ---- imports ---------------------------------------------------------------
  app.get('/imports', async () => ({
    snapshots: listSnapshots(db),
    merges: listMerges(db),
  }));
  app.get('/imports/:id/changes', async (req, reply) => {
    const p = parse(SnapshotParam, req.params, reply);
    if (!p) return;
    snapshotInfo(db, p.id); // 404 when missing
    return { changes: diffSincePrevious(db, p.id) ?? null };
  });
  app.post('/imports/scan', async () => processInbox(db, inboxDir));

  return app;
}
