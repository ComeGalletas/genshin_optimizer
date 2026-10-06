/**
 * The import center (TODO 8.1, ADR-0049): the local server's imports at a
 * glance. Its sources in precedence order (ADR-0027), every snapshot with
 * what it changed, how the current merge (or an older one) reconciled its
 * snapshots, and the two ways in: upload a GOOD file, or scan the inbox.
 * Offered only while the server runs; the account it builds is loaded
 * into this page with Load Account, under Load Data on the Start view.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hrefOf } from '../components/views';
import {
  fetchImports,
  scanInbox,
  uploadImport,
  type Imports,
  type InboxEvent,
  type InboxRun,
  type SourceKind,
} from '../local-server/imports';
import { Callout } from '../components/ui/Callout';
import { cn } from '../components/ui/cn';
import { ChangesView, MergeReportView } from './pieces';
import { snapshotName, SOURCE_LABEL, when } from './format';
import { countOf } from '../labels';
import { HelpHeading } from '../components/help/Help';

/** The merge's precedence: a better source's values win (ADR-0027). */
const SOURCES: SourceKind[] = ['irminsul', 'ocr', 'good', 'enka'];

const eventText = (e: InboxEvent) => {
  switch (e.status) {
    case 'imported':
      return `imported as snapshot #${e.snapshot.id}: ${countOf(e.snapshot.artifacts, 'piece')}${e.issues ? `, ${countOf(e.issues, 'line')} it couldn’t read` : ''}`;
    case 'already-imported':
      return `already imported (snapshot #${e.snapshot.id})`;
    case 'faulty-scan':
      return `a faulty scan (snapshot #${e.snapshot.id}, kept out of the account): ${countOf(e.snapshot.fault?.repeatedPieces ?? 0, 'piece')} repeated`;
    case 'refused':
      return `refused: ${e.reason}`;
  }
};

// Every error says what failed, as the other views' do: the server's own
// message is lowercase and names no action.
const loadFailed = (e: unknown) =>
  `Couldn’t load the imports: ${(e as Error).message}`;

export function ImportCenter() {
  const [data, setData] = useState<Imports | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'upload' | 'scan' | null>(null);
  const [run, setRun] = useState<{ what: string; run: InboxRun } | null>(null);
  const [openSnapshot, setOpenSnapshot] = useState<number | null>(null);
  const [mergeId, setMergeId] = useState<number | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await fetchImports());
      setError(null);
    } catch (e) {
      setError(loadFailed(e));
    }
  }, []);
  useEffect(() => {
    let live = true;
    fetchImports()
      .then((d) => live && setData(d))
      .catch((e: Error) => live && setError(loadFailed(e)));
    return () => {
      live = false;
    };
  }, []);

  const byId = useMemo(
    () => new Map((data?.snapshots ?? []).map((s) => [s.id, s])),
    [data],
  );
  const current = data?.merges[data.merges.length - 1];
  const shownMerge = mergeId ?? current?.id;

  async function act(kind: 'upload' | 'scan', f?: File) {
    if (busy) return;
    setBusy(kind);
    try {
      const r = f ? await uploadImport(f) : await scanInbox();
      setRun({ what: f ? f.name : 'the inbox', run: r });
      if (r.merge) setMergeId(null);
      await refresh();
    } catch (e) {
      setRun(null);
      setError(
        `Couldn’t import ${f ? f.name : 'the inbox'}: ${(e as Error).message}`,
      );
    } finally {
      setBusy(null);
      if (file.current) file.current.value = '';
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <label
          className={cn('btn-primary cursor-pointer', busy && 'opacity-60')}
          aria-busy={busy === 'upload'}
        >
          {busy === 'upload' ? 'Importing…' : 'Upload a GOOD File'}
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            disabled={!!busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void act('upload', f);
            }}
          />
        </label>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => void act('scan')}
          aria-busy={busy === 'scan'}
          aria-disabled={!!busy}
        >
          {busy === 'scan' ? 'Scanning…' : 'Scan the Inbox'}
        </button>
        <p className="text-xs text-muted">
          Irminsul, OCR scanners and genshin-agent files land in{' '}
          <code>imports/inbox/</code>; an upload takes the same path.
        </p>
      </div>

      {error && (
        <Callout tone="error" role="alert">
          {error}.
        </Callout>
      )}
      {run && (
        <Callout tone={run.run.merge ? 'success' : 'info'} role="status">
          {run.run.events.length === 0 ? (
            <>The inbox is empty.</>
          ) : (
            <ul className="space-y-0.5">
              {run.run.events.map((e) => (
                <li key={e.file}>
                  {e.file}: {eventText(e)}.
                </li>
              ))}
            </ul>
          )}
          {run.run.merge && (
            <p className="mt-1">
              New account (merge #{run.run.merge.id}):{' '}
              {countOf(run.run.merge.artifacts, 'artifact')}. Press Load Account
              under{' '}
              <a href={hrefOf('start')} className="underline">
                Load Data
              </a>{' '}
              to use it here.
            </p>
          )}
        </Callout>
      )}

      {data && (
        <>
          <section aria-labelledby="ic-sources">
            <HelpHeading
              id="import-sources"
              headingId="ic-sources"
              className="field-label mb-0"
            >
              Sources, best first
            </HelpHeading>
            <ul className="grid gap-2 sm:grid-cols-2">
              {SOURCES.map((kind) => {
                const all = data.snapshots.filter((s) => s.kind === kind);
                const used = all.find((s) =>
                  current?.snapshotIds.includes(s.id),
                );
                const faulty = all.filter((s) => s.fault).length;
                return (
                  <li key={kind} className="well rounded-xl p-3 text-sm">
                    <p className="text-paper">{SOURCE_LABEL[kind]}</p>
                    <p className="text-xs text-muted">
                      {all.length === 0
                        ? 'No snapshots yet.'
                        : `${countOf(all.length, 'snapshot')}${faulty ? `, ${faulty} faulty` : ''}. ${
                            used
                              ? `In the account: #${used.id}, ${countOf(used.artifacts, 'piece')}, taken ${when(used.takenAt)}.`
                              : 'None in the current account.'
                          }`}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="ic-snapshots">
            <HelpHeading
              id="import-snapshots"
              headingId="ic-snapshots"
              className="field-label mb-0"
            >
              Snapshots, newest first
            </HelpHeading>
            {data.snapshots.length === 0 ? (
              <p className="text-sm text-muted">
                Nothing imported yet: upload a GOOD file or drop one in the
                inbox.
              </p>
            ) : (
              <ul className="space-y-2">
                {[...data.snapshots].reverse().map((s) => {
                  const open = openSnapshot === s.id;
                  const inAccount = current?.snapshotIds.includes(s.id);
                  return (
                    <li key={s.id} className="well rounded-xl p-3">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                        <span className="text-paper">
                          {snapshotName(s, s.id)}
                        </span>
                        <span className="text-xs text-muted">
                          {countOf(s.artifacts, 'piece')} · taken{' '}
                          {when(s.takenAt)}
                          {s.issues
                            ? ` · ${countOf(s.issues, 'line')} unread`
                            : ''}
                        </span>
                        {s.fault ? (
                          <span className="text-xs text-rose">
                            Faulty scan:{' '}
                            {countOf(s.fault.repeatedPieces, 'piece')} repeated,
                            kept out
                          </span>
                        ) : inAccount ? (
                          <span className="text-xs text-jade">
                            In the account
                          </span>
                        ) : null}
                        {!s.fault && (
                          <button
                            type="button"
                            className="btn-ghost ml-auto text-xs"
                            aria-expanded={open}
                            onClick={() => setOpenSnapshot(open ? null : s.id)}
                          >
                            {open ? 'Hide changes' : 'What changed'}
                          </button>
                        )}
                      </div>
                      {open && (
                        <div className="mt-2">
                          <ChangesView snapshotId={s.id} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {shownMerge !== undefined && (
            <section aria-labelledby="ic-merge">
              <HelpHeading
                id="import-reconciliation"
                headingId="ic-merge"
                className="field-label mb-0"
                rowClassName="mb-2 flex-wrap"
                aside={
                  <label className="text-xs text-muted">
                    <span className="sr-only">Merge</span>
                    <select
                      className="field py-1 text-xs"
                      value={shownMerge}
                      onChange={(e) => setMergeId(Number(e.target.value))}
                    >
                      {[...data.merges].reverse().map((m) => (
                        <option key={m.id} value={m.id}>
                          Merge #{m.id}
                          {m.id === current?.id
                            ? ' (current account)'
                            : ''}:{' '}
                          {m.snapshotIds.map((id) => `#${id}`).join(', ')},{' '}
                          {countOf(m.artifacts, 'artifact')}
                        </option>
                      ))}
                    </select>
                  </label>
                }
              >
                Reconciliation
              </HelpHeading>
              <MergeReportView
                key={shownMerge}
                mergeId={shownMerge}
                snapshots={byId}
              />
            </section>
          )}
        </>
      )}
      {!data && !error && <p className="text-sm text-muted">Loading…</p>}
    </div>
  );
}
