import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExplainBuild } from './ExplainBuild';
import type { GapReport } from '@genshin-build-lab/engine/meta/gap';
import { useServer } from '../local-server/status';

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

const READY = { provider: 'ollama', model: 'qwen3:8b', ready: true };
const serverIs = (s: Partial<ReturnType<typeof useServer.getState>>) =>
  useServer.setState({ status: 'checking', llm: null, ...s });

afterEach(() => {
  serverIs({});
  vi.clearAllMocks();
});

describe('ExplainBuild', () => {
  it('renders nothing client-only, or when the server has no ready model', () => {
    for (const s of [
      { status: 'checking' as const },
      { status: 'offline' as const },
      { status: 'online' as const, llm: null },
      {
        status: 'online' as const,
        llm: {
          ...READY,
          ready: false,
          notReady: 'ANTHROPIC_API_KEY is not set',
        },
      },
    ]) {
      serverIs(s);
      const { container, unmount } = renderIt();
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  describe('with the server and a ready model', () => {
    beforeEach(() => serverIs({ status: 'online', llm: READY }));

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
      vi.mocked(explainBuild).mockRejectedValue(
        new Error("qwen3:8b didn't answer within 120 s"),
      );
      renderIt();
      await userEvent.click(
        screen.getByRole('button', { name: /Explain this build/i }),
      );
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          /generate an explanation: qwen3:8b didn't answer within 120 s/i,
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
