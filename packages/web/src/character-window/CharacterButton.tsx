/**
 * Any character the app shows, as a button that opens their window
 * (TODO 9.9). Wraps what the call site already draws (a portrait, a name),
 * so the look stays the call site's.
 */
import type { ReactNode } from 'react';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import { cn } from '../components/ui/cn';
import { openCharacter } from './store';

export function CharacterButton({
  characterKey,
  children,
  className,
}: {
  characterKey: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        'focus-ring inline-flex items-center gap-2 rounded-md text-left transition-colors hover:text-accent-bright',
        className,
      )}
      // Named for what it does: the portrait inside is decorative, and a
      // printed name beside it reads the same either way.
      aria-label={`${genshinAdapter.characterName(characterKey)}: details`}
      title={`${genshinAdapter.characterName(characterKey)}: details`}
      onClick={() => openCharacter(characterKey)}
    >
      {children}
    </button>
  );
}
