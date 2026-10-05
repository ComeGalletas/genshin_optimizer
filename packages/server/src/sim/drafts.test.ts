import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeGOOD } from '@genshin-build-lab/engine/good/normalize';
import { loadSampleGOOD } from '@genshin-build-lab/engine/test-fixtures/sampleAccount';
import type { SimAccount } from '@genshin-build-lab/engine/sim/account';
import { sampleAccountServices } from '../llm/evaluate';
import { Services, ServiceError } from '../api/services';
import { GcsimError, gcsimPath, loadGcsimTool } from './gcsim';
import { readResult, type SimResult } from './result';
import { SimTimeout } from './runner';
import {
  draftRotation,
  installedRotationDeps,
  promoteRotation,
  reviewRotation,
  type DraftInput,
  type RotationDeps,
} from './drafts';
import { loadRotation, ROTATIONS_DIR, rotationFingerprint } from './rotations';

const REAL: SimResult = readResult(
  JSON.parse(
    readFileSync(
      new URL('./__fixtures__/raiden-national-30.json', import.meta.url),
      'utf8',
    ),
  ),
);

const SAMPLE = {
  seed: 7,
  character_details: [{ name: 'raidenshogun' }],
  logs: [
    {
      event: 'action',
      frame: 1,
      char_index: 0,
      msg: 'executed skill',
      logs: { action: 'skill' },
    },
    {
      event: 'damage',
      frame: 30,
      char_index: 0,
      msg: 'Eye',
      logs: { damage: 1234 },
    },
  ],
};

const good = normalizeGOOD(loadSampleGOOD())!;
const ACCOUNT: SimAccount = {
  roster: good.roster,
  weapons: good.weapons,
  artifacts: (good.artifacts ?? []).map((e) => e.artifact),
};

/** A runner that records the configs and answers with a real result, or
 *  throws `fail`. */
function fakeRunner(fail?: Error, result: SimResult = REAL) {
  const configs: string[] = [];
  const runner: RotationDeps['runner'] = {
    async run(config) {
      configs.push(config);
      if (fail) throw fail;
      return result;
    },
    async runWithSample(config) {
      configs.push(config);
      if (fail) throw fail;
      return { result, sample: SAMPLE };
    },
  };
  return { runner, configs };
}

/** The sample account fields this team: Raiden, Xiangling, Xingqiu, Bennett. */
const INPUT: DraftInput = {
  id: 'raiden-xingqiu',
  name: 'Raiden National with Xingqiu',
  archetype: 'raiden-national',
  summary: 'Raiden on field with Xingqiu in place of Yelan.',
  slots: [
    { id: 'raiden', character: 'raiden_shogun', role: 'on-field-dps' },
    { id: 'xiangling', character: 'xiangling', role: 'off-field-dps' },
    { id: 'xingqiu', character: 'xingqiu', role: 'off-field-dps' },
    { id: 'bennett', character: 'bennett', role: 'buffer' },
  ],
  active: 'raiden',
  template: [
    '{{raiden}} skill;',
    'for let i = 0; i < 4; i = i + 1 {',
    '  {{xingqiu}} burst, skill;',
    '  {{bennett}} burst, skill;',
    '  {{xiangling}} burst, skill;',
    '  {{raiden}} burst, attack:4, dash, attack:4;',
    '}',
  ].join('\n'),
  notes: 'Raiden National with Xingqiu for Yelan, whom the owner lacks.',
};

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'drafts-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const deps = (runner: RotationDeps['runner']): RotationDeps => ({
  dir,
  runner,
  gcsim: 'v2.48.8',
  today: () => '2026-10-05',
});

describe('draftRotation (TODO 5.7)', () => {
  it('saves a draft that runs, on the owner’s builds, in the standard fight with burst waits filled', async () => {
    const f = fakeRunner();
    const out = await draftRotation(INPUT, ACCOUNT, deps(f.runner));
    expect(out).toMatchObject({
      saved: true,
      id: 'raiden-xingqiu',
      status: 'draft',
      dps: Math.round(REAL.dps.mean),
    });
    const r = loadRotation('raiden-xingqiu', dir);
    expect(r.meta).toMatchObject({
      status: 'draft',
      energyWait: 'attack',
      fight: { mode: 'actions', enemy: { hp: 999999999 } },
      source: {
        kind: 'llm',
        retrieved: '2026-10-05',
        changes: INPUT.notes,
      },
      validation: { gcsim: 'v2.48.8', date: '2026-10-05' },
    });
    expect(r.meta.review).toBeUndefined();
    // The reference builds are the owner's equipped ones.
    expect(r.reference).toMatch(/^raidenshogun char lvl=\d+\/\d+ cons=\d/m);
    expect(r.reference).toMatch(/^raidenshogun add stats /m);
    // What gcsim ran: the standard target, and filled waits.
    expect(f.configs[0]).toMatch(/^target [^\n]*hp=999999999;$/m);
    expect(f.configs[0]).toContain(
      'while !.raidenshogun.burst.ready { raidenshogun attack; }',
    );
  });

  it('refuses, saving nothing, what the owner lacks or the library’s checks reject', async () => {
    const f = fakeRunner();
    expect(
      await draftRotation(
        {
          ...INPUT,
          slots: [
            ...INPUT.slots.slice(0, 3),
            { id: 'bennett', character: 'yelan', role: 'buffer' },
          ],
        },
        ACCOUNT,
        deps(f.runner),
      ),
    ).toEqual({ saved: false, problems: ['yelan is not in the account'] });
    expect(
      await draftRotation(
        { ...INPUT, template: `${INPUT.template}\n{{kazuha}} skill;` },
        ACCOUNT,
        deps(f.runner),
      ),
    ).toEqual({
      saved: false,
      problems: ['template uses {{kazuha}}, which is not a slot'],
    });
    expect(f.configs).toEqual([]);
    expect(existsSync(join(dir, 'raiden-xingqiu'))).toBe(false);
  });

  it('hands back gcsim’s own refusal, and a fight that never ends, to fix', async () => {
    const refused = await draftRotation(
      INPUT,
      ACCOUNT,
      deps(
        fakeRunner(new GcsimError('gcsim failed: parse error at line 3'))
          .runner,
      ),
    );
    expect(refused).toEqual({
      saved: false,
      problems: ['gcsim refused it: gcsim failed: parse error at line 3'],
    });
    const endless = await draftRotation(
      INPUT,
      ACCOUNT,
      deps(
        fakeRunner(new SimTimeout("gcsim didn't finish within 60 s")).runner,
      ),
    );
    expect(endless).toMatchObject({
      saved: false,
      problems: [expect.stringMatching(/has to end .*not while 1/)],
    });
    const partly = await draftRotation(
      INPUT,
      ACCOUNT,
      deps(fakeRunner(undefined, { ...REAL, incomplete: ['xingqiu'] }).runner),
    );
    expect(partly).toEqual({
      saved: false,
      problems: [
        "gcsim implements xingqiu only partly, so the run can't be trusted",
      ],
    });
    expect(existsSync(join(dir, 'raiden-xingqiu'))).toBe(false);
  });

  it('never replaces a curated rotation; redrafting its own draft drops the old review', async () => {
    cpSync(
      join(ROTATIONS_DIR, 'raiden-national'),
      join(dir, 'raiden-national'),
      {
        recursive: true,
      },
    );
    expect(
      await draftRotation(
        { ...INPUT, id: 'raiden-national' },
        ACCOUNT,
        deps(fakeRunner().runner),
      ),
    ).toEqual({
      saved: false,
      problems: [
        'a rotation "raiden-national" exists and isn\'t an LLM draft: choose another id',
      ],
    });
    await draftRotation(INPUT, ACCOUNT, deps(fakeRunner().runner));
    writeFileSync(join(dir, 'raiden-xingqiu', 'review.md'), 'old');
    const again = await draftRotation(
      { ...INPUT, summary: 'Second try.' },
      ACCOUNT,
      deps(fakeRunner().runner),
    );
    expect(again.saved).toBe(true);
    expect(existsSync(join(dir, 'raiden-xingqiu', 'review.md'))).toBe(false);
  });
});

describe('review and promotion (the owner’s)', () => {
  it('a review writes the run step by step with the fingerprint; promotion records it', async () => {
    await draftRotation(INPUT, ACCOUNT, deps(fakeRunner().runner));
    expect(
      promoteRotation('raiden-xingqiu', deps(fakeRunner().runner)),
    ).toEqual({
      promoted: false,
      problems: [
        'raiden-xingqiu has no review: run npm run rotations -- review raiden-xingqiu and read it first',
      ],
    });
    const { path, fingerprint } = await reviewRotation(
      'raiden-xingqiu',
      deps(fakeRunner().runner),
    );
    const text = readFileSync(path, 'utf8');
    expect(text).toContain(`Fingerprint: \`${fingerprint}\``);
    expect(text).toContain('| 0.0–0.5 | raidenshogun | E | 1,234 |  |');
    expect(text).toContain('npm run rotations -- promote raiden-xingqiu');

    expect(
      promoteRotation('raiden-xingqiu', { dir, gcsim: 'v2.49.0' }),
    ).toMatchObject({
      promoted: false,
      problems: [
        'raiden-xingqiu was reviewed with gcsim v2.48.8, the pin is v2.49.0: review it again',
      ],
    });
    expect(
      promoteRotation('raiden-xingqiu', {
        ...deps(fakeRunner().runner),
        note: 'Looks right.',
      }),
    ).toEqual({ promoted: true });
    const r = loadRotation('raiden-xingqiu', dir);
    expect(r.meta.status).toBe('validated');
    expect(r.meta.review).toEqual({
      by: 'owner',
      date: '2026-10-05',
      gcsim: 'v2.48.8',
      fingerprint: rotationFingerprint(r),
      note: 'Looks right.',
    });
    expect(
      promoteRotation('raiden-xingqiu', deps(fakeRunner().runner)),
    ).toEqual({
      promoted: false,
      problems: ['raiden-xingqiu is already validated'],
    });
  });

  it('a change after the review needs a new one; a validated rotation changed since is refused', async () => {
    await draftRotation(INPUT, ACCOUNT, deps(fakeRunner().runner));
    await reviewRotation('raiden-xingqiu', deps(fakeRunner().runner));
    const tmpl = join(dir, 'raiden-xingqiu', 'rotation.gcsl.tmpl');
    writeFileSync(
      tmpl,
      readFileSync(tmpl, 'utf8').replace('attack:4;', 'attack:3;'),
    );
    expect(
      promoteRotation('raiden-xingqiu', deps(fakeRunner().runner)),
    ).toEqual({
      promoted: false,
      problems: [
        'raiden-xingqiu changed since its review: review it again (npm run rotations -- review raiden-xingqiu)',
      ],
    });
    await reviewRotation('raiden-xingqiu', deps(fakeRunner().runner));
    expect(
      promoteRotation('raiden-xingqiu', deps(fakeRunner().runner)),
    ).toEqual({
      promoted: true,
    });
    writeFileSync(
      tmpl,
      readFileSync(tmpl, 'utf8').replace('attack:3;', 'attack:2;'),
    );
    expect(() => loadRotation('raiden-xingqiu', dir)).toThrow(
      /changed since the owner's review on 2026-10-05: review it again/,
    );
  });
});

describe('the tools’ side (Services)', () => {
  it('drafting needs gcsim; listing and reading don’t', async () => {
    const sample = sampleAccountServices();
    const without = new Services(sample.db, undefined, {});
    await expect(without.draftRotation(INPUT)).rejects.toThrow(
      new ServiceError(
        503,
        'gcsim_unavailable',
        'gcsim is not installed here: run npm run sim:check',
      ),
    );
    expect(without.listRotations().rotations.map((r) => r.id)).toContain(
      'raiden-national',
    );
    expect(without.getRotation('raiden-national').template).toMatch(
      /\{\{raiden\}\} skill;/,
    );
    expect(() => without.getRotation('../etc')).toThrow(/not a rotation id/);
    expect(() => without.getRotation('nothing-here')).toThrow(
      'no rotation "nothing-here"',
    );
    const f = fakeRunner();
    const withSim = new Services(sample.db, undefined, {
      dir,
      deps: deps(f.runner),
    });
    expect(await withSim.draftRotation(INPUT)).toMatchObject({ saved: true });
    expect(withSim.listRotations().rotations).toEqual([
      expect.objectContaining({
        id: 'raiden-xingqiu',
        status: 'draft',
        source: 'llm',
        reviewed: false,
      }),
    ]);
    await sample.searches.close();
    await without.searches.close();
    await withSim.searches.close();
  });
});

// Runs only where `npm run sim:check` installed the pinned binary.
const installed = (() => {
  try {
    return existsSync(gcsimPath(loadGcsimTool()));
  } catch {
    return false;
  }
})();

describe.skipIf(!installed)('drafting over the installed gcsim', () => {
  it('drafts on the sample account, reviews with a real sample, promotes', async () => {
    const live = {
      ...installedRotationDeps()!,
      dir,
      today: () => '2026-10-05',
    };
    const out = await draftRotation(INPUT, ACCOUNT, live);
    expect(out).toMatchObject({ saved: true, status: 'draft' });
    const { path } = await reviewRotation('raiden-xingqiu', live);
    const text = readFileSync(path, 'utf8');
    expect(text).toMatch(/\| raidenshogun \| Q N\d/);
    expect(promoteRotation('raiden-xingqiu', live)).toEqual({ promoted: true });
  }, 120_000);

  it('hands back gcsim’s own parse error', async () => {
    const live = { ...installedRotationDeps()!, dir };
    const out = await draftRotation(
      { ...INPUT, template: `${INPUT.template}\n{{raiden}} not_an_action;` },
      ACCOUNT,
      live,
    );
    expect(out).toMatchObject({
      saved: false,
      problems: [expect.stringMatching(/^gcsim refused it: gcsim failed: /)],
    });
  }, 120_000);
});
