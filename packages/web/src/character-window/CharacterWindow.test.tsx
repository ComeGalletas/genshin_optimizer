import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Artifact } from '@genshin-build-lab/engine/game/types';
import { CharacterWindow } from './CharacterWindow';
import { CharacterButton } from './CharacterButton';
import { openCharacter, useCharacterWindow } from './store';
import { useRoster } from '../state/roster';
import { useInventory } from '../state/inventory';
import { useSettings } from '../state/settings';
import { setImageNamesForTests } from '../components/imageNames';
import { TeamsView } from '../teams/TeamsView';

/** The window and its details file load lazily: a cold first import can
 *  outlast findBy's default second. */
const LAZY = { timeout: 10_000 };

const flower: Artifact = {
  id: 'f1',
  setKey: 'GoldenTroupe',
  slot: 'flower',
  rarity: 5,
  level: 20,
  mainStat: 'hp',
  mainStatValue: 4780,
  subStats: [
    { key: 'hp_pct', value: 10 },
    { key: 'crit_rate', value: 3.9 },
  ],
  location: 'furina',
};

function furina(constellation = 3) {
  useRoster.getState().setRoster({
    furina: {
      buildLevel: 90,
      level: 90,
      constellation,
      talents: { auto: 1, skill: 10, burst: 10 },
      weaponKey: 'splendor_of_tranquil_waters',
      weaponLevel: 90,
      weaponAscension: 6,
      weaponRefinement: 1,
    },
  });
  useInventory.getState().addMany([flower]);
}

describe('character window', () => {
  beforeEach(() => {
    useRoster.getState().clear();
    useInventory.getState().clear();
    useCharacterWindow.getState().close();
    useSettings.setState({ showArt: true });
    setImageNamesForTests({
      genshinDbVersion: 'test',
      characters: { furina: 'Furina' },
      weapons: {},
      sets: {},
    });
  });

  it('opens from any character button, with their art behind it', async () => {
    const user = userEvent.setup();
    furina();
    render(
      <>
        <CharacterButton characterKey="furina">Furina</CharacterButton>
        <CharacterWindow />
      </>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Furina: details' }));
    const dialog = await screen.findByRole('dialog', { name: 'Furina' }, LAZY);
    const splash = within(dialog).getByTestId('character-splash');
    expect(splash).toHaveAttribute(
      'src',
      'https://enka.network/ui/UI_Gacha_AvatarImg_Furina.png',
    );
    // 85% transparent.
    expect(splash).toHaveClass('opacity-15');
    // Moved 75px right, so the character sits nearer the middle.
    expect(splash.style.objectPosition).toBe('calc(60% + 75px) center');
  });

  it('shows no art when game art is off', async () => {
    useSettings.setState({ showArt: false });
    furina();
    render(<CharacterWindow />);
    openCharacter('furina');
    await screen.findByRole('dialog', undefined, LAZY);
    expect(screen.queryByTestId('character-splash')).toBeNull();
  });

  it('shows talents at their level, plus the constellations’ +3', async () => {
    furina(3);
    render(<CharacterWindow />);
    openCharacter('furina');
    // Furina's C3 raises her burst; C5 (not reached) her skill.
    const burst = await screen.findByTestId('talent-burst', undefined, LAZY);
    expect(burst).toHaveTextContent('Let the People Rejoice');
    expect(burst).toHaveTextContent(/10\s*\+ 3$/);
    expect(screen.getByTestId('talent-skill')).toHaveTextContent(/10$/);
    expect(screen.getByTestId('talent-auto')).toHaveTextContent(/1$/);
  });

  it('shows each stat as base + artifacts (+ the rest) = total', async () => {
    const user = userEvent.setup();
    furina();
    render(<CharacterWindow />);
    openCharacter('furina');
    await user.click(await screen.findByRole('tab', { name: 'Stats' }, LAZY));
    // 15,307 base HP at 90; the flower's 4,780 plus 10% of the base.
    expect(
      await screen.findByTestId('stat-hp', undefined, LAZY),
    ).toHaveTextContent('HP15307 + 6311 = 21618');
    // 5% base, 3.9% from the flower, 19.2% from her ascension.
    expect(screen.getByTestId('stat-crit_rate')).toHaveTextContent(
      'CRIT Rate5.0% + 3.9% + 19.2% = 28.1%',
    );
    // Splendor's CRIT DMG substat at level 90.
    expect(screen.getByTestId('stat-crit_dmg')).toHaveTextContent(
      '50.0% + 0.0% + 88.2% = 138.2%',
    );
  });

  it('shows the weapon as it is: level, refinement, stats, passive, story', async () => {
    const user = userEvent.setup();
    furina();
    render(<CharacterWindow />);
    openCharacter('furina');
    await user.click(await screen.findByRole('tab', { name: 'Gear' }, LAZY));
    const weapon = await screen.findByRole('region', { name: 'Weapon' }, LAZY);
    expect(weapon).toHaveTextContent('Splendor of Tranquil Waters');
    expect(weapon).toHaveTextContent('Lv 90 · R1');
    expect(
      await within(weapon).findByText('542', undefined, LAZY),
    ).toBeInTheDocument();
    expect(weapon).toHaveTextContent('Dawn and Dusk by the Lake (R1)');
    expect(weapon).toHaveTextContent(/8%.*14%/);
    expect(weapon).toHaveTextContent(/A scepter around which swirls/);
    const pieces = screen.getByRole('region', { name: 'Artifacts' });
    expect(pieces).toHaveTextContent('Golden Troupe');
    expect(pieces).toHaveTextContent('HP% 10.0%');
  });

  it('opens for a character not in the roster, at level 90', async () => {
    const user = userEvent.setup();
    render(<CharacterWindow />);
    openCharacter('furina');
    expect(
      await screen.findByText(/Not in your roster/, undefined, LAZY),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Stats' }));
    expect(
      await screen.findByTestId('stat-hp', undefined, LAZY),
    ).toHaveTextContent('HP15307 + 0 = 15307');
    await user.click(screen.getByRole('tab', { name: 'Gear' }));
    expect(screen.getByText('No weapon equipped.')).toBeInTheDocument();
  });

  it('opens from a team member', async () => {
    const user = userEvent.setup();
    const entry = {
      buildLevel: 90 as const,
      talents: { auto: 9, skill: 9, burst: 9 },
      weaponLevel: 90,
    };
    useRoster
      .getState()
      .setRoster(
        Object.fromEntries(
          [
            'neuvillette',
            'furina',
            'kaedehara_kazuha',
            'charlotte',
            'raiden_shogun',
            'xiangling',
            'xingqiu',
            'bennett',
          ].map((k) => [k, entry]),
        ),
      );
    render(
      <>
        <TeamsView />
        <CharacterWindow />
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Furina: details' }));
    expect(
      await screen.findByRole('dialog', { name: 'Furina' }, LAZY),
    ).toBeInTheDocument();
  });
});
