/**
 * The constellations a character has activated (TODO 9.10), each with its
 * description, below their stats. Nothing at C0, or for a character the
 * account doesn't have.
 */
import type { RosterEntry } from '@genshin-build-lab/engine/import/good';
import { useCharacterTexts } from './texts';

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
    <section aria-label="Constellations" className="well space-y-2 px-3 py-2">
      <h3 className="text-xs font-semibold uppercase text-muted">
        Constellations
      </h3>
      <ol className="space-y-2">
        {texts.constellations.slice(0, n).map((c, i) => (
          <li key={c.name} data-testid={`constellation-${i + 1}`}>
            <p className="font-semibold text-paper">
              <span className="mr-1.5 font-mono text-xs text-accent-bright">
                C{i + 1}
              </span>
              {c.name}
            </p>
            <p className="whitespace-pre-line text-xs leading-relaxed text-paper/80">
              {c.description}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
