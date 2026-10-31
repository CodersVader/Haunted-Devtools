import type { DiagnosisResult } from '../ai/diagnosis';
import type { DebugEvent, IncidentStatus } from '../shared/events';

export type DiagnosisViewState = {
  eventId: string;
  status: 'loading' | 'ready' | 'error';
  result?: DiagnosisResult;
  error?: string;
};

export type IncidentState =
  | 'new'
  | 'queued'
  | 'reading'
  | 'diagnosed'
  | 'failed';

export const lifecycleClass: Record<IncidentStatus, string> = {
  active: 'bg-rose-300/10 text-rose-100',
  exorcised: 'bg-emerald-300/10 text-emerald-100',
  resurrected: 'bg-amber-300/10 text-amber-100',
};

export const incidentStateClass: Record<IncidentState, string> = {
  new: 'bg-slate-400/10 text-slate-200',
  queued: 'bg-amber-300/10 text-amber-100',
  reading: 'bg-violet-300/15 text-violet-100',
  diagnosed: 'bg-emerald-300/10 text-emerald-100',
  failed: 'bg-rose-300/10 text-rose-100',
};

export const diagnosisStateLabel: Record<IncidentState, string> = {
  new: 'Awaiting diagnosis',
  queued: 'Queued',
  reading: 'Reading',
  diagnosed: 'Diagnosed',
  failed: 'Diagnosis failed',
};

export function replaceOrPrepend(
  events: DebugEvent[],
  event: DebugEvent,
): DebugEvent[] {
  const index = events.findIndex((current) => current.id === event.id);
  return index === -1
    ? [event, ...events]
    : events.map((current) => (current.id === event.id ? event : current));
}

export function addToQueue(
  queue: DebugEvent[],
  event: DebugEvent,
): DebugEvent[] {
  const existing = queue.findIndex((item) => item.id === event.id);
  return existing === -1
    ? [...queue, event]
    : queue.map((item) => (item.id === event.id ? event : item));
}

export function lifecycleState(event: DebugEvent): IncidentStatus {
  return event.incidentStatus ?? 'active';
}

export function lifecycleLabel(event: DebugEvent): string {
  return lifecycleState(event) === 'resurrected'
    ? `Resurrected ×${event.resurrectionCount ?? 0}`
    : lifecycleState(event);
}

export function incidentState(
  event: DebugEvent,
  diagnosis: DiagnosisViewState | undefined,
  queue: DebugEvent[],
): IncidentState {
  if (diagnosis?.status === 'ready') return 'diagnosed';
  if (diagnosis?.status === 'error') return 'failed';
  if (diagnosis?.status === 'loading') return 'reading';
  return queue.some((item) => item.id === event.id) ? 'queued' : 'new';
}

export function eventLabel(type: DebugEvent['type']): string {
  return type.replaceAll('-', ' ');
}

export function incidentSource(event: DebugEvent): string {
  if (event.request)
    return `${event.request.method} · ${event.request.status ?? 'No response'}`;
  if (event.source?.url)
    return event.source.url.split('/').at(-1) || event.source.url;
  return 'Browser runtime';
}
