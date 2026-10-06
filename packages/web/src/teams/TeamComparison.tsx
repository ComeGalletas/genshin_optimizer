/**
 * Compare teams (TODO 6.2, ADR-0046): a team in a library rotation, with
 * the local server's account as equipped, against up to five variants of
 * it, simulated by gcsim on the server. Shows each run's team DPS against
 * the base with its 95% interval, the DPS distribution, the damage share,
 * reactions and energy warnings. Offered only while the server runs.
 */
import { useEffect, useId, useMemo, useState } from 'react';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import {
  fetchRotations,
  postTeamSim,
  type RotationSummary,
  type TeamRun,
  type TeamSimResult,
  type TeamVariantRequest,
} from '../local-server/teamsim';
import { Callout } from '../components/ui/Callout';
import { Combobox } from '../components/ui/Combobox';
import { Segmented } from '../components/ui/Segmented';
import { cn } from '../components/ui/cn';
import { DamageShare, DpsDistribution } from './comparisonCharts';
import { kilo } from './kilo';
import { useCompareRotation } from './compareRotation';
import { PerCharacter, TeamAsRun } from './runDetails';
import { ShareButton } from '../components/ShareButton';
import { encodeComparison } from '@genshin-build-lab/engine/share/comparison';
// The server's own limit on variants, so the form can't drift from it.
import { MAX_VARIANTS } from '@genshin-build-lab/engine/sim/team';
import { HelpButton, HelpPanel } from '../components/help/Help';
import { countOf } from '../labels';

type Kind = 'weapon' | 'set' | 'swap' | 'enemy' | 'rotation';
const KINDS: { kind: Kind; label: string }[] = [
  { kind: 'weapon', label: 'Weapon' },
  { kind: 'set', label: 'Artifact set' },
  { kind: 'swap', label: 'Teammate' },
  { kind: 'enemy', label: 'Enemy' },
  { kind: 'rotation', label: 'Rotation' },
];

interface Draft {
  id: number;
  kind: Kind;
  label: string;
  character: string;
  weapon: string;
  refinement: number;
  set: string;
  to: string;
  rotation: string;
  count: number;
  res: number;
  level: number;
}

/** gcsim's warnings, in words. */
const WARNING: Record<string, string> = {
  insufficient_energy: 'a burst waited for energy',
  insufficient_stamina: 'ran out of stamina',
  swap_cd: 'a swap waited for its cooldown',
  skill_cd: 'a skill waited for its cooldown',
  burst_cd: 'a burst waited for its cooldown',
  dash_cd: 'a dash waited for its cooldown',
  target_overlap: 'targets’ hitboxes overlap',
};
const warning = (w: string) => WARNING[w] ?? w.replace(/_/g, ' ');
const ITERATIONS = ['500', '1000', '2000'] as const;
const name = (k: string) => genshinAdapter.characterName(k);

/** The label a variant gets unless the owner writes one. */
function autoLabel(d: Draft, rotations: RotationSummary[]): string {
  switch (d.kind) {
    case 'weapon':
      return `${name(d.character)}: ${genshinAdapter.weaponName(d.weapon)} R${d.refinement}`;
    case 'set':
      return `${name(d.character)}: ${d.set ? `4pc ${genshinAdapter.setName(d.set)}` : 'any set'}`;
    case 'swap':
      return `${name(d.to)} for ${name(d.character)}`;
    case 'enemy':
      return `${countOf(d.count, 'target')}, ${d.res}% RES, level ${d.level}`;
    case 'rotation':
      return rotations.find((r) => r.id === d.rotation)?.name ?? d.rotation;
  }
}

function toRequest(d: Draft, rotations: RotationSummary[]): TeamVariantRequest {
  const label = (d.label.trim() || autoLabel(d, rotations)).slice(0, 60);
  switch (d.kind) {
    case 'weapon':
      return {
        label,
        weapons: {
          [d.character]: { weapon: d.weapon, refinement: d.refinement },
        },
      };
    case 'set':
      return {
        label,
        builds: {
          [d.character]: {
            set: d.set ? { kind: '4pc', setKey: d.set } : { kind: 'any' },
          },
        },
      };
    case 'swap':
      return { label, swap: { [d.character]: d.to } };
    case 'enemy':
      return { label, enemy: { count: d.count, res: d.res, level: d.level } };
    case 'rotation':
      return { label, rotation: d.rotation };
  }
}

/** Is a variant filled in enough to send? */
function complete(d: Draft): boolean {
  switch (d.kind) {
    case 'weapon':
      return !!d.character && !!d.weapon;
    case 'set':
      return !!d.character;
    case 'swap':
      return !!d.character && !!d.to && d.to !== d.character;
    case 'enemy':
      return true;
    case 'rotation':
      return !!d.rotation;
  }
}

export function TeamComparison() {
  const [rotations, setRotations] = useState<RotationSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Shared with the rotation library, which can open a team here.
  const rotation = useCompareRotation((s) => s.id);
  const setRotation = useCompareRotation((s) => s.set);
  const [iterations, setIterations] =
    useState<(typeof ITERATIONS)[number]>('1000');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [nextId, setNextId] = useState(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ran, setRan] = useState<{
    rotation: string;
    result: TeamSimResult;
  } | null>(null);
  // A result is shown with the rotation it ran, not after another is picked.
  const result = ran?.rotation === rotation ? ran.result : null;
  const rotationId = useId();

  useEffect(() => {
    let live = true;
    fetchRotations()
      .then((rs) => {
        if (!live) return;
        const usable = rs.filter((r) => !r.problems);
        setRotations(usable);
        const picked = useCompareRotation.getState();
        if (!picked.id) picked.set(usable[0]?.id ?? '');
      })
      .catch((e: Error) => live && setLoadError(e.message));
    return () => {
      live = false;
    };
  }, []);

  const team = useMemo(
    () =>
      (rotations?.find((r) => r.id === rotation)?.characters ?? []).map(
        (c) => c.split(' or ')[0],
      ),
    [rotations, rotation],
  );

  if (loadError)
    return (
      <Callout tone="error" role="alert">
        Couldn’t load the rotation library: {loadError}.
      </Callout>
    );
  if (!rotations)
    return <p className="text-sm text-muted">Loading rotations…</p>;
  if (!rotations.length)
    return (
      <p className="text-sm text-muted">
        The rotation library is empty: add one with the server’s{' '}
        <code>draft_rotation</code> tool.
      </p>
    );

  const add = (kind: Kind) => {
    const first = team[0] ?? '';
    setDrafts((ds) => [
      ...ds,
      {
        id: nextId,
        kind,
        label: '',
        character: first,
        weapon: '',
        refinement: 1,
        set: '',
        to: '',
        rotation: rotations.find((r) => r.id !== rotation)?.id ?? '',
        count: 2,
        res: 10,
        level: 100,
      },
    ]);
    setNextId((n) => n + 1);
  };
  const update = (id: number, patch: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  const ready = drafts.every(complete);
  async function run() {
    if (pending || !ready) return;
    setPending(true);
    setError(null);
    try {
      setRan({
        rotation,
        result: await postTeamSim({
          rotation,
          iterations: Number(iterations),
          variants: drafts.map((d) => toRequest(d, rotations!)),
        }),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <fieldset className="panel panel-sm space-y-3">
        <legend className="micro-label px-1">1 · The base team</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor={rotationId}>
              Base team’s rotation
            </label>
            <select
              id={rotationId}
              className="field"
              value={rotation}
              onChange={(e) => {
                setRotation(e.target.value);
              }}
            >
              {rotations.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.status === 'draft' ? ' (draft)' : ''}
                </option>
              ))}
            </select>
            <p className="mt-1 text-2xs text-muted">
              {team.map(name).join(', ')}, as equipped on the server’s account.
            </p>
          </div>
          <div>
            <p className="field-label">Iterations per run</p>
            <Segmented
              label="Iterations per run"
              options={ITERATIONS}
              value={iterations}
              onChange={setIterations}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="panel panel-sm space-y-3">
        <legend className="micro-label px-1">
          2 · Variants, up to {MAX_VARIANTS}
        </legend>
        {drafts.length === 0 && (
          <p className="text-xs text-muted">
            None yet: the base team runs alone. Add one to see what a change is
            worth.
          </p>
        )}
        <ol className="space-y-3" aria-label="Variants">
          {drafts.map((d, i) => (
            <VariantEditor
              key={d.id}
              n={i + 1}
              draft={d}
              team={team}
              rotations={rotations.filter((r) => r.id !== rotation)}
              placeholder={autoLabel(d, rotations)}
              onChange={(patch) => update(d.id, patch)}
              onRemove={() =>
                setDrafts((ds) => ds.filter((x) => x.id !== d.id))
              }
            />
          ))}
        </ol>

        {drafts.length < MAX_VARIANTS && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Add a variant:</span>
            <HelpButton id="compare-variants" />
            {KINDS.map((k) => (
              <button
                key={k.kind}
                type="button"
                className="btn-ghost text-xs"
                onClick={() => add(k.kind)}
              >
                {k.label}
              </button>
            ))}
          </div>
        )}
        <HelpPanel id="compare-variants" />
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <span className="micro-label">3 · Run</span>
        <button
          type="button"
          className="btn-primary"
          aria-busy={pending}
          aria-disabled={pending || !ready}
          onClick={() => void run()}
        >
          {pending
            ? 'Simulating…'
            : drafts.length
              ? `Compare ${drafts.length + 1} runs`
              : 'Simulate the team'}
        </button>
        {!ready && (
          <span className="text-xs text-muted">
            Finish each variant (pick a weapon, or who swaps in) to run.
          </span>
        )}
      </div>

      <p className="sr-only" role="status">
        {pending ? 'Simulating.' : result ? 'Comparison ready.' : ''}
      </p>
      {error && (
        <Callout tone="error" role="alert">
          No comparison: {error}.
        </Callout>
      )}
      {result && (
        <div
          aria-busy={pending}
          className={cn('space-y-3', pending && 'opacity-40')}
        >
          <ShareButton
            label="Share This Comparison"
            makeUrl={async () => {
              const param = await encodeComparison(result);
              return param
                ? `${location.origin}${location.pathname}#c=${param}`
                : { why: 'this comparison is too large for a link' };
            }}
          />
          <ComparisonResult result={result} />
        </div>
      )}
    </div>
  );
}

function VariantEditor({
  n,
  draft: d,
  team,
  rotations,
  placeholder,
  onChange,
  onRemove,
}: {
  n: number;
  draft: Draft;
  team: string[];
  rotations: RotationSummary[];
  placeholder: string;
  onChange: (patch: Partial<Draft>) => void;
  onRemove: () => void;
}) {
  const base = useId();
  const weaponType = genshinAdapter.character(d.character)?.weaponType;
  const weapons = useMemo(
    () =>
      genshinAdapter
        .weapons()
        .filter((w) => w.type === weaponType)
        .map((w) => ({ value: w.key, label: w.name })),
    [weaponType],
  );
  const sets = useMemo(
    () => genshinAdapter.sets().map((s) => ({ value: s.key, label: s.name })),
    [],
  );
  const characters = useMemo(
    () =>
      genshinAdapter.characters().map((c) => ({ value: c.key, label: c.name })),
    [],
  );
  const member = (label: string, field: 'character') => (
    <div>
      <label className="field-label" htmlFor={`${base}-${field}`}>
        {label}
      </label>
      <select
        id={`${base}-${field}`}
        className="field"
        value={d.character}
        onChange={(e) => onChange({ character: e.target.value, weapon: '' })}
      >
        {team.map((k) => (
          <option key={k} value={k}>
            {name(k)}
          </option>
        ))}
      </select>
    </div>
  );
  const number = (
    label: string,
    field: 'count' | 'res' | 'level' | 'refinement',
    min: number,
    max: number,
  ) => (
    <div>
      <label className="field-label" htmlFor={`${base}-${field}`}>
        {label}
      </label>
      <input
        id={`${base}-${field}`}
        type="number"
        className="field"
        min={min}
        max={max}
        value={d[field]}
        onChange={(e) =>
          onChange({
            [field]: Math.min(
              max,
              Math.max(min, Number(e.target.value) || min),
            ),
          })
        }
      />
    </div>
  );

  return (
    <li className="card space-y-3 p-3" data-testid="variant">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">
          Variant {n} · {KINDS.find((k) => k.kind === d.kind)!.label}
        </p>
        <button type="button" className="btn-ghost text-xs" onClick={onRemove}>
          Remove
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {d.kind === 'weapon' && (
          <>
            {member('Character', 'character')}
            <div>
              <p className="field-label" id={`${base}-weapon`}>
                Weapon
              </p>
              <Combobox
                label="Weapon"
                options={weapons}
                value={d.weapon}
                onChange={(weapon) => onChange({ weapon })}
                placeholder="Choose a weapon"
              />
            </div>
            {number('Refinement', 'refinement', 1, 5)}
          </>
        )}
        {d.kind === 'set' && (
          <>
            {member('Character', 'character')}
            <div>
              <p className="field-label">4-piece set (empty: any sets)</p>
              <Combobox
                label="Artifact set"
                options={sets}
                value={d.set}
                onChange={(set) => onChange({ set })}
                placeholder="Any sets"
              />
            </div>
          </>
        )}
        {d.kind === 'swap' && (
          <>
            {member('Who leaves', 'character')}
            <div>
              <p className="field-label">Who comes in</p>
              <Combobox
                label="Who comes in"
                options={characters}
                value={d.to}
                onChange={(to) => onChange({ to })}
                placeholder="Choose a character"
              />
            </div>
          </>
        )}
        {d.kind === 'enemy' && (
          <>
            {number('Targets', 'count', 1, 5)}
            {number('Resistance (%)', 'res', -100, 100)}
            {number('Level', 'level', 1, 200)}
          </>
        )}
        {d.kind === 'rotation' && (
          <div>
            <label className="field-label" htmlFor={`${base}-rotation`}>
              Rotation
            </label>
            <select
              id={`${base}-rotation`}
              className="field"
              value={d.rotation}
              onChange={(e) => onChange({ rotation: e.target.value })}
            >
              {rotations.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="field-label" htmlFor={`${base}-label`}>
            Label
          </label>
          <input
            id={`${base}-label`}
            className="field"
            maxLength={60}
            value={d.label}
            placeholder={placeholder}
            onChange={(e) => onChange({ label: e.target.value })}
          />
        </div>
      </div>
    </li>
  );
}

/** Fight length against the base's, when it differs by a second or more:
 *  a longer fight is a team waiting on energy (ADR-0041). */
/** A variant's enemy, when it differs from the base's. */
function enemyText(run: TeamRun, base: TeamRun): string | null {
  const e = run.enemy;
  const b = base.enemy ?? {};
  if (!e) return null;
  const parts = [
    e.level !== undefined && e.level !== b.level && `level ${e.level}`,
    e.res !== undefined && e.res !== b.res && `${e.res}% resistance`,
    e.count !== undefined &&
      e.count !== (b.count ?? 1) &&
      countOf(e.count, 'target'),
  ].filter(Boolean);
  return parts.length ? `enemy: ${parts.join(', ')}` : null;
}

function longer(run: TeamRun, base: TeamRun): string | null {
  if (run.fightSec === undefined || base.fightSec === undefined) return null;
  const d = run.fightSec - base.fightSec;
  return Math.abs(d) >= 1
    ? `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} s`
    : null;
}

/** The comparison's details, one at a time below the summary table. */
const DETAIL_TABS = [
  'Damage share',
  'DPS spread',
  'Per character',
  'Teams',
  'Reactions',
  'Energy',
] as const;
type DetailTab = (typeof DETAIL_TABS)[number];

export function ComparisonResult({ result }: { result: TeamSimResult }) {
  const [base] = result.runs;
  const reactions = [
    ...new Set(result.runs.flatMap((r) => Object.keys(r.reactions ?? {}))),
  ].sort();
  const uid = useId();
  // Reactions only when a run had some (TODO 9.7: the details behind tabs).
  const tabs = DETAIL_TABS.filter((t) => t !== 'Reactions' || reactions.length);
  const [tab, setTab] = useState<DetailTab>('Damage share');
  return (
    <div className="space-y-6">
      <p className="text-xs text-muted">
        {result.iterations} iterations per run · burst waits {result.burstWaits}{' '}
        · {(result.ms / 1000).toFixed(1)} s
        {result.runs.some((r) => r.cached) ? ' (some runs from the cache)' : ''}
        . Differences come with their 95% interval; one inside it is no
        difference.
      </p>
      {result.runs.some((r) => r.rotation?.status === 'draft') && (
        <Callout tone="warning">
          A draft rotation ran: its numbers count once you review it (npm run
          rotations -- review).
        </Callout>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Team DPS per run against the base
          </caption>
          <thead className="text-left text-2xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="py-1 pr-3 font-normal">
                Run
              </th>
              <th scope="col" className="py-1 pr-3 text-right font-normal">
                Team DPS
              </th>
              <th scope="col" className="py-1 pr-3 text-right font-normal">
                vs base
              </th>
              <th scope="col" className="py-1 text-right font-normal">
                Fight
              </th>
            </tr>
          </thead>
          <tbody>
            {result.runs.map((r) => (
              <tr
                key={r.label}
                className="border-t border-white/5 align-top"
                data-testid="run-row"
              >
                <th scope="row" className="py-2 pr-3 text-left font-normal">
                  <span className="text-paper">{r.label}</span>
                  {r.rotation && r.rotation.id !== base.rotation?.id && (
                    <span className="block text-2xs text-muted">
                      {r.rotation.name}
                    </span>
                  )}
                  {r.rotation?.status === 'draft' && (
                    <span className="block text-2xs text-amber">
                      draft rotation
                    </span>
                  )}
                  {r !== base && enemyText(r, base) && (
                    <span className="block text-2xs text-muted">
                      {enemyText(r, base)}
                    </span>
                  )}
                  {(r.problems ?? r.notSimulated)?.map((p) => (
                    <span key={p} className="block text-2xs text-rose">
                      {r.problems ? p : `Not simulated: ${p}`}
                    </span>
                  ))}
                </th>
                <td className="py-2 pr-3 text-right font-mono tabular-nums">
                  {r.dps ? (
                    <>
                      {kilo(r.dps.mean)}
                      <span className="block text-2xs text-muted">
                        {kilo(r.dps.ci95[0])}–{kilo(r.dps.ci95[1])}
                      </span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td
                  className={cn(
                    'py-2 pr-3 text-right font-mono tabular-nums',
                    r.vsBase &&
                      !r.vsBase.withinNoise &&
                      (r.vsBase.pct > 0 ? 'text-jade' : 'text-rose'),
                  )}
                >
                  {r === base ? 'base' : (r.vsBase?.text ?? '—')}
                  {r.vsBase?.withinNoise && (
                    <span className="block text-2xs text-muted">
                      within noise
                    </span>
                  )}
                </td>
                <td className="py-2 text-right font-mono tabular-nums text-muted">
                  {r.fightSec !== undefined
                    ? `${r.fightSec.toFixed(1)} s`
                    : '—'}
                  {r !== base && longer(r, base) && (
                    <span className="block text-2xs">{longer(r, base)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Segmented
        label="Comparison details"
        options={tabs}
        value={tab}
        onChange={setTab}
        itemId={(t) => `${uid}-tab-${t.replace(/\s+/g, '-')}`}
        controls={`${uid}-panel`}
      />
      <div
        role="tabpanel"
        id={`${uid}-panel`}
        aria-labelledby={`${uid}-tab-${tab.replace(/\s+/g, '-')}`}
        tabIndex={0}
        className="focus-ring space-y-6 rounded-lg"
      >
        {tab === 'Teams' && (
          <section aria-labelledby="team-h" className="space-y-2">
            <h3 id="team-h" className="text-sm text-paper">
              The teams as run
            </h3>
            <TeamAsRun runs={result.runs} />
          </section>
        )}

        {tab === 'DPS spread' && (
          <section aria-labelledby="dist-h" className="space-y-2">
            <h3 id="dist-h" className="text-sm text-paper">
              DPS across fights
            </h3>
            <DpsDistribution runs={result.runs} />
          </section>
        )}

        {tab === 'Damage share' && (
          <section aria-labelledby="share-h" className="space-y-2">
            <h3 id="share-h" className="text-sm text-paper">
              Damage share
            </h3>
            <DamageShare runs={result.runs} />
          </section>
        )}

        {tab === 'Per character' && (
          <section aria-labelledby="chars-h" className="space-y-2">
            <h3 id="chars-h" className="text-sm text-paper">
              Per character
            </h3>
            <PerCharacter runs={result.runs} />
          </section>
        )}

        {tab === 'Reactions' && reactions.length > 0 && (
          <section aria-labelledby="react-h" className="space-y-2">
            <h3 id="react-h" className="text-sm text-paper">
              Reactions per fight
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted">
                  <tr>
                    <th scope="col" className="py-1 pr-3 font-normal">
                      Reaction
                    </th>
                    {result.runs
                      .filter((r) => r.reactions)
                      .map((r) => (
                        <th
                          key={r.label}
                          scope="col"
                          className="py-1 pr-3 text-right font-normal"
                        >
                          {r.label}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {reactions.map((k) => (
                    <tr key={k} className="border-t border-white/5">
                      <th
                        scope="row"
                        className="py-1 pr-3 text-left font-normal"
                      >
                        {k}
                      </th>
                      {result.runs
                        .filter((r) => r.reactions)
                        .map((r) => (
                          <td
                            key={r.label}
                            className="py-1 pr-3 text-right font-mono tabular-nums"
                          >
                            {Math.round(r.reactions![k] ?? 0)}
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'Energy' && (
          <section aria-labelledby="energy-h" className="space-y-2">
            <h3 id="energy-h" className="text-sm text-paper">
              Energy and warnings
            </h3>
            <ul className="space-y-1 text-xs" data-testid="energy">
              {result.runs
                .filter((r) => r.dps)
                .map((r) => {
                  const waiting = (r.characters ?? []).filter(
                    (c) => c.energyWaitSec >= 0.5,
                  );
                  const ok = !r.warnings?.length && !waiting.length;
                  return (
                    <li key={r.label}>
                      <span className="text-paper">{r.label}:</span>{' '}
                      {ok ? (
                        <span className="text-muted">no warnings.</span>
                      ) : (
                        <span className="text-amber">
                          {[
                            ...(r.warnings ?? []).map(warning),
                            ...waiting.map(
                              (c) =>
                                `${name(c.character)} waited ${c.energyWaitSec.toFixed(1)} s for energy`,
                            ),
                          ].join('; ')}
                          .
                        </span>
                      )}
                    </li>
                  );
                })}
            </ul>
            <p className="text-2xs text-muted">
              With burst waits filled, a team short of energy attacks while it
              waits and shows up as a longer fight instead.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
