/**
 * In-app help (TODO 9.6, ADR-0054): a "?" button beside a title, and the
 * larger panel it opens with the steps to follow. Help is on demand: closed
 * until asked for, and closed again from the panel or the button.
 */
import { cn } from '../ui/cn';
import { HELP, type HelpId } from './topics';
import { useHelpOpen } from './helpState';

const panelId = (id: HelpId) => `help-${id}`;

export function HelpButton({
  id,
  className,
}: {
  id: HelpId;
  className?: string;
}) {
  const open = useHelpOpen((s) => s.open.has(id));
  const toggle = useHelpOpen((s) => s.toggle);
  return (
    <button
      type="button"
      className={cn(
        'focus-ring inline-grid h-6 w-6 flex-none place-items-center rounded-full border text-xs font-bold transition-colors',
        open
          ? 'border-accent/70 bg-accent/20 text-accent-bright'
          : 'border-white/15 text-muted hover:border-accent/50 hover:text-paper',
        className,
      )}
      aria-label={`Help: ${HELP[id].title}`}
      aria-expanded={open}
      aria-controls={panelId(id)}
      onClick={() => toggle(id)}
    >
      ?
    </button>
  );
}

export function HelpPanel({ id }: { id: HelpId }) {
  const open = useHelpOpen((s) => s.open.has(id));
  const close = useHelpOpen((s) => s.close);
  const t = HELP[id];
  if (!open) return null;
  return (
    <div
      id={panelId(id)}
      role="region"
      aria-label={`${t.title}: help`}
      className="mt-3 space-y-2 rounded-xl border border-accent/30 bg-accent/[0.06] p-4 text-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-display font-bold text-paper">{t.title}</p>
        <button
          type="button"
          className="btn-ghost flex-none text-xs"
          onClick={() => close(id)}
        >
          Close
        </button>
      </div>
      <p className="text-paper/90">{t.intro}</p>
      {'steps' in t && t.steps && (
        <ol className="list-decimal space-y-1 pl-5 text-paper/90 marker:text-accent">
          {t.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      )}
      {'tips' in t && t.tips && (
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
          {t.tips.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A subsection's title with its "?", and the panel below it. */
export function HelpHeading({
  id,
  children,
  as: Tag = 'h3',
  className,
}: {
  id: HelpId;
  children: React.ReactNode;
  as?: 'h3' | 'h4' | 'p';
  className?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <Tag className={className}>{children}</Tag>
        <HelpButton id={id} />
      </div>
      <HelpPanel id={id} />
    </div>
  );
}
