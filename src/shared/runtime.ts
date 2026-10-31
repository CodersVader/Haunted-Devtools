import type { DebugEvent } from './events';

export type RuntimeEventPayload = {
  type: 'runtime-error' | 'unhandled-rejection';
  message: string;
  source?: string;
  line?: number;
  column?: number;
  timestamp: number;
};

export type RuntimeEventMessage = {
  kind: 'haunted-runtime-event';
  payload: RuntimeEventPayload;
};

export type RuntimeBridgeReadyMessage = {
  kind: 'haunted-runtime-bridge-ready';
};

export type RuntimeExtensionMessage =
  | RuntimeEventMessage
  | RuntimeBridgeReadyMessage;

export function isRuntimeExtensionMessage(
  value: unknown,
): value is RuntimeExtensionMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as { kind?: unknown; payload?: unknown };
  if (message.kind === 'haunted-runtime-bridge-ready') return true;
  const payload = message.payload as Partial<RuntimeEventPayload> | undefined;
  return (
    message.kind === 'haunted-runtime-event' &&
    !!payload &&
    (payload.type === 'runtime-error' ||
      payload.type === 'unhandled-rejection') &&
    typeof payload.message === 'string' &&
    typeof payload.timestamp === 'number'
  );
}

function redactPotentialSecrets(value: string): string {
  return value
    .replace(
      /([?&](?:token|key|secret|password|authorization)=)[^\s&]+/gi,
      '$1[REDACTED]',
    )
    .replace(/(bearer\s+)[^\s]+/gi, '$1[REDACTED]')
    .slice(0, 2_000);
}

export function runtimePayloadToEvent(
  payload: RuntimeEventPayload,
): DebugEvent {
  const title =
    payload.type === 'runtime-error'
      ? 'Uncaught JavaScript error'
      : 'Unhandled Promise rejection';
  const source = payload.source
    ? redactPotentialSecrets(payload.source)
    : undefined;
  const location = source
    ? `${source}${payload.line ? `:${payload.line}${payload.column ? `:${payload.column}` : ''}` : ''}`
    : undefined;

  return {
    id: crypto.randomUUID(),
    type: payload.type,
    timestamp: payload.timestamp,
    severity: 'high',
    title,
    message: location
      ? `${redactPotentialSecrets(payload.message)} (${location})`
      : redactPotentialSecrets(payload.message),
    fingerprint: `${payload.type}:${redactPotentialSecrets(payload.message)}:${location ?? ''}`,
    occurrences: 1,
    source: location
      ? { url: source!, line: payload.line, column: payload.column }
      : undefined,
  };
}
