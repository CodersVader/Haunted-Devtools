import type { DebugEvent, PersistedDiagnosis } from './events';
import type { RegistrySite } from './registry';

export type RegistryCommand =
  | { kind: 'haunted-registry'; action: 'ensure-website'; origin: string }
  | { kind: 'haunted-registry'; action: 'list-sites' }
  | { kind: 'haunted-registry'; action: 'list-events'; siteId: string }
  | {
      kind: 'haunted-registry';
      action: 'create-local-project';
      origin: string;
      label: string;
    }
  | {
      kind: 'haunted-registry';
      action: 'upsert-event';
      siteId: string;
      event: DebugEvent;
    }
  | {
      kind: 'haunted-registry';
      action: 'find-archived-event';
      siteId: string;
      fingerprint: string;
    }
  | {
      kind: 'haunted-registry';
      action: 'commit-exorcised';
      siteId: string;
      event: DebugEvent;
    }
  | {
      kind: 'haunted-registry';
      action: 'save-diagnosis';
      siteId: string;
      eventId: string;
      diagnosis: PersistedDiagnosis;
    }
  | {
      kind: 'haunted-registry';
      action: 'mark-exorcised';
      siteId: string;
      eventId: string;
    }
  | { kind: 'haunted-registry'; action: 'clear-site'; siteId: string }
  | { kind: 'haunted-registry'; action: 'clear-all' };

export type RegistryResponse =
  | {
      ok: true;
      sites?: RegistrySite[];
      site?: RegistrySite;
      events?: DebugEvent[];
      event?: DebugEvent | null;
    }
  | { ok: false; error: string };

export function isRegistryCommand(value: unknown): value is RegistryCommand {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  if (command.kind !== 'haunted-registry') return false;
  if (command.action === 'list-sites' || command.action === 'clear-all')
    return true;
  if (command.action === 'ensure-website')
    return typeof command.origin === 'string';
  if (command.action === 'list-events' || command.action === 'clear-site')
    return typeof command.siteId === 'string';
  if (command.action === 'mark-exorcised')
    return (
      typeof command.siteId === 'string' && typeof command.eventId === 'string'
    );
  if (command.action === 'find-archived-event')
    return (
      typeof command.siteId === 'string' &&
      typeof command.fingerprint === 'string'
    );
  if (command.action === 'commit-exorcised')
    return (
      typeof command.siteId === 'string' &&
      !!command.event &&
      typeof command.event === 'object'
    );
  if (command.action === 'create-local-project')
    return (
      typeof command.origin === 'string' && typeof command.label === 'string'
    );
  if (command.action === 'upsert-event')
    return (
      typeof command.siteId === 'string' &&
      !!command.event &&
      typeof command.event === 'object'
    );
  return (
    command.action === 'save-diagnosis' &&
    typeof command.siteId === 'string' &&
    typeof command.eventId === 'string' &&
    !!command.diagnosis &&
    typeof command.diagnosis === 'object'
  );
}
