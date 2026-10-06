/**
 * The rotation library browser (TODO 8.2): every gcsim rotation the local
 * server has, with its team, where it came from (and the credit), how its
 * own run compares with the published number, whether the owner reviewed
 * it, and whether the owner's account can field it. A rotation opens to
 * its slots, fight, validation and action list, and can be sent to
 * Compare Teams. Offered only while the server runs.
 */
import { useEffect, useState } from 'react';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import { ROLE_LABELS } from '@genshin-build-lab/engine/labels';
import {
  fetchRotation,
  fetchRotations,
  type RotationDetail,
  type RotationSummary,
} from '../local-server/teamsim';
import { Callout } from '../components/ui/Callout';
import { AppDrawer } from '../components/ui/Drawer';
import { cn } from '../components/ui/cn';
import { useCompareRotation } from '../teams/compareRotation';
import { scrollToId } from '../ui/scroll';
import { CharacterPortrait } from '../components/GameArt';
import { CharacterButton } from '../character-window/CharacterButton';

const nf = (n: number) => Math.round(n).toLocaleString('en-US');
const name = (k: string) => genshinAdapter.characterName(k);
/** "+0.4%", "−1.2%", "0.0%": no sign on what rounds to nothing. */
const pct = (x: number) => {
  const r = Math.round(x * 10) / 10;
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(1)}%`;
};
/** "raiden_shogun or kujou_sara" → "Raiden Shogun or Kujou Sara". */
const slotNames = (s: string) => s.split(' or ').map(name).join(' or ');

const SOURCE: Record<string, string> = {
  community: 'Community config',
  adapted: 'Adapted from a community config',
  owner: 'Written by the owner',
  llm: 'Drafted by a model',
};

function Detail({ id }: { id: string }) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'ok'; r: RotationDetail }
    | { status: 'error'; message: string }
  >({ status: 'loading' });
  useEffect(() => {
    let live = true;
    fetchRotation(id).then(
      (r) => live && setState({ status: 'ok', r }),
      (e: Error) => live && setState({ status: 'error', message: e.message }),
    );
    return () => {
      live = false;
    };
  }, [id]);
  if (state.status === 'loading')
    return <p className="text-xs text-muted">Loading…</p>;
  if (state.status === 'error')
    return (
      <Callout tone="error" role="alert">
        Couldn’t load the rotation: {state.message}.
      </Callout>
    );
  const { meta: m, template } = state.r;
  const v = m.validation;
  return (
    <div className="mt-3 space-y-3 text-xs">
      <table className="w-full">
        <caption className="sr-only">Slots</caption>
        <thead className="text-left text-2xs uppercase tracking-wide text-muted">
          <tr>
            <th scope="col" className="py-1 pr-3 font-normal">
              Slot
            </th>
            <th scope="col" className="py-1 pr-3 font-normal">
              Takes
            </th>
            <th scope="col" className="py-1 font-normal">
              Role
            </th>
          </tr>
        </thead>
        <tbody>
          {m.slots.map((s) => (
            <tr key={s.id} className="border-t border-white/5">
              <td className="py-1 pr-3 font-mono">
                {s.id}
                {s.id === m.active ? ' (starts)' : ''}
              </td>
              <td className="py-1 pr-3">{s.characters.map(name).join(', ')}</td>
              <td className="py-1">
                {ROLE_LABELS[s.role as keyof typeof ROLE_LABELS] ?? s.role}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-muted">
        Fight:{' '}
        {m.fight.mode === 'actions'
          ? 'as long as the action list (one target too big to die)'
          : `${m.fight.seconds} s`}
        , enemy level {m.fight.enemy.level}, {m.fight.enemy.res}% resistance
        {m.rotationSec ? `; about ${m.rotationSec} s a rotation` : ''}
        {m.energyWait
          ? `; burst waits ${m.energyWait === 'attack' ? 'filled with attacks' : 'left idle'}`
          : ''}
        .
      </p>
      {v && (
        <p className="text-muted">
          Validated with gcsim {v.gcsim} on {v.date}: {nf(v.dps)} ± {nf(v.sd)}{' '}
          team DPS over {v.durationSec} s ({nf(v.iterations)} iterations)
          {v.warnings.length ? `; warnings: ${v.warnings.join(', ')}` : ''}.
        </p>
      )}
      {m.review && (
        <p className="text-muted">
          Reviewed by the owner on {m.review.date}
          {m.review.note ? `: ${m.review.note}` : '.'}
        </p>
      )}
      <p className="text-muted">
        Source: {m.source.title}
        {m.source.url && (
          <>
            {' '}
            (
            <a
              className="text-flux-bright underline"
              href={m.source.url}
              target="_blank"
              rel="noreferrer"
            >
              link
            </a>
            )
          </>
        )}
        , retrieved {m.source.retrieved}.
        {m.source.changes ? ` Changes: ${m.source.changes}` : ''}
      </p>
      <div>
        <p className="field-label">Action list</p>
        <pre className="max-h-72 overflow-auto rounded-lg bg-black/30 p-3 font-mono text-2xs leading-relaxed">
          {template}
        </pre>
      </div>
    </div>
  );
}

export function RotationLibrary() {
  const [rotations, setRotations] = useState<RotationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const pick = useCompareRotation((s) => s.set);

  useEffect(() => {
    let live = true;
    fetchRotations().then(
      (rs) => live && setRotations(rs),
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, []);

  if (error)
    return (
      <Callout tone="error" role="alert">
        Couldn’t load the rotation library: {error}.
      </Callout>
    );
  if (!rotations) return <p className="text-sm text-muted">Loading…</p>;
  const opened = rotations.find((r) => r.id === open && !r.problems);
  /** Open a team in Compare Teams, which sits above the library. */
  const compare = (r: RotationSummary) => {
    if (r.missing?.length) return;
    setOpen(null);
    pick(r.id);
    scrollToId('compare-teams');
  };
  return (
    <>
      {/* A grid of compact cards (TODO 9.7); a rotation's details open in a
        drawer rather than lengthening the page. */}
      <ul className="grid gap-3 sm:grid-cols-2">
        {rotations.map((r) => {
          if (r.problems)
            return (
              <li key={r.id} className="well rounded-xl p-3 text-sm">
                <p className="text-paper">{r.id}</p>
                <p className="text-xs text-rose">
                  Fails the library’s checks: {r.problems.join('; ')}.
                </p>
              </li>
            );
          const missing = r.missing ?? [];
          return (
            <li key={r.id} className="well flex flex-col rounded-xl p-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-sm font-medium text-paper">{r.name}</h3>
                <span
                  className={cn(
                    'text-xs',
                    r.status === 'validated' ? 'text-jade' : 'text-amber',
                  )}
                >
                  {r.status === 'validated'
                    ? r.reviewed
                      ? 'Validated, reviewed by you'
                      : 'Validated'
                    : 'Draft: needs your review'}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="flex -space-x-1.5">
                  {(r.characters ?? []).map((slot) => (
                    <CharacterButton
                      key={slot}
                      characterKey={slot.split(' or ')[0]}
                    >
                      <CharacterPortrait
                        characterKey={slot.split(' or ')[0]}
                        size={28}
                      />
                    </CharacterButton>
                  ))}
                </span>
                <p className="text-xs text-muted">
                  {(r.characters ?? []).map(slotNames).join(' · ')}
                </p>
              </div>
              {r.summary && (
                <p className="mt-1 line-clamp-3 text-xs" title={r.summary}>
                  {r.summary}
                </p>
              )}
              <p className="mt-1 text-xs text-muted">
                {SOURCE[r.source ?? ''] ?? r.source}
                {r.sourceTitle ? `: ${r.sourceTitle}` : ''}
                {r.dps !== undefined && (
                  <>
                    {' '}
                    · {nf(r.dps)} team DPS on its reference builds
                    {r.publishedDps !== undefined &&
                      ` (published ${nf(r.publishedDps)}${r.offPct !== undefined ? `, ${pct(r.offPct)}` : ''})`}
                  </>
                )}
              </p>
              {missing.length > 0 && (
                <p className="mt-1 text-xs text-amber">
                  Your account can’t field: {missing.map(slotNames).join(', ')}.
                </p>
              )}
              <div className="mt-auto flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  aria-haspopup="dialog"
                  onClick={() => setOpen(r.id)}
                >
                  Details
                </button>
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  aria-disabled={missing.length > 0}
                  title={
                    missing.length
                      ? 'Compare Teams uses your account as equipped'
                      : undefined
                  }
                  onClick={() => compare(r)}
                >
                  Compare this team
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {opened && (
        <AppDrawer
          open
          onClose={() => setOpen(null)}
          title={opened.name ?? opened.id}
        >
          <Detail id={opened.id} />
          {!opened.missing?.length && (
            <button
              type="button"
              className="btn-primary mt-4"
              onClick={() => compare(opened)}
            >
              Compare this team
            </button>
          )}
        </AppDrawer>
      )}
    </>
  );
}
