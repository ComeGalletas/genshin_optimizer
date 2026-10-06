/**
 * A game image (TODO 9.1, ADR-0052): a character's portrait or side icon,
 * a weapon's icon or an artifact piece's, linked from Enka, then HoYoverse,
 * and the given fallback (the app's own glyph or initials) when neither
 * serves it, the names aren't loaded yet, or the reader turned game art off.
 *
 * Always the same box, so nothing moves when a picture arrives; loaded
 * lazily, with no referrer (a share link's build stays out of the hosts'
 * logs). `alt` is empty unless the caller says otherwise: most call sites
 * print the name right beside the picture, and a second reading is noise.
 */
import { useState, type ReactNode } from 'react';
import {
  imageUrls,
  type ImageRef,
} from '@genshin-build-lab/engine/game/genshin/images';
import { useSettings } from '../state/settings';
import { useImageNames } from './imageNames';
import { cn } from './ui/cn';

export function GameImage({
  image,
  size,
  fallback,
  alt = '',
  className,
}: {
  image: ImageRef;
  /** Width and height in pixels. */
  size: number;
  /** What to show without a picture. */
  fallback: ReactNode;
  alt?: string;
  className?: string;
}) {
  const showArt = useSettings((s) => s.showArt);
  const names = useImageNames();
  const urls = showArt && names ? imageUrls(names, image) : [];
  const key = urls.join('|');
  // Which URL is in use (past the last, the fallback); a new image starts
  // again from the first host.
  const [attempt, setAttempt] = useState({ key, i: 0 });
  const i = attempt.key === key ? attempt.i : 0;
  const url = urls[i];
  return (
    <span
      className={cn(
        'inline-grid flex-none place-items-center overflow-hidden',
        className,
      )}
      style={{ width: size, height: size }}
      data-testid="game-image"
    >
      {url ? (
        <img
          src={url}
          alt={alt}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="h-full w-full object-contain"
          onError={() => setAttempt({ key, i: i + 1 })}
        />
      ) : (
        fallback
      )}
    </span>
  );
}
