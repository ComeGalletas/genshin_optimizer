import { describe, it, expect } from 'vitest';
import { normalizeGOOD, normalizeKey, type NormalizedGood } from './normalize';
import { MAX_ROSTER } from './schema';
import { loadSampleGOOD } from '../test-fixtures/sampleAccount';

const art = (over: Record<string, unknown> = {}) => ({
  setKey: 'EmblemOfSeveredFate',
  slotKey: 'sands',
  rarity: 5,
  level: 20,
  mainStatKey: 'atk_',
  substats: [{ key: 'critRate_', value: 3.9 }],
  ...over,
});
const good = (body: Record<string, unknown>): NormalizedGood =>
  normalizeGOOD({ format: 'GOOD', ...body })!;

describe('normalizeGOOD on the sample account', () => {
  const n = normalizeGOOD(loadSampleGOOD())!;

  it('reads everything the fixture carries, with no issues', () => {
    expect(n.issues).toEqual([]);
    expect(n.version).toBe(2);
    expect(n.source).toMatch(/synthetic test fixture/);
    expect(n.artifacts).toHaveLength(20);
    expect(Object.keys(n.roster)).toHaveLength(8);
  });

  it('keeps the full weapon inventory and the lock flags', () => {
    expect(n.weapons).toHaveLength(8);
    expect(n.weapons[0]).toEqual({
      index: 0,
      key: 'tome_of_the_eternal_flow',
      level: 90,
      ascension: 6,
      refinement: 1,
      location: 'neuvillette',
    });
    expect(n.artifacts!.filter((a) => a.lock === true)).toHaveLength(17);
  });
});

describe('normalizeGOOD', () => {
  it('returns null for anything that is not a GOOD file', () => {
    expect(normalizeGOOD(null)).toBeNull();
    expect(normalizeGOOD('GOOD')).toBeNull();
    expect(normalizeGOOD({ format: 'GOODish', artifacts: [] })).toBeNull();
  });

  // ADR-0023: GOOD and the engine both store percentages in percent.
  it('passes stat values through unchanged', () => {
    const [entry] = good({ artifacts: [art()] }).artifacts!;
    expect(entry.artifact.subStats).toEqual([{ key: 'crit_rate', value: 3.9 }]);
  });

  it('maps GOOD keys to dataset keys', () => {
    expect(normalizeKey('RaidenShogun')).toBe(normalizeKey('raiden_shogun'));
    const n = good({
      weapons: [{ key: 'AmosBow', location: 'RaidenShogun', level: 90 }],
    });
    expect(n.weapons[0]).toMatchObject({
      key: "amos'_bow",
      location: 'raiden_shogun',
    });
    expect(n.roster.raiden_shogun).toEqual({
      weaponKey: "amos'_bow",
      weaponLevel: 90,
    });
  });

  it('ignores fields it does not read, without reporting them', () => {
    const n = good({ artifacts: [art({ totalRolls: 8, astralMark: true })] });
    expect(n.issues).toEqual([]);
    expect(n.artifacts).toHaveLength(1);
  });

  it('keeps an empty artifact list distinct from a missing one', () => {
    expect(good({ artifacts: [] }).artifacts).toEqual([]);
    expect(good({ characters: [] }).artifacts).toBeNull();
  });
});

describe('normalizeGOOD issues: what it skipped, and why', () => {
  const issuesOf = (body: Record<string, unknown>) => good(body).issues;

  it('reports valid GOOD this app does not score as unsupported', () => {
    expect(issuesOf({ artifacts: [art({ rarity: 3 })] })).toEqual([
      expect.objectContaining({
        path: ['artifacts', 0, 'rarity'],
        code: 'unsupported',
      }),
    ]);
    expect(issuesOf({ artifacts: [art({ mainStatKey: 'shield_' })] })).toEqual([
      expect.objectContaining({
        path: ['artifacts', 0, 'mainStatKey'],
        code: 'unsupported',
      }),
    ]);
  });

  it('reports a wrongly typed field as invalid, naming it', () => {
    const [issue] = issuesOf({ artifacts: [art({ level: '20' })] });
    expect(issue).toMatchObject({ path: ['artifacts', 0], code: 'invalid' });
    expect(issue.message).toMatch(/level: expected number/);
  });

  it('drops a bad substat, keeps the artifact, and says which substat', () => {
    const n = good({
      artifacts: [
        art({
          substats: [
            { key: 'critRate_', value: 3.9 },
            { key: 'critDMG_', value: Infinity },
            { key: 'shield_', value: 5 },
          ],
        }),
      ],
    });
    expect(n.artifacts![0].artifact.subStats).toEqual([
      { key: 'crit_rate', value: 3.9 },
    ]);
    expect(n.issues.map((i) => [i.path, i.code])).toEqual([
      [['artifacts', 0, 'substats', 1], 'invalid'],
      [['artifacts', 0, 'substats', 2], 'unsupported'],
    ]);
  });

  it('reports a roll-invariant failure with the manual-entry message', () => {
    const [issue] = issuesOf({ artifacts: [art({ level: 25 })] });
    expect(issue).toMatchObject({
      code: 'invalid',
      message: 'Level must be between 0 and 20.',
    });
  });

  it('reports keys and locations the dataset does not know as unresolved', () => {
    const issues = issuesOf({
      artifacts: [art({ location: 'TravelerAnemo' })],
      characters: [{ key: 'TravelerAnemo', level: 90 }],
      weapons: [{ key: 'NotAWeapon', location: '' }],
    });
    expect(issues.map((i) => [i.path, i.code])).toEqual([
      [['artifacts', 0, 'location'], 'unresolved'],
      [['characters', 0, 'key'], 'unresolved'],
      [['weapons', 0, 'key'], 'unresolved'],
    ]);
  });

  it('reports an oversized artifact list and a truncated weapon list', () => {
    const tooMany = good({
      artifacts: Array.from({ length: 4001 }, () => art()),
    });
    expect(tooMany.artifacts).toBeNull();
    expect(tooMany.issues[0]).toMatchObject({
      path: ['artifacts'],
      code: 'invalid',
    });

    const weapons = Array.from({ length: MAX_ROSTER + 1 }, () => ({
      key: 'AmosBow',
    }));
    const n = good({ weapons });
    expect(n.weapons).toHaveLength(MAX_ROSTER);
    expect(n.issues[0]).toMatchObject({ path: ['weapons'], code: 'truncated' });
  });

  it('reports a list that is not a list, and still reads the others', () => {
    const n = good({
      artifacts: 'nope',
      characters: [{ key: 'Furina', level: 90 }],
    });
    expect(n.artifacts).toBeNull();
    expect(n.issues[0]).toMatchObject({ path: ['artifacts'], code: 'invalid' });
    expect(n.roster.furina).toEqual({ level: 90 });
  });
});
