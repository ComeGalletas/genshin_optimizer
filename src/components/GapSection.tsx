import { useMemo } from 'react';
import type {
  Artifact,
  OptimizeRequest,
  OptimizeResult,
} from '@genshin-build-lab/engine/game/types';
import { META_TARGETS } from '@genshin-build-lab/engine/meta/metaTargets';
import { computeGapReport } from '@genshin-build-lab/engine/meta/gap';
import { GapReport } from './GapReport';
import { ExplainBuild } from './ExplainBuild';

/**
 * The gap-analysis section shown beneath fresh, non-shared results for a meta
 * character: a GapReport plus the optional AI "Explain this build" panel. Owns
 * its own visibility gate so App renders it unconditionally.
 */
export function GapSection({
  result,
  request,
  artifacts,
  sharedArtifacts,
}: {
  result: OptimizeResult;
  request: OptimizeRequest;
  artifacts: Artifact[];
  sharedArtifacts: Artifact[] | null;
}) {
  const meta = META_TARGETS[request.characterKey];
  const build = result.status === 'ok' ? (result.builds[0] ?? null) : null;
  // A full pass over the inventory per render. Memoised because App re-renders
  // for reasons that have nothing to do with gear — while a search runs it
  // re-rendered several times a second, and the report is a pure function of
  // these three inputs.
  const report = useMemo(
    () => (meta ? computeGapReport(meta, artifacts, build) : null),
    [meta, artifacts, build],
  );

  // Only for meta characters on freshly-optimised (non-shared) builds. After
  // the hooks above: a bail-out before them would change the hook order.
  if (sharedArtifacts) return null;

  if (!meta || !report) {
    // Mirrors PlanView's MemberCard wording for the same "no curated recipe"
    // case, so a non-meta character reads as an intentional gap, not a
    // silently broken results section.
    return (
      <p className="mb-4 text-xs text-muted">
        No curated recipe for this character yet.
      </p>
    );
  }

  return (
    <div className="mb-4">
      <GapReport report={report} />
      <ExplainBuild
        characterKey={request.characterKey}
        objective={request.objective}
        totals={build?.totals ?? {}}
        report={report}
      />
    </div>
  );
}
