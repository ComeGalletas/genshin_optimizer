/**
 * The import center's building blocks (TODO 8.1): a piece as the game
 * shows it, what one snapshot changed, and how a merge reconciled its
 * snapshots. Each detail view fetches its own data when opened.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { isStatKey, type Artifact } from '@genshin-build-lab/engine/game/types';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import {
  formatSetName,
  formatStat,
  SLOT_LABELS,
  statLabel,
} from '@genshin-build-lab/engine/labels';
import {
  fetchChanges,
  fetchMergeReport,
  type MergeReport,
  type SnapshotChanges,
  type SnapshotInfo,
} from '../local-server/imports';
import { plural, snapshotName } from './format';
import { Callout } from '../components/ui/Callout';
import { Disclosure } from '../components/ui/Disclosure';

const name = (key: string) => genshinAdapter.characterName(key);

/** A piece as the game shows it: set, slot, main stat, level, substats,
 *  and who wears it. */
export function PieceLine({ a, note }: { a: Artifact; note?: ReactNode }) {
  return (
    <li className="text-xs leading-relaxed">
      <span className="font-medium text-paper">
        {formatSetName(a.setKey)} {SLOT_LABELS[a.slot].toLowerCase()}
      </span>{' '}
      <span className="text-muted">
        · {statLabel(a.mainStat)} · +{a.level} ·{' '}
        {a.subStats
          .map((s) => `${statLabel(s.key)} ${formatStat(s.key, s.value)}`)
          .join(', ')}
        {a.location ? ` · on ${name(a.location)}` : ''}
      </span>
      {note && <span className="text-paper"> {note}</span>}
    </li>
  );
}

/** A count and, open on demand, the pieces behind it. */
function Group({
  label,
  count,
  shown,
  children,
}: {
  label: string;
  count: number;
  shown?: number;
  children: ReactNode;
}) {
  if (!count) return null;
  return (
    <Disclosure label={`${label}: ${count.toLocaleString('en-US')}`}>
      <ul className="mt-1 space-y-1 pl-5">{children}</ul>
      {shown !== undefined && shown < count && (
        <p className="mt-1 pl-5 text-xs text-muted">
          The first {shown} of {count.toLocaleString('en-US')}.
        </p>
      )}
    </Disclosure>
  );
}

function useLoad<T>(load: () => Promise<T>, key: unknown) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'ok'; data: T }
    | { status: 'error'; message: string }
  >({ status: 'loading' });
  // Callers key the view by what it loads, so a new one starts loading.
  useEffect(() => {
    let live = true;
    load().then(
      (data) => live && setState({ status: 'ok', data }),
      (e: Error) => live && setState({ status: 'error', message: e.message }),
    );
    return () => {
      live = false;
    };
    // `key` names what `load` reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

/** What a snapshot changed since the previous one from the same source. */
export function ChangesView({ snapshotId }: { snapshotId: number }) {
  const state = useLoad(() => fetchChanges(snapshotId), snapshotId);
  if (state.status === 'loading')
    return <p className="text-xs text-muted">Comparing…</p>;
  if (state.status === 'error')
    return (
      <Callout tone="error" role="alert">
        Couldn’t compare: {state.message}.
      </Callout>
    );
  const c: SnapshotChanges | null = state.data;
  if (!c)
    return (
      <p className="text-xs text-muted">
        Nothing to compare: the first usable snapshot from this source.
      </p>
    );
  const { diff: d, pieces } = c;
  const before = (i: number) => pieces.before[i];
  const after = (i: number) => pieces.after[i];
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted">
        Against snapshot #{c.from}: {plural(d.unchanged, 'piece')} unchanged.
      </p>
      <Group label="New" count={d.added.length}>
        {d.added.map((i) => (
          <PieceLine key={i} a={after(i)} />
        ))}
      </Group>
      <Group label="Gone" count={d.removed.length}>
        {d.removed.map((i) => (
          <PieceLine key={i} a={before(i)} />
        ))}
      </Group>
      <Group label="Levelled" count={d.upgraded.length}>
        {d.upgraded.map((u) => (
          <PieceLine
            key={u.after}
            a={after(u.after)}
            note={`(was +${before(u.before).level})`}
          />
        ))}
      </Group>
      <Group label="Moved" count={d.moved.length}>
        {d.moved.map((m) => (
          <PieceLine
            key={m.after}
            a={after(m.after)}
            note={`(${m.from ? `from ${name(m.from)}` : 'was unequipped'})`}
          />
        ))}
      </Group>
      <Group label="Lock changed" count={d.lockChanged.length}>
        {d.lockChanged.map((l) => (
          <PieceLine
            key={l.after}
            a={after(l.after)}
            note={l.lock ? '(locked)' : '(unlocked)'}
          />
        ))}
      </Group>
      <Group label="Unexplained" count={d.unexplained.length}>
        {d.unexplained.map((u, i) => {
          const a =
            u.after !== undefined
              ? after(u.after)
              : u.before !== undefined
                ? before(u.before)
                : undefined;
          return a ? (
            <PieceLine key={i} a={a} note={`(${u.why})`} />
          ) : (
            <li key={i} className="text-xs">
              {u.why}
            </li>
          );
        })}
      </Group>
    </div>
  );
}

/** How a merge reconciled each snapshot with the account merged before
 *  it (ADR-0027). */
export function MergeReportView({
  mergeId,
  snapshots,
}: {
  mergeId: number;
  snapshots: ReadonlyMap<number, SnapshotInfo>;
}) {
  const state = useLoad(() => fetchMergeReport(mergeId), mergeId);
  if (state.status === 'loading')
    return <p className="text-xs text-muted">Loading the report…</p>;
  if (state.status === 'error')
    return (
      <Callout tone="error" role="alert">
        Couldn’t load the report: {state.message}.
      </Callout>
    );
  const r: MergeReport = state.data;
  const label = (id: number) => snapshotName(snapshots.get(id), id);
  return (
    <div className="space-y-3">
      {r.merge.rejected.length > 0 && (
        <Callout tone="warning">
          Left out as faulty scans:{' '}
          {r.merge.rejected
            .map(
              (x) =>
                `${label(Number(x.snapshot))} (${plural(x.fault.repeatedPieces, 'piece')} repeated)`,
            )
            .join('; ')}
          .
        </Callout>
      )}
      {r.reports.length === 0 && (
        <p className="text-xs text-muted">
          One snapshot: nothing to reconcile.
        </p>
      )}
      {r.reports.map((rep) => {
        const c = rep.counts;
        return (
          <div key={rep.snapshot} className="well rounded-xl p-3">
            <p className="text-sm text-paper">
              {label(rep.snapshot)} against {rep.against.map(label).join(', ')}
            </p>
            <p className="mb-1 text-xs text-muted">
              {plural(c.paired, 'piece')} paired ({c.exact} exact, {c.fuzzy} one
              step apart, {c.levelled} levelled since).
            </p>
            <Group
              label="Misread or different pieces"
              count={c.mismatches}
              shown={rep.mismatches.length}
            >
              {rep.mismatches.map((m, i) => (
                <li key={i}>
                  <ul className="space-y-0.5">
                    <PieceLine a={m.account} note="(account)" />
                    <PieceLine
                      a={m.snapshot}
                      note={`(this snapshot; differs on ${m.stats
                        .map((k) => (isStatKey(k) ? statLabel(k) : k))
                        .join(', ')})`}
                    />
                  </ul>
                </li>
              ))}
            </Group>
            <Group label="Moved" count={c.moved} shown={rep.moved.length}>
              {rep.moved.map((m, i) => (
                <PieceLine
                  key={i}
                  a={m.snapshot}
                  note={`(in the account: ${m.account.location ? `on ${name(m.account.location)}` : 'unequipped'})`}
                />
              ))}
            </Group>
            <Group
              label="Only in this snapshot (added)"
              count={c.onlySnapshot}
              shown={rep.onlySnapshot.length}
            >
              {rep.onlySnapshot.map((a, i) => (
                <PieceLine key={i} a={a} />
              ))}
            </Group>
            <Group
              label="Not in this snapshot"
              count={c.onlyAccount}
              shown={rep.onlyAccount.length}
            >
              {rep.onlyAccount.map((a, i) => (
                <PieceLine key={i} a={a} />
              ))}
            </Group>
          </div>
        );
      })}
    </div>
  );
}
