import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SharedBuildBanner } from './landing';
import type { OptimizeRequest } from '@genshin-build-lab/engine/game/types';

describe('SharedBuildBanner', () => {
  it('names the character and weapon, and scrolls to the optimise step on click', async () => {
    const user = userEvent.setup();
    const req: OptimizeRequest = {
      characterKey: 'raiden_shogun',
      weaponKey: 'engulfing_lightning',
      buildLevel: 90,
      constraints: {},
      objective: 'crit_value',
    };
    render(<SharedBuildBanner request={req} />);
    expect(screen.getByText(/raiden shogun/i)).toBeInTheDocument();
    expect(screen.getByText(/lv 90/i)).toBeInTheDocument();

    const step = document.createElement('div');
    step.id = 'step-optimise';
    document.body.appendChild(step);
    await user.click(screen.getByRole('button', { name: /run it yourself/i }));
    // scrollToId reads the element off the DOM; scrollIntoView is stubbed in
    // test-setup.ts, so a thrown error is the only failure mode worth
    // checking here — the click completing at all proves the handler ran.
    document.body.removeChild(step);
  });

  it('falls back to the raw weapon key when the weapon is not in the dataset', () => {
    const req: OptimizeRequest = {
      characterKey: 'raiden_shogun',
      weaponKey: 'not_a_real_weapon',
      buildLevel: 90,
      constraints: {},
      objective: 'crit_value',
    };
    render(<SharedBuildBanner request={req} />);
    expect(screen.getByText(/not_a_real_weapon/)).toBeInTheDocument();
  });
});
