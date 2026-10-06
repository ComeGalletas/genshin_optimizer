import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import {
  parseGOOD,
  parseGOODRoster,
} from '@genshin-build-lab/engine/import/good';
import { fetchUidArtifacts, type UidError } from '../import/uid';
import { mergeNew } from '@genshin-build-lab/engine/import/dedupe';
import { useInventory } from '../state/inventory';
import { useRoster } from '../state/roster';
import { useServer } from '../local-server/status';
import { fetchServerAccount } from '../local-server/client';
import { Callout } from './ui/Callout';
import { Disclosure } from './ui/Disclosure';
import { ArtifactForm } from './ArtifactForm';
import { goTo } from './views';
import { useAccount } from '../state/account';
import { demoAccount } from '@genshin-build-lab/engine/sample/demoAccount';
import type { Artifact } from '@genshin-build-lab/engine/game/types';
import { HelpButton, HelpPanel } from './help/Help';
import { countOf, formatCount, pluralWord } from '../labels';

// WCAG 3.3.1: describe what actually went wrong. fetchUidArtifacts already
// distinguishes the three cases; collapsing them into one message left the
// user guessing which of three unrelated fixes to try.
const UID_ERRORS: Record<UidError['error'], string> = {
  NETWORK:
    'Couldn’t reach Enka — check your connection and try again in a moment.',
  NOT_FOUND: 'Couldn’t find that UID — check the digits and your server.',
  NO_SHOWCASE:
    'No artifacts on showcase — turn on Character Showcase in-game and add characters to it.',
};

/** Every outcome this panel reports, in one shape: the tone decides both the
 *  Callout's colour and which of the two live regions announces it. */
interface Notice {
  tone: 'success' | 'info' | 'error';
  text: string;
}

const BAD_FILE =
  'That file isn’t a recognised inventory export. Expected a GOOD-format .json.';

/** How many entries a GOOD file's list holds, read or not. */
function entries(json: unknown, list: 'artifacts' | 'characters'): number {
  const xs = (json as Record<string, unknown> | null)?.[list];
  return Array.isArray(xs) ? xs.length : 0;
}

/** Sample gear carries a `sample-` id prefix (see the engine's
 *  sample/sampleInventory) — the one marker distinguishing the demo bag from
 *  artifacts the player actually owns. */
function isSampleArtifact(a: Artifact): boolean {
  return a.id.startsWith('sample-');
}

/**
 * The Start view (TODO 9.4, ADR-0053): three ways to load data, and nothing
 * else on the page until one is used. The demo data (a made-up account),
 * the local server's account (while it runs), or a new source: a GOOD
 * file, a UID, or pieces by hand. A load records its source for the
 * account bar and opens the view that has something to show.
 */
export function ImportPanel() {
  const artifacts = useInventory((s) => s.artifacts);
  const replaceAll = useInventory((s) => s.replaceAll);
  // One notice, not a message and an error that could both be on screen at
  // once: every path below sets exactly one outcome, and the two live regions
  // are fed from its tone. Previously each path had to remember to clear the
  // other piece of state, and one that forgot showed a green "Imported 1" over
  // a red parse failure.
  const [notice, setLocalNotice] = useState<Notice | null>(null);
  // A success also goes to the account store: the load opens another view,
  // and the confirmation shows under the account bar there (TODO 9.4).
  const setNotice = (n: Notice | null) => {
    setLocalNotice(n);
    useAccount.getState().setLoaded(n?.tone === 'success' ? n.text : null);
  };
  // A confirm that times out takes its "Press Confirm…" prompt with it: the
  // prompt named a button that is no longer there.
  const dropPrompt = () =>
    setLocalNotice((n) => (n?.text.startsWith('Press Confirm') ? null : n));
  const [uid, setUid] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  // Loading the local server's account (TODO 3.5): offered only while the
  // server runs, and two-step when it would replace gear the player owns.
  const serverOnline = useServer((s) => s.status === 'online');
  const [serverBusy, setServerBusy] = useState(false);
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const [confirmingDemo, setConfirmingDemo] = useState(false);
  const [byHand, setByHand] = useState(false);
  const setSource = useAccount((s) => s.setSource);
  const clearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputId = useId();
  const uidInputId = useId();

  // The confirm state has no undo of its own, so it must not linger forever:
  // an idle tab left on "Confirm Clear" is a footgun for whoever touches the
  // button next expecting the original one-step label.
  useEffect(() => {
    if (!confirmingClear) return;
    clearTimeoutRef.current = setTimeout(() => {
      setConfirmingClear(false);
      dropPrompt();
    }, 5000);
    return () => {
      if (clearTimeoutRef.current) clearTimeout(clearTimeoutRef.current);
    };
  }, [confirmingClear]);

  // Same idle reset as Clear's confirm.
  useEffect(() => {
    if (!confirmingReplace) return;
    const t = setTimeout(() => {
      setConfirmingReplace(false);
      dropPrompt();
    }, 5000);
    return () => clearTimeout(t);
  }, [confirmingReplace]);
  useEffect(() => {
    if (!confirmingDemo) return;
    const t = setTimeout(() => {
      setConfirmingDemo(false);
      dropPrompt();
    }, 5000);
    return () => clearTimeout(t);
  }, [confirmingDemo]);

  /** Whether the inventory holds gear the player owns (not the demo's). */
  const ownsGear = () =>
    useInventory.getState().artifacts.some((a) => !isSampleArtifact(a));

  function onDemo() {
    // Replace, like the server's account; two presses over owned gear.
    if (ownsGear() && !confirmingDemo) {
      setConfirmingDemo(true);
      setNotice({
        tone: 'info',
        text: 'Press Confirm replace to swap your inventory and roster in this browser for the demo data.',
      });
      return;
    }
    setConfirmingDemo(false);
    const demo = demoAccount();
    replaceAll(demo.artifacts);
    useRoster.getState().setRoster(demo.roster);
    setSource({ kind: 'demo' });
    setNotice({
      tone: 'success',
      text: `Loaded the demo data: ${demo.artifacts.length} artifacts, ${Object.keys(demo.roster).length} characters.`,
    });
    goTo('roster');
  }

  function mergeDedupe(incoming: Artifact[], suffix = '') {
    // An import replaces the demo bag rather than merging with it. The sample
    // artifacts are generated, not owned, so leaving them in place meant the
    // first real import produced results built around gear the player has
    // never seen — and `mergeNew` can't tell the difference, since a sample
    // piece is a structurally valid artifact.
    const existing = useInventory
      .getState()
      .artifacts.filter((a) => !isSampleArtifact(a));
    // Read live state rather than the render-time `artifacts` closure: onFile
    // and onUid are both async, so a second import can otherwise dedupe
    // against a snapshot that predates the first import's commit.
    const fresh = mergeNew(existing, incoming);
    replaceAll([...existing, ...fresh]);
    // An empty parse is not "already up to date": the file was readable but
    // carried nothing this app recognises, and saying "all 0 pieces were
    // already in your inventory" made a failed import read as a no-op success.
    if (incoming.length === 0) {
      setNotice({
        tone: 'info',
        text: `No readable artifacts in that file — nothing was imported.${suffix}`,
      });
      return;
    }
    // Re-importing the same file adds nothing, and a green "Imported 0
    // artifacts." reads as a failure dressed as a success. Three outcomes,
    // three sentences.
    const skipped = incoming.length - fresh.length;
    if (fresh.length === 0) {
      setNotice({
        tone: 'info',
        text: `Already up to date — all ${countOf(incoming.length, 'piece was', 'pieces were')} already in your inventory.${suffix}`,
      });
      return;
    }
    setNotice({
      tone: 'success',
      text:
        skipped > 0
          ? `Imported ${countOf(fresh.length, 'new artifact')} — ${formatCount(skipped)} ${pluralWord(skipped, 'was', 'were')} already in your inventory.${suffix}`
          : `Imported ${countOf(fresh.length, 'artifact')}.${suffix}`,
    });
  }

  function onClear() {
    // Two-step, because this is the one control on the panel that destroys
    // work and there is no undo. `disabled` is not involved: the button stays
    // fully operable and simply means something different on the second press,
    // with the label saying so rather than a dialog interrupting. A separate
    // Cancel button and a 5s auto-reset (above) both back out of the armed
    // state, since a bare label swap with no way out is a trap for a second
    // accidental click.
    if (!confirmingClear) {
      setConfirmingClear(true);
      setNotice({
        tone: 'info',
        text: 'Press Confirm clear to remove all artifacts and roster data. This cannot be undone.',
      });
      return;
    }
    setConfirmingClear(false);
    useInventory.getState().clear();
    useRoster.getState().clear();
    useAccount.getState().clear();
    setNotice({ tone: 'info', text: 'Inventory and roster cleared.' });
  }

  function onCancelClear() {
    setConfirmingClear(false);
    setNotice(null);
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const json = JSON.parse(await file.text()) as unknown;
      const out = parseGOOD(json);
      if ('error' in out) {
        setNotice({ tone: 'error', text: BAD_FILE });
        return;
      }
      const roster = parseGOODRoster(json);
      const rosterCount = Object.keys(roster).length;
      if (rosterCount > 0) useRoster.getState().setRoster(roster);
      mergeDedupe(
        out,
        rosterCount > 0 ? ` Roster: ${rosterCount} characters.` : '',
      );
      if (out.length > 0 || rosterCount > 0) {
        setSource({ kind: 'file', name: file.name });
        // The view with something to show: the roster, or the optimizer.
        goTo(rosterCount > 0 ? 'roster' : 'optimise');
      }
    } catch {
      setNotice({ tone: 'error', text: BAD_FILE });
    }
  }

  async function onServerAccount() {
    if (serverBusy) return;
    // Replace, not merge: the server's account is already the merge of every
    // import (ADR-0027), and deduping it against an older browser copy would
    // keep a levelled piece twice. Only owned gear needs the second press;
    // the sample bag is replaced by any import.
    if (ownsGear() && !confirmingReplace) {
      setConfirmingReplace(true);
      setNotice({
        tone: 'info',
        text: 'Press Confirm replace to swap the inventory and roster in this browser for the local server’s account.',
      });
      return;
    }
    setConfirmingReplace(false);
    setServerBusy(true);
    setNotice(null);
    try {
      const json = await fetchServerAccount();
      const out = parseGOOD(json);
      if ('error' in out) {
        setNotice({
          tone: 'error',
          text: 'The local server sent an account this app can’t read.',
        });
        return;
      }
      const roster = parseGOODRoster(json);
      const characters = Object.keys(roster).length;
      // This replaces what's loaded and can't be undone, so an account with
      // nothing usable in it never gets that far (QA M3).
      const sent = entries(json, 'artifacts');
      if (out.length === 0 && (sent > 0 || characters === 0)) {
        setNotice({
          tone: 'error',
          text:
            sent > 0
              ? `None of the ${countOf(sent, 'artifact')} in the local server’s account could be read here, so nothing was replaced.`
              : 'The local server’s account is empty, so nothing was replaced.',
        });
        return;
      }
      replaceAll(out);
      useRoster.getState().setRoster(roster);
      const dropped = [
        [sent - out.length, 'artifact'],
        [entries(json, 'characters') - characters, 'character'],
      ] as const;
      const left = dropped
        .filter(([n]) => n > 0)
        .map(([n, word]) => countOf(n, word))
        .join(' and ');
      setNotice({
        tone: 'success',
        text: `Loaded the local server’s account: ${countOf(out.length, 'artifact')}, ${countOf(characters, 'character')}.${left ? ` Left out ${left} this app couldn’t read.` : ''}`,
      });
      setSource({ kind: 'server' });
      goTo(characters > 0 ? 'roster' : 'optimise');
    } catch (e) {
      setNotice({
        tone: 'error',
        text: `Couldn’t load the server’s account: ${(e as Error).message}.`,
      });
    } finally {
      setServerBusy(false);
    }
  }

  async function onUid() {
    // The Fetch button is aria-disabled rather than disabled, and Enter in the
    // field submits regardless — so the guard has to live here.
    if (busy || !uidOk) return;
    setBusy(true);
    setNotice(null);
    const out = await fetchUidArtifacts(uid.trim());
    setBusy(false);
    if ('error' in out) {
      setNotice({ tone: 'error', text: UID_ERRORS[out.error] });
      return;
    }
    mergeDedupe(out);
    if (out.length > 0) {
      setSource({ kind: 'uid', uid: uid.trim() });
      goTo('optimise');
    }
  }

  const count = artifacts.length;
  // Enka UIDs are 9 digits (10 on some servers); anything else is a typo, not
  // a lookup worth a round-trip.
  const uidOk = /^\d{9,10}$/.test(uid.trim());

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <section
          aria-labelledby={`${fileInputId}-demo`}
          className="panel panel-sm flex flex-col gap-3"
        >
          <div className="flex items-center gap-2">
            <h3
              id={`${fileInputId}-demo`}
              className="font-display text-base font-bold text-paper"
            >
              Demo Data
            </h3>
            <HelpButton id="start-demo" />
          </div>
          <p className="flex-1 text-xs text-muted">
            A made-up account to see what the app does: eight characters in two
            teams, each wearing a build, and the rest of a small artifact bag.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className={confirmingDemo ? 'btn-danger' : 'btn-ghost'}
              onClick={onDemo}
            >
              {confirmingDemo ? 'Confirm Replace' : 'Load Demo Data'}
            </button>
            {confirmingDemo && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setConfirmingDemo(false);
                  setNotice(null);
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </section>

        <section
          aria-labelledby={`${fileInputId}-server`}
          className="panel panel-sm flex flex-col gap-3"
        >
          <div className="flex items-center gap-2">
            <h3
              id={`${fileInputId}-server`}
              className="font-display text-base font-bold text-paper"
            >
              Your Account
            </h3>
            <HelpButton id="start-server" />
          </div>
          {serverOnline ? (
            <>
              <p className="flex-1 text-xs text-muted">
                The account the local server merged from your imports (Irminsul,
                scanners). Replaces what’s loaded here.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={confirmingReplace ? 'btn-danger' : 'btn-primary'}
                  onClick={() => void onServerAccount()}
                  aria-busy={serverBusy}
                  aria-disabled={serverBusy}
                >
                  {serverBusy
                    ? 'Loading…'
                    : confirmingReplace
                      ? 'Confirm Replace'
                      : 'Load Account'}
                </button>
                {confirmingReplace && (
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      setConfirmingReplace(false);
                      setNotice(null);
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="flex-1 text-xs text-muted">
              Your full account comes from the local server, which merges your
              Irminsul and scanner exports. Start it with{' '}
              <code>npm run server</code> and this choice appears.
            </p>
          )}
        </section>

        <section
          aria-labelledby={`${fileInputId}-new`}
          className="panel panel-sm flex flex-col gap-3"
        >
          <div className="flex items-center gap-2">
            <h3
              id={`${fileInputId}-new`}
              className="font-display text-base font-bold text-paper"
            >
              A New Source
            </h3>
            <HelpButton id="start-new" />
          </div>
          <div>
            <label className="field-label" htmlFor={fileInputId}>
              Upload GOOD Export
            </label>
            <p className="mb-2 text-xs text-muted">
              Your full inventory, from Genshin Optimizer or similar.
            </p>
            <input
              id={fileInputId}
              type="file"
              accept="application/json,.json"
              onChange={(e) => void onFile(e)}
              className="focus-ring touch-target block w-full cursor-pointer rounded-md text-xs text-muted file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-accent/15 file:px-3 file:py-2 file:font-semibold file:text-accent-bright hover:file:bg-accent/25"
            />
          </div>
          <div>
            <label className="field-label" htmlFor={uidInputId}>
              Import by UID
            </label>
            <p className="mb-2 text-xs text-muted">
              Showcased characters only — not your full inventory.
            </p>
            {/* A real <form>, so Enter in the field submits. */}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void onUid();
              }}
            >
              <input
                id={uidInputId}
                className="field"
                name="uid"
                value={uid}
                onChange={(e) => setUid(e.target.value)}
                placeholder="e.g. 700000000…"
                aria-describedby={uidOk ? undefined : 'uid-hint'}
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
              />
              {/* aria-disabled, not disabled: going disabled mid-click moves
                  focus to <body>. `onUid` holds the matching early return. */}
              <button
                type="submit"
                className="btn-primary flex-none"
                aria-busy={busy}
                aria-disabled={busy || !uidOk}
              >
                {busy ? 'Fetching…' : 'Fetch'}
              </button>
            </form>
            {!uid && (
              <p id="uid-hint" className="mt-2 text-xs text-muted">
                Enter your UID to enable Fetch.
              </p>
            )}
            {uid && !uidOk && (
              <p id="uid-hint" className="mt-2 text-xs text-rose">
                A UID is 9–10 digits.
              </p>
            )}
          </div>
          {/* Mounted when first opened: the form has its own live regions,
              which would otherwise sit beside this panel's from the start. */}
          <Disclosure
            size="md"
            tone="flux"
            label="Add Pieces by Hand"
            onToggle={(e) => {
              if (e.currentTarget.open) setByHand(true);
            }}
          >
            <div className="mt-3">{byHand && <ArtifactForm />}</div>
          </Disclosure>
        </section>
      </div>

      {/* The cards' help, full width below them: a card is too narrow for
          the steps. */}
      <HelpPanel id="start-demo" />
      <HelpPanel id="start-server" />
      <HelpPanel id="start-new" />

      {count > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span className="chip">
            <span className="font-mono font-bold text-accent">{count}</span>
            <span>{pluralWord(count, 'artifact')} loaded</span>
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={confirmingClear ? 'btn-danger' : 'btn-ghost'}
              onClick={onClear}
            >
              {confirmingClear ? 'Confirm Clear' : 'Clear Inventory'}
            </button>
            {confirmingClear && (
              <button
                type="button"
                className="btn-ghost"
                onClick={onCancelClear}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Persistent live regions: a region created in the same commit as its
          text isn't observed yet, so these stay mounted and only their text
          changes. */}
      <p className="sr-only" role="status">
        {notice && notice.tone !== 'error' ? notice.text : ''}
      </p>
      <p className="sr-only" role="alert">
        {notice?.tone === 'error' ? notice.text : ''}
      </p>
      {notice && (
        <Callout tone={notice.tone} className="flex items-center gap-2">
          {notice.text}
        </Callout>
      )}
    </div>
  );
}
