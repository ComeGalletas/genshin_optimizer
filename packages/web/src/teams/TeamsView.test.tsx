import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TeamsView } from './TeamsView';
import { useRoster } from '../state/roster';
import { useInventory } from '../state/inventory';

describe('TeamsView', () => {
  beforeEach(() => {
    useRoster.getState().clear();
    useInventory.getState().clear();
  });

  it('prompts for an import when nothing is owned', () => {
    render(<TeamsView />);
    expect(screen.getByText(/Import a GOOD file/i)).toBeInTheDocument();
  });

  it('renders both halves with four members each', () => {
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

    render(<TeamsView />);
    expect(screen.getByText('First half')).toBeInTheDocument();
    expect(screen.getByText('Second half')).toBeInTheDocument();
    const teams = screen.getAllByTestId('team-card');
    expect(teams).toHaveLength(2);
    for (const t of teams) {
      expect(t.querySelectorAll('[data-testid="team-member"]')).toHaveLength(4);
    }
    // Roles are shown alongside names.
    expect(screen.getAllByText('On-field DPS').length).toBeGreaterThan(0);
  });

  // The mode picker had two disabled options and one inert enabled one: a
  // control that changes nothing is worse than a sentence that says so.
  it('names the unbuilt modes in prose instead of offering a dead control', () => {
    render(<TeamsView />);
    expect(screen.queryByRole('radio')).toBeNull();
    expect(
      screen.getByText(
        /Coming soon: Imaginarium Theater · Stygian Onslaught\./i,
      ),
    ).toBeInTheDocument();
  });

  it('lists near-miss archetypes as one-character-short gaps', () => {
    const entry = { buildLevel: 90 as const };
    useRoster
      .getState()
      .setRoster(
        Object.fromEntries(
          ['hu_tao', 'xingqiu', 'yelan'].map((k) => [k, entry]),
        ),
      );
    render(<TeamsView />);
    expect(screen.getByText(/One character short/i)).toBeInTheDocument();
    expect(screen.getByText(/is missing its sustain/i)).toBeInTheDocument();
    expect(screen.getByText(/Hu Tao Vaporize/)).toBeInTheDocument();
  });
});
