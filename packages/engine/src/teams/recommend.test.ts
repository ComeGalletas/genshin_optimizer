import { describe, it, expect } from 'vitest';
import { instantiate, recommendAbyss, type TeamInstance } from './recommend';
import { COMP_ARCHETYPES } from './comps';
import { loadSampleGOOD } from '../test-fixtures/sampleAccount';
import { parseGOOD, parseGOODRoster } from '../import/good';
import { computeBuildScore } from '../roster/buildScore';
import type { Artifact } from '../game/types';
import type { CompArchetype } from './types';

const arch = (id: string) => COMP_ARCHETYPES.find((a) => a.id === id)!;

const toy: CompArchetype = {
  id: 'toy',
  name: 'Toy',
  modes: ['abyss'],
  tier: 1,
  source: 'https://example.test/',
  notes: 'test',
  slots: [
    {
      role: 'on-field-dps',
      options: [
        { characterKey: 'hu_tao', weight: 1 },
        { characterKey: 'yoimiya', weight: 0.85 },
      ],
    },
    {
      role: 'applicator',
      options: [
        { characterKey: 'xingqiu', weight: 1 },
        { characterKey: 'yelan', weight: 0.85 },
      ],
    },
    {
      role: 'buffer',
      options: [
        { characterKey: 'bennett', weight: 1 },
        { characterKey: 'xiangling', weight: 0.7 },
      ],
    },
    {
      role: 'sustain',
      options: [
        { characterKey: 'zhongli', weight: 1 },
        { characterKey: 'layla', weight: 0.7 },
      ],
    },
  ],
};

describe('instantiate', () => {
  it('picks the highest weight × build score among owned options', () => {
    // Ideal Hu Tao is barely built; the sub Yoimiya is maxed.
    const scores = {
      hu_tao: 20,
      yoimiya: 100,
      xingqiu: 80,
      bennett: 80,
      zhongli: 80,
    };
    const out = instantiate(toy, scores, new Set());
    expect(out).not.toBeNull();
    expect('missing' in out!).toBe(false);
    const team = out as Exclude<typeof out, { missing: unknown } | null>;
    expect(team.members[0].characterKey).toBe('yoimiya');
  });

  it('never reuses a character across slots', () => {
    const scores = { hu_tao: 90, yelan: 90, xiangling: 90, layla: 90 };
    const out = instantiate(toy, scores, new Set());
    const team = out as { members: { characterKey: string }[] };
    const keys = team.members.map((m) => m.characterKey);
    expect(new Set(keys).size).toBe(4);
  });

  it('reports a one-slot gap with the role and the candidates', () => {
    const scores = { hu_tao: 90, xingqiu: 90, bennett: 90 }; // no sustain owned
    const out = instantiate(toy, scores, new Set());
    expect(out).not.toBeNull();
    expect('missing' in out!).toBe(true);
    const gap = (
      out as { missing: { missingRole: string; candidates: string[] } }
    ).missing;
    expect(gap.missingRole).toBe('sustain');
    expect(gap.candidates).toEqual(['zhongli', 'layla']);
  });

  it('returns null when more than one slot is unfillable', () => {
    expect(instantiate(toy, { hu_tao: 90, xingqiu: 90 }, new Set())).toBeNull();
  });

  it('honours the exclusion set', () => {
    const scores = {
      hu_tao: 90,
      xingqiu: 90,
      bennett: 90,
      zhongli: 90,
      layla: 90,
    };
    const out = instantiate(toy, scores, new Set(['zhongli'])) as {
      members: { characterKey: string }[];
    };
    expect(out.members.map((m) => m.characterKey)).toContain('layla');
    expect(out.members.map((m) => m.characterKey)).not.toContain('zhongli');
  });
});

describe('recommendAbyss', () => {
  it('returns nothing for an empty roster', () => {
    const out = recommendAbyss({});
    expect(out.teams).toBeNull();
    expect(out.gaps).toEqual([]);
  });

  it('picks two fully disjoint halves', () => {
    // A roster that can field two teams only if the pair search avoids overlap.
    const scores: Record<string, number> = {};
    for (const key of [
      'neuvillette',
      'furina',
      'kaedehara_kazuha',
      'charlotte',
      'raiden_shogun',
      'xiangling',
      'xingqiu',
      'bennett',
    ])
      scores[key] = 90;
    const out = recommendAbyss(scores);
    expect(out.teams).not.toBeNull();
    const [a, b] = out.teams!;
    const keys = [...a.members, ...b.members].map((m) => m.characterKey);
    expect(new Set(keys).size).toBe(8);
    expect(a.score).toBeGreaterThan(0);
    expect(b.score).toBeGreaterThan(0);
  });

  it('collects near-miss archetypes as gaps', () => {
    const scores = { hu_tao: 90, xingqiu: 90, yelan: 90 }; // hu-tao-vape lacks a sustain
    const out = recommendAbyss(scores);
    const gap = out.gaps.find((g) => g.archetypeId === 'hu-tao-vape');
    expect(gap?.missingRole).toBe('sustain');
    expect(gap?.candidates).toContain('zhongli');
    expect(gap?.bestPossibleScore).toBeGreaterThan(0);
  });

  it('rates the ideal lineup above the same team built on substitutes', () => {
    const score = (scores: Record<string, number>) =>
      (instantiate(arch('hu-tao-vape'), scores, new Set()) as TeamInstance)
        .score;
    const ideal = score({ hu_tao: 90, xingqiu: 90, yelan: 90, zhongli: 90 });
    const subs = score({ hu_tao: 90, yelan: 90, xingqiu: 90, layla: 90 });
    expect(ideal).toBeGreaterThan(subs);
    expect(arch('hu-tao-vape').tier).toBe(1);
  });
});

// End-to-end over the committed synthetic GOOD export: parse -> build score ->
// recommendation. Runs everywhere, unlike the local-only fixture it replaced.
describe('recommendAbyss on the sample account fixture', () => {
  /** Score every owned character from the fixture, the way the app does. */
  function scoreSampleRoster(): Record<string, number> {
    const roster = parseGOODRoster(loadSampleGOOD());
    const artifacts = parseGOOD(loadSampleGOOD()) as Artifact[];
    const byLocation: Record<string, Artifact[]> = {};
    for (const a of artifacts)
      if (a.location) (byLocation[a.location] ??= []).push(a);
    const scores: Record<string, number> = {};
    for (const [key, entry] of Object.entries(roster))
      scores[key] = computeBuildScore(entry, byLocation[key] ?? []).total;
    return scores;
  }

  it('scores the imported roster by how built each character is', () => {
    const scores = scoreSampleRoster();
    expect(Object.keys(scores)).toHaveLength(8);
    expect(Object.values(scores).every((s) => s > 0)).toBe(true);
    // Neuvillette wears a full five-piece set; Xingqiu wears none, so the
    // artifact components separate them even though both are level 90.
    expect(scores['neuvillette']).toBeGreaterThan(scores['xingqiu']);
    expect(scores['neuvillette']).toBeGreaterThan(70); // "built" band
    expect(scores['xingqiu']).toBeLessThan(70);
  });

  it('fields two disjoint teams from the imported roster', () => {
    const out = recommendAbyss(scoreSampleRoster());
    expect(out.teams).not.toBeNull();
    const [first, second] = out.teams!;
    expect(first.score).toBeGreaterThan(0);
    expect(second.score).toBeGreaterThan(0);
    const keys = [...first.members, ...second.members].map(
      (m) => m.characterKey,
    );
    expect(new Set(keys).size).toBe(8);
    // Snapshot the chosen archetypes so meta/curation drift shows as a diff.
    expect([first.archetypeId, second.archetypeId]).toMatchInlineSnapshot(`
      [
        "raiden-national",
        "neuvillette-mono-hydro",
      ]
    `);
  });
});
