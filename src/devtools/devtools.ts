import { stopModel } from "../ai/ollama";
import type { DebugEvent } from "../shared/events";
import { devtoolsRuntimePortName, isPanelCommand, panelPortName, type PanelMessage } from "../shared/messaging";
import { networkFailureToEvent, type NetworkRequestInput } from "../shared/network";
import { isLocalOrigin, normalizeOrigin, type RegistrySite } from "../shared/registry";
import type { RegistryCommand, RegistryResponse } from "../shared/registry-messaging";
import { isRuntimeExtensionMessage, runtimePayloadToEvent } from "../shared/runtime";
import { SessionEventStore } from "../shared/session-store";

const panelTitle = "Haunted DevTools";
const panelPorts = new Set<chrome.runtime.Port>();
const pendingEvents: DebugEvent[] = [];
const liveEventStore = new SessionEventStore();
let liveEvents: DebugEvent[] = [];
const inspectedTabId = window.chrome.devtools.inspectedWindow.tabId;
let activeModel: string | null = null;
let activeCaptureSite: RegistrySite | null = null;
let viewedSiteId: string | null = null;
let localProjectOrigin: string | undefined;
let runtimePort: chrome.runtime.Port | null = null;
let runtimeBridgeStatus: Extract<PanelMessage, { type: "runtime-bridge-status" }> = { type: "runtime-bridge-status", status: "unavailable", detail: "Reload the inspected page to attach runtime listeners." };

window.chrome.devtools.panels.create(panelTitle, "icons/ghost-16.svg", "panel.html");

function registry(command: RegistryCommand): Promise<RegistryResponse> {
  return window.chrome.runtime.sendMessage(command) as Promise<RegistryResponse>;
}

function watchInspectedTab(): void {
  try { runtimePort?.postMessage({ type: "watch-inspected-tab", tabId: inspectedTabId }); } catch { /* reconnect restores it */ }
}

function connectRuntimePort(): void {
  const port = window.chrome.runtime.connect({ name: devtoolsRuntimePortName });
  runtimePort = port;
  port.onMessage.addListener((message: unknown) => {
    if (!isRuntimeExtensionMessage(message)) return;
    if (message.kind === "haunted-runtime-bridge-ready") {
      runtimeBridgeStatus = { type: "runtime-bridge-status", status: "attached" };
      broadcast(runtimeBridgeStatus);
    } else recordEvent(runtimePayloadToEvent(message.payload));
  });
  port.onDisconnect.addListener(() => {
    if (runtimePort === port) runtimePort = null;
    window.setTimeout(connectRuntimePort, 500);
  });
  watchInspectedTab();
}

connectRuntimePort();
const runtimeHeartbeat = window.setInterval(watchInspectedTab, 20_000);
void initialize();

window.chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== panelPortName) return;
  panelPorts.add(port);
  void broadcastRegistryState(port);
  postToPanel(port, runtimeBridgeStatus);
  port.onMessage.addListener((message: unknown) => {
    if (!isPanelCommand(message)) return;
    if (message.type === "set-active-model") { activeModel = message.model; return; }
    if (message.type === "select-site") { viewedSiteId = message.siteId; void broadcastRegistryState(); return; }
    if (message.type === "select-local-project") { void selectLocalProject(message.siteId); return; }
    if (message.type === "create-local-project") { void createAndSelectLocalProject(message.label); return; }
    if (message.type === "clear-site") { void clearRegistrySite(message.siteId); return; }
    if (message.type === "clear-all") void clearEntireRegistry();
    if (message.type === "save-diagnosis") {
      const liveEvent = activeCaptureSite?.id === message.siteId ? liveEventStore.getById(message.eventId) : undefined;
      if (liveEvent) {
        liveEventStore.update({ ...liveEvent, diagnosis: message.diagnosis });
        liveEvents = liveEventStore.list();
        broadcast({ type: "event-detected", event: { ...liveEvent, diagnosis: message.diagnosis }, siteId: message.siteId, isNew: false });
      } else void registry({ kind: "haunted-registry", action: "save-diagnosis", siteId: message.siteId, eventId: message.eventId, diagnosis: message.diagnosis });
    }
    if (message.type === "mark-exorcised") void markIncidentExorcised(message.siteId, message.eventId);
  });
  port.onDisconnect.addListener(() => panelPorts.delete(port));
});

window.addEventListener("unload", () => {
  window.clearInterval(runtimeHeartbeat);
  runtimePort?.disconnect();
  if (activeModel) void stopModel(activeModel);
});

window.chrome.devtools.network.onRequestFinished.addListener((request) => recordNetworkRequest(request as NetworkRequestInput));
window.chrome.devtools.network.onNavigated.addListener((url) => {
  runtimeBridgeStatus = { type: "runtime-bridge-status", status: "unavailable", detail: "Waiting for the runtime bridge…" };
  broadcast(runtimeBridgeStatus);
  watchInspectedTab();
  void configureCaptureSite(url);
});

async function initialize(): Promise<void> {
  await configureCaptureSite(await inspectedUrl());
  await hydrateNetworkSession();
}

function inspectedUrl(): Promise<string> {
  return new Promise((resolve) => window.chrome.devtools.inspectedWindow.eval("location.href", (value, exception) => resolve(exception?.isException || typeof value !== "string" ? "" : value)));
}

async function configureCaptureSite(url: string): Promise<void> {
  // Buffered incidents have no trustworthy project assignment if an unassigned local
  // page is left before the user chooses one; never attribute them to the next site.
  if (localProjectOrigin && !activeCaptureSite) pendingEvents.splice(0);
  const origin = normalizeOrigin(url);
  liveEventStore.clear();
  liveEvents = [];
  activeCaptureSite = null;
  localProjectOrigin = undefined;
  if (!origin) { await broadcastRegistryState(); return; }
  if (isLocalOrigin(origin)) {
    localProjectOrigin = origin;
    await broadcastRegistryState();
    return;
  }
  const response = await registry({ kind: "haunted-registry", action: "ensure-website", origin });
  if (!response.ok || !response.site) return;
  activeCaptureSite = response.site;
  viewedSiteId = response.site.id;
  await flushPendingEvents();
  await broadcastRegistryState();
}

async function selectLocalProject(siteId: string): Promise<void> {
  if (!localProjectOrigin) return;
  const response = await registry({ kind: "haunted-registry", action: "list-sites" });
  const site = response.ok ? response.sites?.find((item) => item.id === siteId && item.kind === "local-project" && item.origin === localProjectOrigin) : undefined;
  if (!site) return;
  activeCaptureSite = site;
  viewedSiteId = site.id;
  await flushPendingEvents();
  await broadcastRegistryState();
}

async function createAndSelectLocalProject(label: string): Promise<void> {
  if (!localProjectOrigin || !label.trim()) return;
  const response = await registry({ kind: "haunted-registry", action: "create-local-project", origin: localProjectOrigin, label });
  if (!response.ok || !response.site) return;
  activeCaptureSite = response.site;
  viewedSiteId = response.site.id;
  await flushPendingEvents();
  await broadcastRegistryState();
}

async function hydrateNetworkSession(): Promise<void> {
  try { (await window.chrome.devtools.network.getHAR()).entries.forEach((request) => recordNetworkRequest(request as NetworkRequestInput)); }
  catch (error) { console.warn("Haunted DevTools could not read the current network session.", error); }
}

function recordNetworkRequest(request: NetworkRequestInput): void {
  const event = networkFailureToEvent(request);
  if (event) recordEvent(event);
}

function recordEvent(event: DebugEvent): void {
  if (!activeCaptureSite) { pendingEvents.push(event); return; }
  void recordLiveEvent(activeCaptureSite.id, event);
}

async function flushPendingEvents(): Promise<void> {
  if (!activeCaptureSite) return;
  for (const event of pendingEvents.splice(0)) await recordLiveEvent(activeCaptureSite.id, event);
}

async function recordLiveEvent(siteId: string, event: DebugEvent): Promise<void> {
  const alreadyGrouped = liveEventStore.getByFingerprint(event.fingerprint);
  if (alreadyGrouped) {
    const grouped = liveEventStore.add(event);
    liveEvents = liveEventStore.list();
    broadcast({ type: "event-detected", event: grouped, siteId, isNew: false });
    return;
  }
  const archived = await registry({ kind: "haunted-registry", action: "find-archived-event", siteId, fingerprint: event.fingerprint });
  if (activeCaptureSite?.id !== siteId) return;
  const groupAfterLookup = liveEventStore.getByFingerprint(event.fingerprint);
  if (groupAfterLookup) {
    const grouped = liveEventStore.add(event);
    liveEvents = liveEventStore.list();
    broadcast({ type: "event-detected", event: grouped, siteId, isNew: false });
    return;
  }
  const seeded = archived.ok && archived.event ? {
    ...archived.event,
    id: event.id,
    timestamp: event.timestamp,
    firstSeenAt: event.timestamp,
    lastSeenAt: event.timestamp,
    occurrences: 1,
    incidentStatus: "resurrected" as const,
    resurrectionCount: (archived.event.resurrectionCount ?? 0) + 1,
    resurrectedAt: event.timestamp,
  } : { ...event, incidentStatus: "active" as const, resurrectionCount: 0, firstSeenAt: event.timestamp, lastSeenAt: event.timestamp };
  const grouped = liveEventStore.add(seeded);
  liveEvents = liveEventStore.list();
  broadcast({ type: "event-detected", event: grouped, siteId, isNew: !grouped.diagnosis });
}

async function markIncidentExorcised(siteId: string, eventId: string): Promise<void> {
  const liveEvent = activeCaptureSite?.id === siteId ? liveEventStore.getById(eventId) : undefined;
  if (liveEvent) {
    const response = await registry({ kind: "haunted-registry", action: "commit-exorcised", siteId, event: liveEvent });
    if (!response.ok) return;
    liveEventStore.remove(eventId);
    liveEvents = liveEventStore.list();
    await broadcastRegistryState();
    return;
  }
  const response = await registry({ kind: "haunted-registry", action: "mark-exorcised", siteId, eventId });
  if (response.ok && response.event) broadcast({ type: "event-detected", event: response.event, siteId, isNew: false });
}

async function clearRegistrySite(siteId: string): Promise<void> {
  await registry({ kind: "haunted-registry", action: "clear-site", siteId });
  await broadcastRegistryState();
}

async function clearEntireRegistry(): Promise<void> {
  const previousCaptureSite = activeCaptureSite;
  await registry({ kind: "haunted-registry", action: "clear-all" });
  if (previousCaptureSite?.kind === "website") {
    const response = await registry({ kind: "haunted-registry", action: "ensure-website", origin: previousCaptureSite.origin });
    activeCaptureSite = response.ok ? response.site ?? null : null;
    viewedSiteId = activeCaptureSite?.id ?? null;
  } else {
    activeCaptureSite = null;
    viewedSiteId = null;
  }
  await broadcastRegistryState();
}

async function broadcastRegistryState(target?: chrome.runtime.Port): Promise<void> {
  const sitesResponse = await registry({ kind: "haunted-registry", action: "list-sites" });
  const sites = sitesResponse.ok ? sitesResponse.sites ?? [] : [];
  const viewedSite = sites.find((site) => site.id === viewedSiteId) ?? null;
  const eventsResponse = viewedSite ? await registry({ kind: "haunted-registry", action: "list-events", siteId: viewedSite.id }) : null;
  const state: PanelMessage = { type: "registry-state", sites, events: eventsResponse?.ok ? eventsResponse.events ?? [] : [], liveEvents, activeCaptureSite, viewedSite, localProjectOrigin };
  if (target) postToPanel(target, state); else broadcast(state);
}

function broadcast(message: PanelMessage): void { for (const port of panelPorts) postToPanel(port, message); }
function postToPanel(port: chrome.runtime.Port, message: PanelMessage): void { try { port.postMessage(message); } catch { panelPorts.delete(port); } }
