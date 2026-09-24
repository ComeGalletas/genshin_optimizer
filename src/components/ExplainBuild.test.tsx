import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExplainBuild } from './ExplainBuild';
import type { GapReport } from '@genshin-build-lab/engine/meta/gap';

vi.mock('../ai/explainClient', () => ({ explainBuild: vi.fn() }));
import { explainBuild } from '../ai/explainClient';

const report: GapReport = {
  characterKey: 'furina',
  feasibility: [],
  shortfalls: [],
  action: 'Upgrade your Sands.',
};

function renderIt() {
  return render(
    <ExplainBuild
      characterKey="furina"
      objective="crit_value"
      totals={{ hp: 30000 }}
      report={report}
    />,
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('ExplainBuild', () => {
  it('renders nothing when the flag is off', () => {
    vi.stubEnv('VITE_AI_ENABLED', '');
    const { container } = renderIt();
    expect(container).toBeEmptyDOMElement();
  });

  describe('with flag on', () => {
    beforeEach(() => vi.stubEnv('VITE_AI_ENABLED', 'true'));

    it('shows the button', () => {
      renderIt();
      expect(
        screen.getByRole('button', { name: /Explain this build/i }),
      ).toBeInTheDocument();
    });

    it('shows the explanation after a successful call', async () => {
      vi.mocked(explainBuild).mockResolvedValue('This build maximises crit.');
      renderIt();
      await userEvent.click(
        screen.getByRole('button', { name: /Explain this build/i }),
      );
      await waitFor(() =>
        expect(
          screen.getByText('This build maximises crit.'),
        ).toBeInTheDocument(),
      );
    });

    it('shows an inline error and keeps the button on failure', async () => {
      vi.mocked(explainBuild).mockRejectedValue(new Error('boom'));
      renderIt();
      await userEvent.click(
        screen.getByRole('button', { name: /Explain this build/i }),
      );
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          /generate an explanation/i,
        ),
      );
      expect(
        screen.getByRole('button', { name: /Explain this build/i }),
      ).toHaveAttribute('aria-disabled', 'false');
    });

    it('keeps a Regenerate action after a successful call', async () => {
      vi.mocked(explainBuild).mockResolvedValue('This build maximises crit.');
      renderIt();
      await userEvent.click(
        screen.getByRole('button', { name: /Explain this build/i }),
      );
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: /Regenerate/i }),
        ).toBeInTheDocument(),
      );
    });
  });
});
