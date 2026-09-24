import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CharacterDetail } from './CharacterDetail';
import type { Artifact } from '@genshin-build-lab/engine/game/types';
import type { RosterEntry } from '@genshin-build-lab/engine/import/good';
import { getDamageProfile } from '@genshin-build-lab/engine/damage/profiles';

const entry: RosterEntry = {
  buildLevel: 90,
  level: 90,
  constellation: 0,
  talents: { auto: 9, skill: 9, burst: 9 },
  weaponKey: 'mistsplitter_reforged',
  weaponLevel: 90,
};

const flower: Artifact = {
  id: 'a1',
  setKey: 'BlizzardStrayer',
  slot: 'flower',
  rarity: 5,
  level: 20,
  mainStat: 'hp',
  mainStatValue: 4780,
  subStats: [{ key: 'crit_rate', value: 10 }],
  location: 'kamisato_ayaka',
};

describe('CharacterDetail', () => {
  it('shows Overview by default and switches tabs with clicks', async () => {
    const user = userEvent.setup();
    render(
      <CharacterDetail
        characterKey="kamisato_ayaka"
        entry={entry}
        artifacts={[flower]}
      />,
    );
    expect(screen.getByRole('tab', { name: /overview/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(screen.getByRole('tab', { name: /recommended/i }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent(/blizzard/i);
  });

  it('lists every slot on the Gear tab, marking empty ones', async () => {
    const user = userEvent.setup();
    render(
      <CharacterDetail
        characterKey="kamisato_ayaka"
        entry={entry}
        artifacts={[flower]}
      />,
    );
    await user.click(screen.getByRole('tab', { name: /gear/i }));
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveTextContent(/Blizzard Strayer/);
    expect(screen.getAllByText('empty')).toHaveLength(4);
  });

  it('says so when a character has no curated recipe', async () => {
    const user = userEvent.setup();
    render(<CharacterDetail characterKey="amber" entry={{}} artifacts={[]} />);
    await user.click(screen.getByRole('tab', { name: /recommended/i }));
    expect(
      screen.getByText(/No curated recipe for this character yet/i),
    ).toBeInTheDocument();
  });

  it('links the damage profile source only when it is a second source', async () => {
    const user = userEvent.setup();
    // Alhaitham's damage profile cites the full guide, his recipe the quick
    // guide — two genuinely different pages.
    render(
      <CharacterDetail characterKey="alhaitham" entry={entry} artifacts={[]} />,
    );
    await user.click(screen.getByRole('tab', { name: /recommended/i }));
    const link = screen.getByRole('link', {
      name: /damage profile source\s*\(opens in new tab\)/i,
    });
    expect(link).toHaveAttribute('href', getDamageProfile('alhaitham')?.source);
    expect(link).toHaveAttribute('rel', 'noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('omits the damage profile link when it repeats the recipe source', async () => {
    const user = userEvent.setup();
    render(
      <CharacterDetail
        characterKey="kamisato_ayaka"
        entry={entry}
        artifacts={[]}
      />,
    );
    await user.click(screen.getByRole('tab', { name: /recommended/i }));
    expect(
      screen.queryByRole('link', { name: /damage profile source/i }),
    ).toBeNull();
    expect(
      screen.getByRole('link', { name: /source guide \(KQM\)/i }),
    ).toBeInTheDocument();
  });

  it('states what the recipe’s 4pc bonus assumes', async () => {
    const user = userEvent.setup();
    render(
      <CharacterDetail
        characterKey="kamisato_ayaka"
        entry={entry}
        artifacts={[]}
      />,
    );
    await user.click(screen.getByRole('tab', { name: /recommended/i }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent(
      /Blizzard Strayer 4pc: Assumes the target is Frozen/,
    );
  });

  it('says why a 4pc is not scored when it is unmodelled', async () => {
    const user = userEvent.setup();
    // Kazuha's recipe is 4pc Viridescent Venerer, which ADR-0020 leaves
    // deliberately unmodelled.
    render(
      <CharacterDetail
        characterKey="kaedehara_kazuha"
        entry={entry}
        artifacts={[]}
      />,
    );
    await user.click(screen.getByRole('tab', { name: /recommended/i }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent(
      /4pc not scored: Swirl DMG/,
    );
  });

  it('says a hit-kind 4pc is unscored when the recipe ranks by a scalar stat', async () => {
    const user = userEvent.setup();
    // Raiden's recipe is 4pc Emblem, whose only channel is Burst DMG from ER —
    // nothing a crit_value ranking can read, so quoting its uptime here would
    // imply a number that never enters the score.
    render(
      <CharacterDetail
        characterKey="raiden_shogun"
        entry={{ ...entry, weaponKey: 'engulfing_lightning' }}
        artifacts={[]}
      />,
    );
    await user.click(screen.getByRole('tab', { name: /recommended/i }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent(
      /Emblem of Severed Fate 4pc: not scored on this objective/,
    );
  });

  it('moves between tabs with arrow keys, taking focus along', async () => {
    const user = userEvent.setup();
    render(
      <CharacterDetail
        characterKey="kamisato_ayaka"
        entry={entry}
        artifacts={[]}
      />,
    );
    screen.getByRole('tab', { name: /overview/i }).focus();
    await user.keyboard('{ArrowRight}');
    const gear = screen.getByRole('tab', { name: /gear/i });
    expect(gear).toHaveAttribute('aria-selected', 'true');
    expect(gear).toHaveFocus();
  });

  it('names the panel after the selected tab and points the tabs at it', () => {
    render(
      <CharacterDetail
        characterKey="kamisato_ayaka"
        entry={entry}
        artifacts={[]}
      />,
    );
    const panel = screen.getByRole('tabpanel');
    const overview = screen.getByRole('tab', { name: /overview/i });
    expect(overview).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAttribute('aria-labelledby', overview.id);
  });
});
