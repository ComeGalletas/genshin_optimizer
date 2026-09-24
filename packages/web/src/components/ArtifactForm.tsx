import { useId, useRef, useState } from 'react';
import type {
  Artifact,
  Element,
  Slot,
  StatKey,
  SubStat,
} from '@genshin-build-lab/engine/game/types';
import { ELEMENTS, SLOTS } from '@genshin-build-lab/engine/game/types';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import { validateArtifactDraft } from '@genshin-build-lab/engine/game/artifactValidation';
import { useInventory } from '../state/inventory';
import { elementLabel, formatSetName, SLOT_LABELS, statLabel } from '../labels';
import { Callout } from './ui/Callout';
import { Combobox } from './ui/Combobox';

const STAT_OPTIONS: StatKey[] = genshinAdapter.statKeys;

// The set list is frozen for the app's lifetime (ADR-0002), so its options are
// built once rather than on every render.
const SET_OPTIONS = genshinAdapter
  .sets()
  .map((s) => ({ value: s.key, label: s.name }));

const DEFAULT_SLOT: Slot = 'sands';
const DEFAULT_MAIN: StatKey = 'atk_pct';
const DEFAULT_LEVEL = 20;

export function ArtifactForm() {
  const uid = useId();
  const add = useInventory((s) => s.add);
  const [slot, setSlot] = useState<Slot>(DEFAULT_SLOT);
  const [setKey, setSetKey] = useState(SET_OPTIONS[0]?.value ?? '');
  const [mainStat, setMainStat] = useState<StatKey>(DEFAULT_MAIN);
  const [element, setElement] = useState<Element | ''>('');
  const [level, setLevel] = useState(DEFAULT_LEVEL);
  // Sub-stat editing UI is intentionally minimal in v1.0; reserved for future use.
  const subStats: SubStat[] = [];
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<{ nonce: number; text: string } | null>(
    null,
  );
  // ponytail: only the level field gets inline validation — it's the one users
  // actually fumble. Everything else keeps the submit-time banner; extend if
  // evidence says otherwise.
  const [levelError, setLevelError] = useState<string | null>(null);
  // Level is the only field `validateArtifactDraft` can reject while sub-stat
  // entry is hard-coded empty, so it is the one field to send focus to.
  const levelRef = useRef<HTMLInputElement>(null);

  function submit() {
    const err = validateArtifactDraft({ mainStat, level, subStats });
    setError(err);
    if (err) {
      setAdded(null);
      levelRef.current?.focus();
      return;
    }
    const a: Artifact = {
      id: crypto.randomUUID(),
      setKey,
      slot,
      rarity: 5,
      level,
      mainStat,
      mainStatValue: genshinAdapter.mainStatValue(mainStat, 5, level),
      subStats,
      element:
        slot === 'goblet' && mainStat === 'elemental_dmg' && element
          ? element
          : undefined,
    };
    add(a);
    // Read the count back from the store rather than the render-time closure:
    // `add` has already committed by the time this line runs.
    const total = useInventory.getState().artifacts.length;
    // Keyed by a nonce below: adding two identical pieces produces the same
    // sentence twice, and an unchanged live region announces nothing.
    setAdded((prev) => ({
      nonce: (prev?.nonce ?? 0) + 1,
      text: `Added: ${formatSetName(setKey)} ${SLOT_LABELS[slot].toLowerCase()} — inventory now ${total}.`,
    }));
    // A form that keeps the last entry invites a duplicate on the next Enter.
    setSlot(DEFAULT_SLOT);
    setMainStat(DEFAULT_MAIN);
    setElement('');
    setLevel(DEFAULT_LEVEL);
    setLevelError(null);
  }

  return (
    <form
      className="panel panel-sm space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {/* <label htmlFor>, like the <select>s beside it — a <button> is a
            labelable element, so the click forwards and opens the list. */}
        <div className="block">
          <label className="field-label" htmlFor={`${uid}-set`}>
            Set
          </label>
          <Combobox
            id={`${uid}-set`}
            options={SET_OPTIONS}
            value={setKey}
            onChange={setSetKey}
            label="Set"
          />
        </div>
        <label className="block">
          <span className="field-label">Slot</span>
          <select
            className="field"
            value={slot}
            onChange={(e) => setSlot(e.target.value as Slot)}
          >
            {SLOTS.map((s) => (
              <option key={s} value={s}>
                {SLOT_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="field-label">Main stat</span>
          <select
            className="field"
            value={mainStat}
            aria-describedby={`${uid}-substat-caveat`}
            onChange={(e) => setMainStat(e.target.value as StatKey)}
          >
            {STAT_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {statLabel(k)}
              </option>
            ))}
          </select>
        </label>
        {slot === 'goblet' && mainStat === 'elemental_dmg' && (
          <label className="block">
            <span className="field-label">Element</span>
            <select
              className="field"
              value={element}
              onChange={(e) => setElement(e.target.value as Element | '')}
            >
              <option value="">Any (unknown)</option>
              {ELEMENTS.map((el) => (
                <option key={el} value={el}>
                  {elementLabel(el)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block">
          <span className="field-label">Level</span>
          <input
            id={`${uid}-level`}
            ref={levelRef}
            className="field"
            type="number"
            name="level"
            min={0}
            max={20}
            value={level}
            aria-describedby={levelError ? 'level-error' : 'level-hint'}
            aria-invalid={levelError ? true : undefined}
            onChange={(e) => setLevel(Number(e.target.value))}
            onBlur={() =>
              setLevelError(
                validateArtifactDraft({ mainStat, level, subStats: [] }),
              )
            }
          />
          {levelError ? (
            <p id="level-error" className="mt-1 text-xs text-rose">
              {levelError}
            </p>
          ) : (
            <p id="level-hint" className="mt-1 text-xs text-muted">
              0 to 20.
            </p>
          )}
          {/* A role="alert" node created in the same commit as its text
              announces nothing — see the panel-level region in App.tsx —
              so this persistent twin carries the announcement instead. */}
          <p className="sr-only" role="alert">
            {levelError ?? ''}
          </p>
        </label>
      </div>
      {/* Sub-stat entry is hard-coded empty (see `subStats` above), and the
          optimiser ranks almost entirely on sub-stats — so say what a
          hand-added piece can and can't do rather than letting the section
          hint imply it's an equal path to importing. */}
      <p id={`${uid}-substat-caveat`} className="text-xs text-muted">
        Hand-added pieces carry no sub-stats yet, so they rank below imported
        gear in a search. Use them to fill a gap, not to compare builds.
      </p>

      {/* The level field states its own error inline; don't say it twice. */}
      {error && error !== levelError && <Callout tone="error">{error}</Callout>}
      {/* The status lives in a persistent region — a role="status" node
          created in the same commit as its text announces nothing — so the
          Callout below is the visual half only. */}
      <p className="sr-only" role="status">
        {added && <span key={added.nonce}>{added.text}</span>}
      </p>
      {/* Same reasoning, for the submit-time error banner above. */}
      <p className="sr-only" role="alert">
        {error && error !== levelError ? error : ''}
      </p>
      {added && <Callout tone="success">{added.text}</Callout>}
      <button type="submit" className="btn-primary">
        Add Artifact
      </button>
    </form>
  );
}
