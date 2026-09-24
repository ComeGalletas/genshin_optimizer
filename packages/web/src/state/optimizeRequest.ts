import { create } from 'zustand';
import type {
  BuildLevel,
  Objective,
  OptimizeConstraints,
  OptimizeRequest,
  StatKey,
} from '@genshin-build-lab/engine/game/types';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import { META_TARGETS } from '@genshin-build-lab/engine/meta/metaTargets';
import { getDamageProfile } from '@genshin-build-lab/engine/damage/profiles';
import { useRoster } from './roster';

export interface PresetInput {
  characterKey: string;
  weaponKey: string;
  objective: Objective;
  constraints: OptimizeConstraints;
}

export interface OptimizeRequestState {
  characterKey: string;
  weaponKey: string;
  buildLevel: BuildLevel;
  objective: Objective;
  /** Single home for all constraints, including the ER floor (minStats.er_pct). */
  constraints: OptimizeConstraints;
  setCharacterKey: (k: string) => void;
  setWeaponKey: (k: string) => void;
  setBuildLevel: (l: BuildLevel) => void;
  setObjective: (o: Objective) => void;
  /** Write the ER floor from a text input value. Empty string or NaN removes the floor. */
  setMinER: (v: string) => void;
  /** Lower (or set) any minStats floor — used by the "Relax X to Y" recovery action. */
  relaxMinStat: (key: StatKey, value: number) => void;
  applyPreset: (p: PresetInput) => void;
  reset: () => void;
}

/**
 * What the app opens on.
 *
 * Sort order used to pick this — `characters()[0]` + `weapons()[0]` — which
 * produced "Aino + Absolution": a claymore user holding a sword, alphabetically
 * arrived at, and the first thing a reader saw. The curated tables already know
 * a better answer, so take the first META_TARGETS entry that names a signature
 * weapon *and* carries a damage profile: a pair the app can also demonstrate
 * the `avg_damage` objective on, chosen from data rather than from an accident
 * of ordering. `Object.values` preserves insertion order, so this is fixed as
 * long as the table is.
 */
const MARQUEE = Object.values(META_TARGETS).find(
  (m) => m.weapon != null && getDamageProfile(m.characterKey) != null,
);

/** The opening character/weapon pair, exported so a caller can tell "still
 *  untouched" from "deliberately chosen" (see App's roster hydration). */
export const DEFAULT_SELECTION = {
  characterKey: MARQUEE?.characterKey ?? genshinAdapter.characters()[0]?.key,
  weaponKey: MARQUEE?.weapon ?? genshinAdapter.weapons()[0]?.key,
} as { characterKey: string; weaponKey: string };

const defaults = () => ({
  characterKey: DEFAULT_SELECTION.characterKey ?? '',
  weaponKey: DEFAULT_SELECTION.weaponKey ?? '',
  buildLevel: 90 as BuildLevel,
  objective: 'crit_value' as Objective,
  constraints: {} as OptimizeConstraints,
});

/** Whether the selection is still exactly what the app opened on — the only
 *  state in which replacing it can't overwrite something the reader chose. */
export function isDefaultSelection(s: {
  characterKey: string;
  weaponKey: string;
}): boolean {
  return (
    s.characterKey === DEFAULT_SELECTION.characterKey &&
    s.weaponKey === DEFAULT_SELECTION.weaponKey
  );
}

/**
 * A weapon this character can actually hold.
 *
 * Weapon legality is a property of the request, not of the panel that happens
 * to edit it: an illegal pair reaching the optimiser produces a "proven
 * optimal" build around a claymore user's polearm. Correcting it here means
 * every writer — the picker, a preset, a roster prefill — is covered by one
 * rule instead of by an effect in one component.
 *
 * Preference order: the weapon asked for, then the player's own equipped one,
 * then the curated meta BiS, then the curated accessible pick, then the first
 * legal weapon as a floor. The accessible pick sits below the BiS because it
 * answers a narrower question ("what if I don't have the signature?") that
 * only the reader can ask; it's here so a character whose BiS the snapshot
 * doesn't carry still lands on a curated weapon rather than an alphabetical
 * one.
 *
 * Unlike `canEquip` (deliberately permissive about keys the frozen snapshot
 * doesn't carry), a weapon the adapter can't resolve counts as illegal here —
 * the request is about to be run, and `baseStats` fails loud on an unknown key.
 */
function legalWeapon(characterKey: string, wanted: string): string {
  const character = genshinAdapter.character(characterKey);
  // No evidence of a weapon class is not evidence of a wrong one: leave an
  // unknown character's selection alone rather than guessing for it.
  if (!character) return wanted;
  const ok = (k: string | undefined): k is string =>
    !!k &&
    !!genshinAdapter.weapon(k) &&
    genshinAdapter.canEquip(characterKey, k);
  if (ok(wanted)) return wanted;
  const equipped = useRoster.getState().entries[characterKey]?.weaponKey;
  if (ok(equipped)) return equipped;
  const meta = META_TARGETS[characterKey];
  const bis = meta?.weapon;
  if (ok(bis)) return bis;
  const accessible = meta?.weaponAccessible;
  if (ok(accessible)) return accessible;
  return genshinAdapter.weaponsOfType(character.weaponType)[0]?.key ?? wanted;
}

export const useOptimizeRequest = create<OptimizeRequestState>((set, get) => ({
  ...defaults(),
  // Selecting a character is also where the roster pre-fill happens, so every
  // writer gets it — not just the picker that used to re-apply it afterward.
  // Precedence: the weapon is whatever `legalWeapon` allows (the current pick
  // if this character can hold it, otherwise their roster-equipped weapon, and
  // only then the curated fallbacks), so a manual override survives flipping
  // away and back. The build level is a floor, not a preference — a rostered
  // character cannot be de-levelled — so the roster's value is raised to
  // rather than replaced by. Both stay editable afterward (ADR-0007/ADR-0015).
  setCharacterKey: (characterKey) =>
    set((s) => {
      const rosterLevel =
        useRoster.getState().entries[characterKey]?.buildLevel;
      return {
        characterKey,
        weaponKey: legalWeapon(characterKey, s.weaponKey),
        buildLevel:
          rosterLevel != null && rosterLevel > s.buildLevel
            ? rosterLevel
            : s.buildLevel,
      };
    }),
  setWeaponKey: (weaponKey) => set({ weaponKey }),
  setBuildLevel: (buildLevel) => set({ buildLevel }),
  setObjective: (objective) => set({ objective }),
  relaxMinStat: (key, value) => {
    if (!Number.isFinite(value) || value < 0) return;
    const prev = get().constraints;
    set({
      constraints: {
        ...prev,
        minStats: { ...(prev.minStats ?? {}), [key]: value },
      },
    });
  },
  setMinER: (v) => {
    const num = v.trim() === '' ? NaN : Number(v);
    const prev = get().constraints;
    // Anything that isn't a usable floor clears the floor. `Number('1e400')`
    // is Infinity and `Number('Infinity')` parses — both are numbers, not NaN,
    // and either would have been stored as a threshold no build can meet,
    // silently returning zero results. A negative floor is no floor at all.
    if (!Number.isFinite(num) || num < 0) {
      // Remove er_pct; drop minStats entirely if it becomes empty.
      if (!prev.minStats || !('er_pct' in prev.minStats)) return;
      const rest = { ...prev.minStats };
      delete rest.er_pct;
      const minStats = Object.keys(rest).length ? rest : undefined;
      set({ constraints: { ...prev, minStats } });
    } else {
      set({
        constraints: {
          ...prev,
          minStats: { ...(prev.minStats ?? {}), er_pct: num },
        },
      });
    }
  },
  applyPreset: (p) => {
    set({
      characterKey: p.characterKey,
      weaponKey: legalWeapon(p.characterKey, p.weaponKey),
      objective: p.objective,
      constraints: p.constraints,
    });
  },
  reset: () => set(defaults()),
}));

/** Project the store state into an OptimizeRequest (no merge logic needed). */
export function currentRequest(s: OptimizeRequestState): OptimizeRequest {
  return {
    characterKey: s.characterKey,
    weaponKey: s.weaponKey,
    buildLevel: s.buildLevel,
    constraints: s.constraints,
    objective: s.objective,
    topK: 10,
  };
}
