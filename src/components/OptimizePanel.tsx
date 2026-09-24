import {
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { BuildLevel, Objective, Slot, StatKey } from '../game/types';
import { BUILD_LEVELS } from '../game/types';
import { genshinAdapter } from '../game/genshin/adapter';
import { useInventory } from '../state/inventory';
import { useRoster } from '../state/roster';
import { useOptimizeRequest } from '../state/optimizeRequest';
import {
  formatCount,
  formatCritRatio,
  isPctStat,
  objectiveLabel,
  setRequirementLabel,
  SLOT_LABELS,
  statLabel,
} from '../labels';
import { cn } from './ui/cn';
import { Combobox } from './ui/Combobox';
import { SearchCounts } from './ui/SearchCounts';
import { SourceLink } from './ui/SourceLink';
import { searchProgressStore } from './searchProgress';
import {
  META_TARGETS,
  metaToConstraints,
  type MetaTarget,
} from '../meta/metaTargets';
import { teammatesFor, type DerivedTeammate } from '../teams/comps';
import { getDamageProfile } from '../damage/profiles';

// Every objective a curated meta recipe can recommend has to be offerable,
// or "(Recommended)" points at an option the dropdown doesn't carry — which is
// how hp_pct and def_pct characters (Hu Tao, Noelle) ended up unable to select
// the metric their own recipe names. `avg_damage` is the deliberate exception:
// it is appended per character, only where a damage profile exists.
const OBJECTIVES: Objective[] = [
  'crit_value',
  'em',
  'atk_pct',
  'atk',
  'hp_pct',
  'def_pct',
  'er_pct',
  'elemental_dmg',
];

/** Shared shell for the two read-only meta-recipe panels below (recipe
 *  summary, teammate recs) — same border/background/text treatment and a
 *  trailing "Source" link out to the guide it was curated from. */
function InfoPanel({ href, children }: { href: string; children: ReactNode }) {
  return (
    <div className="well p-3 text-xs text-muted">
      {children}
      <SourceLink
        className="mt-1.5 inline-block text-accent hover:underline"
        href={href}
      >
        Source
      </SourceLink>
    </div>
  );
}

/** Read-only preview of what "Use meta build" is about to apply — the recipe
 *  itself isn't editable, but every field it fills (constraints, ER floor)
 *  stays editable afterward via the fields above (ADR-0007). */
function MetaTargetSummary({ meta }: { meta: MetaTarget }) {
  const mainsEntries = (Object.keys(meta.mains) as Slot[]).filter(
    (s) => meta.mains[s],
  );
  return (
    <InfoPanel href={meta.source}>
      <p>
        <span className="font-semibold text-paper">
          {setRequirementLabel(meta.setRequirement)}
        </span>
        {mainsEntries.length > 0 && (
          <>
            {' · '}
            {mainsEntries
              .map((s) => `${SLOT_LABELS[s]}: ${statLabel(meta.mains[s]!)}`)
              .join(' · ')}
          </>
        )}
      </p>
      <p className="mt-1 flex flex-wrap gap-x-3">
        {meta.erTarget != null && <span>ER target {meta.erTarget}%</span>}
        {meta.critRatioTarget != null && meta.critRatioTarget > 0 && (
          <span>
            CR:CD ≈ 1:
            {formatCritRatio(meta.critRatioTarget)}
          </span>
        )}
        {meta.statTargets &&
          (Object.entries(meta.statTargets) as [StatKey, number][]).map(
            ([k, v]) => (
              <span key={k}>
                {statLabel(k)} {v}
                {isPctStat(k) ? '%' : ''}
              </span>
            ),
          )}
      </p>
    </InfoPanel>
  );
}

/** Curated "works well with" list (ADR-0007-style: static, sourced). */
function TeammatesSummary({
  entry,
}: {
  entry: { recs: DerivedTeammate[]; source: string };
}) {
  return (
    <InfoPanel href={entry.source}>
      <p className="mb-1.5 font-semibold text-paper">Works well with</p>
      <ul className="space-y-1">
        {entry.recs.map((r) => (
          <li key={r.characterKey}>
            <span className="font-medium text-paper">
              {genshinAdapter.characterName(r.characterKey)}
            </span>{' '}
            <span className="text-muted">({r.role})</span> — {r.why}
          </li>
        ))}
      </ul>
    </InfoPanel>
  );
}

/**
 * What the search has done so far, while it is still doing it. The total is
 * unknowable up front — branch-and-bound's whole point is that it never visits
 * the full space — so the bar is deliberately indeterminate and the honest
 * numbers (leaves evaluated, subtrees pruned, elapsed) carry the real signal.
 * Rendered only while a run is in flight, so Cancel always has something to
 * cancel.
 */
function SearchProgressLine({ onCancel }: { onCancel: () => void }) {
  const { progress, elapsedMs } = useSyncExternalStore(
    searchProgressStore.subscribe,
    searchProgressStore.getSnapshot,
    searchProgressStore.getSnapshot,
  );
  const explored = progress?.explored ?? 0;
  const pruned = progress?.pruned ?? 0;
  // Coarsened to a 3s cadence: the counters above tick 5x/second, but an
  // `aria-live` region that spoke every tick would drown a screen-reader user
  // in noise. The whole announcement — counters included — is frozen per 3s
  // bucket, so React only touches this node's text when the bucket rolls over.
  const announceElapsedSec = Math.floor(elapsedMs / 3000) * 3;
  const announcement = useMemo(
    () =>
      `Searching: ${formatCount(explored)} evaluated, ${formatCount(pruned)} pruned, ${announceElapsedSec}s elapsed.`,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- counters are deliberately sampled only when the 3s bucket changes
    [announceElapsedSec],
  );
  return (
    <div className="space-y-1.5 border-t border-white/5 pt-3">
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-xs text-muted">
          Searching — <SearchCounts explored={explored} pruned={pruned} /> ·{' '}
          <span className="font-mono tabular-nums text-paper">
            {(elapsedMs / 1000).toFixed(1)}s
          </span>
        </p>
        {/* Plain `onClick`, no aria-disabled guard: this line only exists
            while a run is in flight, so there is always something to cancel. */}
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {/* Not a Meter: a progress bar pinned at 100% claims the search is
          finished. There is no total to divide by, so this is a decorative
          pulse that says "still working" and nothing more — the counters
          above carry every fact. */}
      <div
        aria-hidden="true"
        className="h-1 animate-pulse rounded-full bg-accent/40"
      />
    </div>
  );
}

export function OptimizePanel({
  onRun,
  running,
  onCancel,
}: {
  onRun: () => void | Promise<void>;
  running: boolean;
  /** Required: whenever `running` is true the panel offers a Cancel button,
   *  and a Cancel that cancels nothing is worse than no Cancel. */
  onCancel: () => void;
}) {
  const uid = useId();
  const artifacts = useInventory((s) => s.artifacts);
  const rosterEntries = useRoster((s) => s.entries);
  // Both are the adapter's memoised module-level arrays, stable for the app's
  // lifetime — safe as `useMemo` dependencies without wrapping.
  const chars = genshinAdapter.characters();
  const weapons = genshinAdapter.weapons();

  const characterKey = useOptimizeRequest((s) => s.characterKey);
  const weaponKey = useOptimizeRequest((s) => s.weaponKey);
  const buildLevel = useOptimizeRequest((s) => s.buildLevel);
  const objective = useOptimizeRequest((s) => s.objective);
  const erFloor = useOptimizeRequest((s) => s.constraints.minStats?.er_pct);
  const minER = erFloor != null ? String(erFloor) : '';
  // `setMinER` silently drops anything that isn't a usable floor (see
  // optimizeRequest.ts), which would otherwise erase invalid keystrokes from
  // the controlled input before the user can see what they typed. Track the
  // raw text locally so a non-numeric or negative entry stays visible with an
  // inline error, and resync when the floor changes from outside this input
  // (preset apply, character switch).
  const [minERInput, setMinERInput] = useState(minER);
  // "Adjusting state during rendering" (react.dev) rather than an effect: an
  // effect's setState here would cause an extra commit after every external
  // change (preset apply, character switch) instead of resyncing in the same
  // render that received the new floor.
  const [prevMinER, setPrevMinER] = useState(minER);
  if (minER !== prevMinER) {
    setPrevMinER(minER);
    setMinERInput(minER);
  }
  const minERInvalid =
    minERInput.trim() !== '' &&
    (!Number.isFinite(Number(minERInput)) || Number(minERInput) < 0);
  const setCharacterKey = useOptimizeRequest((s) => s.setCharacterKey);
  const setWeaponKey = useOptimizeRequest((s) => s.setWeaponKey);
  const setBuildLevel = useOptimizeRequest((s) => s.setBuildLevel);
  const setObjective = useOptimizeRequest((s) => s.setObjective);
  const setMinER = useOptimizeRequest((s) => s.setMinER);
  const applyPreset = useOptimizeRequest((s) => s.applyPreset);

  // Weapon legality (ADR-0002 data): a character can only equip their own
  // weapon class, so offering all 235 let the panel hand a catalyst user a
  // polearm and then call the result "proven optimal". An unknown character key
  // (a snapshot older than the request) falls back to the full list rather than
  // an empty picker — no evidence of a class is not evidence of no class.
  const character = genshinAdapter.character(characterKey);
  const legalWeapons = character
    ? genshinAdapter.weaponsOfType(character.weaponType)
    : weapons;
  const weaponOptions = useMemo(
    () =>
      legalWeapons.map((w) => ({
        value: w.key,
        label: w.name,
        hint: `${w.rarity}★`,
      })),
    [legalWeapons],
  );

  function onObjectiveChange(next: Objective) {
    setObjective(next);
    // Pre-fill the profile's ER floor, leaving anything the user already typed
    // alone (same spirit as "Use meta build").
    if (
      next === 'avg_damage' &&
      damageProfile?.erRequirement != null &&
      erFloor == null
    )
      setMinER(String(damageProfile.erRequirement));
  }

  const charOptions = useMemo(() => {
    const owned = (key: string) => key in rosterEntries;
    // Meta coverage is worth flagging before selection, not after — otherwise
    // a curated recipe only surfaces once the user has already picked someone
    // else and backed out.
    const hasMeta = (key: string) => key in META_TARGETS;
    const opts = chars.map((c) => {
      const tags = [owned(c.key) && 'Owned', hasMeta(c.key) && 'Meta'].filter(
        Boolean,
      );
      return {
        value: c.key,
        label: tags.length ? `${c.name} (${tags.join(', ')})` : c.name,
      };
    });
    // Stable sort: owned first, dataset order preserved within each group.
    return opts.sort((a, b) => Number(owned(b.value)) - Number(owned(a.value)));
  }, [chars, rosterEntries]);

  const hasArtifacts = artifacts.length > 0;
  const canRun = hasArtifacts && !!characterKey;
  const blocked = !canRun || running;
  const hint = !hasArtifacts
    ? 'Add or import artifacts before optimising.'
    : !characterKey
      ? 'Pick a character to start.'
      : null;
  const meta = META_TARGETS[characterKey];
  // `avg_damage` needs a curated profile, so it is offered per character. If the
  // user switches to a character without one, drop the selection — otherwise
  // buildContext would throw on the next run.
  const damageProfile = getDamageProfile(characterKey);
  const objectives = damageProfile
    ? [...OBJECTIVES, 'avg_damage' as const]
    : OBJECTIVES;
  useEffect(() => {
    if (!damageProfile && objective === 'avg_damage')
      setObjective('crit_value');
  }, [damageProfile, objective, setObjective]);
  // The effect above corrects the *store* after the commit; render from the
  // clamped value too, so the select never paints a value none of its options
  // carry (the frame after switching to a profile-less character).
  const shownObjective = objectives.includes(objective)
    ? objective
    : 'crit_value';
  const teammates = teammatesFor(characterKey);
  // A character can't be de-leveled, so a rostered character's build level
  // is a floor, not just a suggestion — levels below it aren't achievable.
  const rosterBuildLevel = rosterEntries[characterKey]?.buildLevel;
  useEffect(() => {
    if (rosterBuildLevel != null && buildLevel < rosterBuildLevel) {
      setBuildLevel(rosterBuildLevel);
    }
  }, [rosterBuildLevel, buildLevel, setBuildLevel]);

  // Doherty threshold: a run that resolves in under ~300ms reads better as an
  // instant result than as a progress line that flashes on and off. Hidden
  // immediately on stop — only the *appearance* of progress is delayed, not
  // its disappearance.
  const [showProgress, setShowProgress] = useState(false);
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setShowProgress(true), 300);
    return () => {
      clearTimeout(t);
      setShowProgress(false);
    };
  }, [running]);

  return (
    <div className="panel panel-md space-y-5">
      <div className="space-y-4">
        {/* Miller's Law: five decisions in one flat grid reads as one big
            choice. Two named groups — what's being built vs. what constrains
            it — give the eye a place to chunk them. */}
        <p className="field-label text-muted">Build</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Real <label htmlFor>, matching the <select>s below: as a bare
              <span> the visible label wasn't clickable, so the two halves of
              the same grid behaved differently. */}
          <div className="block">
            <label className="field-label" htmlFor={`${uid}-character`}>
              Character
            </label>
            <Combobox
              id={`${uid}-character`}
              options={charOptions}
              value={characterKey}
              onChange={setCharacterKey}
              label="Character"
            />
          </div>
          <div className="block">
            <label className="field-label" htmlFor={`${uid}-weapon`}>
              Weapon
              {/* Naming the class is what makes the short list read as a filter
                  rather than a missing-data bug. `.field-label` uppercases it. */}
              {character && (
                <span className="ml-1.5 font-normal text-muted">
                  {character.weaponType}
                </span>
              )}
            </label>
            <Combobox
              id={`${uid}-weapon`}
              options={weaponOptions}
              value={weaponKey}
              onChange={setWeaponKey}
              label="Weapon"
            />
          </div>
          <label className="block">
            <span className="field-label">Build level</span>
            <select
              className="field"
              value={buildLevel}
              onChange={(e) =>
                setBuildLevel(Number(e.target.value) as BuildLevel)
              }
            >
              {BUILD_LEVELS.map((l) => {
                const alreadyAchieved =
                  rosterBuildLevel != null && l < rosterBuildLevel;
                return (
                  <option key={l} value={l} disabled={alreadyAchieved}>
                    Lv. {l}
                    {alreadyAchieved ? ' (already achieved)' : ''}
                  </option>
                );
              })}
            </select>
          </label>
        </div>
        <p className="field-label text-muted">Constraints</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Maximise</span>
            <select
              className="field"
              value={shownObjective}
              onChange={(e) => onObjectiveChange(e.target.value as Objective)}
            >
              {objectives.map((o) => (
                <option key={o} value={o}>
                  {objectiveLabel(o)}
                  {meta?.objective === o ? ' (Recommended)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="field-label">Minimum Energy Recharge %</span>
            <input
              className="field"
              type="number"
              name="minEnergyRecharge"
              value={minERInput}
              onChange={(e) => {
                setMinERInput(e.target.value);
                setMinER(e.target.value);
              }}
              placeholder="e.g. 200…"
              aria-invalid={minERInvalid || undefined}
              aria-describedby={
                minERInvalid ? `${uid}-er-error` : `${uid}-er-hint`
              }
            />
            {minERInvalid ? (
              <p id={`${uid}-er-error`} className="mt-1.5 text-xs text-rose">
                Enter a positive number, or leave blank for no floor.
              </p>
            ) : (
              <p id={`${uid}-er-hint`} className="mt-1.5 text-xs text-muted">
                Leave blank to search without an Energy Recharge floor.
              </p>
            )}
            {/* A role="alert" node created in the same commit as its text
                announces nothing — see App.tsx's persistent region — so this
                always-mounted twin carries the announcement instead. */}
            <p className="sr-only" role="alert">
              {minERInvalid
                ? 'Enter a positive number, or leave blank for no floor.'
                : ''}
            </p>
          </label>
        </div>
      </div>

      {meta && <MetaTargetSummary meta={meta} />}
      {teammates && <TeammatesSummary entry={teammates} />}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-4">
        {hint ? (
          <p className="text-sm text-muted">{hint}</p>
        ) : (
          <p className="text-sm text-muted">
            Searching{' '}
            <span className="font-semibold text-paper">{artifacts.length}</span>{' '}
            artifacts for the exact optimum.
          </p>
        )}
        {/* aria-disabled + an early return, not `disabled`: a button that goes
            disabled while it is the active element hands focus to <body>, so
            the keyboard user is dropped at the top of the page mid-run. */}
        <div className="flex gap-2">
          {meta && (
            <button
              type="button"
              className="btn-ghost"
              aria-disabled={blocked}
              onClick={() => {
                if (blocked) return;
                applyPreset({
                  characterKey,
                  weaponKey,
                  objective: meta.objective,
                  constraints: metaToConstraints(meta),
                });
                void onRun();
              }}
            >
              Use Meta Build
            </button>
          )}
          <button
            type="button"
            className={cn('btn-primary', running && 'animate-pulse-glow')}
            aria-busy={running}
            aria-disabled={blocked}
            onClick={() => {
              if (blocked) return;
              void onRun();
            }}
          >
            {running ? 'Searching…' : 'Optimise'}
          </button>
        </div>
      </div>

      {showProgress && <SearchProgressLine onCancel={onCancel} />}
    </div>
  );
}
