import type { DebugEvent } from "./events";

export class SessionEventStore {
  private readonly eventsByFingerprint = new Map<string, DebugEvent>();

  add(event: DebugEvent): DebugEvent {
    const existing = this.eventsByFingerprint.get(event.fingerprint);
    if (!existing) {
      this.eventsByFingerprint.set(event.fingerprint, event);
      return event;
    }

    const updated: DebugEvent = {
      ...existing,
      ...event,
      id: existing.id,
      occurrences: existing.occurrences + 1,
      timestamp: Math.max(existing.timestamp, event.timestamp),
    };
    this.eventsByFingerprint.set(updated.fingerprint, updated);
    return updated;
  }

  list(): DebugEvent[] {
    return [...this.eventsByFingerprint.values()].sort((left, right) => right.timestamp - left.timestamp);
  }

  clear(): void {
    this.eventsByFingerprint.clear();
  }
}
