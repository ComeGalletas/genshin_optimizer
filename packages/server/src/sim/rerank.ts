/**
 * `objective: "sim"` (TODO 5.8): the exact search's top builds for one
 * character, each simulated in a team rotation with the owner's teammates,
 * ranked by mean team DPS (`rankBySim`).
 *
 * - **The rotation**: the one the spec names, or the library's rotation
 *   for the character (a validated one first; a draft only when it is the
 *   only one, and the result says so).
 * - **The team**: each other slot filled from the account (the slot's
 *   first character the owner has, as equipped), and their equipped pieces
 *   kept off-limits to the search unless the spec says otherwise, so a
 *   candidate never wears a teammate's piece.
 * - **The candidate**: the character as in the account, with the request's
 *   weapon and the build's five pieces.
 * - **Burst waits filled** (ADR-0041): the owner's builds may be short of
 *   energy, and standing idle would rank them on waiting, not on damage.
 * @packageDocumentation
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Artifact } from '@genshin-build-lab/engine/game/types';
import type { OptimizeRequest } from '@genshin-build-lab/engine/game/types';
import {
  simCharacterFromAccount,
  type SimAccount,
} from '@genshin-build-lab/engine/sim/account';
import type { SimCharacter } from '@genshin-build-lab/engine/sim/configgen';
import {
  rotationConfig,
  type Rotation,
} from '@genshin-build-lab/engine/sim/rotation';
import type { SpecIssue } from '@genshin-build-lab/engine/constraints/spec';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import type { PoolRun } from './pool';
import type { SimOptions } from './runner';
import { loadRotation, RotationError } from './rotations';

export interface SimTeam {
  rotation: Rotation;
  /** The slot the character fills. */
  slot: string;
  /** Teammates by slot id, as the account has them. */
  teammates: Record<string, SimCharacter>;
}

/** The files a rotation is read from. */
const FILES = ['meta.json', 'rotation.gcsl.tmpl', 'reference.gcsl'];

/** The library as last read, per directory, with what it was read from:
 *  every request that names a rotation (the translator's catalog, each
 *  "sim" spec) would otherwise re-read and re-check every file. */
const cache = new Map<string, { stamp: string; rotations: Rotation[] }>();

/** Every rotation in `dir` that loads, by id. Re-read when any of its
 *  files changes (a draft saved, a promotion), by name, size and time. */
export function rotationLibrary(dir: string): Rotation[] {
  if (!existsSync(dir)) return [];
  const ids = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const stamp = ids
    .flatMap((id) =>
      FILES.map((f) => {
        const st = statSync(join(dir, id, f), { throwIfNoEntry: false });
        return `${id}/${f}:${st ? `${st.size}@${st.mtimeMs}` : '-'}`;
      }),
    )
    .join('|');
  const hit = cache.get(dir);
  if (hit?.stamp === stamp) return hit.rotations;
  const out: Rotation[] = [];
  for (const id of ids) {
    try {
      out.push(loadRotation(id, dir));
    } catch (e) {
      if (!(e instanceof RotationError)) throw e;
    }
  }
  out.sort((a, b) => a.meta.id.localeCompare(b.meta.id));
  cache.set(dir, { stamp, rotations: out });
  return out;
}

const name = (key: string) => genshinAdapter.characterName(key);

const fail = (
  path: string,
  message: string,
): { ok: false; issues: SpecIssue[] } => ({
  ok: false,
  issues: [{ path, message }],
});

/** The rotation and teammates for `character`, or what stops it. */
export function resolveSimTeam(
  character: string,
  rotationId: string | undefined,
  account: SimAccount,
  dir: string,
): { ok: true; team: SimTeam } | { ok: false; issues: SpecIssue[] } {
  const all = rotationLibrary(dir);
  const fits = (r: Rotation) =>
    r.meta.slots.some((s) => s.characters.includes(character));
  let rotation: Rotation | undefined;
  if (rotationId !== undefined) {
    rotation = all.find((r) => r.meta.id === rotationId);
    if (!rotation)
      return fail(
        'sim.rotation',
        `no rotation "${rotationId}" in the library (${all.map((r) => r.meta.id).join(', ')})`,
      );
    if (!fits(rotation))
      return fail(
        'sim.rotation',
        `${rotation.meta.name} has no slot for ${name(character)}`,
      );
  } else {
    const matches = all.filter(fits);
    const validated = matches.filter((r) => r.meta.status === 'validated');
    const pick = validated.length ? validated : matches;
    if (pick.length === 1) rotation = pick[0];
    else if (!pick.length)
      return fail(
        'sim.rotation',
        `no rotation in the library has ${name(character)}: draft one (draft_rotation), or choose another objective`,
      );
    else
      return fail(
        'sim.rotation',
        `several rotations have ${name(character)} (${pick.map((r) => r.meta.id).join(', ')}): choose one in sim.rotation`,
      );
  }
  const slot = rotation.meta.slots.find((s) =>
    s.characters.includes(character),
  )!;
  const teammates: Record<string, SimCharacter> = {};
  const issues: SpecIssue[] = [];
  for (const s of rotation.meta.slots) {
    if (s.id === slot.id) continue;
    const found = s.characters
      .filter((k) => k !== character)
      .map((k) => simCharacterFromAccount(account, k));
    const ready = found.find((c): c is SimCharacter => !('problem' in c));
    if (ready) teammates[s.id] = ready;
    else
      issues.push({
        path: 'sim.rotation',
        message: `${rotation.meta.name} needs ${s.characters.map(name).join(' or ')}: ${found
          .map((c) => ('problem' in c ? c.problem : ''))
          .join('; ')}`,
      });
  }
  if (issues.length) return { ok: false, issues };
  return { ok: true, team: { rotation, slot: slot.id, teammates } };
}

/** The character with the request's weapon and one build's pieces. */
export function candidate(
  base: SimCharacter,
  request: OptimizeRequest,
  artifacts: readonly Artifact[],
): SimCharacter {
  const same = base.weapon.key === request.weaponKey;
  return {
    ...base,
    weapon: {
      key: request.weaponKey,
      level: same ? base.weapon.level : 90,
      maxLevel: same ? base.weapon.maxLevel : 90,
      refinement: request.refinement ?? (same ? base.weapon.refinement : 1),
    },
    artifacts,
  };
}

/** What runs the configs (a `SimPool`, or a fake in tests). */
export interface RunsPooled {
  run(config: string, options?: SimOptions): Promise<PoolRun>;
}

/** Each candidate simulated in the team's rotation, in parallel up to the
 *  pool's bound. */
export function simulateCandidates(
  team: SimTeam,
  candidates: readonly SimCharacter[],
  pool: RunsPooled,
  iterations: number,
): Promise<PoolRun[]> {
  return Promise.all(
    candidates.map((c) =>
      pool.run(
        rotationConfig(
          team.rotation,
          { ...team.teammates, [team.slot]: c },
          { iterations, energyWait: 'attack' },
        ),
        { iterations },
      ),
    ),
  );
}
