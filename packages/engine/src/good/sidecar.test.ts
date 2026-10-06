import { describe, it, expect } from 'vitest';
import { normalizeGOOD, type NormalizedGood } from './normalize';
import { buildSidecar, firstRollKey, SidecarEntry } from './sidecar';
import { fingerprint } from '../import/fingerprint';

const good = (artifacts: unknown[]): NormalizedGood =>
  normalizeGOOD({ format: 'GOOD', source: 'Irminsul', artifacts })!;

// A 3-line +0 piece as Irminsul exports it (values from the owner's export).
const fresh = (over: Record<string, unknown> = {}) => ({
  setKey: 'EmblemOfSeveredFate',
  slotKey: 'sands',
  rarity: 5,
  level: 0,
  mainStatKey: 'atk_',
  substats: [
    { key: 'critRate_', value: 3.9, initialValue: 3.9 },
    { key: 'hp', value: 299, initialValue: 299 },
    { key: 'def', value: 23, initialValue: 23 },
  ],
  unactivatedSubstats: [{ key: 'critDMG_', value: 7, initialValue: 7 }],
  totalRolls: 3,
  astralMark: false,
  elixerCrafted: true,
  ...over,
});

// The same kind of piece at +20: 3 first lines, the 4th activated at +4,
// then 4 rolls. First rolls are below the values they grew into.
const levelled = (over: Record<string, unknown> = {}) => ({
  ...fresh(),
  level: 20,
  substats: [
    { key: 'critRate_', value: 10.5, initialValue: 3.9 },
    { key: 'hp', value: 299, initialValue: 299 },
    { key: 'def', value: 44, initialValue: 23 },
    { key: 'critDMG_', value: 14.8, initialValue: 7 },
  ],
  unactivatedSubstats: [],
  totalRolls: 8,
  ...over,
});

const issuesOf = (n: NormalizedGood) =>
  n.issues.map((i) => [i.path.slice(2), i.code]);

describe('artifact extras', () => {
  it('keeps what Irminsul exports, including its elixerCrafted spelling', () => {
    const n = good([fresh(), levelled()]);
    expect(n.issues).toEqual([]);
    expect(n.artifacts![0].extras).toEqual({
      totalRolls: 3,
      astralMark: false,
      elixirCrafted: true,
      initialValues: { crit_rate: 3.9, hp: 299, def: 23, crit_dmg: 7 },
    });
    expect(n.artifacts![1].extras?.initialValues).toEqual({
      crit_rate: 3.9,
      hp: 299,
      def: 23,
      crit_dmg: 7,
    });
  });

  it('keeps partial roll data, as an OCR scanner exports it', () => {
    const [line0, ...rest] = levelled().substats;
    const n = good([
      levelled({
        substats: [line0, ...rest.map(({ key, value }) => ({ key, value }))],
        totalRolls: undefined,
        elixerCrafted: undefined,
        elixirCrafted: false,
      }),
    ]);
    expect(n.issues).toEqual([]);
    expect(n.artifacts![0].extras).toEqual({
      astralMark: false,
      elixirCrafted: false,
      initialValues: { crit_rate: 3.9 },
    });
  });

  it('drops an impossible roll count and reports it', () => {
    // Seen in a real OCR export: 7 at +20, where the minimum is 8.
    const n = good([levelled({ totalRolls: 7 }), fresh({ totalRolls: 4 })]);
    expect(issuesOf(n)).toEqual([
      [['totalRolls'], 'invalid'],
      [['totalRolls'], 'invalid'],
    ]);
    expect(n.artifacts!.map((e) => e.extras?.totalRolls)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it('drops a first roll that is off-tier, above the value, or not the value at +0', () => {
    const subs = levelled().substats;
    const n = good([
      levelled({
        substats: [
          { ...subs[0], initialValue: 3.4 }, // no crit rate roll shows 3.4
          { ...subs[1], initialValue: 'high' },
          { ...subs[2], value: 23, initialValue: 23 },
          { ...subs[3], value: 7, initialValue: 7.8 }, // above the value
        ],
      }),
      fresh({
        substats: [
          { key: 'critRate_', value: 3.9, initialValue: 3.5 },
          ...fresh().substats.slice(1),
        ],
      }),
    ]);
    expect(issuesOf(n)).toEqual([
      [['substats', 0, 'initialValue'], 'invalid'],
      [['substats', 1, 'initialValue'], 'invalid'],
      [['substats', 3, 'initialValue'], 'invalid'],
      [['substats', 0, 'initialValue'], 'invalid'],
    ]);
    expect(n.artifacts![0].extras?.initialValues).toEqual({ def: 23 });
  });

  it('keeps roll data for 5★ pieces only', () => {
    const n = good([fresh({ rarity: 4 })]);
    expect(issuesOf(n)).toEqual([[['totalRolls'], 'unsupported']]);
    expect(n.artifacts![0].extras).toEqual({
      astralMark: false,
      elixirCrafted: true,
    });
  });

  it('ignores the first roll of an unactivated line it dropped', () => {
    const n = good([
      fresh({
        unactivatedSubstats: [
          { key: 'critRate_', value: 3.9, initialValue: 3.9 },
        ],
      }),
    ]);
    expect(n.artifacts![0].extras?.initialValues).toEqual({
      crit_rate: 3.9,
      hp: 299,
      def: 23,
    });
  });
});

describe('buildSidecar', () => {
  it('keys each entry by fingerprint and keeps its place in the file', () => {
    const n = good([
      {
        ...fresh(),
        totalRolls: undefined,
        astralMark: undefined,
        elixerCrafted: undefined,
        substats: fresh().substats.map(({ key, value }) => ({ key, value })),
        unactivatedSubstats: [],
      },
      levelled(),
    ]);
    const sc = buildSidecar(n);
    expect(sc.source).toBe('Irminsul');
    expect(sc.entries).toHaveLength(1);
    expect(sc.entries[0]).toMatchObject({
      fingerprint: fingerprint(n.artifacts![1].artifact),
      index: 1,
    });
    expect(SidecarEntry.safeParse(sc.entries[0]).success).toBe(true);
  });

  it('gives a first-roll key that survives levelling, only with all 4 first rolls', () => {
    const sc = buildSidecar(good([fresh(), levelled()]));
    const [a, b] = sc.entries;
    expect(a.fingerprint).not.toBe(b.fingerprint);
    expect(a.firstRollKey).toBeDefined();
    expect(a.firstRollKey).toBe(b.firstRollKey);
    expect(
      firstRollKey(good([fresh()]).artifacts![0].artifact, { crit_rate: 3.9 }),
    ).toBeUndefined();
  });
});
