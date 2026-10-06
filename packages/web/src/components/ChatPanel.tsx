import { useEffect, useId, useRef, useState } from 'react';
import { AppDrawer } from './ui/Drawer';
import { Callout } from './ui/Callout';
import { Disclosure } from './ui/Disclosure';
import { selectExplainReady, useServer } from '../local-server/status';
import { useChat, type ChatEntry } from '../local-server/chat';
import { MASK_NOTE, renderAnswer } from './chatText';

/**
 * The chat (TODO 3.6, ADR-0035; polished in 8.2): questions about the
 * account, answered by the local server's model with the same tools as
 * MCP. Offered only while the server runs with a ready model, like
 * explain; client-only, there is nothing to ask.
 */
export function ChatPanel() {
  const ready = useServer(selectExplainReady);
  const model = useServer((s) => s.llm?.model);
  const [open, setOpen] = useState(false);
  if (!ready) return null;
  return (
    <>
      <button
        type="button"
        className="btn-primary fixed bottom-5 right-5 z-30 shadow-lg"
        onClick={() => setOpen(true)}
      >
        Ask
      </button>
      {open && (
        <AppDrawer
          open
          onClose={() => setOpen(false)}
          title="Ask About Your Account"
        >
          <ChatBody model={model} />
        </AppDrawer>
      )}
    </>
  );
}

/** Questions the tools can answer, to start from (they fill the box). */
const EXAMPLES = [
  'What’s my best Furina build with at least 180% ER?',
  'Share my artifacts between Mualani, Mavuika, Xilonen and Emilie.',
  'How much does The Catch R5 change Raiden National?',
  'What did my last import change?',
];

/** "{"character":"furina","minStats":{"er_pct":180}}", cut short. */
const args = (a: Record<string, unknown> | undefined) => {
  if (!a || !Object.keys(a).length) return '';
  const s = JSON.stringify(a);
  return s.length > 160 ? `${s.slice(0, 157)}…` : s;
};

type Answer = Extract<ChatEntry, { role: 'assistant' }>;

function Steps({ entry }: { entry: Answer }) {
  const failed = entry.steps.filter((s) => !s.ok).length;
  const seconds = entry.steps.reduce((t, s) => t + s.ms, 0) / 1000;
  return (
    <div className="mt-2 space-y-1 text-xs text-muted">
      {entry.stop === 'step_limit' && (
        <p className="text-amber">
          Stopped at the most tool calls a question may use: the answer may be
          incomplete.
        </p>
      )}
      {entry.steps.length > 0 && (
        <Disclosure
          label={`Used ${entry.steps.length} tool${entry.steps.length === 1 ? '' : 's'}${failed ? ` (${failed} failed)` : ''} · ${seconds.toFixed(1)} s`}
        >
          <ol className="mt-1 space-y-1 pl-5" data-testid="chat-steps">
            {entry.steps.map((s, i) => (
              <li key={i} className="list-decimal">
                <code className={s.ok ? 'text-paper' : 'text-rose'}>
                  {s.tool}
                </code>{' '}
                · {(s.ms / 1000).toFixed(1)} s
                {!s.ok && <span className="text-rose"> · failed</span>}
                {args(s.arguments) && (
                  <span className="block break-all font-mono text-2xs">
                    {args(s.arguments)}
                  </span>
                )}
                {s.error && <span className="block text-rose">{s.error}</span>}
              </li>
            ))}
          </ol>
        </Disclosure>
      )}
      {entry.masked.length > 0 && (
        <p className="text-accent">
          {MASK_NOTE} Removed: {entry.masked.join(', ')}.
        </p>
      )}
    </div>
  );
}

function CopyAnswer({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="focus-ring mt-1 rounded text-2xs text-muted hover:text-paper"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(
          () => setCopied(true),
          () => setCopied(false),
        );
      }}
    >
      {copied ? 'Copied' : 'Copy answer'}
    </button>
  );
}

/** Seconds since `since`, ticking while it is set. */
function useElapsed(since: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);
  return since === null ? 0 : Math.max(0, Math.floor((now - since) / 1000));
}

function ChatBody({ model }: { model?: string }) {
  const { entries, pending, since, error, ask, stop, clear } = useChat();
  const [draft, setDraft] = useState('');
  const inputId = useId();
  const endRef = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const elapsed = useElapsed(since);

  // Keep the newest message in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [entries.length, pending]);

  async function send() {
    const q = draft.trim();
    if (!q || pending) return;
    setDraft('');
    if (!(await ask(q))) setDraft(q);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted">
        Answers come from {model ?? 'the local model'} using the local server’s
        account (load it in Inventory to see the same gear here). Every number
        is checked against what the tools returned.
      </p>

      {entries.length === 0 && !pending && (
        <div>
          <p className="field-label">Try asking</p>
          <ul className="flex flex-wrap gap-2">
            {EXAMPLES.map((q) => (
              <li key={q}>
                <button
                  type="button"
                  className="focus-ring rounded-full border border-white/10 px-3 py-1 text-left text-xs text-paper/90 transition-colors hover:border-accent/60 hover:text-paper"
                  onClick={() => {
                    setDraft(q);
                    box.current?.focus();
                  }}
                >
                  {q}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ol className="space-y-3" aria-label="Conversation">
        {entries.map((e, i) => (
          <li
            key={i}
            className={
              e.role === 'user'
                ? 'ml-8 rounded-xl bg-accent/15 px-3 py-2 text-sm text-paper'
                : 'mr-4 rounded-xl bg-white/5 px-3 py-2 text-sm text-paper/90'
            }
          >
            <span className="sr-only">
              {e.role === 'user' ? 'You: ' : 'Answer: '}
            </span>
            <div className="whitespace-pre-wrap leading-relaxed">
              {e.role === 'user' ? e.content : renderAnswer(e.content)}
            </div>
            {e.role === 'assistant' && (
              <>
                <Steps entry={e} />
                <CopyAnswer text={e.content} />
              </>
            )}
          </li>
        ))}
      </ol>
      <div ref={endRef} />

      {/* Always mounted, so screen readers hear each change. */}
      <p className="sr-only" role="status">
        {pending
          ? 'Working on it.'
          : entries[entries.length - 1]?.role === 'assistant'
            ? 'Answer ready.'
            : ''}
      </p>
      <p className="sr-only" role="alert">
        {error ? `No answer: ${error}.` : ''}
      </p>
      {pending && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
          <p data-testid="chat-working">
            Working on it… {elapsed} s. An exact search over a large account can
            take a minute or two.
          </p>
          <button type="button" className="btn-ghost text-xs" onClick={stop}>
            Stop Waiting
          </button>
        </div>
      )}
      {error && (
        <Callout tone="error">
          <p>
            No answer: {error}. Your question is back in the box to try again.
          </p>
          <button
            type="button"
            className="btn-ghost mt-2 text-xs"
            onClick={() => void send()}
          >
            Try Again
          </button>
        </Callout>
      )}

      {/* Stays in view at the bottom of a long conversation. */}
      <form
        className="sticky bottom-0 -mx-2 space-y-2 rounded-xl bg-surface-700/95 px-2 py-2 backdrop-blur"
        onSubmit={(ev) => {
          ev.preventDefault();
          void send();
        }}
      >
        <label className="field-label" htmlFor={inputId}>
          Your question
        </label>
        <textarea
          ref={box}
          id={inputId}
          className="field min-h-20"
          value={draft}
          onChange={(ev) => setDraft(ev.target.value)}
          onKeyDown={(ev) => {
            // Enter sends, Shift+Enter starts a new line.
            if (ev.key === 'Enter' && !ev.shiftKey) {
              ev.preventDefault();
              void send();
            }
          }}
          maxLength={4000}
          placeholder="e.g. What's my best Furina build with at least 180% ER?"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            className="btn-primary"
            aria-busy={pending}
            aria-disabled={pending || !draft.trim()}
          >
            {pending ? 'Working…' : 'Send'}
          </button>
          {entries.length > 0 && (
            <button
              type="button"
              className="btn-ghost"
              onClick={clear}
              aria-disabled={pending}
              disabled={pending}
            >
              New Conversation
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
