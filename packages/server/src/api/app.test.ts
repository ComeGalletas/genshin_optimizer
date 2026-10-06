import { readFileSync } from 'node:fs';
import { normalizeGOOD } from '@genshin-build-lab/engine/good/normalize';
import {
  currentAccount,
  currentRoster,
  importGood,
  openStore,
  recordMerge,
  type Store,
} from '../store/store';
import { buildApp } from './app';

const SAMPLE = readFileSync(
  new URL(
    '../../../engine/src/import/__fixtures__/sample-account.good.json',
    import.meta.url,
  ),
  'utf8',
);
const H = { host: 'localhost:5198' };

let db: Store;
let app: ReturnType<typeof buildApp>;
beforeEach(() => {
  db = openStore(':memory:');
  importGood(db, { text: SAMPLE });
  recordMerge(db, [1]);
  app = buildApp({ db });
});
afterEach(() => app.close());

const get = (url: string, headers: Record<string, string> = H) =>
  app.inject({ method: 'GET', url, headers });
const post = (url: string, payload: object, headers = H) =>
  app.inject({ method: 'POST', url, headers, payload });

describe('localhost only', () => {
  it('refuses a non-local Host (DNS rebinding) and a non-local Origin', async () => {
    expect((await get('/health', { host: 'evil.example' })).statusCode).toBe(
      403,
    );
    const r = await get('/health', { ...H, origin: 'https://evil.example' });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ error: 'forbidden' });
  });

  it('answers a local page, with CORS for it', async () => {
    const origin = 'http://localhost:5199';
    const r = await get('/health', { ...H, origin });
    expect(r.statusCode).toBe(200);
    expect(r.headers['access-control-allow-origin']).toBe(origin);
    const pre = await app.inject({
      method: 'OPTIONS',
      url: '/optimize',
      headers: { ...H, origin },
    });
    expect(pre.statusCode).toBe(204);
    expect(pre.headers['access-control-allow-methods']).toMatch(/POST/);
    expect(
      (await get('/health')).headers['access-control-allow-origin'],
    ).toBeUndefined();
  });
});

describe('account and characters', () => {
  it('summarises the current account', async () => {
    const r = await get('/account');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      merge: { id: 1, snapshotIds: [1], artifacts: 20 },
      artifacts: { total: 20 },
      characters: 8,
      weapons: 8,
      rosterFrom: 1,
    });
  });

  it('returns the account as a GOOD file the web import reads back', async () => {
    const r = await get('/account/good');
    expect(r.statusCode).toBe(200);
    const good = normalizeGOOD(r.json())!;
    expect(good.issues).toEqual([]);
    expect(good.source).toBe('genshin-build-lab');
    expect(good.artifacts).toHaveLength(20);
    const { roster, weapons } = currentRoster(db);
    expect(good.roster).toEqual(roster);
    expect(good.weapons.map((w) => w.key)).toEqual(weapons.map((w) => w.key));
    // The merged pieces, lock flags included.
    const merged = currentAccount(db);
    expect(good.artifacts!.map((e) => [e.artifact.setKey, e.lock])).toEqual(
      merged.map((m) => [m.artifact.setKey, m.lock]),
    );
    // Nothing imported yet: a 404 that says what to do.
    const empty = buildApp({ db: openStore(':memory:') });
    const none = await empty.inject({
      method: 'GET',
      url: '/account/good',
      headers: H,
    });
    expect(none.statusCode).toBe(404);
    expect(none.json().message).toMatch(/imports\/inbox/);
    await empty.close();
  });

  it('lists characters and shows one with its equipped stats', async () => {
    const list = (await get('/characters')).json() as { key: string }[];
    expect(list).toHaveLength(8);
    const r = await get('/characters/neuvillette');
    expect(r.statusCode).toBe(200);
    const c = r.json();
    expect(c).toMatchObject({ key: 'neuvillette', name: 'Neuvillette' });
    expect(c.stats.hp).toBeGreaterThan(0);
    expect(c.defaults.objective).toBeDefined();
  });

  it('counts the weapon and character passives in a character’s sheet (ADR-0042)', async () => {
    const n = (await get('/characters/neuvillette')).json();
    expect(n.weaponRefinement).toBe(1);
    expect(n.passives).toEqual([
      expect.stringMatching(/^Tome of the Eternal Flow R1 passive: \+16% HP%/),
    ]);
    // Raiden's own passive, resolved at her sheet's own ER.
    const r = (await get('/characters/raiden_shogun')).json();
    const er = Math.round(r.stats.er_pct * 100) / 100;
    expect(r.passives.at(-1)).toMatch(/^Raiden Shogun’s passive: \+/);
    expect(r.passives.at(-1)).toContain(`counted at ${er}% Energy Recharge`);
  });

  it('404s an unknown or unowned character', async () => {
    expect((await get('/characters/nobody')).json()).toMatchObject({
      error: 'not_found',
      message: expect.stringMatching(/in the dataset/),
    });
    expect((await get('/characters/diluc')).json().message).toMatch(
      /not in the account/,
    );
  });
});

describe('off-element goblets (ADR-0014)', () => {
  it('count for nothing in compare, optimize and character totals', async () => {
    const goblets = (
      await post('/artifacts/query', {
        slot: 'goblet',
        mainStat: 'elemental_dmg',
      })
    ).json().artifacts as {
      id: string;
      element: string;
      mainStatValue: number;
    }[];
    const hydro = goblets.find((g) => g.element === 'hydro')!;
    const electro = goblets.find((g) => g.element === 'electro')!;
    // Furina is Hydro: the Electro goblet's 46.6% is dead weight.
    const c = (
      await post('/compare', {
        characterKey: 'furina',
        objective: 'elemental_dmg',
        a: [hydro.id],
        b: [electro.id],
      })
    ).json();
    expect(c.a.totals.elemental_dmg).toBeCloseTo(hydro.mainStatValue, 1);
    expect(c.b.totals.elemental_dmg ?? 0).toBe(0);
    // The piece itself is shown as it is.
    expect(c.b.artifacts[0].mainStatValue).toBe(electro.mainStatValue);

    const o = (
      await post('/optimize', {
        characterKey: 'furina',
        objective: 'elemental_dmg',
        constraints: {},
      })
    ).json();
    expect(o.builds[0].artifacts.goblet.element).toBe('hydro');

    // Raiden wears the Electro goblet; Xiangling (Pyro) would get nothing
    // from it, and her own sheet counts her own Pyro goblet.
    const x = (await get('/characters/xiangling')).json();
    const own = x.equipped.find((a: { slot: string }) => a.slot === 'goblet');
    expect(own.element).toBe('pyro');
    expect(x.stats.elemental_dmg).toBeGreaterThanOrEqual(
      own.mainStatValue - 0.05,
    );
  });
});

describe('/optimize', () => {
  it('fills defaults from the roster and meta, and resolves the pieces', async () => {
    const r = await post('/optimize', { characterKey: 'neuvillette', topK: 2 });
    expect(r.statusCode).toBe(200);
    const b = r.json();
    expect(b.request).toMatchObject({
      characterKey: 'neuvillette',
      weaponKey: 'tome_of_the_eternal_flow',
      refinement: 1, // the owner's copy (ADR-0042)
      buildLevel: 90,
    });
    expect(b.passives).toEqual([
      expect.stringMatching(/^Tome of the Eternal Flow R1 passive/),
    ]);
    expect(b.status).toBe('ok');
    expect(Object.keys(b.builds[0].artifacts).sort()).toEqual([
      'circlet',
      'flower',
      'goblet',
      'plume',
      'sands',
    ]);
  });

  it('validates keys, stats and weapon types', async () => {
    const bad = async (body: object) => (await post('/optimize', body)).json();
    expect(await bad({ characterKey: 'nobody' })).toMatchObject({
      error: 'bad_request',
      message: 'characterKey: unknown character',
    });
    expect(
      (
        await bad({
          characterKey: 'neuvillette',
          constraints: { minStats: { er: 1 } },
        })
      ).message,
    ).toMatch(/minStats/);
    expect(
      (
        await bad({
          characterKey: 'neuvillette',
          weaponKey: "wolf's_gravestone",
        })
      ).message,
    ).toMatch(/can't wield/);
    expect((await bad({ characterKey: 'neuvillette', extra: 1 })).error).toBe(
      'bad_request',
    );
  });

  it('stops a search that runs past its limit, then recovers', async () => {
    await app.close();
    app = buildApp({ db, searchLimitMs: 1 });
    const r = await post('/optimize', { characterKey: 'neuvillette' });
    expect(r.statusCode).toBe(504);
    expect(r.json().error).toBe('timeout');
    await app.close();
    app = buildApp({ db });
    expect(
      (await post('/optimize', { characterKey: 'neuvillette' })).statusCode,
    ).toBe(200);
  });
});

describe('imports and later phases', () => {
  it('lists snapshots and merges, and each snapshot’s changes', async () => {
    const r = (await get('/imports')).json();
    expect(r.snapshots).toHaveLength(1);
    expect(r.merges).toHaveLength(1);
    expect((await get('/imports/1/changes')).json()).toEqual({ changes: null });
    expect((await get('/imports/9/changes')).statusCode).toBe(404);
  });

  it('answers 501 for allocation until its phase', async () => {
    expect((await post('/allocate', {})).statusCode).toBe(501);
    expect((await get('/nope')).statusCode).toBe(404);
  });
});

describe('rotations and team comparisons (TODO 6.2)', () => {
  // No gcsim here, wherever the tests run: the routes, not the simulator.
  beforeEach(async () => {
    await app.close();
    app = buildApp({ db, rotations: {} });
  });

  it('lists the library and serves one rotation', async () => {
    const list = (await get('/rotations')).json();
    expect(list.rotations.map((r: { id: string }) => r.id)).toContain(
      'raiden-national',
    );
    const one = (await get('/rotations/raiden-national')).json();
    expect(one.template).toMatch(/\{\{raiden\}\} skill;/);
    expect((await get('/rotations/nothing-here')).statusCode).toBe(404);
  });

  it('checks a team comparison, and says when gcsim is missing', async () => {
    const bad = await post('/sim/team', {
      rotation: 'raiden-national',
      variants: [{ label: 'x', bogus: 1 }],
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({
      error: 'invalid_request',
      issues: [{ path: 'variants.0.bogus', message: 'unknown field' }],
    });
    const none = await post('/sim/team', { rotation: 'raiden-national' });
    expect(none.statusCode).toBe(503);
    expect(none.json().message).toMatch(/npm run sim:check/);
  });
});

describe('queries, comparisons and MCP over HTTP', () => {
  it('queries artifacts and compares builds', async () => {
    const q = (
      await post('/artifacts/query', { slot: 'sands', limit: 1 })
    ).json();
    expect(q.artifacts).toHaveLength(1);
    expect(q.total).toBeGreaterThanOrEqual(1);
    const ids = (await get('/characters/neuvillette'))
      .json()
      .equipped.map((a: { id: string }) => a.id);
    const c = (
      await post('/compare', { characterKey: 'neuvillette', a: ids, b: ids })
    ).json();
    expect(c.objectiveDiff).toBe(0);
    expect(c.diff).toEqual({});
    expect(
      (
        await post('/compare', {
          characterKey: 'neuvillette',
          a: ids,
          b: [ids[0], ids[0]],
        })
      ).statusCode,
    ).toBe(400);
    expect((await get('/imports/report')).json()).toMatchObject({
      snapshots: 1,
      faultyScans: [],
    });
  });

  it('serves MCP at /mcp behind the same localhost guard', async () => {
    const rpc = (headers: Record<string, string>) =>
      app.inject({
        method: 'POST',
        url: '/mcp',
        headers: {
          ...headers,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        payload: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      });
    const r = await rpc(H);
    expect(r.statusCode).toBe(200);
    expect(r.json().result.tools.length).toBe(11);
    expect((await rpc({ host: 'evil.example' })).statusCode).toBe(403);
    expect((await get('/mcp')).statusCode).toBe(405);
  });
});
