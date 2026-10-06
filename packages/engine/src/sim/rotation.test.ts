import { describe, it, expect } from 'vitest';
import type { SimCharacter } from './configgen';
import {
  fillBurstWaits,
  renderTemplate,
  rotationConfig,
  rotationIssues,
  RotationMetaSchema,
  type Rotation,
  type RotationMeta,
} from './rotation';

const META: RotationMeta = {
  id: 'raiden-national',
  archetype: 'raiden-national',
  name: 'Raiden National',
  status: 'validated',
  summary: 'Two-character test rotation.',
  slots: [
    { id: 'raiden', characters: ['raiden_shogun'], role: 'on-field-dps' },
    { id: 'pyro', characters: ['xiangling', 'bennett'], role: 'buffer' },
  ],
  active: 'raiden',
  fight: {
    mode: 'actions',
    enemy: { level: 100, res: 10, hp: 999999999, radius: 2, pos: [0, 2.4] },
    energy: 'energy every interval=480,720 amount=1;',
  },
  source: {
    kind: 'community',
    title: 'A published config',
    url: 'https://db.kqm.gg/db/abc',
    retrieved: '2026-10-05',
    publishedDps: 66102,
    changes: 'Names as placeholders.',
  },
  validation: {
    gcsim: 'v2.48.8',
    date: '2026-10-05',
    iterations: 1000,
    dps: 66103,
    sd: 1763,
    durationSec: 106,
    warnings: [],
    offPct: 0,
  },
};

const TEMPLATE = `{{raiden}} skill;
for let x = 0; x < 2; x = x + 1 {
  {{pyro}} burst, skill;
  {{raiden}} burst, attack:4;
}
`;

const REFERENCE = `# reference builds
raidenshogun char lvl=90/90 cons=0 talent=9,9,9;
raidenshogun add weapon="deathmatch" refine=1 lvl=90/90;
xiangling char lvl=90/90 cons=6 talent=9,9,9; # C6
xiangling add weapon="thecatch" refine=5 lvl=90/90;
`;

const ROTATION: Rotation = {
  meta: META,
  template: TEMPLATE,
  reference: REFERENCE,
};

/** A copy of `o` without `key`. */
function without<T extends object>(o: T, key: keyof T): Partial<T> {
  const copy: Partial<T> = { ...o };
  delete copy[key];
  return copy;
}

/** META with changes, for the issue tests. */
const meta = (patch: Partial<RotationMeta>): unknown => ({ ...META, ...patch });
const issues = (m: unknown, template = TEMPLATE, reference?: string) =>
  rotationIssues({ meta: m, template, reference });

describe('rotationIssues', () => {
  it('a sound rotation has none', () => {
    expect(issues(META, TEMPLATE, REFERENCE)).toEqual([]);
  });

  it('reports the meta’s shape with the path, strictly', () => {
    const noHp = without(META.fight.enemy as { hp: number }, 'hp');
    expect(
      issues(meta({ fight: { ...META.fight, enemy: noHp } as never })),
    ).toEqual(['meta.fight.enemy.hp: expected number']);
    expect(issues({ ...META, extra: 1 })).toEqual([
      'meta.extra: unknown field',
    ]);
    expect(issues(meta({ id: 'Raiden National' }))).toEqual([
      'meta.id: must match /^[a-z0-9]+(-[a-z0-9]+)*$/',
    ]);
    expect(
      issues(meta({ source: { ...META.source, url: 'db.kqm.gg' } })),
    ).toEqual(['meta.source.url: not a valid url']);
    expect(issues(meta({ status: 'final' as never }))).toEqual([
      'meta.status: must be "validated" or "draft"',
    ]);
    // A duration fight takes no hp: that would turn it into the other mode.
    expect(
      issues(
        meta({
          fight: {
            mode: 'duration',
            seconds: 90,
            enemy: { ...META.fight.enemy },
            energy: META.fight.energy,
          } as never,
        }),
      ),
    ).toEqual(['meta.fight.enemy.hp: unknown field']);
  });

  it('finds slots and placeholders that don’t line up', () => {
    expect(issues(META, `${TEMPLATE}{{bennett}} skill;\n`)).toEqual([
      'template uses {{bennett}}, which is not a slot',
    ]);
    expect(issues(META, '{{raiden}} skill;\n')).toEqual([
      'slot "pyro" never acts in the template',
    ]);
    expect(issues(META, `${TEMPLATE}{{raiden skill;\n`)).toEqual([
      'template has an unclosed placeholder',
    ]);
    expect(
      issues(
        meta({ slots: [META.slots[0], { ...META.slots[1], id: 'raiden' }] }),
      ),
    ).toContain('slot "raiden" appears twice');
    expect(
      issues(
        meta({
          slots: [
            META.slots[0],
            { ...META.slots[1], characters: ['raiden_shogun'] },
          ],
        }),
      ),
    ).toContain('"raiden_shogun" can fill more than one slot');
    expect(issues(meta({ active: 'yelan' }))).toEqual([
      'active slot "yelan" is not a slot',
    ]);
  });

  it('checks archetypes and characters against the dataset', () => {
    expect(issues(meta({ archetype: 'raiden-international' }))).toEqual([
      'archetype "raiden-international" is not a curated archetype',
    ]);
    expect(
      issues(
        meta({
          slots: [{ ...META.slots[0], characters: ['raiden'] }, META.slots[1]],
        }),
      ),
    ).toEqual(['"raiden" is not a character']);
  });

  it('holds each status and source to its rules', () => {
    const unchecked = without(META, 'validation');
    expect(issues(unchecked)).toEqual([
      'a validated rotation needs its validation run',
    ]);
    expect(issues({ ...unchecked, status: 'draft' })).toEqual([]);
    expect(
      issues(
        meta({
          source: { ...META.source, kind: 'llm', publishedDps: undefined },
        }),
      ),
    ).toEqual([
      'an LLM-drafted rotation stays a draft until the owner reviews it',
    ]);
    const unpublished = without(META.source, 'publishedDps');
    expect(issues(meta({ source: unpublished as never }))).toEqual([
      'a community rotation records its published DPS',
    ]);
  });

  it('validates anything but a published config only through the owner’s review (5.7)', () => {
    const drafted = {
      ...META,
      source: { ...without(META.source, 'publishedDps'), kind: 'llm' },
    };
    expect(issues(drafted)).toEqual([
      'an LLM-drafted rotation stays a draft until the owner reviews it',
    ]);
    expect(
      issues({ ...drafted, source: { ...drafted.source, kind: 'adapted' } }),
    ).toEqual(['an adapted rotation stays a draft until the owner reviews it']);
    const review = {
      by: 'owner',
      date: '2026-10-05',
      gcsim: 'v2.48.8',
      fingerprint: 'a'.repeat(64),
    };
    expect(issues({ ...drafted, review })).toEqual([]);
    expect(issues({ ...drafted, review: { ...review, by: 'llm' } })).toEqual([
      'meta.review.by: must be "owner"',
    ]);
    // A model's draft needs no link; a published or adapted one does.
    expect(
      issues({
        ...drafted,
        status: 'draft',
        source: without(drafted.source, 'url'),
      }),
    ).toEqual([]);
    expect(
      issues(meta({ source: without(META.source, 'url') as never })),
    ).toEqual(['a community rotation links its source']);
  });

  it('checks the reference builds belong to the slots', () => {
    expect(
      issues(META, TEMPLATE, `${REFERENCE}yelan char lvl=90/90;\n`),
    ).toEqual([
      'reference line for "yelan", who is in no slot: yelan char lvl=90/90;',
    ]);
    expect(
      issues(
        META,
        TEMPLATE,
        REFERENCE.replace('xiangling char', 'xiangling  add'),
      ),
    ).toEqual(['reference has no "xiangling char" line']);
  });
});

describe('fillBurstWaits', () => {
  it('splits each statement before its burst and attacks until the burst is ready', () => {
    expect(
      fillBurstWaits(
        [
          '{{raiden}} skill;',
          'for let x = 0; x < 2; x = x + 1 {',
          '  {{pyro}} burst, skill[hold=1, x=2];',
          '  {{raiden}} attack, burst,',
          '    attack:4, dash;',
          '}',
        ].join('\n'),
        { raiden: 'attack', pyro: 'charge' },
      ),
    ).toBe(
      [
        '{{raiden}} skill;',
        'for let x = 0; x < 2; x = x + 1 {',
        '  while !.{{pyro}}.burst.ready { {{pyro}} charge; }',
        '  {{pyro}} burst, skill[hold=1, x=2];',
        '  {{raiden}} attack;',
        '  while !.{{raiden}}.burst.ready { {{raiden}} attack; }',
        '  {{raiden}} burst, attack:4, dash;',
        '}',
      ].join('\n'),
    );
  });

  it('leaves alone a slot without a filler, conditions, and actions that only start with "burst"', () => {
    const t = [
      'if .{{pyro}}.burst.ready { x(); }',
      '{{pyro}} burst;',
      '{{raiden}} bursty;',
    ].join('\n');
    expect(fillBurstWaits(t, { pyro: false, raiden: 'attack' })).toBe(t);
  });
});

describe('energyWait', () => {
  const ours = (key: string): SimCharacter => ({
    key,
    level: 90,
    maxLevel: 90,
    constellation: 0,
    talents: { auto: 9, skill: 9, burst: 9 },
    weapon: { key: 'the_catch', level: 90, maxLevel: 90, refinement: 5 },
    artifacts: [],
  });
  const team = { raiden: ours('raiden_shogun'), pyro: ours('bennett') };

  it('idle by default: a published rotation keeps its author’s assumption', () => {
    expect(rotationConfig(ROTATION, team)).not.toContain('while !');
  });

  it('"attack" fills every burst wait with the slot’s filler; a run can override either way', () => {
    const filling: Rotation = {
      ...ROTATION,
      meta: {
        ...META,
        energyWait: 'attack',
        slots: [META.slots[0], { ...META.slots[1], filler: false }],
      },
    };
    const c = rotationConfig(filling, team);
    expect(c).toContain(
      '  while !.raidenshogun.burst.ready { raidenshogun attack; }\n  raidenshogun burst, attack:4;',
    );
    expect(c).not.toContain('while !.bennett');
    expect(rotationConfig(filling, team, { energyWait: 'idle' })).not.toContain(
      'while !',
    );
    expect(rotationConfig(ROTATION, team, { energyWait: 'attack' })).toContain(
      'while !.bennett.burst.ready { bennett attack; }',
    );
  });

  it('a filler is one gcsim action', () => {
    expect(
      issues(
        meta({
          slots: [{ ...META.slots[0], filler: 'attack; skill' }, META.slots[1]],
        }),
      ),
    ).toEqual([expect.stringMatching(/^meta\.slots\.0\.filler: /)]);
  });
});

describe('renderTemplate', () => {
  it('writes each slot’s character in gcsim’s name', () => {
    expect(
      renderTemplate(TEMPLATE, { raiden: 'raiden_shogun', pyro: 'bennett' }),
    ).toBe(`raidenshogun skill;
for let x = 0; x < 2; x = x + 1 {
  bennett burst, skill;
  raidenshogun burst, attack:4;
}
`);
  });
  it('refuses a slot with no one in it', () => {
    expect(() => renderTemplate(TEMPLATE, { raiden: 'raiden_shogun' })).toThrow(
      'no character for slot {{pyro}}',
    );
  });
});

describe('rotationConfig', () => {
  const ours = (key: string): SimCharacter => ({
    key,
    level: 90,
    maxLevel: 90,
    constellation: 0,
    talents: { auto: 9, skill: 9, burst: 9 },
    weapon: { key: 'the_catch', level: 90, maxLevel: 90, refinement: 5 },
    artifacts: [],
  });

  it('our characters in the rotation’s fight: a target that outlasts the action list', () => {
    expect(
      rotationConfig(
        ROTATION,
        { raiden: ours('raiden_shogun'), pyro: ours('bennett') },
        { iterations: 500 },
      ),
    ).toBe(
      [
        'options iteration=500 swap_delay=12;',
        'target lvl=100 resist=0.1 radius=2 pos=0,2.4 hp=999999999;',
        'energy every interval=480,720 amount=1;',
        '',
        'raidenshogun char lvl=90/90 cons=0 talent=9,9,9;',
        'raidenshogun add weapon="thecatch" refine=5 lvl=90/90;',
        '',
        'bennett char lvl=90/90 cons=0 talent=9,9,9;',
        'bennett add weapon="thecatch" refine=5 lvl=90/90;',
        '',
        'active raidenshogun;',
        '',
        renderTemplate(TEMPLATE, {
          raiden: 'raiden_shogun',
          pyro: 'bennett',
        }).trim(),
        '',
      ].join('\n'),
    );
  });

  it('the reference builds, as written, with each slot’s first character', () => {
    const c = rotationConfig(ROTATION, 'reference');
    expect(c).toContain(REFERENCE.trim());
    expect(c).toContain('  xiangling burst, skill;');
    expect(c).toMatch(/^active raidenshogun;$/m);
  });

  it('a duration fight: no target hp, the rotation’s seconds unless asked otherwise', () => {
    const timed: Rotation = {
      ...ROTATION,
      meta: RotationMetaSchema.parse({
        ...META,
        fight: {
          mode: 'duration',
          seconds: 120,
          enemy: { level: 95, res: -20 },
          energy: META.fight.energy,
        },
      }),
    };
    const c = rotationConfig(timed, 'reference');
    expect(c).toMatch(/^options iteration=1000 duration=120 swap_delay=12;$/m);
    expect(c).toMatch(/^target lvl=95 resist=-0\.2;$/m);
    expect(rotationConfig(timed, 'reference', { duration: 60 })).toMatch(
      /duration=60 /,
    );
  });

  it('refuses a character who can’t fill the slot, or a missing one', () => {
    expect(() =>
      rotationConfig(ROTATION, {
        raiden: ours('raiden_shogun'),
        pyro: ours('yelan'),
      }),
    ).toThrow(`yelan can't fill slot "pyro" (xiangling, bennett)`);
    expect(() =>
      rotationConfig(ROTATION, { raiden: ours('raiden_shogun') }),
    ).toThrow('no character for slot "pyro"');
    expect(() =>
      rotationConfig({ meta: META, template: TEMPLATE }, 'reference'),
    ).toThrow('rotation raiden-national has no reference builds');
  });
});
