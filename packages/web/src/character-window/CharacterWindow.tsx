/**
 * The character window's host (TODO 9.9): mounted once, it loads the
 * window itself the first time a character is opened, so the first load
 * doesn't carry it.
 */
import { lazy, Suspense } from 'react';
import { useCharacterWindow } from './store';

const CharacterWindowDrawer = lazy(() =>
  import('./CharacterWindowDrawer').then((m) => ({
    default: m.CharacterWindowDrawer,
  })),
);

export function CharacterWindow() {
  const key = useCharacterWindow((s) => s.key);
  if (!key) return null;
  return (
    <Suspense fallback={null}>
      <CharacterWindowDrawer characterKey={key} />
    </Suspense>
  );
}
