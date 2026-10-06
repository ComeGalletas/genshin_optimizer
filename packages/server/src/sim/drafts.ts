/**
 * Drafted rotations and the owner's review (TODO 5.7, ADR-0043).
 *
 * - **Draft** (`draftRotation`, what the LLM tools call): a rotation for
 *   characters the owner has, run on their equipped builds, which become
 *   its reference builds. It is saved only once it passes the library's
 *   checks and gcsim parses it and runs it cleanly, and it is always saved
 *   as `draft`. It never replaces a rotation that isn't itself an LLM
 *   draft, nor a validated one.
 * - **Review** (`reviewRotation`, the owner's CLI): a full run on the
 *   reference builds plus gcsim's sample of one fight, written to
 *   `review.md` step by step, with the fingerprint of the files reviewed.
 * - **Promote** (`promoteRotation`, the owner's CLI only, never a tool):
 *   `validated`, with the review recorded, if the files are still the ones
 *   reviewed, with the same gcsim.
 * @packageDocumentation
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as z from 'zod';
import {
  characterLines,
  type SimCharacter,
} from '@genshin-build-lab/engine/sim/configgen';
import {
  simCharacterFromAccount,
  type SimAccount,
} from '@genshin-build-lab/engine/sim/account';
import {
  rotationConfig,
  rotationIssues,
  STANDARD_FIGHT,
  type Rotation,
  type RotationMeta,
} from '@genshin-build-lab/engine/sim/rotation';
import {
  sampleTable,
  summarizeSample,
} from '@genshin-build-lab/engine/sim/sample';
import { DISPLAY_NAMES } from '@genshin-build-lab/engine/game/genshin/adapter';
import { setsInPlay, unsimulated } from '@genshin-build-lab/engine/sim/support';
import { GcsimError, gcsimPath, loadGcsimTool } from './gcsim';
import type { SimResult } from './result';
import { SimRunner, SimTimeout, type SimOptions } from './runner';
import {
  loadRotation,
  ROTATIONS_DIR,
  rotationFingerprint,
  writeMeta,
  writeRotation,
} from './rotations';
import { round1 } from '@genshin-build-lab/engine/numbers';

/** What a model sends to draft a rotation. */
export const DraftInput = z.strictObject({
  id: z
    .string()
    .max(60)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  name: z.string().min(1).max(80),
  /** A curated comp archetype id (`teams/comps.ts`). */
  archetype: z.string().max(60),
  summary: z.string().min(1).max(600),
  slots: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[a-z][a-z0-9_]*$/),
        character: z.string().max(64),
        role: z.string().min(1).max(40),
        filler: z.union([z.string().max(40), z.literal(false)]).optional(),
      }),
    )
    .min(1)
    .max(4),
  active: z.string().max(40),
  template: z.string().min(1).max(20_000),
  energyWait: z.enum(['idle', 'attack']).optional(),
  rotationSec: z.number().positive().max(120).optional(),
  /** What it was drafted from and why: the meta's `source.changes`. */
  notes: z.string().min(1).max(600),
  /** A published config it adapts, if any. */
  basedOn: z.string().url().optional(),
});
export type DraftInput = z.infer<typeof DraftInput>;

/** What the drafting, review and promotion need. */
export interface RotationDeps {
  dir?: string;
  runner: {
    run(config: string, options?: SimOptions): Promise<SimResult>;
    runWithSample(
      config: string,
      options?: SimOptions,
    ): Promise<{ result: SimResult; sample: unknown }>;
  };
  /** The pinned gcsim version, e.g. `v2.48.8`. */
  gcsim: string;
  /** The pinned gcsim commit, for the result cache (5.4); the version
   *  when left out. */
  commit?: string;
  /** Today, `YYYY-MM-DD`. */
  today?: () => string;
}

/** The pinned gcsim, if `npm run sim:check` installed it here. */
export function installedRotationDeps(): RotationDeps | undefined {
  try {
    const tool = loadGcsimTool();
    const path = gcsimPath(tool);
    return existsSync(path)
      ? {
          runner: new SimRunner(path),
          gcsim: tool.version,
          commit: tool.commit,
        }
      : undefined;
  } catch {
    return undefined;
  }
}

const CHECK_ITERATIONS = 300;
const CHECK_TIMEOUT_MS = 60_000;
const REVIEW_ITERATIONS = 1000;
const REVIEW_TIMEOUT_MS = 120_000;

const isoToday = () => new Date().toISOString().slice(0, 10);

export type DraftOutcome =
  | {
      saved: true;
      id: string;
      status: 'draft';
      dps: number;
      sd: number;
      durationSec: number;
      warnings: string[];
      /** Seconds each character waited on energy for a burst. */
      energyWaitSec: Record<string, number>;
      next: string;
    }
  | { saved: false; problems: string[] };

/** A failed run, as problems a model can act on. */
function runProblem(e: unknown): string[] {
  if (e instanceof SimTimeout)
    return [
      `it didn't finish within ${CHECK_TIMEOUT_MS / 1000} s: against the standard target the action list has to end (a for loop of 4 or 5 rotations, not while 1)`,
    ];
  if (e instanceof GcsimError) return [`gcsim refused it: ${e.message}`];
  throw e;
}

/** Draft a rotation and, if it passes, save it as a draft. */
export async function draftRotation(
  input: DraftInput,
  account: SimAccount,
  deps: RotationDeps,
): Promise<DraftOutcome> {
  const dir = deps.dir ?? ROTATIONS_DIR;
  const today = (deps.today ?? isoToday)();
  if (existsSync(join(dir, input.id, 'meta.json'))) {
    let existing: Rotation | undefined;
    try {
      existing = loadRotation(input.id, dir);
    } catch {
      existing = undefined;
    }
    if (
      !existing ||
      existing.meta.source.kind !== 'llm' ||
      existing.meta.status !== 'draft'
    )
      return {
        saved: false,
        problems: [
          `a rotation "${input.id}" exists and isn't an LLM draft: choose another id`,
        ],
      };
  }

  const problems: string[] = [];
  const builds: SimCharacter[] = [];
  for (const s of input.slots) {
    const c = simCharacterFromAccount(account, s.character);
    if ('problem' in c) problems.push(c.problem);
    else builds.push(c);
  }
  if (problems.length) return { saved: false, problems };
  // What gcsim lacks can't be drafted for (TODO 5.9): say so before running.
  const lacking = unsimulated(
    {
      characters: builds.map((c) => c.key),
      weapons: builds.map((c) => c.weapon.key),
      sets: builds.flatMap((c) => setsInPlay(c.artifacts)),
    },
    DISPLAY_NAMES,
  );
  if (lacking.length)
    return {
      saved: false,
      problems: lacking.map((l) => `${l}, so this team can't be simulated`),
    };

  const meta: RotationMeta = {
    id: input.id,
    archetype: input.archetype,
    name: input.name,
    status: 'draft',
    summary: input.summary,
    slots: input.slots.map((s) => ({
      id: s.id,
      characters: [s.character],
      role: s.role,
      ...(s.filler !== undefined && { filler: s.filler }),
    })),
    active: input.active,
    fight: STANDARD_FIGHT,
    energyWait: input.energyWait ?? 'attack',
    ...(input.rotationSec !== undefined && { rotationSec: input.rotationSec }),
    source: {
      kind: 'llm',
      title: `${input.name}, drafted by a language model`,
      ...(input.basedOn && { url: input.basedOn }),
      retrieved: today,
      changes: input.notes,
    },
  };
  const reference = [
    `# Reference builds: the owner's equipped builds on ${today}.`,
    ...builds.flatMap((c) => [...characterLines(c), '']),
  ]
    .join('\n')
    .trimEnd()
    .concat('\n');
  const template = input.template.replace(/\r\n/g, '\n').trimEnd() + '\n';
  const issues = rotationIssues({ meta, template, reference });
  if (issues.length) return { saved: false, problems: issues };

  const rotation: Rotation = { meta, template, reference };
  let result: SimResult;
  try {
    result = await deps.runner.run(
      rotationConfig(rotation, 'reference', { iterations: CHECK_ITERATIONS }),
      { timeoutMs: CHECK_TIMEOUT_MS },
    );
  } catch (e) {
    return { saved: false, problems: runProblem(e) };
  }
  if (result.incomplete.length)
    return {
      saved: false,
      problems: [
        `gcsim implements ${result.incomplete.join(', ')} only partly, so the run can't be trusted`,
      ],
    };

  meta.validation = {
    gcsim: deps.gcsim,
    date: today,
    iterations: result.iterations,
    dps: Math.round(result.dps.mean),
    sd: Math.round(result.dps.sd),
    durationSec: round1(result.durationSec),
    warnings: result.warnings,
  };
  writeRotation(rotation, dir);
  // A review of an earlier version no longer applies.
  rmSync(join(dir, input.id, 'review.md'), { force: true });
  return {
    saved: true,
    id: input.id,
    status: 'draft',
    dps: meta.validation.dps,
    sd: meta.validation.sd,
    durationSec: meta.validation.durationSec,
    warnings: result.warnings,
    energyWaitSec: Object.fromEntries(
      result.characters.map((c) => [c.name, round1(c.energyWaitSec)]),
    ),
    next: `Saved as a draft. The owner reviews it with \`npm run rotations -- review ${input.id}\` and promotes it with \`npm run rotations -- promote ${input.id}\`; until then it stays a draft.`,
  };
}

const int = (x: number) => Math.round(x).toLocaleString('en-US');

/** The review the owner reads before promoting. */
function reviewText(
  r: Rotation,
  fingerprint: string,
  gcsim: string,
  date: string,
  result: SimResult,
  sample: ReturnType<typeof summarizeSample>,
): string {
  const { meta } = r;
  const src = meta.source;
  return [
    `# Review: ${meta.name} (\`${meta.id}\`)`,
    '',
    `- Status: ${meta.status}. Source: ${src.kind}, ${src.title}${src.url ? ` (${src.url})` : ''}. ${src.changes}`,
    `- Fingerprint: \`${fingerprint}\``,
    `- gcsim ${gcsim}, ${date}, on the reference builds; burst waits ${meta.energyWait ?? 'idle'}.`,
    '',
    '## Result',
    '',
    `${int(result.dps.mean)} DPS ± ${int(result.dps.sd)} over ${result.durationSec.toFixed(1)} s (${result.iterations} iterations). Warnings: ${result.warnings.length ? result.warnings.join(', ') : 'none'}.`,
    '',
    '| Character | DPS | Share | On field (s) | Waited for energy (s) |',
    '| --------- | --: | ----: | -----------: | --------------------: |',
    ...result.characters.map(
      (c) =>
        `| ${c.name} | ${int(c.dps.mean)} | ${(100 * c.share).toFixed(0)}% | ${c.fieldTimeSec.toFixed(1)} | ${c.energyWaitSec.toFixed(1)} |`,
    ),
    '',
    `Reactions per run: ${
      Object.entries(result.reactions)
        .map(([k, v]) => `${k} ${v.toFixed(0)}`)
        .join(', ') || 'none'
    }.`,
    '',
    `## One fight, step by step (seed ${sample.seed ?? 'unknown'}, ${sample.lengthSec.toFixed(1)} s)`,
    '',
    sampleTable(sample),
    '',
    '## Template',
    '',
    '```text',
    r.template.trimEnd(),
    '```',
    '',
    '## Promote',
    '',
    `If this is right, the owner promotes it with \`npm run rotations -- promote ${meta.id}\`. Any change to its files after this review needs a new review.`,
    '',
  ].join('\n');
}

/** Run a rotation for review and write `review.md` beside it. */
export async function reviewRotation(
  id: string,
  deps: RotationDeps,
): Promise<{ path: string; fingerprint: string; result: SimResult }> {
  const dir = deps.dir ?? ROTATIONS_DIR;
  const today = (deps.today ?? isoToday)();
  const rotation = loadRotation(id, dir);
  if (!rotation.reference)
    throw new Error(`rotation ${id} has no reference builds to review on`);
  const { result, sample } = await deps.runner.runWithSample(
    rotationConfig(rotation, 'reference', { iterations: REVIEW_ITERATIONS }),
    { timeoutMs: REVIEW_TIMEOUT_MS },
  );
  if (result.incomplete.length)
    throw new Error(
      `gcsim implements ${result.incomplete.join(', ')} only partly: nothing to review`,
    );
  const fingerprint = rotationFingerprint(rotation);
  const path = join(dir, id, 'review.md');
  const published = rotation.meta.source.publishedDps;
  writeFileSync(
    path,
    reviewText(
      rotation,
      fingerprint,
      deps.gcsim,
      today,
      result,
      summarizeSample(sample),
    ),
  );
  writeMeta(
    {
      ...rotation.meta,
      validation: {
        gcsim: deps.gcsim,
        date: today,
        iterations: result.iterations,
        dps: Math.round(result.dps.mean),
        sd: Math.round(result.dps.sd),
        durationSec: round1(result.durationSec),
        warnings: result.warnings,
        ...(published && {
          offPct:
            Math.round((10_000 * (result.dps.mean - published)) / published) /
            100,
        }),
      },
    },
    dir,
  );
  return { path, fingerprint, result };
}

/** Promote a reviewed draft. Only the owner's CLI calls this. */
export function promoteRotation(
  id: string,
  deps: Pick<RotationDeps, 'dir' | 'gcsim' | 'today'> & { note?: string },
): { promoted: true } | { promoted: false; problems: string[] } {
  const dir = deps.dir ?? ROTATIONS_DIR;
  const rotation = loadRotation(id, dir);
  const { meta } = rotation;
  if (meta.status === 'validated')
    return { promoted: false, problems: [`${id} is already validated`] };
  const reviewPath = join(dir, id, 'review.md');
  if (!existsSync(reviewPath))
    return {
      promoted: false,
      problems: [
        `${id} has no review: run npm run rotations -- review ${id} and read it first`,
      ],
    };
  const review = readFileSync(reviewPath, 'utf8');
  const reviewed = /Fingerprint: `([0-9a-f]{64})`/.exec(review)?.[1];
  const reviewedWith = /gcsim (v\d+\.\d+\.\d+)/.exec(review)?.[1];
  const fingerprint = rotationFingerprint(rotation);
  const problems: string[] = [];
  if (reviewed !== fingerprint)
    problems.push(
      `${id} changed since its review: review it again (npm run rotations -- review ${id})`,
    );
  if (reviewedWith !== deps.gcsim || meta.validation?.gcsim !== deps.gcsim)
    problems.push(
      `${id} was reviewed with gcsim ${reviewedWith ?? 'unknown'}, the pin is ${deps.gcsim}: review it again`,
    );
  if (problems.length) return { promoted: false, problems };
  const promoted: RotationMeta = {
    ...meta,
    status: 'validated',
    review: {
      by: 'owner',
      date: (deps.today ?? isoToday)(),
      gcsim: deps.gcsim,
      fingerprint,
      ...(deps.note && { note: deps.note }),
    },
  };
  const issues = rotationIssues({ ...rotation, meta: promoted });
  if (issues.length) return { promoted: false, problems: issues };
  writeMeta(promoted, dir);
  return { promoted: true };
}
