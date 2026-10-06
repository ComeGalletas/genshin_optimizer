/**
 * The game's pictures where the app shows a character, a weapon or an
 * artifact piece (TODO 9.2, ADR-0052), each with the app's own fallback:
 * a character's initials, a weapon's empty frame, a piece's slot glyph.
 * Decorative unless given `alt`: their callers print the name beside them.
 */
import type { Slot } from '@genshin-build-lab/engine/game/types';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import { GameImage } from './GameImage';
import { SlotGlyph } from './SlotGlyph';
import { cn } from './ui/cn';

/** "Raiden Shogun" → "RS"; "Furina" → "Fu". */
function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return words.length > 1 ? `${words[0][0]}${words[1][0]}` : name.slice(0, 2);
}

export function CharacterPortrait({
  characterKey,
  size = 32,
  alt,
  className,
}: {
  characterKey: string;
  size?: number;
  alt?: string;
  className?: string;
}) {
  return (
    <GameImage
      image={{ kind: 'character', key: characterKey }}
      size={size}
      alt={alt}
      className={cn('rounded-full bg-white/5 ring-1 ring-white/10', className)}
      fallback={
        <span
          aria-hidden="true"
          className="font-display font-bold text-muted"
          style={{ fontSize: Math.max(9, Math.round(size * 0.36)) }}
        >
          {initials(genshinAdapter.characterName(characterKey))}
        </span>
      }
    />
  );
}

export function WeaponIcon({
  weaponKey,
  size = 32,
  alt,
  className,
}: {
  weaponKey: string;
  size?: number;
  alt?: string;
  className?: string;
}) {
  return (
    <GameImage
      image={{ kind: 'weapon', key: weaponKey }}
      size={size}
      alt={alt}
      className={cn('rounded-md bg-white/5', className)}
      fallback={null}
    />
  );
}

export function ArtifactIcon({
  setKey,
  slot,
  size = 24,
  alt,
  className,
}: {
  setKey: string;
  slot: Slot;
  size?: number;
  alt?: string;
  className?: string;
}) {
  return (
    <GameImage
      image={{ kind: 'artifact', set: setKey, slot }}
      size={size}
      alt={alt}
      className={className}
      fallback={
        <SlotGlyph slot={slot} className="h-[70%] w-[70%] text-accent" />
      }
    />
  );
}
