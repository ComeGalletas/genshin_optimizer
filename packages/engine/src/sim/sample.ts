/**
 * One simulated fight, step by step (TODO 5.7): gcsim's sample (`-sample`,
 * the full event log of one iteration) condensed into what the owner reviews
 * before a drafted rotation is promoted. Each row is one stretch a character
 * holds the field: when, who, what they did in KQM's notation (`Q N4 D E`),
 * the team's damage meanwhile and the reactions it came with. Pure.
 * @packageDocumentation
 */

import * as z from 'zod/mini';
import { formatCount } from '../labels-core';

const Sample = z.looseObject({
  initial_character: z.optional(z.string()),
  seed: z.optional(z.union([z.string(), z.number()])),
  character_details: z.array(z.looseObject({ name: z.string() })),
  logs: z.array(
    z.looseObject({
      event: z.string(),
      frame: z.number(),
      char_index: z.number(),
      msg: z.string(),
      logs: z.optional(z.record(z.string(), z.unknown())),
    }),
  ),
});

/** gcsim runs at 60 frames a second. */
const FPS = 60;

/** Actions in KQM's notation; anything else keeps its gcsim name. */
const NOTATION: Record<string, string> = {
  attack: 'N',
  charge: 'C',
  skill: 'E',
  burst: 'Q',
  dash: 'D',
  jump: 'J',
  walk: 'W',
  aim: 'A',
  high_plunge: 'HP',
  low_plunge: 'LP',
};

export interface SampleRow {
  startSec: number;
  endSec: number;
  /** gcsim name of the character on field. */
  character: string;
  /** What they did, e.g. `Q N4 D N4 E N4 D N3`. */
  actions: string;
  /** Damage the whole team dealt during the stretch. */
  damage: number;
  /** Amplifying and catalyzing reactions on that damage, by name. */
  reactions: Record<string, number>;
}

export interface SampleSummary {
  seed?: string;
  lengthSec: number;
  rows: SampleRow[];
}

/** "N" ×4 → "N4"; other repeats are written out ("E E"). */
function notate(actions: string[]): string {
  const out: string[] = [];
  for (let i = 0; i < actions.length;) {
    const a = NOTATION[actions[i]] ?? actions[i];
    let n = 1;
    while (a === 'N' && actions[i + n] === actions[i]) n++;
    out.push(n > 1 ? `N${n}` : a);
    i += n;
  }
  return out.join(' ');
}

/** The sample as rows, one per stretch on field. Throws on something that
 *  isn't a gcsim sample. */
export function summarizeSample(input: unknown): SampleSummary {
  const sample = Sample.parse(input);
  const names = sample.character_details.map((c) => c.name);
  const acts = sample.logs
    .filter(
      (l) =>
        l.event === 'action' &&
        l.msg.startsWith('executed') &&
        typeof l.logs?.action === 'string' &&
        l.logs.action !== 'swap',
    )
    .sort((a, b) => a.frame - b.frame);
  const damage = sample.logs.filter((l) => l.event === 'damage');
  const lastFrame = Math.max(0, ...sample.logs.map((l) => l.frame));
  const stretches: { who: number; start: number; actions: string[] }[] = [];
  for (const a of acts) {
    const last = stretches.at(-1);
    if (last && last.who === a.char_index)
      last.actions.push(String(a.logs!.action));
    else
      stretches.push({
        who: a.char_index,
        start: a.frame,
        actions: [String(a.logs!.action)],
      });
  }
  const rows = stretches.map((s, i): SampleRow => {
    const end = stretches[i + 1]?.start ?? lastFrame + 1;
    const reactions: Record<string, number> = {};
    let total = 0;
    for (const d of damage) {
      if (d.frame < s.start || d.frame >= end) continue;
      total += typeof d.logs?.damage === 'number' ? d.logs.damage : 0;
      for (const k of ['amp', 'cata'] as const) {
        const r = d.logs?.[k];
        if (typeof r === 'string' && r) reactions[r] = (reactions[r] ?? 0) + 1;
      }
    }
    return {
      startSec: s.start / FPS,
      endSec: end / FPS,
      character: names[s.who] ?? `#${s.who}`,
      actions: notate(s.actions),
      damage: total,
      reactions,
    };
  });
  return {
    ...(sample.seed !== undefined && { seed: String(sample.seed) }),
    lengthSec: lastFrame / FPS,
    rows,
  };
}

const int = (x: number) => formatCount(Math.round(x));

/** The rows as a Markdown table. */
export function sampleTable(summary: SampleSummary): string {
  const lines = [
    '| Time (s) | On field | Actions | Team damage | Reactions |',
    '| -------- | -------- | ------- | ----------: | --------- |',
  ];
  for (const r of summary.rows)
    lines.push(
      `| ${r.startSec.toFixed(1)}–${r.endSec.toFixed(1)} | ${r.character} | ${r.actions} | ${int(r.damage)} | ${Object.entries(
        r.reactions,
      )
        .map(([k, n]) => `${k} ×${n}`)
        .join(', ')} |`,
    );
  return lines.join('\n');
}
