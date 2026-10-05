import { readFileSync } from 'node:fs';
import { readResult, SimResultError } from './result';
import { withOptions } from './runner';

/** A real gcsim v2.48.8 result, trimmed to the fields the reader uses. */
const REAL = JSON.parse(
  readFileSync(
    new URL('./__fixtures__/raiden-national-30.json', import.meta.url),
    'utf8',
  ),
);

describe('readResult, on a real gcsim result', () => {
  const r = readResult(REAL);

  it('reads team DPS with its spread, and the run behind it', () => {
    expect(r).toMatchObject({
      simVersion: '1f9c1f2e9698239a24b44e38a21358a00fd16bff',
      iterations: 30,
      mode: 'duration',
      durationSec: 90,
    });
    expect(r.dps.mean).toBeCloseTo(34354, 0);
    expect(r.dps.sd).toBeGreaterThan(0);
    expect(r.dps.min).toBeLessThan(r.dps.mean);
    expect(r.dps.max).toBeGreaterThan(r.dps.mean);
    expect(r.dps.median).toBeDefined();
  });

  it('per character: DPS adding up to the team, shares to 1, field time to the fight', () => {
    expect(r.characters.map((c) => c.name)).toEqual([
      'raidenshogun',
      'xiangling',
      'yelan',
      'bennett',
    ]);
    const sum = (f: (c: (typeof r.characters)[number]) => number) =>
      r.characters.reduce((t, c) => t + f(c), 0);
    expect(sum((c) => c.dps.mean)).toBeCloseTo(r.dps.mean, 3);
    expect(sum((c) => c.share)).toBeCloseTo(1, 9);
    // Seconds, not frames: the four field times are the 90 s fight.
    expect(sum((c) => c.fieldTimeSec)).toBeCloseTo(90, 3);
  });

  it('reactions, energy and warnings', () => {
    // Raiden triggers electro-charged and overload with this team.
    expect(Object.keys(r.characters[0].reactions).sort()).toEqual([
      'electrocharged',
      'overload',
    ]);
    // The team total is the sum over characters.
    expect(r.reactions.overload).toBeCloseTo(
      r.characters.reduce((t, c) => t + (c.reactions.overload ?? 0), 0),
      9,
    );
    expect(Object.keys(r.characters[0].energyBySource).length).toBeGreaterThan(
      0,
    );
    for (const c of r.characters) {
      expect(c.endingEnergy).toBeGreaterThanOrEqual(0);
      expect(c.energyWaitSec).toBeGreaterThanOrEqual(0);
    }
    expect(r.warnings).toEqual(['insufficient_energy', 'burst_cd']);
    expect(r.incomplete).toEqual([]);
  });
});

describe('readResult, refusing what it cannot read', () => {
  it('a result without numbers is an error, not zero', () => {
    expect(() =>
      readResult({ statistics: { iterations: 1, dps: {} } }),
    ).toThrow(/no mean DPS/);
    expect(() => readResult({ nope: true })).toThrow(SimResultError);
  });

  it('a fight to the target’s death is marked, since it isn’t comparable', () => {
    expect(readResult({ ...REAL, mode: 2 }).mode).toBe('damage');
  });

  it('a partly implemented character is reported', () => {
    expect(
      readResult({ ...REAL, incomplete_characters: ['sandrone'] }).incomplete,
    ).toEqual(['sandrone']);
  });
});

describe('withOptions', () => {
  const config =
    'options iteration=200 duration=90 swap_delay=12;\nactive raiden;\n';

  it('sets iterations, duration and workers in the options line, keeping the rest', () => {
    expect(withOptions(config, { iterations: 500, workers: 4 })).toBe(
      'options duration=90 swap_delay=12 iteration=500 workers=4;\nactive raiden;\n',
    );
    expect(withOptions(config, { duration: 120 })).toBe(
      'options iteration=200 swap_delay=12 duration=120;\nactive raiden;\n',
    );
  });

  it('adds an options line when there is none, and changes nothing when asked nothing', () => {
    expect(withOptions('active raiden;\n', { iterations: 100 })).toBe(
      'options iteration=100;\nactive raiden;\n',
    );
    expect(withOptions(config, {})).toBe(config);
  });

  it('touches only the options line, not a comment or an action that mentions it', () => {
    const tricky =
      '# options iteration=5 is too few\noptions iteration=200;\nraiden attack;\n';
    expect(withOptions(tricky, { iterations: 50 })).toBe(
      '# options iteration=5 is too few\noptions iteration=50;\nraiden attack;\n',
    );
  });
});
