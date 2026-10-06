/**
 * "I understood: …" (TODO 4.3, ADR-0038): a checked spec and the run it maps
 * to, in plain words, before anything runs. Each condition says whether the
 * owner asked for it or it is the character's curated default, so a
 * misread request ("she wanted ER ≥ 180, not 18") is caught by a person
 * reading one paragraph, not by squinting at JSON. Pure.
 * @packageDocumentation
 */

import type { Objective, StatKey, StatVec } from '../game/types';
import { genshinAdapter } from '../game/genshin/adapter';
import { objectiveLabel, statLabel } from '../labels-core';
import { SIM_ITERATIONS, SIM_TOP_K, type ConstraintSpec } from './spec';
import type { SpecRun } from './toRequest';

export interface UnderstoodLine {
  text: string;
  /** `asked`: in the request. `default`: the character's curated target. */
  source: 'asked' | 'default';
}

export interface Understood {
  /** One paragraph, starting "I understood:". */
  text: string;
  /** The headline: who, with what, for what. */
  goal: string;
  conditions: UnderstoodLine[];
}

const FLAT = new Set<StatKey>(['hp', 'atk', 'def', 'em']);
const amount = (k: StatKey, v: number) =>
  `${Number.isInteger(v) ? v : v.toFixed(1)}${FLAT.has(k) ? '' : '%'}`;
const setName = (key: string) =>
  genshinAdapter.sets().find((s) => s.key === key)?.name ?? key;
const statList = (v: StatVec, sign = '') =>
  (Object.entries(v) as [StatKey, number][])
    .map(([k, x]) => `${statLabel(k)} ${sign}${amount(k, x)}`)
    .join(', ');

function objectiveText(o: Objective, weights?: StatVec): string {
  if (o === 'weighted' && weights)
    return `a weighted sum of ${(Object.entries(weights) as [StatKey, number][])
      .map(([k, w]) => `${statLabel(k)} × ${w}`)
      .join(' + ')}`;
  return o === 'avg_damage'
    ? 'average damage (estimated)'
    : objectiveLabel(o).toLowerCase();
}

/** With `objective: "sim"` (TODO 5.8): the rotation the candidates run in
 *  and the teammates who fill its other slots, as the server resolved them. */
export interface SimDescription {
  rotation: string;
  teammates: string[];
  /** Why it runs as the stat search alone (TODO 5.9). */
  notSimulated?: string[];
}

export function describeRun(
  spec: ConstraintSpec,
  run: SpecRun,
  sim?: SimDescription,
): Understood {
  const { request, extras } = run;
  const c = request.constraints;
  const character =
    genshinAdapter.character(request.characterKey)?.name ??
    request.characterKey;
  const weapon = `${genshinAdapter.weapon(request.weaponKey)?.name ?? request.weaponKey}${
    request.refinement ? ` R${request.refinement}` : ''
  }`;
  const lines: UnderstoodLine[] = [];
  const line = (text: string, asked: boolean) =>
    lines.push({ text, source: asked ? 'asked' : 'default' });

  const isSim = spec.objective === 'sim';
  const objectiveAsked = isSim
    ? spec.sim?.by !== undefined
    : spec.objective !== undefined;
  const objective = objectiveText(request.objective, extras.weights);
  const statGoal = objectiveAsked
    ? objective
    : objective.endsWith(')')
      ? `${objective.slice(0, -1)}; default)`
      : `${objective} (default)`;
  const goal = sim?.notSimulated?.length
    ? `rank ${character}'s top ${spec.sim?.topK ?? SIM_TOP_K} builds (${weapon}, level ${request.buildLevel}) by ${statGoal}, not simulated (${sim.notSimulated.join('; ')})`
    : isSim
      ? `rank ${character}'s top ${spec.sim?.topK ?? SIM_TOP_K} builds (${weapon}, level ${request.buildLevel}) by ${statGoal} by simulated team DPS in ${sim?.rotation ?? spec.sim?.rotation ?? 'their rotation'}${
          sim?.teammates.length ? ` with ${sim.teammates.join(', ')}` : ''
        } (${spec.sim?.iterations ?? SIM_ITERATIONS} iterations each)`
      : `build ${character} (${weapon}, level ${request.buildLevel}) for ${statGoal}`;

  const set = c.setRequirement;
  if (set)
    line(
      set.kind === '2+2'
        ? `2-piece ${setName(set.setKeys[0])} + 2-piece ${setName(set.setKeys[1])}`
        : `${set.kind === '4pc' ? '4' : '2'}-piece ${setName(set.setKey)}`,
      spec.set !== undefined,
    );
  else if (spec.set?.kind === 'any') line('any artifact sets', true);

  for (const [slot, main] of Object.entries(c.mainStatLocks ?? {}) as [
    string,
    StatKey,
  ][])
    line(
      `${slot} main stat ${statLabel(main)}`,
      spec.mainStats?.[slot as 'sands'] !== undefined,
    );
  for (const [slot, main] of Object.entries(spec.mainStats ?? {}))
    if (main === 'any') line(`any ${slot} main stat`, true);

  for (const [k, v] of Object.entries(c.minStats ?? {}) as [StatKey, number][])
    line(
      `${statLabel(k)} at least ${amount(k, v)}`,
      spec.minStats?.[k] !== undefined,
    );
  for (const [k, v] of Object.entries(c.maxStats ?? {}) as [StatKey, number][])
    line(`${statLabel(k)} at most ${amount(k, v)}`, true);

  const keep = spec.keepEquippedOn;
  if (keep === 'all')
    line(`only unequipped pieces and ${character}'s own`, true);
  else if (keep?.length)
    line(
      `leaving the pieces ${keep
        .map((k) => genshinAdapter.character(k)?.name ?? k)
        .join(', ')} ${keep.length === 1 ? 'wears' : 'wear'}`,
      true,
    );
  if (spec.excludeArtifacts?.length)
    line(
      `never using ${spec.excludeArtifacts.length === 1 ? 'artifact' : 'artifacts'} ${spec.excludeArtifacts.join(', ')}`,
      true,
    );
  if (extras.buffs) line(`team buffs ${statList(extras.buffs, '+')}`, true);
  if (extras.enemy)
    line(
      `against an enemy at ${[
        extras.enemy.level !== undefined && `level ${extras.enemy.level}`,
        extras.enemy.res !== undefined && `${extras.enemy.res}% resistance`,
      ]
        .filter(Boolean)
        .join(', ')}`,
      true,
    );

  const conditions = lines.map(
    (l) => `${l.text}${l.source === 'default' ? ' (default)' : ''}`,
  );
  return {
    goal,
    conditions: lines,
    text: `I understood: ${goal}${conditions.length ? `, with ${conditions.join('; ')}` : ''}.`,
  };
}
