import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ServerChip } from './ServerChip';
import { useServer } from '../local-server/status';

const LLM = { provider: 'ollama', model: 'qwen3:8b', ready: true };
const initial = useServer.getState();
afterEach(() => useServer.setState(initial, true));

describe('ServerChip', () => {
  it('names the state: checking, client-only, connected with or without a model', () => {
    const cases = [
      [{ status: 'checking' as const }, 'Checking local server…'],
      [{ status: 'offline' as const, reason: 'nope' }, 'Client-only'],
      [{ status: 'online' as const, llm: LLM }, 'Local server · qwen3:8b'],
      [
        {
          status: 'online' as const,
          llm: {
            ...LLM,
            ready: false,
            notReady: 'ANTHROPIC_API_KEY is not set',
          },
        },
        'Local server · no model',
      ],
    ] as const;
    for (const [state, label] of cases) {
      useServer.setState(state);
      const { unmount } = render(<ServerChip />);
      expect(screen.getByRole('button')).toHaveTextContent(label);
      unmount();
    }
  });

  it('explains a model that isn’t ready, and checks again when pressed', async () => {
    const check = vi.fn(async () => {});
    useServer.setState({
      status: 'online',
      llm: { ...LLM, ready: false, notReady: 'ANTHROPIC_API_KEY is not set' },
      check,
    });
    render(<ServerChip />);
    const chip = screen.getByRole('button');
    expect(chip).toHaveAccessibleName(/ANTHROPIC_API_KEY is not set/);
    await userEvent.click(chip);
    expect(check).toHaveBeenCalledOnce();
  });
});
