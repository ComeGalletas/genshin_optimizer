/**
 * The artifacts a character has on now (TODO 9.9, 9.10): each slot's set,
 * then its main stat (an elemental goblet with its element), then its
 * substats with their rolls; under them, the set effects they activate.
 */
import type {
  Artifact,
  StatKey,
  SubStat,
} from '@genshin-build-lab/engine/game/types';
import { displaySteps } from '@genshin-build-lab/engine/import/fingerprint';
import { SLOTS } from '@genshin-build-lab/engine/game/types';
import type { Details } from '@genshin-build-lab/engine/game/genshin/details';
import { countSets } from '@genshin-build-lab/engine/optimizer/score';
import {
  splitRolls,
  type LineRolls,
  type Roll,
} from '@genshin-build-lab/engine/game/genshin/rollSplit';
import {
  countOf,
  elementLabel,
  formatScore,
  formatSetName,
  formatStat,
  isPctStat,
  SLOT_LABELS,
  statLabel,
} from '../labels';
import { ArtifactIcon } from '../components/GameArt';
import { StarGlyph } from '../components/ui/Glyphs';
import { isRecommendedSet } from '@genshin-build-lab/engine/roster/artifactQuality';

/** "Electro DMG Bonus" for an elemental goblet whose element is known. */
function mainStatLabel(a: Artifact): string {
  return a.mainStat === 'elemental_dmg' && a.element
    ? `${elementLabel(a.element)} DMG Bonus`
    : statLabel(a.mainStat);
}

/** A value at the game's display precision, without the unit. */
const shown = (key: StatKey, steps: number) =>
  formatScore(isPctStat(key) ? steps / 10 : steps, isPctStat(key) ? 1 : 0);

/**
 * Each roll at display precision, rounded so the rolls add up to the
 * value the game shows: rounding them one by one could overshoot (Skirk's
 * ATK 31 read "16 + 16"). Floors first, then the leftover steps go to the
 * largest remainders.
 */
function apportion(line: SubStat, values: number[]): number[] {
  const scale = isPctStat(line.key) ? 10 : 1;
  const raw = values.map((v) => v * scale);
  const floors = raw.map(Math.floor);
  const left = displaySteps(line) - floors.reduce((a, b) => a + b, 0);
  if (left < 0 || left > values.length) return raw.map(Math.round);
  const order = raw
    .map((r, i) => ({ i, rem: r - floors[i] }))
    .sort((a, b) => b.rem - a.rem);
  for (let k = 0; k < left; k++) floors[order[k].i]++;
  return floors;
}

const TIER_PCT = ['70%', '80%', '90%', '100%'];
const TIER_TONE = [
  'text-muted/70',
  'text-muted',
  'text-paper/85',
  'text-accent-bright',
];

function RollList({ line, split }: { line: SubStat; split: LineRolls }) {
  if (split.kind === 'unknown') return null;
  const stat = line.key;
  const one = (r: Roll, i: number, steps: number) => (
    <span key={i} className={TIER_TONE[r.tier]}>
      {i > 0 && <span className="text-muted/60"> + </span>}
      {shown(stat, steps)}
    </span>
  );
  if (split.kind === 'exact') {
    const steps = apportion(
      line,
      split.rolls.map((r) => r.value),
    );
    const title = `Rolls: ${split.rolls.map((r) => TIER_PCT[r.tier]).join(', ')} of the maximum${
      split.firstKnown ? ' (the first roll first)' : ''
    }`;
    return (
      <span className="font-mono text-2xs" title={title} data-testid="rolls">
        {' ('}
        {split.rolls.map((r, i) => one(r, i, steps[i]))})
      </span>
    );
  }
  const others = split.first ? split.count - 1 : split.count;
  // The first roll as the game shows it, and the others as what is left of
  // the shown value, so the two add up.
  const firstSteps = split.first
    ? displaySteps({ key: stat, value: split.first.value })
    : 0;
  return (
    <span
      className="font-mono text-2xs text-muted"
      title={`${split.count} rolls; which sizes the others were, the value can't tell`}
      data-testid="rolls"
    >
      {' ('}
      {split.first && (
        <>
          {one(split.first, 0, firstSteps)}
          <span className="text-muted/60"> + </span>
        </>
      )}
      {split.first
        ? `${countOf(others, 'roll')}: ${shown(stat, displaySteps(line) - firstSteps)}`
        : `${split.count} rolls`}
      )
    </span>
  );
}

/** A star beside a set the build shown recommends (ADR-0057, ADR-0059). */
function Recommended({
  characterKey,
  build,
  setKey,
}: {
  characterKey: string;
  build: number;
  setKey: string;
}) {
  if (!isRecommendedSet(characterKey, setKey, build)) return null;
  return (
    <span
      className="inline-flex text-accent-bright"
      title="A set their build recommends"
      data-testid="recommended-set"
    >
      <StarGlyph />
      <span className="sr-only">(recommended set)</span>
    </span>
  );
}

export function ArtifactList({
  characterKey,
  build = 0,
  details,
  artifacts,
}: {
  characterKey: string;
  /** The build whose recommended sets are starred. */
  build?: number;
  details: Details | null | 'failed';
  artifacts: readonly Artifact[];
}) {
  const sets = Object.entries(countSets([...artifacts])).filter(
    ([, n]) => n >= 2,
  );
  const effects = details && details !== 'failed' ? details.sets : undefined;
  return (
    <section aria-label="Artifacts" className="space-y-1.5">
      <h3 className="text-xs font-semibold uppercase text-muted">Artifacts</h3>
      <ul className="space-y-1.5">
        {SLOTS.flatMap((s) => {
          // Every piece the account puts in the slot: two means the data
          // holds two copies (often one piece before and after levelling
          // that a source couldn't pair, ADR-0025). Stats count both, so
          // both show here, flagged.
          const inSlot = artifacts.filter((x) => x.slot === s);
          return (inSlot.length ? inSlot : [undefined]).map((a, k) => {
            const rolls = a ? splitRolls(a) : [];
            return (
              <li
                key={`${s}-${k}`}
                className="well flex items-start gap-2 px-3 py-2"
              >
                {a ? (
                  <ArtifactIcon setKey={a.setKey} slot={s} size={36} />
                ) : (
                  <span className="w-9 flex-none" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2">
                    <span className="text-xs uppercase text-muted">
                      {SLOT_LABELS[s]}
                    </span>
                    {a ? (
                      <>
                        <span className="text-paper">
                          {formatSetName(a.setKey)}{' '}
                          <Recommended
                            characterKey={characterKey}
                            build={build}
                            setKey={a.setKey}
                          />
                        </span>
                        <span className="chip px-2 py-0.5 text-2xs">
                          Lv {a.level}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted">empty</span>
                    )}
                  </p>
                  {inSlot.length > 1 && k === 0 && (
                    <p
                      className="text-xs text-amber"
                      data-testid="slot-duplicate"
                    >
                      {inSlot.length} pieces in this slot: the account data
                      lists both, and the stats count both.
                    </p>
                  )}
                  {a && (
                    <p
                      className="text-[17px] font-semibold leading-snug text-paper"
                      data-testid="main-stat"
                    >
                      {mainStatLabel(a)}{' '}
                      <span className="font-mono">
                        {formatStat(a.mainStat, a.mainStatValue)}
                      </span>
                    </p>
                  )}
                  {a && a.subStats.length > 0 && (
                    <ul className="mt-1 grid gap-0.5 text-xs text-muted">
                      {a.subStats.map((sub, i) => (
                        <li key={sub.key}>
                          {statLabel(sub.key)}{' '}
                          <span className="font-mono text-paper/80">
                            {formatStat(sub.key, sub.value)}
                          </span>
                          <RollList line={sub} split={rolls[i]} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          });
        })}
      </ul>
      {sets.length > 0 && (
        <div className="well space-y-1.5 px-3 py-2 text-xs">
          <p className="text-muted">
            Sets:{' '}
            {sets.map(([k, n], i) => (
              <span key={k}>
                {i > 0 && ', '}
                {formatSetName(k)} {n >= 4 ? 4 : 2}-piece{' '}
                <Recommended
                  characterKey={characterKey}
                  build={build}
                  setKey={k}
                />
              </span>
            ))}
          </p>
          {effects && (
            <ul className="space-y-1.5" aria-label="Active set effects">
              {sets.flatMap(([k, n]) =>
                (
                  [
                    [2, effects[k]?.two],
                    [4, n >= 4 ? effects[k]?.four : null],
                  ] as const
                )
                  .filter(([, text]) => text)
                  .map(([pc, text]) => (
                    <li key={`${k}-${pc}`} className="leading-relaxed">
                      <span className="font-semibold text-paper">
                        {formatSetName(k)} {pc}-piece:
                      </span>{' '}
                      <span className="text-paper/80">{text}</span>
                    </li>
                  )),
              )}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
