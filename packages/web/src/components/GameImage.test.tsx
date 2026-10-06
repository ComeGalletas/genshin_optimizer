import { describe, it, expect, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GameImage } from './GameImage';
import { setImageNamesForTests } from './imageNames';
import { useSettings } from '../state/settings';

const NAMES = {
  genshinDbVersion: 'x',
  characters: { furina: 'Furina' },
  weapons: {},
  sets: { GoldenTroupe: 15032 },
};

afterEach(() => {
  setImageNamesForTests(null);
  useSettings.setState({ showArt: true });
});

describe('GameImage (TODO 9.1)', () => {
  it('shows Enka’s picture, then HoYoverse’s when that fails, then the fallback', () => {
    setImageNamesForTests(NAMES);
    render(
      <GameImage
        image={{ kind: 'character', key: 'furina' }}
        size={40}
        fallback={<span>F</span>}
        alt="Furina"
      />,
    );
    const img = screen.getByRole('img', { name: 'Furina' });
    expect(img).toHaveAttribute(
      'src',
      'https://enka.network/ui/UI_AvatarIcon_Furina.png',
    );
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
    fireEvent.error(img);
    expect(screen.getByRole('img', { name: 'Furina' })).toHaveAttribute(
      'src',
      'https://upload-os-bbs.mihoyo.com/game_record/genshin/character_icon/UI_AvatarIcon_Furina.png',
    );
    fireEvent.error(screen.getByRole('img', { name: 'Furina' }));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('F')).toBeInTheDocument();
    // The box keeps its size whatever it shows.
    expect(screen.getByTestId('game-image')).toHaveStyle({
      width: '40px',
      height: '40px',
    });
  });

  it('shows the fallback before the names arrive, for what they don’t name, and with game art off', () => {
    const { rerender } = render(
      <GameImage
        image={{ kind: 'artifact', set: 'GoldenTroupe', slot: 'sands' }}
        size={24}
        fallback={<span>sands</span>}
      />,
    );
    expect(screen.getByText('sands')).toBeInTheDocument();
    setImageNamesForTests(NAMES);
    rerender(
      <GameImage
        image={{ kind: 'artifact', set: 'GoldenTroupe', slot: 'sands' }}
        size={24}
        fallback={<span>sands</span>}
      />,
    );
    // Decorative by default: no alt text, so it isn't an "img" by name.
    expect(
      screen.getByTestId('game-image').querySelector('img'),
    ).toHaveAttribute(
      'src',
      'https://enka.network/ui/UI_RelicIcon_15032_5.png',
    );
    rerender(
      <GameImage
        image={{ kind: 'weapon', key: 'unnamed_blade' }}
        size={24}
        fallback={<span>blade</span>}
      />,
    );
    expect(screen.getByText('blade')).toBeInTheDocument();
    useSettings.setState({ showArt: false });
    rerender(
      <GameImage
        image={{ kind: 'character', key: 'furina' }}
        size={24}
        fallback={<span>F</span>}
      />,
    );
    expect(screen.getByText('F')).toBeInTheDocument();
    expect(screen.getByTestId('game-image').querySelector('img')).toBeNull();
  });
});
