/**
 * Self-contained share links (ADR-0005): encodes a `BuildSnapshot` (request,
 * result, and the five full artifacts) into a URL and decodes it back, with
 * no server-side state.
 * @packageDocumentation
 */

import type {
  Artifact,
  BuildResult,
  OptimizeRequest,
  StatVec,
} from '../game/types';
import { isStatKey, isObjective, BUILD_LEVELS, SLOTS } from '../game/types';
import { isPersistedArtifact, MAX_KEY_LEN } from '../game/artifactValidation';
import { genshinAdapter } from '../game/genshin/adapter';

export interface BuildSnapshot {
  request: OptimizeRequest;
  build: BuildResult;
  /** The five full artifacts of the build, so the link is self-contained and a
   *  recipient (who lacks the sender's inventory) can render the exact pieces (ADR-0005). */
  artifacts: Artifact[];
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4); // restore padding for strict atob
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Native deflate/inflate via the platform's compression streams (no pako).
// 'deflate' is zlib (RFC 1950) — the same wire format pako's deflate() produced,
// so share links minted by older builds still decode. Driven via reader/writer
// rather than Blob.stream()/Response, which jsdom (test env) doesn't implement.
// A share link is at most 5 artifacts plus a small request/build envelope
// (ADR-0005) — real decompressed payloads are well under 100 KB. Cap
// generously so a crafted small deflate stream can't decompression-bomb the
// tab (inflate() is the only caller that passes this; deflate() never needs
// it since compressing our own small snapshot can't blow up).
const MAX_INFLATED_BYTES = 1_000_000;

async function runStream(
  transform: CompressionStream | DecompressionStream,
  input: Uint8Array<ArrayBuffer>,
  maxBytes?: number,
): Promise<Uint8Array> {
  const writer = transform.writable.getWriter();
  // Fire-and-forget: a malformed-input error surfaces via the reader below, so
  // swallow the writer's mirror rejection (write or close) to avoid an
  // unhandled rejection.
  writer
    .write(input)
    .then(() => writer.close())
    .catch(() => {});
  const reader = transform.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    if (maxBytes !== undefined && total > maxBytes) {
      await reader.cancel();
      throw new Error('decompressed payload exceeds size cap');
    }
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

async function deflate(text: string): Promise<Uint8Array> {
  return runStream(
    new CompressionStream('deflate'),
    new TextEncoder().encode(text),
  );
}

async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return new TextDecoder().decode(
    await runStream(
      new DecompressionStream('deflate'),
      bytes,
      MAX_INFLATED_BYTES,
    ),
  );
}

export async function encodeBuild(snapshot: BuildSnapshot): Promise<string> {
  const json = JSON.stringify(snapshot);
  return toBase64Url(await deflate(json));
}

// Bound untrusted strings before they reach regex (formatSetName) / the DOM —
// a multi-MB key would cause main-thread jank. MAX_KEY_LEN is the shared cap
// (artifactValidation), the same one the AI proxy payload guard applies.
// A build is exactly five artifacts (ADR-0005). Cap generously so a crafted
// ?b= link can't hand us a huge array to validate/render (client-side jank).
const MAX_ARTIFACTS = 20;
function isShortString(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0 && x.length <= MAX_KEY_LEN;
}

function isStatVec(x: unknown): x is StatVec {
  if (typeof x !== 'object' || x === null) return false;
  return Object.entries(x).every(
    ([k, v]) => isStatKey(k) && typeof v === 'number' && Number.isFinite(v),
  );
}

/** The tiebreak is a cr/(cr+cd) ratio, so anything outside [0,1] is malformed
 *  rather than merely extreme. */
function isCritRatioTarget(x: unknown): boolean {
  return (
    x === undefined ||
    (typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1)
  );
}

function isSetRequirement(x: unknown): boolean {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  if (r.kind === '4pc' || r.kind === '2pc') return isShortString(r.setKey);
  if (r.kind === '2+2') {
    const keys = r.setKeys;
    return (
      Array.isArray(keys) &&
      keys.length === 2 &&
      keys.every(isShortString) &&
      // Equal halves collapse to a plain 2pc, which the optimiser's ceiling
      // and satisfies() would each read differently — reject rather than
      // silently reinterpret.
      keys[0] !== keys[1]
    );
  }
  return false;
}

function isMainStatLocks(x: unknown): boolean {
  if (typeof x !== 'object' || x === null) return false;
  return Object.entries(x).every(
    ([slot, stat]) => (SLOTS as string[]).includes(slot) && isStatKey(stat),
  );
}

function isOptimizeRequest(x: unknown): x is OptimizeRequest {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  if (!isShortString(r.characterKey) || !isShortString(r.weaponKey))
    return false;
  // A link the snapshot can't run is not a link — the recipient's "Re-run this
  // build" would throw out of `baseStats`, which fails loud on an unknown key.
  // So unlike `canEquip`'s deliberately permissive unknown-key rule, both keys
  // must resolve here *and* form a legal pairing.
  if (
    !genshinAdapter.character(r.characterKey) ||
    !genshinAdapter.weapon(r.weaponKey) ||
    !genshinAdapter.canEquip(r.characterKey, r.weaponKey)
  )
    return false;
  if (!(BUILD_LEVELS as number[]).includes(r.buildLevel as number))
    return false;
  if (!isObjective(r.objective)) return false;
  if (typeof r.constraints !== 'object' || r.constraints === null) return false;
  // The whole constraints object reaches the optimizer should a shared request
  // ever be re-run — validate every field now rather than trust the link. A
  // malformed setRequirement in particular would otherwise reach
  // meetsSetRequirement and setCeilingVector, which each read the union's
  // members without re-checking `kind`.
  const c = r.constraints as Record<string, unknown>;
  if (c.minStats !== undefined && !isStatVec(c.minStats)) return false;
  if (!isCritRatioTarget(c.critRatioTarget)) return false;
  if (c.setRequirement !== undefined && !isSetRequirement(c.setRequirement))
    return false;
  if (c.mainStatLocks !== undefined && !isMainStatLocks(c.mainStatLocks))
    return false;
  return true;
}

function isBuildResult(x: unknown): x is BuildResult {
  if (typeof x !== 'object' || x === null) return false;
  const b = x as Record<string, unknown>;
  if (
    typeof b.objectiveValue !== 'number' ||
    !Number.isFinite(b.objectiveValue)
  )
    return false;
  if (typeof b.score !== 'number' || !Number.isFinite(b.score)) return false;
  if (!isStatVec(b.totals)) return false;
  if (typeof b.artifactIds !== 'object' || b.artifactIds === null) return false;
  const ids = b.artifactIds as Record<string, unknown>;
  if (!SLOTS.every((s) => typeof ids[s] === 'string')) return false;
  if (!isBuildDiagnostics(b.diagnostics)) return false;
  return true;
}

// Binding constraints are sentences, not keys ("Energy Recharge ≥ 160 (build
// has 172.4)"), so they get their own bounds rather than MAX_KEY_LEN. Both caps
// are generous against what `diagnostics.ts` actually emits (one line per
// minStat plus a set line) and tight enough that a crafted ?b= link cannot hand
// the DOM a wall of text.
const MAX_BINDING_CONSTRAINTS = 32;
const MAX_BINDING_CONSTRAINT_LEN = 300;

/** Deep-validate `BuildDiagnostics`. Both fields reach the DOM: BuildCard
 *  prints `bindingConstraints` verbatim and meters `marginalBySlot`, so a
 *  malformed one is an unreadable link, not something to render past. */
function isBuildDiagnostics(x: unknown): boolean {
  if (typeof x !== 'object' || x === null) return false;
  const d = x as Record<string, unknown>;
  if (
    !Array.isArray(d.bindingConstraints) ||
    d.bindingConstraints.length > MAX_BINDING_CONSTRAINTS ||
    !d.bindingConstraints.every(
      (c: unknown) =>
        typeof c === 'string' && c.length <= MAX_BINDING_CONSTRAINT_LEN,
    )
  )
    return false;
  const m = d.marginalBySlot;
  if (typeof m !== 'object' || m === null) return false;
  // Partial by type — `search.ts` emits an empty map on the single-build path —
  // so the rule is "no key that isn't a slot, no value that isn't a finite
  // number", not "exactly five entries".
  return Object.entries(m).every(
    ([slot, v]) =>
      (SLOTS as string[]).includes(slot) &&
      typeof v === 'number' &&
      Number.isFinite(v),
  );
}

/**
 * Structurally validate an untrusted decoded share snapshot. Returns the typed
 * snapshot, or null if any field the render path reads is malformed. This is the
 * trust-boundary guard for the ?b= link (parity with parseExplainPayload).
 */
export function parseBuildSnapshot(input: unknown): BuildSnapshot | null {
  if (typeof input !== 'object' || input === null) return null;
  const o = input as Record<string, unknown>;
  const { request, build, artifacts } = o;
  if (!isOptimizeRequest(request)) return null;
  if (!isBuildResult(build)) return null;
  if (!Array.isArray(artifacts) || artifacts.length > MAX_ARTIFACTS)
    return null;
  if (!artifacts.every(isPersistedArtifact)) return null;
  // The build's per-slot ids must resolve to a carried artifact *of that slot*,
  // else the link renders a "valid" build with no gear shown — or, worse, five
  // circlets under five slot headings. Indexing by slot also rejects a payload
  // carrying two pieces for one slot, since the later one wins the map entry
  // and the earlier slot then fails to match.
  const bySlot = new Map(
    (artifacts as Artifact[]).map((a) => [a.slot, a] as const),
  );
  if (!SLOTS.every((s) => bySlot.get(s)?.id === build.artifactIds[s]))
    return null;
  return { request, build, artifacts: artifacts as Artifact[] };
}

export async function decodeBuild(
  param: string,
): Promise<BuildSnapshot | { error: 'UNREADABLE' }> {
  try {
    if (!param) return { error: 'UNREADABLE' };
    const json = await inflate(fromBase64Url(param));
    const snapshot = parseBuildSnapshot(JSON.parse(json));
    if (!snapshot) return { error: 'UNREADABLE' };
    return snapshot;
  } catch {
    return { error: 'UNREADABLE' };
  }
}
