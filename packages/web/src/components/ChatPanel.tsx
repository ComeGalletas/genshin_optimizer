import { Fragment, useEffect, useId, useRef, useState } from 'react';
import { AppDrawer } from './ui/Drawer';
import { Callout } from './ui/Callout';
import { selectExplainReady, useServer } from '../local-server/status';
import { useChat, type ChatEntry } from '../local-server/chat';
import { MASK_NOTE, renderAnswer } from './chatText';

/**
 * The chat (TODO 3.6, ADR-0035): questions about the account, answered by
 * the local server's model with the same tools as MCP. Offered only while
 * the server runs with a ready model, like explain; client-only, there is
 * nothing to ask.
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

function Steps({
  entry,
}: {
  entry: Extract<ChatEntry, { role: 'assistant' }>;
}) {
  if (!entry.steps.length && !entry.masked.length) return null;
  const seconds = entry.steps.reduce((t, s) => t + s.ms, 0) / 1000;
  return (
    <div className="mt-2 space-y-1 text-xs text-muted">
      {entry.steps.length > 0 && (
        <p>
          Used{' '}
          {entry.steps.map((s, i) => (
            <Fragment key={i}>
              {i > 0 && ', '}
              <code className={s.ok ? '' : 'text-rose'} title={s.error}>
                {s.tool}
                {!s.ok && ' (failed)'}
              </code>
            </Fragment>
          ))}{' '}
          · tools {seconds.toFixed(1)} s
        </p>
      )}
      {entry.masked.length > 0 && <p className="text-accent">{MASK_NOTE}</p>}
    </div>
  );
}

function ChatBody({ model }: { model?: string }) {
  const { entries, pending, error, ask, clear } = useChat();
  const [draft, setDraft] = useState('');
  const inputId = useId();
  const endRef = useRef<HTMLDivElement>(null);

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
            {e.role === 'assistant' && <Steps entry={e} />}
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
        <p className="text-xs text-muted">
          Working on it… an exact search over a large account can take a minute
          or two.
        </p>
      )}
      {error && (
        <Callout tone="error">
          No answer: {error}. Your question is back in the box to try again.
        </Callout>
      )}

      <form
        className="space-y-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          void send();
        }}
      >
        <label className="field-label" htmlFor={inputId}>
          Your question
        </label>
        <textarea
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
