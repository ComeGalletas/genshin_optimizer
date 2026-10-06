import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatPanel } from './ChatPanel';
import { useServer } from '../local-server/status';
import { sendChat, useChat, type ChatEntry } from '../local-server/chat';
import { renderAnswer } from './chatText';

const LLM = { provider: 'ollama', model: 'qwen3:8b', ready: true };
const REPLY = {
  answer: 'Your best build has **181%** ER and 66.1% crit rate, [?] damage.',
  steps: [
    {
      tool: 'get_character',
      arguments: { characterKey: 'furina' },
      ok: true,
      ms: 14,
    },
    { tool: 'optimize_build', ok: false, error: 'timeout', ms: 120000 },
    { tool: 'optimize_build', ok: true, ms: 2848 },
  ],
  masked: ['98765'],
  stop: 'answer' as const,
  provider: 'ollama',
  model: 'qwen3:8b',
};

/** A fake server answering POST /chat with `status` and `body`. */
function serveChat(status: number, body: unknown) {
  const f = vi.fn<
    (url: string, init: RequestInit) => Promise<Partial<Response>>
  >(async () => ({
    ok: status === 200,
    status,
    json: async () => body,
  }));
  vi.stubGlobal('fetch', f);
  return f;
}

const initialServer = useServer.getState();
beforeEach(() => useServer.setState({ status: 'online', llm: LLM }));
afterEach(() => {
  vi.unstubAllGlobals();
  useServer.setState(initialServer, true);
  useChat.setState({ entries: [], pending: false, since: null, error: null });
});

async function openAndAsk(question: string) {
  render(<ChatPanel />);
  await userEvent.click(screen.getByRole('button', { name: 'Ask' }));
  await userEvent.type(screen.getByLabelText('Your question'), question);
  await userEvent.click(screen.getByRole('button', { name: 'Send' }));
}

describe('ChatPanel', () => {
  it('is offered only while the server runs with a ready model', () => {
    for (const s of [
      { status: 'offline' as const, llm: null },
      { status: 'online' as const, llm: { ...LLM, ready: false } },
    ]) {
      useServer.setState(s);
      const { container, unmount } = render(<ChatPanel />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it('asks the server and shows the answer, the tools used and removed numbers', async () => {
    const f = serveChat(200, REPLY);
    await openAndAsk('Best Furina build with at least 180% ER?');
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Answer ready.'),
    );
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:5198/chat');
    expect(JSON.parse(init.body as string)).toEqual({
      messages: [
        { role: 'user', content: 'Best Furina build with at least 180% ER?' },
      ],
    });
    // **bold** is rendered, not shown as asterisks.
    expect(screen.getByText('181%').tagName).toBe('STRONG');
    // The tools, opened on demand: each with its arguments, a failure's
    // reason inline.
    await userEvent.click(
      screen.getByText('Used 3 tools (1 failed) · 122.9 s'),
    );
    const steps = screen.getByTestId('chat-steps');
    expect(steps).toHaveTextContent(
      'get_character · 0.0 s{"characterKey":"furina"}',
    );
    expect(steps).toHaveTextContent('optimize_build · 120.0 s · failedtimeout');
    expect(
      screen.getByText(/Numbers no tool gave were removed/),
    ).toHaveTextContent('Removed: 98765.');
    // The removed number stands out where it was.
    expect(screen.getByText('[?]').tagName).toBe('MARK');
    // The box is empty and ready for the next question.
    expect(screen.getByLabelText('Your question')).toHaveValue('');
  });

  it('sends the conversation so far with the next question', async () => {
    const f = serveChat(200, REPLY);
    await openAndAsk('First?');
    await waitFor(() => expect(useChat.getState().entries).toHaveLength(2));
    await userEvent.type(
      screen.getByLabelText('Your question'),
      'Second?{Enter}',
    );
    await waitFor(() => expect(f).toHaveBeenCalledTimes(2));
    expect(
      JSON.parse(f.mock.calls[1][1].body as string).messages.map(
        (m: { role: string }) => m.role,
      ),
    ).toEqual(['user', 'assistant', 'user']);
  });

  it('shows the server’s reason and puts the question back', async () => {
    serveChat(504, {
      error: 'llm_timeout',
      message: "qwen3:8b didn't answer within 120 s",
    });
    await openAndAsk('Anything?');
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        "No answer: qwen3:8b didn't answer within 120 s.",
      ),
    );
    expect(screen.getByLabelText('Your question')).toHaveValue('Anything?');
    expect(useChat.getState().entries).toEqual([]);
  });
});

describe('ChatPanel polish (TODO 8.2)', () => {
  it('offers example questions that fill the box', async () => {
    render(<ChatPanel />);
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }));
    await userEvent.click(
      screen.getByRole('button', {
        name: /Share my artifacts between Mualani/,
      }),
    );
    expect(screen.getByLabelText('Your question')).toHaveValue(
      'Share my artifacts between Mualani, Mavuika, Xilonen and Emilie.',
    );
  });

  it('stops waiting on request: the question comes back, with no error', async () => {
    // A server that never answers until the request is aborted.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_, reject) =>
            init.signal!.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            ),
          ),
      ),
    );
    await openAndAsk('Slow one?');
    expect(await screen.findByTestId('chat-working')).toHaveTextContent(
      /Working on it… \d+ s/,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Stop Waiting' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Your question')).toHaveValue('Slow one?'),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('');
    expect(useChat.getState()).toMatchObject({ entries: [], pending: false });
  });

  it('tries again from the error, and says when the tool-call limit cut an answer short', async () => {
    serveChat(504, { message: 'the model timed out' });
    await openAndAsk('Anything?');
    await screen.findByRole('button', { name: 'Try Again' });
    const f = serveChat(200, { ...REPLY, stop: 'step_limit' });
    await userEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText(/Stopped at the most tool calls/),
    ).toBeInTheDocument();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    await userEvent.click(screen.getByRole('button', { name: 'Copy answer' }));
    expect(writeText).toHaveBeenCalledWith(REPLY.answer);
    expect(screen.getByRole('button', { name: 'Copied' })).toBeVisible();
  });
});

describe('renderAnswer', () => {
  it('turns - and 1. lines into lists, keeps bold and code, and the rest as text', () => {
    render(
      <div>
        {renderAnswer(
          [
            'Two options:',
            '- **Emblem** 4pc',
            '- `GladiatorsFinale` 2pc',
            'Then:',
            '1. Level the sands',
            '2. Farm',
          ].join('\n'),
        )}
      </div>,
    );
    const [ul, ol] = screen.getAllByRole('list');
    expect(ul.tagName).toBe('UL');
    expect(ul).toHaveTextContent('Emblem 4pcGladiatorsFinale 2pc');
    expect(screen.getByText('Emblem').tagName).toBe('STRONG');
    expect(screen.getByText('GladiatorsFinale').tagName).toBe('CODE');
    expect(ol.tagName).toBe('OL');
    expect(ol.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByText(/Two options:/)).toBeInTheDocument();
  });
});

describe('sendChat', () => {
  it('sends at most the server’s window, starting with a question, each message capped', async () => {
    const f = serveChat(200, REPLY);
    const entries: ChatEntry[] = Array.from({ length: 45 }, (_, i) =>
      i % 2 === 0
        ? { role: 'user', content: `q${i}` }
        : { role: 'assistant', content: 'x'.repeat(5000), ...REPLY },
    );
    await sendChat(entries);
    const sent = JSON.parse(f.mock.calls[0][1].body as string).messages;
    expect(sent.length).toBeLessThanOrEqual(40);
    expect(sent[0].role).toBe('user');
    expect(sent.at(-1)).toEqual({ role: 'user', content: 'q44' });
    expect(
      Math.max(...sent.map((m: { content: string }) => m.content.length)),
    ).toBe(4000);
  });
});
