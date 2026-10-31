import { decorateGhostCommentary, type GhostPersonality } from '../personality';
import type { DebugEvent } from '../../shared/events';
import {
  eventLabel,
  lifecycleLabel,
  lifecycleState,
  type DiagnosisViewState,
} from '../incident';

type Props = {
  event: DebugEvent;
  diagnosis?: DiagnosisViewState;
  isModelActive: boolean;
  personality: GhostPersonality;
  personalityLabel: string;
  isQueued: boolean;
  viewedSiteLabel?: string;
  isArchive: boolean;
  onBack: () => void;
  onMarkExorcised: () => void;
  onCopyFix: (value: string) => void;
};

export function IncidentDetails({
  event,
  diagnosis,
  isModelActive,
  personality,
  personalityLabel,
  isQueued,
  viewedSiteLabel,
  isArchive,
  onBack,
  onMarkExorcised,
  onCopyFix,
}: Props) {
  return (
    <article
      className="rounded-xl border border-rose-300/20 bg-rose-400/5 p-4"
      aria-label="Selected anomaly details"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          {isArchive && (
            <button
              type="button"
              onClick={onBack}
              className="mb-3 text-xs text-violet-200 hover:text-violet-100"
            >
              ‹ {viewedSiteLabel ?? 'Error groups'}
            </button>
          )}
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-200">
            Case file · {eventLabel(event.type)} · {lifecycleLabel(event)}
          </p>
          <h2 className="mt-1 font-semibold text-rose-50">{event.title}</h2>
        </div>
        <span className="rounded-full bg-rose-300/10 px-2 py-1 text-xs font-medium capitalize text-rose-100">
          {event.severity}
        </span>
      </div>
      <p className="mt-4 break-all rounded-lg bg-black/20 p-3 font-mono text-xs leading-5 text-slate-200">
        {event.message}
      </p>
      <p className="mt-3 text-xs text-slate-400">
        First seen{' '}
        {new Date(event.firstSeenAt ?? event.timestamp).toLocaleString()} · Last
        seen {new Date(event.lastSeenAt ?? event.timestamp).toLocaleString()}
      </p>
      {event.exorcisedAt && (
        <p className="mt-1 text-xs text-emerald-200">
          Exorcised {new Date(event.exorcisedAt).toLocaleString()}
        </p>
      )}
      {event.resurrectedAt && (
        <p className="mt-1 text-xs text-amber-200">
          Resurrected {new Date(event.resurrectedAt).toLocaleString()} · ×
          {event.resurrectionCount ?? 0}
        </p>
      )}
      {event.request && (
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">
          <dt className="text-slate-400">Request</dt>
          <dd className="break-all font-mono text-slate-200">
            {event.request.method} {event.request.url}
          </dd>
          <dt className="text-slate-400">Status</dt>
          <dd className="text-slate-200">
            {event.request.status ?? 'No response'}
            {event.request.statusText ? ` ${event.request.statusText}` : ''}
          </dd>
        </dl>
      )}
      {event.source && (
        <p className="mt-4 break-all font-mono text-xs text-slate-400">
          {event.source.url}
          {event.source.line
            ? `:${event.source.line}${event.source.column ? `:${event.source.column}` : ''}`
            : ''}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {lifecycleState(event) !== 'exorcised' && (
          <button
            type="button"
            onClick={onMarkExorcised}
            className="rounded-md bg-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-950"
          >
            Mark exorcised
          </button>
        )}
        {lifecycleState(event) === 'exorcised' && (
          <span className="text-xs text-emerald-200">
            This ghost is exorcised. A future match will be marked resurrected.
          </span>
        )}
        {!isModelActive && (
          <span className="text-xs text-slate-400">
            Start the selected local model to awaken automatic diagnoses.
          </span>
        )}
        {isModelActive && diagnosis?.status === 'loading' && (
          <span className="summon-button rounded-md bg-violet-300 px-3 py-1.5 text-xs font-semibold text-violet-950">
            {personalityLabel} ghost is reading this trace…
          </span>
        )}
        {isModelActive && !diagnosis && isQueued && (
          <span className="text-xs text-violet-200">
            Queued for a {personalityLabel.toLowerCase()} reading.
          </span>
        )}
      </div>
      {diagnosis?.status === 'error' && (
        <p className="mt-3 text-xs text-amber-100">{diagnosis.error}</p>
      )}
      {diagnosis?.status === 'ready' &&
        diagnosis.result?.kind === 'fallback' && (
          <section
            className="mt-4 rounded-lg border border-amber-300/20 bg-amber-400/5 p-3"
            aria-label="Unstructured model response"
          >
            <p className="text-xs font-semibold text-amber-100">
              Unstructured local-model response
            </p>
            <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs text-slate-200">
              {diagnosis.result.raw}
            </pre>
          </section>
        )}
      {diagnosis?.status === 'ready' &&
        diagnosis.result?.kind === 'validated' && (
          <section
            className="mt-4 rounded-lg border border-violet-300/20 bg-violet-400/5 p-3"
            aria-label="Local AI diagnosis"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-violet-100">
                {diagnosis.result.diagnosis.title}
              </p>
              <span className="text-xs capitalize text-violet-200">
                {diagnosis.result.diagnosis.confidence} confidence
              </span>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-200">
              {diagnosis.result.diagnosis.explanation}
            </p>
            <p className="mt-3 text-xs text-slate-400">Likely cause</p>
            <p className="mt-1 text-xs leading-5 text-slate-200">
              {diagnosis.result.diagnosis.likelyCause}
            </p>
            <p className="mt-3 text-xs text-slate-400">Observed evidence</p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-5 text-slate-200">
              {diagnosis.result.diagnosis.evidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-400">Suggested fix</p>
              <button
                type="button"
                onClick={() =>
                  onCopyFix(
                    diagnosis.result?.kind === 'validated'
                      ? diagnosis.result.diagnosis.suggestedFix
                      : '',
                  )
                }
                className="text-xs font-medium text-violet-200 hover:text-violet-100"
              >
                Copy fix
              </button>
            </div>
            <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-black/20 p-2 font-mono text-xs leading-5 text-slate-100">
              {diagnosis.result.diagnosis.suggestedFix}
            </pre>
            <p className="mt-3 text-xs italic text-violet-200">
              {decorateGhostCommentary(
                personality,
                diagnosis.result.diagnosis.ghostCommentary,
              )}
            </p>
          </section>
        )}
    </article>
  );
}
