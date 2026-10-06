/**
 * The rotation library on disk (TODO 5.6, ADR-0041): `rotations/<id>/` with
 * `meta.json`, `rotation.gcsl.tmpl` and, for a rotation checked on
 * reference builds, `reference.gcsl`. Every rotation is checked as it loads
 * (`rotationIssues`), and one that fails is refused with its reasons,
 * never half-used. A rotation the owner reviewed (5.7) carries the
 * fingerprint of its files as reviewed; a validated one changed since is
 * refused until it's reviewed again.
 * @packageDocumentation
 */

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  rotationIssues,
  RotationMetaSchema,
  type Rotation,
  type RotationMeta,
} from '@genshin-build-lab/engine/sim/rotation';
import { fromRoot } from '../paths';

export const ROTATIONS_DIR = fromRoot('rotations');

export class RotationError extends Error {
  constructor(
    readonly id: string,
    readonly issues: string[],
  ) {
    super(`rotation ${id}: ${issues.join('; ')}`);
  }
}

/** One rotation, checked. */
export function loadRotation(id: string, dir = ROTATIONS_DIR): Rotation {
  const at = (f: string) => join(dir, id, f);
  const read = (f: string) =>
    readFileSync(at(f), 'utf8').replace(/\r\n/g, '\n');
  if (!existsSync(at('meta.json')))
    throw new RotationError(id, ['no meta.json']);
  let meta: unknown;
  try {
    meta = JSON.parse(read('meta.json'));
  } catch (e) {
    throw new RotationError(id, [`meta.json: ${(e as Error).message}`]);
  }
  if (!existsSync(at('rotation.gcsl.tmpl')))
    throw new RotationError(id, ['no rotation.gcsl.tmpl']);
  const template = read('rotation.gcsl.tmpl');
  const reference = existsSync(at('reference.gcsl'))
    ? read('reference.gcsl')
    : undefined;
  const issues = rotationIssues({ meta, template, reference });
  if (issues.length) throw new RotationError(id, issues);
  const parsed = RotationMetaSchema.parse(meta);
  if (parsed.id !== id)
    throw new RotationError(id, [
      `meta.id "${parsed.id}" is not its folder's name`,
    ]);
  const rotation = {
    meta: parsed,
    template,
    ...(reference !== undefined && { reference }),
  };
  if (
    parsed.status === 'validated' &&
    parsed.review &&
    parsed.review.fingerprint !== rotationFingerprint(rotation)
  )
    throw new RotationError(id, [
      `changed since the owner's review on ${parsed.review.date}: review it again (npm run rotations -- review ${id})`,
    ]);
  return rotation;
}

/** What the owner reviews: the template, the reference builds and the
 *  meta without its status, validation and review (which change when a
 *  rotation is checked or promoted, not what it does). */
export function rotationFingerprint(r: Rotation): string {
  const meta: Partial<RotationMeta> = { ...r.meta };
  delete meta.status;
  delete meta.validation;
  delete meta.review;
  return createHash('sha256')
    .update(
      JSON.stringify({
        meta,
        template: r.template.replace(/\r\n/g, '\n'),
        reference: r.reference?.replace(/\r\n/g, '\n') ?? null,
      }),
    )
    .digest('hex');
}

/** Write a rotation's files (meta, template, reference builds). */
export function writeRotation(r: Rotation, dir = ROTATIONS_DIR): void {
  const at = join(dir, r.meta.id);
  mkdirSync(at, { recursive: true });
  writeMeta(r.meta, dir);
  writeFileSync(join(at, 'rotation.gcsl.tmpl'), r.template);
  if (r.reference !== undefined)
    writeFileSync(join(at, 'reference.gcsl'), r.reference);
}

/** Write a rotation's meta.json alone. */
export function writeMeta(meta: RotationMeta, dir = ROTATIONS_DIR): void {
  writeFileSync(join(dir, meta.id, 'meta.json'), formatJson(meta));
}

const PRINT_WIDTH = 80;
const PRIMITIVE = String.raw`(?:"(?:[^"\\]|\\.)*"|-?\d[\d.eE+-]*|true|false|null)`;
/** A multi-line array of primitives in `JSON.stringify`'s output. */
const PRIMITIVE_ARRAY = new RegExp(
  String.raw`^( *)(.*)\[\n((?: *${PRIMITIVE},?\n)+) *\](,?)$`,
  'gm',
);

/** JSON as Prettier writes it (CI checks): `JSON.stringify`'s two-space
 *  layout, with arrays of plain values on one line when they fit in the
 *  print width, as Prettier puts them. */
export function formatJson(value: unknown): string {
  const text = JSON.stringify(value, null, 2).replace(
    PRIMITIVE_ARRAY,
    (whole, indent: string, head: string, items: string, comma: string) => {
      const inline = `${indent}${head}[${items
        .trim()
        .split('\n')
        .map((l) => l.trim().replace(/,$/, ''))
        .join(', ')}]${comma}`;
      return inline.length <= PRINT_WIDTH ? inline : whole;
    },
  );
  return `${text}\n`;
}

/** Every rotation in the library, in folder order. */
export function loadRotations(dir = ROTATIONS_DIR): Rotation[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .map((id) => loadRotation(id, dir));
}
