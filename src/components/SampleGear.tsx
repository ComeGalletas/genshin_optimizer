import { useState } from 'react';
import { useInventory } from '../state/inventory';
import { useOptimizeRequest } from '../state/optimizeRequest';
import {
  SAMPLE_PRESETS,
  type SamplePreset,
} from '@genshin-build-lab/engine/sample/presets';
import { SAMPLE_INVENTORY } from '@genshin-build-lab/engine/sample/sampleInventory';

export function SampleGear({
  onRun,
  running,
}: {
  onRun: () => void | Promise<void>;
  running: boolean;
}) {
  const clear = useInventory((s) => s.clear);
  const addMany = useInventory((s) => s.addMany);
  const applyPreset = useOptimizeRequest((s) => s.applyPreset);
  const [busy, setBusy] = useState<string | null>(null);

  async function load(preset: SamplePreset) {
    // Matches the buttons' aria-disabled below: they stay focusable so a
    // keyboard user isn't dropped to <body> mid-run, so the guard lives here.
    if (busy !== null || running) return;
    setBusy(preset.label);
    clear();
    addMany(SAMPLE_INVENTORY);
    applyPreset(preset);
    try {
      await onRun();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="panel panel-md space-y-3">
      <div>
        <div className="mb-1 flex items-center gap-2">
          {/* Non-numeric, so this reads as parallel to Step 1 rather than an
              unlabelled step 0 in front of it. */}
          <span className="chip">Shortcut</span>
        </div>
        <h2 className="text-pretty font-display text-base font-bold tracking-wide text-paper">
          No Gear Handy? Try a Sample Build
        </h2>
        <p className="text-xs text-muted">
          Loads a realistic sample account and optimises it in one click — each
          preset shows a different kind of constraint.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {SAMPLE_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className="btn-ghost"
            aria-disabled={busy !== null || running}
            aria-busy={busy === p.label}
            onClick={() => void load(p)}
          >
            {busy === p.label ? 'Optimising…' : p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
