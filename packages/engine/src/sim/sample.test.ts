import { describe, it, expect } from 'vitest';
import { sampleTable, summarizeSample } from './sample';

const act = (frame: number, who: number, action: string) => ({
  event: 'action',
  frame,
  char_index: who,
  msg: `executed ${action}`,
  logs: { action },
});
const hit = (frame: number, damage: number, amp = '', cata = '') => ({
  event: 'damage',
  frame,
  char_index: 0,
  msg: 'hit',
  logs: { damage, amp, cata },
});

/** A tiny sample in gcsim's shape: Raiden E, swap to Nahida E Q, back to
 *  Raiden Q N4 D N3. */
const SAMPLE = {
  initial_character: 'raidenshogun',
  seed: 42,
  character_details: [{ name: 'raidenshogun' }, { name: 'nahida' }],
  logs: [
    act(1, 0, 'skill'),
    {
      event: 'action',
      frame: 37,
      char_index: 0,
      msg: 'swapping raidenshogun to nahida',
      logs: {},
    },
    act(49, 1, 'swap'),
    act(49, 1, 'skill'),
    hit(62, 1000),
    act(81, 1, 'burst'),
    act(240, 0, 'burst'),
    ...[300, 320, 340, 360].map((f) => act(f, 0, 'attack')),
    hit(301, 5000, '', 'aggravate'),
    hit(321, 4000, '', 'spread'),
    hit(341, 6000, '', 'aggravate'),
    act(380, 0, 'dash'),
    ...[400, 420, 440].map((f) => act(f, 0, 'attack')),
    { event: 'energy', frame: 599, char_index: 0, msg: 'particle', logs: {} },
  ],
};

describe('summarizeSample', () => {
  it('one row per stretch on field, in KQM notation, with the team’s damage and reactions meanwhile', () => {
    expect(summarizeSample(SAMPLE)).toEqual({
      seed: '42',
      lengthSec: 599 / 60,
      rows: [
        {
          startSec: 1 / 60,
          endSec: 49 / 60,
          character: 'raidenshogun',
          actions: 'E',
          damage: 0,
          reactions: {},
        },
        {
          startSec: 49 / 60,
          endSec: 4,
          character: 'nahida',
          actions: 'E Q',
          damage: 1000,
          reactions: {},
        },
        {
          startSec: 4,
          endSec: 10,
          character: 'raidenshogun',
          actions: 'Q N4 D N3',
          damage: 15000,
          reactions: { aggravate: 2, spread: 1 },
        },
      ],
    });
  });

  it('refuses what isn’t a sample', () => {
    expect(() => summarizeSample({ logs: 'nope' })).toThrow();
  });

  it('renders a Markdown table', () => {
    expect(sampleTable(summarizeSample(SAMPLE)).split('\n')).toEqual([
      '| Time (s) | On field | Actions | Team damage | Reactions |',
      '| -------- | -------- | ------- | ----------: | --------- |',
      '| 0.0–0.8 | raidenshogun | E | 0 |  |',
      '| 0.8–4.0 | nahida | E Q | 1,000 |  |',
      '| 4.0–10.0 | raidenshogun | Q N4 D N3 | 15,000 | aggravate ×2, spread ×1 |',
    ]);
  });
});
