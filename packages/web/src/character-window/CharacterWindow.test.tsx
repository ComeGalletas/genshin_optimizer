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

  it('shows talents on Stats, each opening to its words and values', async () => {
    const user = userEvent.setup();
    furina(3);
    render(<CharacterWindow />);
    openCharacter('furina');
    await user.click(await screen.findByRole('tab', { name: 'Stats' }, LAZY));
    // Furina's C3 raises her burst; C5 (not reached) her skill.
    const burst = await screen.findByTestId('talent-burst', undefined, LAZY);
    expect(burst).toHaveTextContent('Let the People Rejoice');
    expect(burst).toHaveTextContent(/10\s*\+ 3/);
    expect(screen.getByTestId('talent-skill')).toHaveTextContent(/10(?!\s*\+)/);
    const skill = within(screen.getByTestId('talent-skill')).getByRole(
      'button',
    );
    expect(skill).toHaveAttribute('aria-expanded', 'false');
    await user.click(skill);
    expect(skill).toHaveAttribute('aria-expanded', 'true');
    const open = screen.getByTestId('talent-skill');
    // The description, then the values at level 10 (no boost at C3).
    expect(
      await within(open).findByText(
        /Invites the guests of the Salon/,
        undefined,
        LAZY,
      ),
    ).toBeInTheDocument();
    expect(open).toHaveTextContent('Lv 10');
    expect(open).toHaveTextContent(/Ousia Bubble DMG\s*14\.2% Max HP/);
    // The burst's values are at 13: its level and the +3.
    await user.click(within(burst).getByRole('button'));
    expect(screen.getByTestId('talent-burst')).toHaveTextContent(
      'Lv 13 (10 + 3)',
    );
  });

  it('lists the activated constellations below the stats, none at C0', async () => {
    const user = userEvent.setup();
    furina(2);
    const { unmount } = render(<CharacterWindow />);
    openCharacter('furina');
    await user.click(await screen.findByRole('tab', { name: 'Stats' }, LAZY));
    expect(
      await screen.findByTestId('constellation-2', undefined, LAZY),
    ).toBeInTheDocument();
    expect(screen.getByTestId('constellation-1')).toHaveTextContent('C1');
    expect(screen.queryByTestId('constellation-3')).toBeNull();
    unmount();
    useCharacterWindow.getState().close();
    furina(0);
    render(<CharacterWindow />);
    openCharacter('furina');
    await user.click(await screen.findByRole('tab', { name: 'Stats' }, LAZY));
    await screen.findByTestId('talent-burst', undefined, LAZY);
    expect(screen.queryByRole('region', { name: 'Constellations' })).toBeNull();
  });

  it('keeps Optimise at the bottom of Overview, and beside the name elsewhere', async () => {
    const user = userEvent.setup();
    furina();
    render(<CharacterWindow />);
    openCharacter('furina');
    const dialog = await screen.findByRole('dialog', undefined, LAZY);
    // Overview: Teams, then Recommended, then the big button.
    const order = [
      within(dialog).getByRole('region', { name: 'Teams' }),
      within(dialog).getByRole('region', { name: 'Recommended' }),
      within(dialog).getByRole('button', { name: 'Optimise This Character' }),
    ];
    for (let i = 1; i < order.length; i++)
      expect(
        order[i - 1].compareDocumentPosition(order[i]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    expect(
      within(dialog).queryByRole('button', { name: 'Optimize' }),
    ).toBeNull();
    expect(
      within(dialog)
        .getAllByRole('tab')
        .map((t) => t.textContent),
    ).toEqual(['Overview', 'Stats', 'Gear']);
    await user.click(within(dialog).getByRole('tab', { name: 'Gear' }));
    expect(
      within(dialog).queryByRole('button', { name: 'Optimise This Character' }),
    ).toBeNull();
    expect(
      within(dialog).getByRole('button', { name: 'Optimize' }),
    ).toBeInTheDocument();
  });

  it('shows each piece’s main stat with its element, its rolls, and the set effects', async () => {
    const user = userEvent.setup();
    furina();
    useInventory.getState().addMany([
      {
        id: 'g1',
        setKey: 'GoldenTroupe',
        slot: 'goblet',
        rarity: 5,
        level: 20,
        mainStat: 'elemental_dmg',
        mainStatValue: 46.6,
        element: 'hydro',
        subStats: [
          { key: 'hp', value: 448 },
          { key: 'crit_dmg', value: 15.5 },
          { key: 'er_pct', value: 13.0 },
          { key: 'hp_pct', value: 14.6 },
        ],
        rolls: { first: { hp: 209.13 }, total: 9 },
        location: 'furina',
      },
    ]);
    render(<CharacterWindow />);
    openCharacter('furina');
    await user.click(await screen.findByRole('tab', { name: 'Gear' }, LAZY));
    const pieces = screen.getByRole('region', { name: 'Artifacts' });
    const mains = within(pieces).getAllByTestId('main-stat');
    expect(mains.map((m) => m.textContent)).toEqual([
      'HP 4780',
      'Hydro DMG Bonus 46.6%',
    ]);
    // HP 448: the exported first roll, 209, then 239.
    const rolls = within(pieces).getAllByTestId('rolls');
    expect(rolls.some((r) => r.textContent === ' (209 + 239)')).toBe(true);
    // Two Golden Troupe pieces: the 2-piece effect, word for word.
    const effects = await within(pieces).findByRole(
      'list',
      { name: 'Active set effects' },
      LAZY,
    );
    expect(effects).toHaveTextContent(
      'Golden Troupe 2-piece: Increases Elemental Skill DMG by 20%.',
    );
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
