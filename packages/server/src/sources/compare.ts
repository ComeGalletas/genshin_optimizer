/**
 * Comparing a fresh read of a guide page with the previous one (ADR-0061):
 * what changed, in words, and what the fresh read missed that the previous
 * one had. Pure.
 * @packageDocumentation
 */
import type { SourceCharacter } from '@genshin-build-lab/engine/sources/types';

/** What changed in one character's builds, in words. */
export function diffBuilds(
  before: SourceCharacter | undefined,
  after: SourceCharacter,
) {
  const out: string[] = [];
  const by = (c?: SourceCharacter) =>
    new Map((c?.builds ?? []).map((b) => [b.name, b]));
  const b0 = by(before);
  const b1 = by(after);
  for (const [n, b] of b1) {
    const old = b0.get(n);
    if (!old) out.push(`+ ${n}`);
    else {
      const what = (
        ['role', 'mains', 'substats', 'sets', 'erMin'] as const
      ).filter((k) => JSON.stringify(old[k]) !== JSON.stringify(b[k]));
      if (what.length) out.push(`~ ${n}: ${what.join(', ')}`);
    }
  }
  for (const n of b0.keys()) if (!b1.has(n)) out.push(`- ${n}`);
  return out;
}

/** What a fresh read misses (a role the page doesn't say, a main stat or
 *  substat line it couldn't read) keeps the previous read's value, flagged
 *  for review; the language-model step can still settle a role. */
export function keepFromPrevious(
  prev: SourceCharacter | undefined,
  next: SourceCharacter,
) {
  if (!prev) return;
  for (const b of next.builds) {
    // The same build: by name, the only one on both sides, or the first
    // with the same role.
    const old =
      prev.builds.find((x) => x.name === b.name) ??
      (prev.builds.length === 1 && next.builds.length === 1
        ? prev.builds[0]
        : undefined) ??
      (b.roleFrom !== 'review'
        ? prev.builds.find((x) => x.role === b.role)
        : undefined);
    if (!old) continue;
    const kept: string[] = [];
    if (b.roleFrom === 'review') {
      b.role = old.role;
      b.flags = (b.flags ?? []).filter((f) => !f.startsWith('role not clear'));
      kept.push('role');
    }
    for (const slot of ['sands', 'goblet', 'circlet'] as const)
      if (!b.mains[slot].length && old.mains[slot]?.length) {
        b.mains = { ...b.mains, [slot]: [...old.mains[slot]] };
        b.flags = (b.flags ?? []).filter(
          (f) => !f.startsWith(`no ${slot} main stat`),
        );
        kept.push(`${slot} main stat`);
      }
    if (!b.substats.length && old.substats.length) {
      b.substats = [...old.substats];
      b.flags = (b.flags ?? []).filter((f) => f !== 'no stat priority line');
      kept.push('substats');
    }
    if (kept.length)
      (b.flags ??= []).push(
        `${kept.join(', ')} kept from the previous read ("${old.name}")`,
      );
  }
}
