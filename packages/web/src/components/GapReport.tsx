import { Callout } from './ui/Callout';
import type { GapReport as GapReportData } from '@genshin-build-lab/engine/meta/gap';

export function GapReport({ report }: { report: GapReportData }) {
  const allMet =
    report.feasibility.length === 0 && report.shortfalls.length === 0;
  return (
    <div className="panel panel-md space-y-3">
      <h3 className="text-pretty font-display text-lg font-bold tracking-wide text-paper">
        Gap vs Meta Build
      </h3>

      {allMet ? (
        <Callout tone="success">
          Your gear can already build the meta — nice.
          {report.action ? ` To push further: ${report.action}` : ''}
        </Callout>
      ) : (
        <>
          {report.feasibility.length > 0 && (
            <div>
              <p className="field-label">What’s missing</p>
              {/* Native `list-disc` marker instead of a literal "•" — a
                  screen reader already announces list membership, so a typed
                  bullet is redundant noise (some read it aloud as "bullet"). */}
              <ul className="list-disc space-y-1 pl-4 text-sm text-paper/90 marker:text-muted">
                {report.feasibility.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}

          {report.shortfalls.length > 0 && (
            <div>
              <p className="field-label">Shortfall</p>
              <ul className="list-disc space-y-1 pl-4 text-sm text-paper/90 marker:text-muted">
                {report.shortfalls.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          {report.action && (
            <Callout tone="info">
              <span className="font-semibold">Next:</span> {report.action}
            </Callout>
          )}
        </>
      )}
    </div>
  );
}
