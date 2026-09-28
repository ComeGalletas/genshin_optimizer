import { describe, it, expect } from 'vitest';
import type { Artifact, SubStat } from '../game/types';
import {
  displaySteps,
  fingerprint,
  matchArtifacts,
  repeatedFingerprints,
} from './fingerprint';

const sub = (key: SubStat['key'], value: number): SubStat => ({ key, value });
let id = 0;
// Shaped after a real +20 piece from the owner's exports, where Irminsul
// wrote DEF% 18.9 and the OCR scan read 19.0 (the raw sum is 18.95).
const art = (over: Partial<Artifact> = {}): Artifact => ({
  id: String(id++),
  setKey: 'GoldenTroupe',
  slot: 'sands',
  rarity: 5,
  level: 20,
  mainStat: 'hp_pct',
  mainStatValue: 46.6,
  subStats: [
    sub('crit_rate', 9.7),
    sub('er_pct', 11),
    sub('def', 21),
    sub('def_pct', 18.9),
  ],
  ...over,
});

describe('fingerprint', () => {
  it('ignores id, location, lock and substat order', () => {
    const a = art();
    const b = art({
      location: 'furina',
      subStats: [...a.subStats].reverse(),
    });
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it('rounds to what the game shows', () => {
    expect(displaySteps(sub('crit_rate', 3.8899999))).toBe(39);
    expect(displaySteps(sub('hp', 298.75))).toBe(299);
    expect(fingerprint(art({ subStats: [sub('crit_rate', 3.89)] }))).toBe(
      fingerprint(art({ subStats: [sub('crit_rate', 3.9)] })),
    );
  });

  it('tells apart level, element, and any shown value', () => {
    const a = art();
    expect(fingerprint(art({ level: 16 }))).not.toBe(fingerprint(a));
    const goblet = {
      slot: 'goblet' as const,
      mainStat: 'elemental_dmg' as const,
    };
    expect(fingerprint(art({ ...goblet, element: 'pyro' }))).not.toBe(
      fingerprint(art({ ...goblet, element: 'hydro' })),
    );
    expect(
      fingerprint(
        art({ subStats: [...a.subStats.slice(0, 3), sub('def_pct', 19)] }),
      ),
    ).not.toBe(fingerprint(a));
  });
});

describe('matchArtifacts', () => {
  it('pairs exact fingerprints first, one to one', () => {
    const a = art();
    const m = matchArtifacts([a, a], [a, a, a]);
    expect(m.pairs.map((p) => [p.left, p.right, p.kind])).toEqual([
      [0, 0, 'exact'],
      [1, 1, 'exact'],
    ]);
    expect(m.onlyLeft).toEqual([]);
    expect(m.onlyRight).toEqual([2]);
  });

  it('falls back to one display step per substat', () => {
    const irminsul = art();
    const ocr = art({
      subStats: [...irminsul.subStats.slice(0, 3), sub('def_pct', 19)],
    });
    expect(matchArtifacts([irminsul], [ocr]).pairs).toEqual([
      { left: 0, right: 0, kind: 'fuzzy' },
    ]);
    // Two steps is a different piece.
    const far = art({
      subStats: [...irminsul.subStats.slice(0, 3), sub('def_pct', 19.1)],
    });
    expect(matchArtifacts([irminsul], [far])).toMatchObject({
      pairs: [],
      onlyLeft: [0],
      onlyRight: [0],
    });
  });

  it('never fuzzy-matches across level, set or substat keys', () => {
    const a = art();
    const near = (over: Partial<Artifact>) =>
      matchArtifacts([a], [art({ ...over })]).pairs;
    expect(near({ level: 16 })).toEqual([]);
    expect(near({ setKey: 'EmblemOfSeveredFate' })).toEqual([]);
    expect(
      near({ subStats: [...a.subStats.slice(0, 3), sub('atk_pct', 18.9)] }),
    ).toEqual([]);
  });

  it('leaves a piece with two fuzzy candidates unmatched', () => {
    const low = art({
      subStats: [...art().subStats.slice(0, 3), sub('def_pct', 18.8)],
    });
    const high = art({
      subStats: [...art().subStats.slice(0, 3), sub('def_pct', 19)],
    });
    const m = matchArtifacts([low, high], [art()]);
    expect(m).toMatchObject({
      pairs: [],
      ambiguous: [0],
      onlyRight: [0],
      onlyLeft: [0, 1],
    });
  });
});

describe('repeatedFingerprints', () => {
  it('counts only what repeats', () => {
    const a = art();
    const r = repeatedFingerprints([a, art({ level: 16 }), a, a]);
    expect([...r.values()]).toEqual([3]);
  });
});
