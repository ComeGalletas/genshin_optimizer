import { useServer } from '../local-server/status';
import { SERVER_URL } from '../local-server/client';

/**
 * The header's local-server status (TODO 3.5): connected with its model,
 * or client-only. A button, because pressing it checks again, e.g. right
 * after starting `npm run server`.
 */
export function ServerChip() {
  const { status, llm, reason, check } = useServer();
  const online = status === 'online';
  const label =
    status === 'checking'
      ? 'Checking local server…'
      : !online
        ? 'Client-only'
        : llm?.ready
          ? `Local server · ${llm.model}`
          : 'Local server · no model';
  const detail =
    status === 'checking'
      ? `Looking for the local server at ${SERVER_URL}.`
      : !online
        ? `No local server (${reason ?? 'not reachable'}). Everything here works without it; start it with npm run server for explanations and your imported account.`
        : llm?.ready
          ? `Connected to ${SERVER_URL}; explanations use ${llm.provider} ${llm.model}.`
          : `Connected to ${SERVER_URL}; explanations are off: ${llm?.notReady ?? 'no language model configured'}.`;
  return (
    <button
      type="button"
      className="chip focus-ring cursor-pointer"
      title={`${detail} Press to check again.`}
      aria-label={`${label}. ${detail} Check again.`}
      onClick={() => void check()}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${
          online && llm?.ready
            ? 'bg-jade'
            : online
              ? 'bg-accent'
              : 'bg-white/30'
        }`}
      />
      {label}
    </button>
  );
}
