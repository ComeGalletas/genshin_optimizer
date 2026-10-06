/**
 * The game's own words (talents, constellations): genshin-db marks the
 * terms the game highlights with `**…**`, shown here in bold, never as
 * asterisks. Line breaks are kept.
 */
export function GameText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <strong key={i} className="font-semibold text-paper">
            {p}
          </strong>
        ) : (
          p
        ),
      )}
    </>
  );
}
