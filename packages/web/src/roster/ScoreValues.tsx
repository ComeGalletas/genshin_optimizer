/**
 * The two character scores as every view shows them (ADR-0057): combat
 * readiness out of 100 with a crown per talent at level 10, and artifact
 * quality, a score with no cap ("no recipe" for a character without
 * curated targets).
 */
import type { ArtifactQuality } from '@genshin-build-lab/engine/roster/artifactQuality';
import { CrownGlyph } from '../components/ui/Glyphs';
import { cn } from '../components/ui/cn';
import { countOf, formatScore } from '../labels';

/** One crown per talent at level 10, named for screen readers. */
export function Crowns({ n, className }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return (
    <span
      className={cn('inline-flex items-center text-accent-bright', className)}
      title={`${countOf(n, 'talent')} at level 10 (a Crown of Insight each)`}
      data-testid="crowns"
    >
      {Array.from({ length: n }, (_, i) => (
        <CrownGlyph key={i} />
      ))}
      <span className="sr-only">, {countOf(n, 'talent')} at level 10</span>
    </span>
  );
}

/** Combat readiness: "82 / 100", then the crowns. */
export function ReadinessValue({
  total,
  crowns,
  className,
}: {
  total: number;
  crowns: number;
  className?: string;
}) {
  return (
    <span
      className={cn('inline-flex items-center gap-1.5', className)}
      data-testid="readiness"
    >
      <span className="font-mono font-bold text-accent-bright">
        {formatScore(total, 0)}
        <span className="text-xs font-normal text-muted"> / 100</span>
      </span>
      <Crowns n={crowns} />
    </span>
  );
}

/** Artifact quality, compact: "Artifacts 58.3", or "no recipe yet". */
export function QualityValue({
  quality,
  className,
}: {
  quality: ArtifactQuality | null;
  className?: string;
}) {
  return (
    <span
      className={cn('font-mono text-xs', className)}
      data-testid="quality"
      title={
        quality
          ? `Main stats ${quality.main.slots.filter((s) => s.ok).length} of 3 · ${formatScore(quality.rolls, 1)} good rolls of ${formatScore(quality.possible, 1)} possible`
          : 'No curated build for this character yet, so no artifact score.'
      }
    >
      <span className="text-muted">Artifacts </span>
      {quality ? (
        <span className="font-bold text-paper">
          {formatScore(quality.total, 1)}
        </span>
      ) : (
        <span className="text-muted">no recipe</span>
      )}
    </span>
  );
}
