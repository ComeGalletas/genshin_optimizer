import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import {
  parseGOOD,
  parseGOODRoster,
} from '@genshin-build-lab/engine/import/good';
import { fetchUidArtifacts, type UidError } from '../import/uid';
import { mergeNew } from '@genshin-build-lab/engine/import/dedupe';
import { useInventory } from '../state/inventory';
import { useRoster } from '../state/roster';
import { scrollToId } from '../ui/scroll';
import { Callout } from './ui/Callout';
import type { Artifact } from '@genshin-build-lab/engine/game/types';

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

/** "1 artifact" / "2 artifacts". English's regular plural is all this panel
 *  needs, and a count of one printed as "1 artifacts" reads as a bug in the
 *  importer rather than in the copy. */
function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}

/** Sample gear carries a `sample-` id prefix (see the engine's
 *  sample/sampleInventory) — the one marker distinguishing the demo bag from
 *  artifacts the player actually owns. */
function isSampleArtifact(a: Artifact): boolean {
  return a.id.startsWith('sample-');
}

export function ImportPanel() {
  const artifacts = useInventory((s) => s.artifacts);
  const replaceAll = useInventory((s) => s.replaceAll);
  // One notice, not a message and an error that could both be on screen at
  // once: every path below sets exactly one outcome, and the two live regions
  // are fed from its tone. Previously each path had to remember to clear the
  // other piece of state, and one that forgot showed a green "Imported 1" over
  // a red parse failure.
  const [notice, setNotice] = useState<Notice | null>(null);
  const [uid, setUid] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
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
    }, 5000);
    return () => {
      if (clearTimeoutRef.current) clearTimeout(clearTimeoutRef.current);
    };
  }, [confirmingClear]);

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
        text: `Already up to date — all ${incoming.length} ${incoming.length === 1 ? 'piece was' : 'pieces were'} already in your inventory.${suffix}`,
      });
      return;
    }
    setNotice({
      tone: 'success',
      text:
        skipped > 0
          ? `Imported ${fresh.length} new ${plural(fresh.length, 'artifact')} — ${skipped} ${skipped === 1 ? 'was' : 'were'} already in your inventory.${suffix}`
          : `Imported ${fresh.length} ${plural(fresh.length, 'artifact')}.${suffix}`,
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
      if (rosterCount > 0) {
        useRoster.getState().setRoster(roster);
        // The roster section renders below the fold; without a nudge the user
        // sees an unchanged import panel and assumes nothing happened.
        setTimeout(() => scrollToId('step-roster'), 150);
      }
      mergeDedupe(
        out,
        rosterCount > 0 ? ` Roster: ${rosterCount} characters.` : '',
      );
    } catch {
      setNotice({ tone: 'error', text: BAD_FILE });
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
  }

  const count = artifacts.length;
  // Enka UIDs are 9 digits (10 on some servers); anything else is a typo, not
  // a lookup worth a round-trip.
  const uidOk = /^\d{9,10}$/.test(uid.trim());

  return (
    <div className="panel panel-md space-y-5">
      <div className="flex items-center justify-between">
        <span className="micro-label">Inventory</span>
        {/* Two explicit element children, not an element plus a bare text
            node: JSX drops the newline between them, so the spacing was left
            to .chip's flex gap and read as "70artifacts loaded". */}
        <div className="flex items-center gap-2">
          <span className="chip">
            {/* Tabular digits: the count changes under the reader's eyes on
                every import, and a proportional font shifted the word beside
                it sideways each time. */}
            <span className="font-mono font-bold text-accent">{count}</span>
            <span>{plural(count, 'artifact')} loaded</span>
          </span>
          {count > 0 && (
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
          )}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {/* GOOD file upload */}
        <div className="well rounded-xl p-4">
          <label className="field-label" htmlFor={fileInputId}>
            Upload GOOD Export
          </label>
          <p className="mb-3 text-xs text-muted">
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

        {/* UID import */}
        <div className="well rounded-xl p-4">
          <label className="field-label" htmlFor={uidInputId}>
            Import by UID
          </label>
          <p className="mb-3 text-xs text-muted">
            Showcased characters only — not your full inventory.
          </p>
          {/* A real <form>, so Enter in the field submits — the row read as a
              form and behaved like two unrelated controls. */}
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
                focus to <body> and the user loses their place. `onUid` holds
                the matching early return. */}
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
      </div>

      {/* Persistent live regions. A region created in the same commit as its
          text isn't being observed yet, so nothing is announced — these two
          are always mounted and only their text changes. `sr-only` is
          absolutely positioned, so they cost the panel no vertical rhythm and
          the Callouts below stay purely visual. */}
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
