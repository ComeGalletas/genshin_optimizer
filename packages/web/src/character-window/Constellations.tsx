/**
 * The constellations a character has activated (TODO 9.10), below their
 * stats: each a row that opens to its description, as the talents do.
 * Nothing at C0, or for a character the account doesn't have.
 */
import { useId, useState } from 'react';
import type { RosterEntry } from '@genshin-build-lab/engine/import/good';
import { useCharacterTexts } from './texts';
import { GameText } from './GameText';

export function Constellations({
  characterKey,
  entry,
}: {
  characterKey: string;
  entry: RosterEntry | undefined;
}) {
  const texts = useCharacterTexts(characterKey);
  const n = Math.min(entry?.constellation ?? 0, 6);
  if (n < 1 || !texts?.constellations) return null;
  return (
    <section aria-label="Constellations" className="well space-y-1 px-3 py-2">
      <h3 className="text-xs font-semibold uppercase text-muted">
        Constellations
      </h3>
      <ul className="divide-y divide-white/5">
        {texts.constellations.slice(0, n).map((c, i) => (
          <ConstellationRow
            key={c.name}
            n={i + 1}
            name={c.name}
            description={c.description}
          />
        ))}
      </ul>
    </section>
  );
}

function ConstellationRow({
  n,
  name,
  description,
}: {
  n: number;
  name: string;
  description: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <li data-testid={`constellation-${n}`}>
      <button
        type="button"
        className="focus-ring flex w-full items-center justify-between gap-4 rounded py-1.5 text-left"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="min-w-0 text-paper">
          <span className="mr-1.5 font-mono text-xs text-accent-bright">
            C{n}
          </span>
          {name}
        </span>
        <span
          aria-hidden="true"
          className={`flex-none text-2xs text-muted transition ${open ? 'rotate-90' : ''}`}
        >
          ▶
        </span>
      </button>
      {open && (
        <p
          id={panelId}
          className="whitespace-pre-line pb-2 text-xs leading-relaxed text-paper/80"
        >
          <GameText text={description} />
        </p>
      )}
    </li>
  );
}
