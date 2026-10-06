/**
 * The chat's conversation (TODO 3.6, ADR-0035): what was asked and
 * answered, and the call to the local server's `POST /chat`, which runs the
 * model and its tools over the server's account. Kept for the session
 * only: answers describe the account as it was when asked.
 * @packageDocumentation
 */

import { create } from 'zustand';
import { RequestStopped, serverJson } from './client';

/** A tool the model called for an answer (as the server reports it). */
export interface ChatStep {
  tool: string;
  /** What the model asked the tool for. */
  arguments?: Record<string, unknown>;
  ok: boolean;
  error?: string;
  ms: number;
}

export interface ChatReply {
  answer: string;
  steps: ChatStep[];
  /** Numbers no tool gave, removed from the answer. */
  masked: string[];
  stop: 'answer' | 'step_limit';
  provider: string;
  model: string;
}

export type ChatEntry =
  | { role: 'user'; content: string }
  | ({ role: 'assistant'; content: string } & Omit<ChatReply, 'answer'>);

/** The server's limits (`ChatBody`): 40 messages of up to 4,000 characters. */
const MAX_MESSAGES = 40;
const MAX_CHARS = 4_000;

/** A tool round can include an exact search of up to 120 s, plus the
 *  model's own turns on a local machine. */
const CHAT_TIMEOUT_MS = 300_000;

export function sendChat(
  entries: readonly ChatEntry[],
  signal?: AbortSignal,
): Promise<ChatReply> {
  const messages = entries
    .slice(-MAX_MESSAGES)
    .map((e) => ({ role: e.role, content: e.content.slice(0, MAX_CHARS) }));
  // The window must start with a question the server can pair up.
  while (messages.length > 1 && messages[0].role !== 'user') messages.shift();
  return serverJson<ChatReply>('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    timeoutMs: CHAT_TIMEOUT_MS,
    ...(signal && { signal }),
  });
}

interface ChatState {
  entries: ChatEntry[];
  pending: boolean;
  /** When the pending question was sent (ms since the epoch). */
  since: number | null;
  /** Why the last question got no answer. */
  error: string | null;
  /** Asks, and says whether an answer came back (on false the question
   *  is taken back out, for the panel to put in its box again). */
  ask: (question: string) => Promise<boolean>;
  /** Stop waiting for the pending answer: the question comes back out,
   *  with no error. The server finishes the request on its own. */
  stop: () => void;
  clear: () => void;
}

let inFlight: AbortController | null = null;

export const useChat = create<ChatState>()((set, get) => ({
  entries: [],
  pending: false,
  since: null,
  error: null,
  ask: async (question) => {
    const q = question.trim();
    if (!q || get().pending) return false;
    const entries: ChatEntry[] = [
      ...get().entries,
      { role: 'user', content: q },
    ];
    set({ entries, pending: true, since: Date.now(), error: null });
    const abort = new AbortController();
    inFlight = abort;
    try {
      const { answer, ...rest } = await sendChat(entries, abort.signal);
      set({
        entries: [...entries, { role: 'assistant', content: answer, ...rest }],
      });
      return true;
    } catch (e) {
      set({
        entries: entries.slice(0, -1),
        error: e instanceof RequestStopped ? null : (e as Error).message,
      });
      return false;
    } finally {
      if (inFlight === abort) inFlight = null;
      set({ pending: false, since: null });
    }
  },
  stop: () => inFlight?.abort(),
  clear: () => set({ entries: [], error: null }),
}));
