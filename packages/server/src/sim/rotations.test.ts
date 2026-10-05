import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeGOOD } from '@genshin-build-lab/engine/good/normalize';
import { loadSampleGOOD } from '@genshin-build-lab/engine/test-fixtures/sampleAccount';
import type { SimCharacter } from '@genshin-build-lab/engine/sim/configgen';
import { rotationConfig } from '@genshin-build-lab/engine/sim/rotation';
import { gcsimPath, loadGcsimTool } from './gcsim';
import { SimRunner } from './runner';
import {
  loadRotation,
  loadRotations,
  RotationError,
  ROTATIONS_DIR,
} from './rotations';

describe('the rotation library (TODO 5.6)', () => {
  const library = loadRotations();
  const tool = loadGcsimTool();

  it('covers the five seed teams (TODO 5.0, Mualani as the owner plays her)', () => {
    expect(library.map((r) => r.meta.id)).toEqual([
      'ayaka-freeze',
      'mualani-burn-vape',
      'nahida-aggravate',
      'raiden-national',
      'skirk-mono-cryo',
    ]);
  });

  it('validated rotations reproduce a published config with the pinned gcsim; adapted ones stay drafts', () => {
    for (const { meta } of library) {
      if (meta.status === 'validated') {
        expect(meta.source.kind).toBe('community');
        expect(meta.validation?.gcsim).toBe(tool.version);
        expect(Math.abs(meta.validation!.offPct!)).toBeLessThanOrEqual(2);
      } else expect(meta.source.kind).toBe('adapted');
    }
    expect(
      library
        .filter((r) => r.meta.status === 'validated')
        .map((r) => r.meta.id),
    ).toEqual([
      'ayaka-freeze',
      'mualani-burn-vape',
      'raiden-national',
      'skirk-mono-cryo',
    ]);
    // Published rotations keep their authors' idle burst waits.
    for (const { meta } of library)
      if (meta.source.kind === 'community')
        expect(meta.energyWait ?? 'idle', meta.id).toBe('idle');
  });

  it('each renders on its reference builds, against a target that outlasts its actions', () => {
    for (const r of library) {
      const c = rotationConfig(r, 'reference', { iterations: 10 });
      expect(c).toMatch(/^target [^\n]*\bhp=\d+;$/m);
      expect(c).not.toMatch(/\{\{|\}\}/);
      for (const s of r.meta.slots)
        expect(c).toMatch(
          new RegExp(`^${s.characters[0].replace(/_/g, '')} char `, 'm'),
        );
    }
  });
});

describe('loadRotation refuses a broken rotation, with its reasons', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotations-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const copy = (id: string, edit: (meta: Record<string, unknown>) => void) => {
    const good = loadRotation('raiden-national');
    const meta = structuredClone(good.meta) as Record<string, unknown>;
    edit(meta);
    mkdirSync(join(dir, id));
    writeFileSync(join(dir, id, 'meta.json'), JSON.stringify(meta));
    writeFileSync(join(dir, id, 'rotation.gcsl.tmpl'), good.template);
    return join(dir, id);
  };

  it('a copy of a good one loads', () => {
    copy('raiden-national', () => {});
    expect(loadRotations(dir)).toHaveLength(1);
  });

  it('every issue at once, then the folder name', () => {
    copy('raiden-national', (m) => {
      m.active = 'kazuha';
      m.archetype = 'raiden-international';
    });
    expect(() => loadRotation('raiden-national', dir)).toThrow(
      new RotationError('raiden-national', [
        'archetype "raiden-international" is not a curated archetype',
        'active slot "kazuha" is not a slot',
      ]),
    );
    copy('national', () => {});
    expect(() => loadRotation('national', dir)).toThrow(
      'meta.id "raiden-national" is not its folder\'s name',
    );
  });

  it('missing or unreadable files', () => {
    const at = copy('raiden-national', () => {});
    writeFileSync(join(at, 'meta.json'), '{ "id": ');
    expect(() => loadRotation('raiden-national', dir)).toThrow(
      /rotation raiden-national: meta\.json: /,
    );
    rmSync(join(at, 'meta.json'));
    expect(() => loadRotation('raiden-national', dir)).toThrow('no meta.json');
    copy('ayaka-freeze', (m) => (m.id = 'ayaka-freeze'));
    rmSync(join(dir, 'ayaka-freeze', 'rotation.gcsl.tmpl'));
    expect(() => loadRotation('ayaka-freeze', dir)).toThrow(
      'no rotation.gcsl.tmpl',
    );
  });

  it('reads the library from the repository by default', () => {
    expect(
      existsSync(join(ROTATIONS_DIR, 'raiden-national', 'meta.json')),
    ).toBe(true);
  });
});

// Runs only where `npm run sim:check` installed the pinned binary.
const installed = (() => {
  try {
    const p = gcsimPath(loadGcsimTool());
    return existsSync(p) ? p : undefined;
  } catch {
    return undefined;
  }
})();

describe.skipIf(!installed)('the library over the installed gcsim', () => {
  const runner = () => new SimRunner(installed!, { timeoutMs: 120_000 });

  it('every rotation runs cleanly on its reference builds; community ones land within 2% of the published DPS', async () => {
    for (const r of loadRotations()) {
      const s = await runner().run(
        rotationConfig(r, 'reference', { iterations: 300 }),
      );
      expect(s.incomplete, r.meta.id).toEqual([]);
      // The fight lasts as long as the action list: the target outlives it.
      expect(s.mode, r.meta.id).toBe('damage');
      expect(s.durationSec, r.meta.id).toBeGreaterThan(60);
      const published = r.meta.source.publishedDps;
      if (published)
        expect(
          Math.abs(s.dps.mean - published) / published,
          r.meta.id,
        ).toBeLessThan(0.02);
    }
  }, 120_000);

  it('runs a rotation on our own characters: the sample account’s Raiden, Xiangling and Bennett', async () => {
    const good = normalizeGOOD(loadSampleGOOD())!;
    const ours = (key: string): SimCharacter => {
      const weapon = good.weapons.find((w) => w.location === key);
      return {
        key,
        level: 90,
        maxLevel: 90,
        constellation: good.roster[key]?.constellation ?? 0,
        talents: good.roster[key]?.talents ?? { auto: 9, skill: 9, burst: 9 },
        weapon: weapon
          ? {
              key: weapon.key,
              level: 90,
              maxLevel: 90,
              refinement: weapon.refinement ?? 1,
            }
          : { key: 'favonius_warbow', level: 90, maxLevel: 90, refinement: 1 },
        artifacts: (good.artifacts ?? [])
          .map((e) => e.artifact)
          .filter((a) => a.location === key),
      };
    };
    // The sample has no Yelan: she joins with a weapon and no artifacts.
    const team = {
      raiden: ours('raiden_shogun'),
      xiangling: ours('xiangling'),
      yelan: ours('yelan'),
      bennett: ours('bennett'),
    };
    const national = loadRotation('raiden-national');
    const s = await runner().run(
      rotationConfig(national, team, { iterations: 100 }),
    );
    expect(s.incomplete).toEqual([]);
    expect(s.characters.map((c) => c.name)).toEqual([
      'raidenshogun',
      'xiangling',
      'yelan',
      'bennett',
    ]);
    expect(s.characters.every((c) => c.dps.mean > 0)).toBe(true);
    // The sample's Xiangling (122% ER, beside a Bennett with no artifacts)
    // can't afford her burst each rotation. Against a target that outlasts
    // the actions, the fight waits for her rather than skipping it, and the
    // result says how long: what 5.8 must flag for a build.
    const xiangling = s.characters[1];
    expect(xiangling.energyWaitSec).toBeGreaterThan(60);
    expect(s.durationSec).toBeGreaterThan(
      national.meta.validation!.durationSec + 60,
    );
    // Filling those waits with attacks: nobody stands idle, and the team
    // deals more over the same rotation.
    const filled = await runner().run(
      rotationConfig(national, team, { iterations: 100, energyWait: 'attack' }),
    );
    expect(filled.incomplete).toEqual([]);
    expect(filled.characters[1].energyWaitSec).toBeLessThan(1);
    expect(filled.dps.mean).toBeGreaterThan(s.dps.mean);
  }, 120_000);
});
