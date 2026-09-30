/**
 * The chat's conversation (TODO 3.6, ADR-0035): what was asked and
 * answered, and the call to the local server's `POST /chat`, which runs the
 * model and its tools over the server's account. Kept for the session
 * only: answers describe the account as it was when asked.
 * @packageDocumentation
 */

import { create } from 'zustand';
import { serverJson } from './client';

/** A tool the model called for an answer (as the server reports it). */
export interface ChatStep {
  tool: string;
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

export function sendChat(entries: readonly ChatEntry[]): Promise<ChatReply> {
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
  });
}

interface ChatState {
  entries: ChatEntry[];
  pending: boolean;
  /** Why the last question got no answer. */
  error: string | null;
  /** Asks, and says whether an answer came back (on false the question
   *  is taken back out, for the panel to put in its box again). */
  ask: (question: string) => Promise<boolean>;
  clear: () => void;
}

export const useChat = create<ChatState>()((set, get) => ({
  entries: [],
  pending: false,
  error: null,
  ask: async (question) => {
    const q = question.trim();
    if (!q || get().pending) return false;
    const entries: ChatEntry[] = [
      ...get().entries,
      { role: 'user', content: q },
    ];
    set({ entries, pending: true, error: null });
    try {
      const { answer, ...rest } = await sendChat(entries);
      set({
        entries: [...entries, { role: 'assistant', content: answer, ...rest }],
      });
      return true;
    } catch (e) {
      set({ entries: entries.slice(0, -1), error: (e as Error).message });
      return false;
    } finally {
      set({ pending: false });
    }
  },
  clear: () => set({ entries: [], error: null }),
}));
