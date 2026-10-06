/**
 * Talents (TODO 9.9, 9.10): each at the level the account raised it to,
 * then the +3 its constellations add ("10 + 3"). A row opens to the
 * talent's description (no flavour text) and its values at the level that
 * applies in combat, constellations included.
 */
import { useId, useState } from 'react';
import {
  talentBonus,
  talentValues,
  type Details,
  type TalentKind,
  type TalentText,
} from '@genshin-build-lab/engine/game/genshin/details';
import type { RosterEntry } from '@genshin-build-lab/engine/import/good';
import { useCharacterTexts } from './texts';

const KINDS: { kind: TalentKind; label: string }[] = [
  { kind: 'auto', label: 'Normal Attack' },
  { kind: 'skill', label: 'Elemental Skill' },
  { kind: 'burst', label: 'Elemental Burst' },
];

/** The level a character not in the roster is shown at. */
const SHOWN_WITHOUT_ROSTER = 10;

export function Talents({
  details,
  characterKey,
  entry,
}: {
  details: Details | null | 'failed';
  characterKey: string;
  entry: RosterEntry | undefined;
}) {
  const texts = useCharacterTexts(characterKey);
  const levels = entry?.talents;
  const c =
    details && details !== 'failed'
      ? details.characters[characterKey]
      : undefined;
  if (!levels && !c?.talents) return null;
  const bonus = c
    ? talentBonus(c, entry?.constellation ?? 0)
    : { auto: 0, skill: 0, burst: 0 };
  return (
    <section aria-label="Talents" className="well space-y-1 px-3 py-2">
      <h3 className="text-xs font-semibold uppercase text-muted">Talents</h3>
      <ul className="divide-y divide-white/5">
        {KINDS.map(({ kind, label }, i) => (
          <TalentRow
            key={kind}
            kind={kind}
            label={label}
            name={c?.talents?.[i]}
            base={levels?.[kind]}
            bonus={bonus[kind]}
            text={texts?.talents[i] ?? null}
            loading={texts === undefined}
          />
        ))}
      </ul>
    </section>
  );
}

function TalentRow({
  kind,
  label,
  name,
  base,
  bonus,
  text,
  loading,
}: {
  kind: TalentKind;
  label: string;
  name: string | undefined;
  base: number | undefined;
  bonus: number;
  text: TalentText | null;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const level = base !== undefined ? base + bonus : SHOWN_WITHOUT_ROSTER;
  return (
    <li data-testid={`talent-${kind}`}>
      <button
        type="button"
        className="focus-ring flex w-full items-center justify-between gap-4 rounded py-1.5 text-left"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="min-w-0">
          <span className="text-paper">{label}</span>
          {name && (
            <span className="block truncate text-xs text-muted">{name}</span>
          )}
        </span>
        <span className="flex flex-none items-center gap-2 font-mono">
          {base !== undefined ? (
            <span>
              <span className="text-paper">{base}</span>
              {bonus > 0 && (
                <span
                  className="text-accent-bright"
                  title={`${base + bonus} with constellations`}
                >
                  {' '}
                  + {bonus}
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted">—</span>
          )}
          <span
            aria-hidden="true"
            className={`text-2xs text-muted transition ${open ? 'rotate-90' : ''}`}
          >
            ▶
          </span>
        </span>
      </button>
      {open && (
        <div id={panelId} className="space-y-2 pb-2 text-xs">
          {text ? (
            <>
              <p className="whitespace-pre-line leading-relaxed text-paper/80">
                {text.description}
              </p>
              <p className="font-semibold text-muted">
                {base !== undefined
                  ? `Lv ${level}${bonus > 0 ? ` (${base} + ${bonus})` : ''}`
                  : `At Lv ${level} (not in your roster)`}
              </p>
              <dl className="grid gap-0.5">
                {talentValues(text, level).map((v) => (
                  <div key={v.label} className="flex justify-between gap-4">
                    <dt className="text-muted">{v.label}</dt>
                    <dd className="text-right font-mono text-paper">
                      {v.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <p className="text-muted">
              {loading ? 'Loading…' : 'No description for this talent yet.'}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
