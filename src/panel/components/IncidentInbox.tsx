import type { DebugEvent } from '../../shared/events';
import {
  diagnosisStateLabel,
  incidentSource,
  incidentState,
  incidentStateClass,
  lifecycleClass,
  lifecycleLabel,
  lifecycleState,
  eventLabel,
  type DiagnosisViewState,
} from '../incident';

type Props = {
  events: DebugEvent[];
  diagnoses: Record<string, DiagnosisViewState>;
  diagnosisQueue: DebugEvent[];
  selectedEventId: string | null;
  viewMode: 'live' | 'archive';
  archiveStep: 'sites' | 'groups' | 'case';
  onSelect: (eventId: string) => void;
  onBackToSites: () => void;
};

export function IncidentInbox({
  events,
  diagnoses,
  diagnosisQueue,
  selectedEventId,
  viewMode,
  archiveStep,
  onSelect,
  onBackToSites,
}: Props) {
  return (
    <section className="min-w-0" aria-label="Incident inbox">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-200">
          {viewMode === 'live' ? 'Live hauntings' : 'Grouped hauntings'}
        </p>
        {viewMode === 'archive' && archiveStep === 'groups' && (
          <button
            type="button"
            onClick={onBackToSites}
            className="text-xs text-violet-200 hover:text-violet-100"
          >
            All websites
          </button>
        )}
        {viewMode === 'live' && (
          <p className="text-xs text-slate-500">Swipe to inspect</p>
        )}
      </div>
      <ol
        className={
          viewMode === 'live' ? 'flex gap-2 overflow-x-auto pb-2' : 'space-y-2'
        }
        aria-label="Detected anomalies"
      >
        {events.map((event) => {
          const state = incidentState(
            event,
            diagnoses[event.id],
            diagnosisQueue,
          );
          return (
            <li
              key={event.id}
              className={viewMode === 'live' ? 'w-64 shrink-0' : ''}
            >
              <button
                type="button"
                onClick={() => onSelect(event.id)}
                className={`w-full rounded-xl border p-3 text-left transition ${selectedEventId === event.id ? 'haunted-selected border-violet-300/60 bg-violet-400/10' : 'border-white/10 bg-black/15 hover:bg-white/5'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-medium text-slate-100">
                    {event.title}
                  </p>
                  <span className="flex shrink-0 items-center gap-1">
                    <span
                      className={`rounded-full px-2 py-1 text-[11px] font-medium capitalize ${lifecycleClass[lifecycleState(event)]}`}
                    >
                      {lifecycleLabel(event)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-1 text-[11px] font-medium ${incidentStateClass[state]}`}
                    >
                      {diagnosisStateLabel[state]}
                    </span>
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3 text-xs text-slate-400">
                  <p className="truncate capitalize">
                    {eventLabel(event.type)} · {incidentSource(event)}
                    {viewMode === 'live' && event.occurrences > 1
                      ? ` · ×${event.occurrences}`
                      : ''}
                  </p>
                  <time
                    className="shrink-0"
                    dateTime={new Date(event.timestamp).toISOString()}
                  >
                    {new Date(event.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
