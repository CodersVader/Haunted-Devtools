import { describe, expect, it } from 'vitest';
import type { DebugEvent, DebugEventType } from './events';
import { networkFailureToEvent, sanitizeRequestUrl } from './network';
import { runtimePayloadToEvent } from './runtime';
import {
  clearAll,
  clearSite,
  commitExorcised,
  createLocalProject,
  emptyRegistry,
  ensureWebsite,
  findArchivedEvent,
  listEvents,
  markExorcised,
  parseRegistry,
  saveDiagnosis,
  upsertEvent,
} from './registry';
import { SessionEventStore } from './session-store';

describe('shared DebugEvent contract', () => {
  it('supports each MVP event type', () => {
    const supported: DebugEventType[] = [
      'runtime-error',
      'unhandled-rejection',
      'network-failure',
    ];
    const event: DebugEvent = {
      id: 'event-1',
      type: supported[0],
      timestamp: Date.now(),
      severity: 'high',
      title: 'Test error',
      message: 'A deterministic test event.',
      fingerprint: 'test-error',
      occurrences: 1,
    };

    expect(supported).toHaveLength(3);
    expect(event.type).toBe('runtime-error');
  });
});

describe('session event store', () => {
  it('groups matching event fingerprints while retaining the newest timestamp', () => {
    const store = new SessionEventStore();
    const first: DebugEvent = {
      id: 'first',
      type: 'network-failure',
      timestamp: 10,
      severity: 'medium',
      title: 'HTTP 404',
      message: 'A safe message',
      fingerprint: 'network:GET:https://example.test/missing:404',
      occurrences: 1,
    };

    store.add(first);
    const grouped = store.add({ ...first, id: 'second', timestamp: 20 });

    expect(grouped.id).toBe('first');
    expect(grouped.occurrences).toBe(2);
    expect(store.list()).toEqual([grouped]);
  });

  it('clears a session without persisting events', () => {
    const store = new SessionEventStore();
    store.add({
      id: 'event',
      type: 'runtime-error',
      timestamp: 1,
      severity: 'high',
      title: 'Runtime error',
      message: 'Safe text',
      fingerprint: 'runtime-error:safe',
      occurrences: 1,
    });

    store.clear();
    expect(store.list()).toEqual([]);
  });
});

describe('persistent site registry', () => {
  const event = (id: string, timestamp: number): DebugEvent => ({
    id,
    type: 'network-failure',
    timestamp,
    severity: 'medium',
    title: 'HTTP 404',
    message: 'GET https://api.example.test/missing returned 404.',
    fingerprint: 'network:GET:https://api.example.test/missing:404',
    occurrences: 1,
  });

  it('retains first and last occurrence while grouping only within one site', () => {
    const registry = emptyRegistry();
    const firstSite = ensureWebsite(registry, 'https://first.example.test', 1);
    const secondSite = ensureWebsite(
      registry,
      'https://second.example.test',
      1,
    );
    const grouped = upsertEvent(registry, firstSite.id, event('one', 10));
    const updated = upsertEvent(registry, firstSite.id, event('two', 20));
    upsertEvent(registry, secondSite.id, event('three', 20));

    expect(grouped?.firstSeenAt).toBe(10);
    expect(updated).toMatchObject({
      id: 'one',
      occurrences: 1,
      firstSeenAt: 10,
      lastSeenAt: 20,
      incidentStatus: 'active',
      resurrectionCount: 0,
    });
    expect(registry.eventsBySite[firstSite.id]).toHaveLength(1);
    expect(registry.eventsBySite[secondSite.id]).toHaveLength(1);
  });

  it('keeps distinct local projects even when they share an origin', () => {
    const registry = emptyRegistry();
    const alpha = createLocalProject(
      registry,
      'http://localhost:5173',
      'Alpha',
      1,
      'local:alpha',
    );
    const beta = createLocalProject(
      registry,
      'http://localhost:5173',
      'Beta',
      1,
      'local:beta',
    );
    upsertEvent(registry, alpha.id, event('alpha', 10));
    upsertEvent(registry, beta.id, event('beta', 10));

    expect(registry.eventsBySite[alpha.id][0].id).toBe('alpha');
    expect(registry.eventsBySite[beta.id][0].id).toBe('beta');
  });

  it('clears one site or the complete registry without affecting the other scope', () => {
    const registry = emptyRegistry();
    const first = ensureWebsite(registry, 'https://first.example.test');
    const second = ensureWebsite(registry, 'https://second.example.test');
    upsertEvent(registry, first.id, event('one', 1));
    upsertEvent(registry, second.id, event('two', 1));
    clearSite(registry, first.id);
    expect(registry.eventsBySite[first.id]).toEqual([]);
    expect(registry.eventsBySite[second.id]).toHaveLength(1);
    clearAll(registry);
    expect(registry.sites).toEqual([]);
  });

  it('retains a diagnosis when a grouped error occurs again', () => {
    const registry = emptyRegistry();
    const site = ensureWebsite(registry, 'https://example.test');
    upsertEvent(registry, site.id, event('one', 1));
    saveDiagnosis(registry, site.id, 'one', {
      status: 'error',
      error: 'Model unavailable',
      updatedAt: 2,
    });
    const updated = upsertEvent(registry, site.id, event('two', 3));
    expect(updated?.diagnosis).toMatchObject({
      status: 'error',
      error: 'Model unavailable',
    });
  });

  it('counts a returning error only after it is exorcised', () => {
    const registry = emptyRegistry();
    const site = ensureWebsite(registry, 'https://example.test');
    upsertEvent(registry, site.id, event('one', 1));
    const repeated = upsertEvent(registry, site.id, event('two', 2));
    expect(repeated).toMatchObject({
      incidentStatus: 'active',
      resurrectionCount: 0,
    });

    markExorcised(registry, site.id, 'one', 3);
    const resurrected = upsertEvent(registry, site.id, event('three', 4));
    expect(resurrected).toMatchObject({
      incidentStatus: 'resurrected',
      resurrectionCount: 1,
      exorcisedAt: 3,
      resurrectedAt: 4,
    });
    expect(upsertEvent(registry, site.id, event('four', 5))).toMatchObject({
      incidentStatus: 'resurrected',
      resurrectionCount: 1,
    });

    markExorcised(registry, site.id, 'one', 6);
    expect(upsertEvent(registry, site.id, event('five', 7))).toMatchObject({
      incidentStatus: 'resurrected',
      resurrectionCount: 2,
    });
  });

  it('migrates v1 groups into active lifecycle groups without losing their diagnosis', () => {
    const registry = parseRegistry({
      version: 1,
      sites: [
        {
          id: 'website:https://example.test',
          kind: 'website',
          origin: 'https://example.test',
          label: 'https://example.test',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      eventsBySite: {
        'website:https://example.test': [
          {
            ...event('one', 1),
            diagnosis: {
              status: 'error',
              error: 'Saved diagnosis',
              updatedAt: 1,
            },
          },
        ],
      },
    });
    expect(
      registry.eventsBySite['website:https://example.test'][0],
    ).toMatchObject({
      incidentStatus: 'active',
      resurrectionCount: 0,
      diagnosis: { error: 'Saved diagnosis' },
    });
  });

  it('exposes only exorcised groups in the archive', () => {
    const registry = emptyRegistry();
    const site = ensureWebsite(registry, 'https://example.test');
    const active = event('one', 1);
    upsertEvent(registry, site.id, active);
    expect(listEvents(registry, site.id)).toEqual([]);
    commitExorcised(registry, site.id, active, 2);
    expect(listEvents(registry, site.id)).toHaveLength(1);
    expect(findArchivedEvent(registry, site.id, active.fingerprint)?.id).toBe(
      'one',
    );
  });

  it('safely ignores malformed or legacy persisted state', () => {
    expect(parseRegistry({ version: 0, sites: [], eventsBySite: {} })).toEqual(
      emptyRegistry(),
    );
    expect(
      parseRegistry({
        version: 1,
        sites: [{ id: 'bad' }],
        eventsBySite: { bad: [{}] },
      }),
    ).toEqual(emptyRegistry());
  });
});

describe('runtime error normalization', () => {
  it('redacts query secrets from runtime-error evidence', () => {
    const event = runtimePayloadToEvent({
      type: 'runtime-error',
      message: 'Failed to load /profile?token=do-not-store',
      source: 'https://app.example.test/main.js?key=private',
      line: 42,
      column: 8,
      timestamp: 0,
    });

    expect(event.type).toBe('runtime-error');
    expect(event.message).not.toContain('do-not-store');
    expect(event.message).not.toContain('private');
    expect(event.source?.url).toContain('[REDACTED]');
  });
});

describe('network failure normalization', () => {
  it('strips query values before creating a failed-request event', () => {
    const event = networkFailureToEvent({
      startedDateTime: '2026-10-28T00:00:00.000Z',
      request: {
        method: 'GET',
        url: 'https://api.example.test/profile?token=do-not-store',
      },
      response: { status: 401, statusText: 'Unauthorized' },
    });

    expect(event?.request?.url).toBe('https://api.example.test/profile');
    expect(event?.message).not.toContain('do-not-store');
  });

  it('does not create events for successful requests', () => {
    const event = networkFailureToEvent({
      startedDateTime: '2026-10-28T00:00:00.000Z',
      request: { method: 'GET', url: 'https://api.example.test/healthy' },
      response: { status: 200, statusText: 'OK' },
    });

    expect(event).toBeNull();
  });

  it('uses the endpoint and status together as the network group fingerprint', () => {
    const input = {
      startedDateTime: '2026-10-28T00:00:00.000Z',
      request: { method: 'GET', url: 'https://api.example.test/profile' },
    };
    const unauthorized = networkFailureToEvent({
      ...input,
      response: { status: 401, statusText: 'Unauthorized' },
    });
    const missing = networkFailureToEvent({
      ...input,
      response: { status: 404, statusText: 'Not Found' },
    });

    expect(unauthorized?.fingerprint).not.toBe(missing?.fingerprint);
  });

  it('removes query data from malformed URLs too', () => {
    expect(sanitizeRequestUrl('not a URL?secret=value')).toBe('not a URL');
  });
});
