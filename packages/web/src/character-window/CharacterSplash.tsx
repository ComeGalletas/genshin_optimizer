/**
 * A character's wish art behind their window (TODO 9.9), 85% transparent
 * (the owner's choice), so the text over it stays readable. Nothing when
 * game art is off, the names haven't loaded, or Enka doesn't serve it.
 */
import { useState } from 'react';
import { imageUrls } from '@genshin-build-lab/engine/game/genshin/images';
import { useSettings } from '../state/settings';
import { useImageNames } from '../components/imageNames';

/** Where the art sits in the window (the owner's placement). */
const SPLASH_POSITION = 'calc(60% + 75px) center';

export function CharacterSplash({ characterKey }: { characterKey: string }) {
  const showArt = useSettings((s) => s.showArt);
  const names = useImageNames();
  const [failed, setFailed] = useState<string | null>(null);
  const url =
    showArt && names
      ? imageUrls(names, { kind: 'character-splash', key: characterKey })[0]
      : undefined;
  if (!url || failed === url) return null;
  return (
    <img
      src={url}
      alt=""
      referrerPolicy="no-referrer"
      decoding="async"
      data-testid="character-splash"
      className="h-full w-full object-cover opacity-15"
      // 75px right of the art's 60% point: the wish art is wider than the
      // window, so this moves the character toward its middle without
      // uncovering an edge.
      style={{ objectPosition: SPLASH_POSITION }}
      onError={() => setFailed(url)}
    />
  );
}
