import type { DebugEvent } from './events';

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
      firstSeenAt: existing.firstSeenAt ?? existing.timestamp,
      lastSeenAt: Math.max(
        existing.lastSeenAt ?? existing.timestamp,
        event.lastSeenAt ?? event.timestamp,
      ),
    };
    this.eventsByFingerprint.set(updated.fingerprint, updated);
    return updated;
  }

  list(): DebugEvent[] {
    return [...this.eventsByFingerprint.values()].sort(
      (left, right) => right.timestamp - left.timestamp,
    );
  }

  getByFingerprint(fingerprint: string): DebugEvent | undefined {
    return this.eventsByFingerprint.get(fingerprint);
  }

  getById(id: string): DebugEvent | undefined {
    return [...this.eventsByFingerprint.values()].find(
      (event) => event.id === id,
    );
  }

  update(event: DebugEvent): DebugEvent | null {
    const existing = this.eventsByFingerprint.get(event.fingerprint);
    if (!existing || existing.id !== event.id) return null;
    this.eventsByFingerprint.set(event.fingerprint, event);
    return event;
  }

  remove(eventId: string): void {
    for (const [fingerprint, event] of this.eventsByFingerprint) {
      if (event.id === eventId) this.eventsByFingerprint.delete(fingerprint);
    }
  }

  clear(): void {
    this.eventsByFingerprint.clear();
  }
}
