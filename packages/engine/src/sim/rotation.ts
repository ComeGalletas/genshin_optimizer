/**
 * The rotation library (TODO 5.6, ADR-0041): a team's gcsim action list
 * with a placeholder for each character (`{{raiden}} burst;`), and its
 * `meta.json`: the slots and who can fill them, the fight it was written
 * for, where it came from, and the gcsim version it was checked with.
 * Pure; the server reads `rotations/<id>/` and runs it.
 *
 * - A **slot** is one place in the team. Its `characters` are the dataset
 *   keys that can fill it with the same actions (one, for every seed).
 * - The **fight** is part of the rotation: community rotations are a finite
 *   loop against a target too big to die, and gcsim runs them until the
 *   action list ends (`mode: "actions"`); cut at a fixed duration instead,
 *   the same list scores ~7% lower (Ayaka Freeze: 62,079 at 90 s against
 *   67,024 over its own ~104 s). `mode: "duration"` is for open-ended lists.
 * - **Status**: `validated` rotations reproduce a published result, or were
 *   reviewed by the owner; `draft` ones (adapted or drafted, 5.7) have only
 *   run cleanly, and say so.
 * @packageDocumentation
 */

import * as z from 'zod/mini';
import { genshinAdapter } from '../game/genshin/adapter';
import { COMP_ARCHETYPES } from '../teams/comps';
import { gcsimConfig, gcsimName, type SimCharacter } from './configgen';

const Id = z.string().check(z.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/));
const SlotId = z.string().check(z.regex(/^[a-z][a-z0-9_]*$/));
const Key = z.string().check(z.minLength(1), z.maxLength(64));

const Enemy = z.strictObject({
  level: z.number().check(z.int(), z.minimum(1), z.maximum(200)),
  /** percent */
  res: z.number().check(z.minimum(-100), z.maximum(100)),
  radius: z.optional(z.number().check(z.positive())),
  pos: z.optional(z.tuple([z.number(), z.number()])),
});

const Energy = z.string().check(z.regex(/^energy [^;\n]+;$/));

export const RotationMetaSchema = z.strictObject({
  id: Id,
  /** The curated comp archetype this is a rotation for (`teams/comps.ts`). */
  archetype: Id,
  name: z.string().check(z.minLength(1), z.maxLength(80)),
  status: z.enum(['validated', 'draft']),
  summary: z.string().check(z.minLength(1), z.maxLength(600)),
  slots: z
    .array(
      z.strictObject({
        id: SlotId,
        characters: z.array(Key).check(z.minLength(1), z.maxLength(8)),
        role: z.string().check(z.minLength(1), z.maxLength(40)),
      }),
    )
    .check(z.minLength(1), z.maxLength(4)),
  /** The slot on field when the fight starts. */
  active: SlotId,
  fight: z.discriminatedUnion('mode', [
    z.strictObject({
      mode: z.literal('actions'),
      enemy: z.extend(Enemy, { hp: z.number().check(z.positive()) }),
      energy: Energy,
    }),
    z.strictObject({
      mode: z.literal('duration'),
      seconds: z.number().check(z.positive(), z.maximum(600)),
      enemy: Enemy,
      energy: Energy,
    }),
  ]),
  /** One rotation's length, as its author gives it. */
  rotationSec: z.optional(z.number().check(z.positive(), z.maximum(120))),
  source: z.strictObject({
    /** `community`: taken from a published config, only renamed.
     *  `adapted`: changed from one (`changes` says how). */
    kind: z.enum(['community', 'adapted', 'owner', 'llm']),
    title: z.string().check(z.minLength(1)),
    url: z.url(),
    retrieved: z.iso.date(),
    /** The published mean DPS, for a config taken whole. */
    publishedDps: z.optional(z.number().check(z.positive())),
    changes: z.string().check(z.minLength(1)),
  }),
  /** The last check with the pinned gcsim, on the reference builds. */
  validation: z.optional(
    z.strictObject({
      gcsim: z.string().check(z.regex(/^v\d+\.\d+\.\d+$/)),
      date: z.iso.date(),
      iterations: z.number().check(z.int(), z.positive()),
      dps: z.number().check(z.positive()),
      sd: z.number().check(z.minimum(0)),
      durationSec: z.number().check(z.positive()),
      warnings: z.array(z.string()),
      /** Against `source.publishedDps`, percent. */
      offPct: z.optional(z.number()),
    }),
  ),
});

export type RotationMeta = z.infer<typeof RotationMetaSchema>;

export interface Rotation {
  meta: RotationMeta;
  /** The action list with `{{slot}}` placeholders. */
  template: string;
  /** Build lines for each slot's first character (gcsim syntax), with
   *  which the rotation was validated. */
  reference?: string;
}

const PLACEHOLDER = /\{\{([^{}]*)\}\}/g;

/** Problems with a rotation as a whole: the meta's shape, then its slots,
 *  its placeholders and the rules for its status. Empty when it's sound. */
export function rotationIssues(input: {
  meta: unknown;
  template: string;
  reference?: string;
}): string[] {
  const shape = RotationMetaSchema.safeParse(input.meta);
  if (!shape.success) return shape.error.issues.flatMap(describeIssue);
  const meta = shape.data;
  const out: string[] = [];
  const ids = meta.slots.map((s) => s.id);
  const dupe = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dupe) out.push(`slot "${dupe}" appears twice`);
  const keys = meta.slots.flatMap((s) => s.characters);
  const dupeKey = keys.find((k, i) => keys.indexOf(k) !== i);
  if (dupeKey) out.push(`"${dupeKey}" can fill more than one slot`);
  if (!COMP_ARCHETYPES.some((a) => a.id === meta.archetype))
    out.push(`archetype "${meta.archetype}" is not a curated archetype`);
  for (const k of keys)
    if (!genshinAdapter.character(k)) out.push(`"${k}" is not a character`);
  if (!ids.includes(meta.active))
    out.push(`active slot "${meta.active}" is not a slot`);
  const used = new Set<string>();
  for (const [, name] of input.template.matchAll(PLACEHOLDER)) {
    if (ids.includes(name)) used.add(name);
    else out.push(`template uses {{${name}}}, which is not a slot`);
  }
  for (const id of ids)
    if (!used.has(id)) out.push(`slot "${id}" never acts in the template`);
  if (/\{\{|\}\}/.test(input.template.replace(PLACEHOLDER, '')))
    out.push('template has an unclosed placeholder');
  if (meta.status === 'validated' && !meta.validation)
    out.push('a validated rotation needs its validation run');
  if (meta.status === 'validated' && meta.source.kind === 'llm')
    out.push(
      'an LLM-drafted rotation stays a draft until the owner reviews it',
    );
  if (
    meta.source.kind === 'community' &&
    meta.source.publishedDps === undefined
  )
    out.push('a community rotation records its published DPS');
  if (input.reference !== undefined) {
    const names = meta.slots.map((s) => gcsimName(s.characters[0]));
    for (const line of buildLines(input.reference)) {
      const who = line.split(/\s/, 1)[0];
      if (!names.includes(who))
        out.push(`reference line for "${who}", who is in no slot: ${line}`);
    }
    for (const n of names)
      if (!buildLines(input.reference).some((l) => l.startsWith(`${n} char `)))
        out.push(`reference has no "${n} char" line`);
  }
  return out;
}

type MetaIssue = NonNullable<
  ReturnType<typeof RotationMetaSchema.safeParse>['error']
>['issues'][number];

/** zod/mini has no English messages (ADR-0022): these are for a person
 *  editing `meta.json`. */
function describeIssue(issue: MetaIssue): string[] {
  const at = (p: readonly PropertyKey[]) =>
    ['meta', ...p.map(String)].join('.');
  switch (issue.code) {
    case 'unrecognized_keys':
      return issue.keys.map((k) => `${at([...issue.path, k])}: unknown field`);
    case 'invalid_type':
      return [`${at(issue.path)}: expected ${issue.expected}`];
    case 'invalid_value':
      return [
        `${at(issue.path)}: must be ${issue.values.map((v) => JSON.stringify(v)).join(' or ')}`,
      ];
    case 'invalid_format':
      return [
        'pattern' in issue && issue.format === 'regex'
          ? `${at(issue.path)}: must match ${String(issue.pattern)}`
          : `${at(issue.path)}: not a valid ${issue.format}`,
      ];
    case 'too_small':
      return [`${at(issue.path)}: at least ${issue.minimum}`];
    case 'too_big':
      return [`${at(issue.path)}: at most ${issue.maximum}`];
    case 'invalid_union':
      return [`${at(issue.path)}: not one of the accepted forms`];
    default:
      return [`${at(issue.path)}: ${issue.message}`];
  }
}

/** The non-comment lines of a reference block. */
function buildLines(reference: string): string[] {
  return reference
    .split('\n')
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean);
}

/** Which character fills each slot, for a team (dataset keys). Every slot
 *  needs one of its characters; the team may have no one else. */
export function assignSlots(
  meta: RotationMeta,
  team: readonly string[],
):
  | { ok: true; slots: Record<string, string> }
  | { ok: false; missing: string[]; extra: string[] } {
  const slots: Record<string, string> = {};
  const left = new Set(team);
  const missing: string[] = [];
  for (const s of meta.slots) {
    const who = s.characters.find((k) => left.has(k));
    if (who) {
      slots[s.id] = who;
      left.delete(who);
    } else missing.push(s.characters.join(' or '));
  }
  if (missing.length || left.size)
    return { ok: false, missing, extra: [...left] };
  return { ok: true, slots };
}

/** The template with each slot's character in gcsim's name. */
export function renderTemplate(
  template: string,
  slots: Record<string, string>,
): string {
  return template.replace(PLACEHOLDER, (_, id: string) => {
    const key = slots[id];
    if (!key) throw new Error(`no character for slot {{${id}}}`);
    return gcsimName(key);
  });
}

export interface RotationRun {
  iterations?: number;
  /** Only for `mode: "duration"`; overrides the rotation's seconds. */
  duration?: number;
}

/** A config for this rotation: our characters (one per slot, keyed by slot
 *  id) or, with `"reference"`, the rotation's reference builds. */
export function rotationConfig(
  rotation: Rotation,
  characters: Record<string, SimCharacter> | 'reference',
  run: RotationRun = {},
): string {
  const { meta } = rotation;
  let slots: Record<string, string>;
  let blocks: (SimCharacter | string)[];
  if (characters === 'reference') {
    if (!rotation.reference)
      throw new Error(`rotation ${meta.id} has no reference builds`);
    slots = Object.fromEntries(meta.slots.map((s) => [s.id, s.characters[0]]));
    blocks = [rotation.reference];
  } else {
    slots = {};
    blocks = [];
    for (const s of meta.slots) {
      const c = characters[s.id];
      if (!c) throw new Error(`no character for slot "${s.id}"`);
      if (!s.characters.includes(c.key))
        throw new Error(
          `${c.key} can't fill slot "${s.id}" (${s.characters.join(', ')})`,
        );
      slots[s.id] = c.key;
      blocks.push(c);
    }
  }
  const { fight } = meta;
  return gcsimConfig({
    characters: blocks,
    active: slots[meta.active],
    rotation: renderTemplate(rotation.template, slots),
    enemy: fight.enemy,
    energy: fight.energy,
    iterations: run.iterations,
    duration:
      fight.mode === 'duration' ? (run.duration ?? fight.seconds) : undefined,
  });
}
