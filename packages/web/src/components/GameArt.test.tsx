import { describe, it, expect, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ArtifactIcon, CharacterPortrait, WeaponIcon } from './GameArt';
import { setImageNamesForTests } from './imageNames';

const NAMES = {
  genshinDbVersion: 'x',
  characters: { raiden_shogun: 'Shougun' },
  weapons: { engulfing_lightning: 'Pole_Narukami' },
  sets: { EmblemOfSeveredFate: 15020 },
};

afterEach(() => setImageNamesForTests(null));

describe('game art in place (TODO 9.2)', () => {
  it('shows the game’s pictures by their asset names', () => {
    setImageNamesForTests(NAMES);
    const { container } = render(
      <>
        <CharacterPortrait characterKey="raiden_shogun" />
        <WeaponIcon weaponKey="engulfing_lightning" />
        <ArtifactIcon setKey="EmblemOfSeveredFate" slot="circlet" />
      </>,
    );
    expect(
      [...container.querySelectorAll('img')].map((i) => i.getAttribute('src')),
    ).toEqual([
      'https://enka.network/ui/UI_AvatarIcon_Shougun.png',
      'https://enka.network/ui/UI_EquipIcon_Pole_Narukami.png',
      'https://enka.network/ui/UI_RelicIcon_15020_3.png',
    ]);
  });

  it('falls back to initials, an empty frame and the slot glyph', () => {
    setImageNamesForTests(NAMES);
    const { container } = render(
      <>
        <CharacterPortrait characterKey="raiden_shogun" />
        <CharacterPortrait characterKey="furina" />
        <WeaponIcon weaponKey="unknown_blade" />
        <ArtifactIcon setKey="UnknownSet" slot="goblet" />
      </>,
    );
    // Raiden's picture fails on both hosts: her initials.
    const img = container.querySelector('img')!;
    fireEvent.error(img);
    fireEvent.error(container.querySelector('img')!);
    expect(screen.getByText('RS')).toBeInTheDocument();
    // Furina isn't in these names: hers straight away.
    expect(screen.getByText('Fu')).toBeInTheDocument();
    const boxes = screen.getAllByTestId('game-image');
    expect(boxes[2]).toBeEmptyDOMElement();
    expect(boxes[3].querySelector('svg')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });
});
