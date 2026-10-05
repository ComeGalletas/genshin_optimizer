/**
 * The rotation library on disk (TODO 5.6, ADR-0041): `rotations/<id>/` with
 * `meta.json`, `rotation.gcsl.tmpl` and, for a rotation checked on
 * reference builds, `reference.gcsl`. Every rotation is checked as it loads
 * (`rotationIssues`), and one that fails is refused with its reasons,
 * never half-used.
 * @packageDocumentation
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  rotationIssues,
  RotationMetaSchema,
  type Rotation,
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
  return {
    meta: parsed,
    template,
    ...(reference !== undefined && { reference }),
  };
}

/** Every rotation in the library, in folder order. */
export function loadRotations(dir = ROTATIONS_DIR): Rotation[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .map((id) => loadRotation(id, dir));
}
