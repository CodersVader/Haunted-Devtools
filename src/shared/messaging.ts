import type { DebugEvent, PersistedDiagnosis } from './events';
import type { RegistrySite } from './registry';

export const panelPortName = 'haunted-devtools-panel';
export const devtoolsRuntimePortName = 'haunted-devtools-runtime';

export type PanelMessage =
  | {
      type: 'registry-state';
      events: DebugEvent[];
      liveEvents: DebugEvent[];
      sites: RegistrySite[];
      activeCaptureSite: RegistrySite | null;
      viewedSite: RegistrySite | null;
      localProjectOrigin?: string;
    }
  | {
      type: 'event-detected';
      event: DebugEvent;
      siteId: string;
      isNew: boolean;
    }
  | {
      type: 'runtime-bridge-status';
      status: 'attached' | 'unavailable';
      detail?: string;
    };

export type PanelCommand =
  | { type: 'select-site'; siteId: string }
  | { type: 'create-local-project'; label: string }
  | { type: 'select-local-project'; siteId: string }
  | { type: 'clear-site'; siteId: string }
  | { type: 'clear-all' }
  | {
      type: 'save-diagnosis';
      siteId: string;
      eventId: string;
      diagnosis: PersistedDiagnosis;
    }
  | { type: 'mark-exorcised'; siteId: string; eventId: string }
  | { type: 'set-active-model'; model: string | null };

export function isPanelMessage(value: unknown): value is PanelMessage {
  if (!value || typeof value !== 'object' || !('type' in value)) return false;
  return (
    value.type === 'registry-state' ||
    value.type === 'event-detected' ||
    value.type === 'runtime-bridge-status'
  );
}

export function isPanelCommand(value: unknown): value is PanelCommand {
  if (!value || typeof value !== 'object' || !('type' in value)) return false;
  if (
    value.type === 'select-site' ||
    value.type === 'select-local-project' ||
    value.type === 'clear-site'
  )
    return 'siteId' in value && typeof value.siteId === 'string';
  if (value.type === 'mark-exorcised')
    return (
      'siteId' in value &&
      typeof value.siteId === 'string' &&
      'eventId' in value &&
      typeof value.eventId === 'string'
    );
  if (value.type === 'create-local-project')
    return 'label' in value && typeof value.label === 'string';
  if (value.type === 'save-diagnosis')
    return (
      'siteId' in value &&
      typeof value.siteId === 'string' &&
      'eventId' in value &&
      typeof value.eventId === 'string' &&
      'diagnosis' in value
    );
  if (value.type === 'clear-all') return true;
  return (
    value.type === 'set-active-model' &&
    'model' in value &&
    (typeof value.model === 'string' || value.model === null)
  );
}
