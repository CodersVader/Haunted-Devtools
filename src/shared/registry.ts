import type { DebugEvent, PersistedDiagnosis } from "./events";

export const registryStorageKey = "haunted-error-registry-v1";
export const registryVersion = 2;

export type RegistrySite = {
  id: string;
  kind: "website" | "local-project";
  origin: string;
  label: string;
  createdAt: number;
  updatedAt: number;
};

export type ErrorRegistry = {
  version: typeof registryVersion;
  sites: RegistrySite[];
  eventsBySite: Record<string, DebugEvent[]>;
};

export function emptyRegistry(): ErrorRegistry {
  return { version: registryVersion, sites: [], eventsBySite: {} };
}

export function isLocalOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

export function normalizeOrigin(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function validSite(value: unknown): value is RegistrySite {
  if (!value || typeof value !== "object") return false;
  const site = value as Partial<RegistrySite>;
  return typeof site.id === "string" && (site.kind === "website" || site.kind === "local-project") && typeof site.origin === "string" && typeof site.label === "string" && typeof site.createdAt === "number" && typeof site.updatedAt === "number";
}

function validEvent(value: unknown): value is DebugEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<DebugEvent>;
  return typeof event.id === "string" && typeof event.type === "string" && typeof event.timestamp === "number" && typeof event.severity === "string" && typeof event.title === "string" && typeof event.message === "string" && typeof event.fingerprint === "string" && typeof event.occurrences === "number";
}

export function parseRegistry(value: unknown): ErrorRegistry {
  if (!value || typeof value !== "object") return emptyRegistry();
  const candidate = value as Partial<ErrorRegistry>;
  const storedVersion = (candidate as { version?: number }).version;
  if ((storedVersion !== 1 && storedVersion !== registryVersion) || !Array.isArray(candidate.sites) || !candidate.eventsBySite || typeof candidate.eventsBySite !== "object") return emptyRegistry();
  const sites = candidate.sites.filter(validSite);
  const siteIds = new Set(sites.map((site) => site.id));
  const eventsBySite: Record<string, DebugEvent[]> = {};
  for (const [siteId, events] of Object.entries(candidate.eventsBySite)) {
    if (siteIds.has(siteId) && Array.isArray(events)) eventsBySite[siteId] = events.filter(validEvent).map((event) => ({
      ...event,
      incidentStatus: event.incidentStatus === "exorcised" || event.incidentStatus === "resurrected" ? event.incidentStatus : "active",
      resurrectionCount: typeof event.resurrectionCount === "number" && event.resurrectionCount >= 0 ? event.resurrectionCount : 0,
    }));
  }
  return { version: registryVersion, sites, eventsBySite };
}

export function ensureWebsite(registry: ErrorRegistry, origin: string, now = Date.now()): RegistrySite {
  const id = `website:${origin}`;
  const existing = registry.sites.find((site) => site.id === id);
  if (existing) return existing;
  const site: RegistrySite = { id, kind: "website", origin, label: origin, createdAt: now, updatedAt: now };
  registry.sites.push(site);
  registry.eventsBySite[id] = [];
  return site;
}

export function createLocalProject(registry: ErrorRegistry, origin: string, label: string, now = Date.now(), id = `local:${crypto.randomUUID()}`): RegistrySite {
  const site: RegistrySite = { id, kind: "local-project", origin, label, createdAt: now, updatedAt: now };
  registry.sites.push(site);
  registry.eventsBySite[id] = [];
  return site;
}

export function listEvents(registry: ErrorRegistry, siteId: string): DebugEvent[] {
  return (registry.eventsBySite[siteId] ?? []).filter((event) => event.incidentStatus === "exorcised").sort((left, right) => (right.lastSeenAt ?? right.timestamp) - (left.lastSeenAt ?? left.timestamp));
}

export function findArchivedEvent(registry: ErrorRegistry, siteId: string, fingerprint: string): DebugEvent | null {
  return registry.eventsBySite[siteId]?.find((event) => event.fingerprint === fingerprint && event.incidentStatus === "exorcised") ?? null;
}

export function commitExorcised(registry: ErrorRegistry, siteId: string, liveEvent: DebugEvent, now = Date.now()): DebugEvent | null {
  const site = registry.sites.find((item) => item.id === siteId);
  if (!site) return null;
  const events = registry.eventsBySite[siteId] ?? (registry.eventsBySite[siteId] = []);
  const index = events.findIndex((event) => event.fingerprint === liveEvent.fingerprint);
  const existing = index === -1 ? undefined : events[index];
  const committed: DebugEvent = {
    ...(existing ?? liveEvent),
    ...liveEvent,
    id: existing?.id ?? liveEvent.id,
    occurrences: existing?.occurrences ?? 1,
    firstSeenAt: existing?.firstSeenAt ?? liveEvent.firstSeenAt ?? liveEvent.timestamp,
    lastSeenAt: liveEvent.lastSeenAt ?? liveEvent.timestamp,
    diagnosis: liveEvent.diagnosis ?? existing?.diagnosis,
    incidentStatus: "exorcised",
    resurrectionCount: liveEvent.incidentStatus === "resurrected" ? liveEvent.resurrectionCount ?? 1 : existing?.resurrectionCount ?? 0,
    exorcisedAt: now,
    resurrectedAt: liveEvent.resurrectedAt ?? existing?.resurrectedAt,
  };
  if (index === -1) events.push(committed); else events[index] = committed;
  site.updatedAt = Math.max(site.updatedAt, committed.lastSeenAt ?? now);
  return committed;
}

export function upsertEvent(registry: ErrorRegistry, siteId: string, event: DebugEvent): DebugEvent | null {
  const site = registry.sites.find((item) => item.id === siteId);
  if (!site) return null;
  const events = registry.eventsBySite[siteId] ?? (registry.eventsBySite[siteId] = []);
  const existingIndex = events.findIndex((item) => item.fingerprint === event.fingerprint);
  const observedAt = event.lastSeenAt ?? event.timestamp;
  site.updatedAt = Math.max(site.updatedAt, observedAt);
  if (existingIndex === -1) {
    const created = { ...event, occurrences: Math.max(1, event.occurrences), firstSeenAt: event.firstSeenAt ?? event.timestamp, lastSeenAt: observedAt, incidentStatus: "active" as const, resurrectionCount: 0 };
    events.push(created);
    return created;
  }
  const existing = events[existingIndex];
  const resurrected = existing.incidentStatus === "exorcised";
  const updated: DebugEvent = {
    ...existing,
    ...event,
    id: existing.id,
    // Raw browser repeats while a fix is still pending are not new recurrence attempts.
    occurrences: existing.occurrences,
    timestamp: Math.max(existing.timestamp, event.timestamp),
    firstSeenAt: existing.firstSeenAt ?? existing.timestamp,
    lastSeenAt: Math.max(existing.lastSeenAt ?? existing.timestamp, observedAt),
    diagnosis: existing.diagnosis,
    incidentStatus: resurrected ? "resurrected" : (existing.incidentStatus ?? "active"),
    resurrectionCount: (existing.resurrectionCount ?? 0) + (resurrected ? 1 : 0),
    exorcisedAt: existing.exorcisedAt,
    resurrectedAt: resurrected ? observedAt : existing.resurrectedAt,
  };
  events[existingIndex] = updated;
  return updated;
}

export function markExorcised(registry: ErrorRegistry, siteId: string, eventId: string, now = Date.now()): DebugEvent | null {
  const event = registry.eventsBySite[siteId]?.find((item) => item.id === eventId);
  if (!event) return null;
  event.incidentStatus = "exorcised";
  event.exorcisedAt = now;
  return event;
}

export function saveDiagnosis(registry: ErrorRegistry, siteId: string, eventId: string, diagnosis: PersistedDiagnosis): DebugEvent | null {
  const event = registry.eventsBySite[siteId]?.find((item) => item.id === eventId);
  if (!event) return null;
  event.diagnosis = diagnosis;
  return event;
}

export function clearSite(registry: ErrorRegistry, siteId: string): void {
  registry.eventsBySite[siteId] = [];
  const site = registry.sites.find((item) => item.id === siteId);
  if (site) site.updatedAt = Date.now();
}

export function clearAll(registry: ErrorRegistry): void {
  registry.sites = [];
  registry.eventsBySite = {};
}
