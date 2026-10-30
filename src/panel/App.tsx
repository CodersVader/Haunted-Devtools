import { useEffect, useRef, useState } from "react";
import { defaultModelId, modelSelectionStorageKey, supportedModels, type ModelConfig } from "../ai/models";
import { diagnoseEvent, listInstalledModelNames, listLoadedModelNames, startModel, stopModel } from "../ai/ollama";
import type { DiagnosisResult } from "../ai/diagnosis";
import { decorateGhostCommentary, ghostPersonalities, ghostPersonalityStorageKey, type GhostPersonality } from "./personality";
import { type DebugEvent, type IncidentStatus } from "../shared/events";
import { isPanelMessage, panelPortName } from "../shared/messaging";
import type { RegistrySite } from "../shared/registry";

function replaceOrPrepend(events: DebugEvent[], event: DebugEvent): DebugEvent[] {
  const index = events.findIndex((current) => current.id === event.id);
  if (index === -1) return [event, ...events];
  return events.map((current) => (current.id === event.id ? event : current));
}

function eventLabel(type: DebugEvent["type"]): string {
  return type.replaceAll("-", " ");
}

type DiagnosisViewState = {
  eventId: string;
  status: "loading" | "ready" | "error";
  result?: DiagnosisResult;
  error?: string;
};

type IncidentState = "new" | "queued" | "reading" | "diagnosed" | "failed";

function lifecycleState(event: DebugEvent): IncidentStatus {
  return event.incidentStatus ?? "active";
}

function lifecycleLabel(event: DebugEvent): string {
  if (lifecycleState(event) === "resurrected") return `Resurrected ×${event.resurrectionCount ?? 0}`;
  return lifecycleState(event);
}

const lifecycleClass: Record<IncidentStatus, string> = {
  active: "bg-rose-300/10 text-rose-100",
  exorcised: "bg-emerald-300/10 text-emerald-100",
  resurrected: "bg-amber-300/10 text-amber-100",
};

function incidentState(event: DebugEvent, diagnosis: DiagnosisViewState | undefined, queue: DebugEvent[]): IncidentState {
  if (diagnosis?.status === "ready") return "diagnosed";
  if (diagnosis?.status === "error") return "failed";
  if (diagnosis?.status === "loading") return "reading";
  if (queue.some((item) => item.id === event.id)) return "queued";
  return "new";
}

function incidentSource(event: DebugEvent): string {
  if (event.request) return `${event.request.method} · ${event.request.status ?? "No response"}`;
  if (event.source?.url) return event.source.url.split("/").at(-1) || event.source.url;
  return "Browser runtime";
}

const incidentStateClass: Record<IncidentState, string> = {
  new: "bg-slate-400/10 text-slate-200",
  queued: "bg-amber-300/10 text-amber-100",
  reading: "bg-violet-300/15 text-violet-100",
  diagnosed: "bg-emerald-300/10 text-emerald-100",
  failed: "bg-rose-300/10 text-rose-100",
};

const diagnosisStateLabel: Record<IncidentState, string> = {
  new: "Awaiting diagnosis",
  queued: "Queued",
  reading: "Reading",
  diagnosed: "Diagnosed",
  failed: "Diagnosis failed",
};

function addToQueue(queue: DebugEvent[], event: DebugEvent): DebugEvent[] {
  const existing = queue.findIndex((item) => item.id === event.id);
  if (existing === -1) return [...queue, event];
  return queue.map((item) => (item.id === event.id ? event : item));
}

export function App() {
  const [archiveEvents, setArchiveEvents] = useState<DebugEvent[]>([]);
  const [liveEvents, setLiveEvents] = useState<DebugEvent[]>([]);
  const [viewMode, setViewMode] = useState<"live" | "archive">("live");
  const [archiveStep, setArchiveStep] = useState<"sites" | "groups" | "case">("sites");
  const [sites, setSites] = useState<RegistrySite[]>([]);
  const [activeCaptureSite, setActiveCaptureSite] = useState<RegistrySite | null>(null);
  const [viewedSite, setViewedSite] = useState<RegistrySite | null>(null);
  const [localProjectOrigin, setLocalProjectOrigin] = useState<string | undefined>();
  const [localProjectLabel, setLocalProjectLabel] = useState("");
  const panelPortRef = useRef<chrome.runtime.Port | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(true);
  const [runtimeBridge, setRuntimeBridge] = useState<{ status: "attached" | "unavailable"; detail?: string }>({
    status: "unavailable",
    detail: "Awaiting bridge status…",
  });
  const [selectedModelId, setSelectedModelId] = useState<ModelConfig["id"]>(defaultModelId);
  const [installedModels, setInstalledModels] = useState<Set<string>>(new Set());
  const [ollamaStatus, setOllamaStatus] = useState<"checking" | "online" | "offline">("checking");
  const [modelAction, setModelAction] = useState<"starting" | "stopping" | null>(null);
  const [modelNotice, setModelNotice] = useState<string | null>(null);
  const [activeModelId, setActiveModelId] = useState<ModelConfig["id"] | null>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [diagnoses, setDiagnoses] = useState<Record<string, DiagnosisViewState>>({});
  const [diagnosisQueue, setDiagnosisQueue] = useState<DebugEvent[]>([]);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [personality, setPersonality] = useState<GhostPersonality>("spooky");
  const modelActiveRef = useRef(false);
  const diagnosedEventIdsRef = useRef(new Set<string>());
  const activeCaptureSiteIdRef = useRef<string | null>(null);
  const viewedSiteIdRef = useRef<string | null>(null);
  const viewModeRef = useRef<"live" | "archive">("live");

  useEffect(() => {
    const port = window.chrome.runtime.connect({ name: panelPortName });
    panelPortRef.current = port;
    port.onMessage.addListener((message: unknown) => {
      if (!isPanelMessage(message)) return;
      if (message.type === "registry-state") {
        setArchiveEvents(message.events);
        setLiveEvents(message.liveEvents);
        setSites(message.sites);
        setActiveCaptureSite(message.activeCaptureSite);
        setViewedSite(message.viewedSite);
        activeCaptureSiteIdRef.current = message.activeCaptureSite?.id ?? null;
        viewedSiteIdRef.current = message.viewedSite?.id ?? null;
        setLocalProjectOrigin(message.localProjectOrigin);
        const visibleEvents = viewModeRef.current === "live" ? message.liveEvents : message.events;
        setSelectedEventId((selected) => (visibleEvents.some((event) => event.id === selected) ? selected : (visibleEvents[0]?.id ?? null)));
        const restored = Object.fromEntries([...message.events, ...message.liveEvents].flatMap((event) => event.diagnosis ? [[event.id, { eventId: event.id, status: event.diagnosis.status, result: event.diagnosis.result, error: event.diagnosis.error } satisfies DiagnosisViewState]] : []));
        setDiagnoses(restored);
        setDiagnosisQueue([]);
        diagnosedEventIdsRef.current = new Set([...message.events, ...message.liveEvents].filter((event) => !!event.diagnosis).map((event) => event.id));
      }
      if (message.type === "event-detected") {
        if (message.siteId === activeCaptureSiteIdRef.current) setLiveEvents((current) => replaceOrPrepend(current, message.event));
        if (message.siteId === viewedSiteIdRef.current) setArchiveEvents((current) => replaceOrPrepend(current, message.event));
        if (viewModeRef.current === "live" && message.siteId === activeCaptureSiteIdRef.current) setSelectedEventId(message.event.id);
        if (viewModeRef.current === "archive" && message.siteId === viewedSiteIdRef.current) setSelectedEventId(message.event.id);
        if (message.event.diagnosis) setDiagnoses((current) => ({ ...current, [message.event.id]: { eventId: message.event.id, status: message.event.diagnosis!.status, result: message.event.diagnosis!.result, error: message.event.diagnosis!.error } }));
        if (message.isNew && modelActiveRef.current && !message.event.diagnosis && !diagnosedEventIdsRef.current.has(message.event.id)) setDiagnosisQueue((queue) => addToQueue(queue, message.event));
      }
      if (message.type === "runtime-bridge-status") setRuntimeBridge(message);
    });
    port.onDisconnect.addListener(() => setIsConnected(false));

    return () => {
      panelPortRef.current = null;
      port.disconnect();
    };
  }, []);

  useEffect(() => {
    void (async () => {
      const stored = await window.chrome.storage.local.get(modelSelectionStorageKey);
      const savedModel = stored[modelSelectionStorageKey];
      if (supportedModels.some((model) => model.id === savedModel)) setSelectedModelId(savedModel as ModelConfig["id"]);
      const savedPersonality = stored[ghostPersonalityStorageKey];
      if (ghostPersonalities.some((voice) => voice.id === savedPersonality)) setPersonality(savedPersonality as GhostPersonality);
      await refreshOllama(true);
    })();
  }, []);

  const events = viewMode === "live" ? liveEvents : archiveEvents;
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? events[0] ?? null;
  const selectedModel = supportedModels.find((model) => model.id === selectedModelId)!;
  const selectedModelInstalled = installedModels.has(selectedModelId);
  const modelIsActive = activeModelId === selectedModelId;
  const selectedPersonality = ghostPersonalities.find((voice) => voice.id === personality)!;
  const selectedDiagnosis = selectedEvent ? diagnoses[selectedEvent.id] : undefined;
  const incidentCounts = events.reduce<Record<IncidentState, number>>((counts, event) => {
    counts[incidentState(event, diagnoses[event.id], diagnosisQueue)] += 1;
    return counts;
  }, { new: 0, queued: 0, reading: 0, diagnosed: 0, failed: 0 });

  useEffect(() => {
    modelActiveRef.current = activeModelId !== null;
  }, [activeModelId]);

  useEffect(() => {
    if (!modelIsActive || isDiagnosing || diagnosisQueue.length === 0) return;
    const event = diagnosisQueue[0];
    const timer = globalThis.setTimeout(() => {
      setIsDiagnosing(true);
      setDiagnoses((current) => ({ ...current, [event.id]: { eventId: event.id, status: "loading" } }));
      void diagnoseEvent(event, selectedModel, personality)
        .then((result) => {
          diagnosedEventIdsRef.current.add(event.id);
          setDiagnoses((current) => ({ ...current, [event.id]: { eventId: event.id, status: "ready", result } }));
          if (activeCaptureSite) panelPortRef.current?.postMessage({ type: "save-diagnosis", siteId: activeCaptureSite.id, eventId: event.id, diagnosis: { status: "ready", result, updatedAt: Date.now() } });
        })
        .catch((error: unknown) => {
          diagnosedEventIdsRef.current.add(event.id);
          const message = error instanceof Error ? error.message : "The local model could not create a diagnosis.";
          setDiagnoses((current) => ({ ...current, [event.id]: { eventId: event.id, status: "error", error: message } }));
          if (activeCaptureSite) panelPortRef.current?.postMessage({ type: "save-diagnosis", siteId: activeCaptureSite.id, eventId: event.id, diagnosis: { status: "error", error: message, updatedAt: Date.now() } });
        })
        .finally(() => {
          setDiagnosisQueue((queue) => queue.filter((queuedEvent) => queuedEvent.id !== event.id));
          setIsDiagnosing(false);
        });
    }, 0);
    return () => globalThis.clearTimeout(timer);
  }, [activeCaptureSite, diagnosisQueue, isDiagnosing, modelIsActive, personality, selectedModel]);

  function clearSite(): void {
    if (!viewedSite || !window.confirm(`Clear every saved error for ${viewedSite.label}?`)) return;
    panelPortRef.current?.postMessage({ type: "clear-site", siteId: viewedSite.id });
  }

  function clearAll(): void {
    if (!window.confirm("Clear all saved sites, local project labels, errors, and diagnoses?")) return;
    panelPortRef.current?.postMessage({ type: "clear-all" });
  }

  function createLocalProject(): void {
    const label = localProjectLabel.trim();
    if (!label) return;
    panelPortRef.current?.postMessage({ type: "create-local-project", label });
    setLocalProjectLabel("");
  }

  function markExorcised(): void {
    const site = viewMode === "live" ? activeCaptureSite : viewedSite;
    if (!site || !selectedEvent || lifecycleState(selectedEvent) === "exorcised") return;
    panelPortRef.current?.postMessage({ type: "mark-exorcised", siteId: site.id, eventId: selectedEvent.id });
  }

  function openLiveFeed(): void {
    setViewMode("live");
    viewModeRef.current = "live";
    setSelectedEventId(liveEvents[0]?.id ?? null);
  }

  function openArchive(): void {
    setViewMode("archive");
    viewModeRef.current = "archive";
    setArchiveStep("sites");
    setSelectedEventId(null);
  }

  function openArchiveSite(siteId: string): void {
    panelPortRef.current?.postMessage({ type: "select-site", siteId });
    setArchiveStep("groups");
  }

  async function copySuggestedFix(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setModelNotice("Suggested fix copied to the clipboard.");
    } catch {
      setModelNotice("Could not copy the suggested fix. Select and copy it manually.");
    }
  }

  async function refreshOllama(revealWhenInactive = false): Promise<void> {
    setOllamaStatus("checking");
    try {
      const [installed, loaded] = await Promise.all([listInstalledModelNames(), listLoadedModelNames()]);
      setInstalledModels(installed);
      setOllamaStatus("online");
      const active = supportedModels.find((model) => loaded.has(model.id))?.id ?? null;
      setActiveModelId(active);
      if (revealWhenInactive) setModelMenuOpen(active === null);
    } catch (error) {
      setInstalledModels(new Set());
      setOllamaStatus("offline");
      setActiveModelId(null);
      setModelMenuOpen(true);
      setModelNotice(error instanceof Error ? error.message : "Ollama is unavailable.");
    }
  }

  async function selectModel(modelId: ModelConfig["id"]): Promise<void> {
    setSelectedModelId(modelId);
    setModelNotice(null);
    await window.chrome.storage.local.set({ [modelSelectionStorageKey]: modelId });
  }

  async function selectPersonality(next: GhostPersonality): Promise<void> {
    setPersonality(next);
    await window.chrome.storage.local.set({ [ghostPersonalityStorageKey]: next });
  }

  async function changeModelState(): Promise<void> {
    const action = activeModelId === selectedModelId ? "stopping" : "starting";
    setModelAction(action);
    setModelNotice(null);
    try {
      if (action === "starting") {
        await startModel(selectedModelId);
        setActiveModelId(selectedModelId);
        panelPortRef.current?.postMessage({ type: "set-active-model", model: selectedModelId });
        setModelMenuOpen(false);
      } else {
        await stopModel(selectedModelId);
        setActiveModelId(null);
        panelPortRef.current?.postMessage({ type: "set-active-model", model: null });
        setModelMenuOpen(true);
        setDiagnosisQueue([]);
      }
      setModelNotice(action === "starting" ? "Model is warmed and kept alive for 30 minutes." : "Model unloaded from local memory.");
      await refreshOllama();
    } catch (error) {
      setModelNotice(error instanceof Error ? error.message : "The model action failed.");
    } finally {
      setModelAction(null);
    }
  }

  return (
    <main className="haunted-canvas min-h-screen px-5 py-6 font-sans text-slate-100">
      <div className="haunted-static" aria-hidden="true" />
      <section className="haunted-shell mx-auto max-w-3xl rounded-2xl border border-violet-400/30 bg-[#191423] p-6 shadow-2xl shadow-violet-950/30">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-violet-300"><span className="spectral-orb" aria-hidden="true" />Haunted DevTools</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">The séance is listening.</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => setModelMenuOpen((open) => !open)} className="rounded-md px-2 py-1 text-xs font-medium text-violet-100 ring-1 ring-inset ring-violet-300/25 hover:bg-violet-300/10">
              AI settings
            </button>
            <span className={`rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${isConnected ? "bg-emerald-400/10 text-emerald-300 ring-emerald-400/30" : "bg-amber-400/10 text-amber-100 ring-amber-400/30"}`}>
              {isConnected ? "Listening" : "Reconnecting"}
            </span>
          </div>
        </div>

        <nav className="mt-5 flex gap-2 border-b border-white/10 pb-3" aria-label="Haunted DevTools views">
          <button type="button" onClick={openLiveFeed} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${viewMode === "live" ? "bg-violet-300 text-violet-950" : "text-violet-100 ring-1 ring-inset ring-violet-300/25 hover:bg-violet-300/10"}`}>Live feed</button>
          <button type="button" onClick={openArchive} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${viewMode === "archive" ? "bg-violet-300 text-violet-950" : "text-violet-100 ring-1 ring-inset ring-violet-300/25 hover:bg-violet-300/10"}`}>Haunted websites</button>
        </nav>

        <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-200">{viewMode === "live" ? "Live feed" : "Haunted website archive"}</p>
              <p className="mt-1 text-xs text-slate-400">{viewMode === "live" ? `${liveEvents.length} grouped ${liveEvents.length === 1 ? "anomaly" : "anomalies"} captured for this visit` : viewedSite ? `${archiveEvents.length} grouped ${archiveEvents.length === 1 ? "anomaly" : "anomalies"} for ${viewedSite.label}` : "Choose a saved website to inspect its history."}</p>
            </div>
            {viewMode === "archive" && <div className="flex gap-2">
              <button type="button" onClick={clearSite} disabled={!viewedSite || events.length === 0} className="rounded-md px-2 py-1 text-xs font-medium text-slate-300 ring-1 ring-inset ring-white/15 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40">Clear site</button>
              <button type="button" onClick={clearAll} disabled={sites.length === 0} className="rounded-md px-2 py-1 text-xs font-medium text-rose-200 ring-1 ring-inset ring-rose-300/25 hover:bg-rose-300/10 disabled:cursor-not-allowed disabled:opacity-40">Clear all</button>
            </div>}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {viewMode === "archive" ? <label className="text-xs text-slate-400" htmlFor="registry-site">Viewing saved site
              <select id="registry-site" value={viewedSite?.id ?? ""} onChange={(event) => { panelPortRef.current?.postMessage({ type: "select-site", siteId: event.target.value }); setArchiveStep("groups"); }} className="mt-1 w-full rounded-md border border-white/15 bg-[#100d16] px-2 py-1.5 text-xs text-slate-100">
                <option value="" disabled>Select a saved site</option>
                {sites.map((site) => <option key={site.id} value={site.id}>{site.kind === "local-project" ? `Local · ${site.label}` : site.label}</option>)}
              </select>
            </label> : <div className="pt-1 text-xs text-slate-400"><p>Current inspected site</p><p className="mt-1 break-all text-violet-100">{activeCaptureSite ? activeCaptureSite.label : localProjectOrigin ? `Choose a local project for ${localProjectOrigin}` : "Unavailable for this page"}</p></div>}
            <div className="pt-1 text-xs text-slate-400"><p>{viewMode === "live" ? "Feed scope" : "Recording"}</p><p className="mt-1 break-all text-violet-100">{viewMode === "live" ? "This DevTools visit" : activeCaptureSite ? activeCaptureSite.label : "Unavailable"}</p></div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5" aria-label="Incident queue summary">
            {(["new", "queued", "reading", "diagnosed", "failed"] as const).map((state) => (
              <div key={state} className="rounded-lg border border-white/8 bg-black/15 px-2 py-2 text-center">
                <p className="text-sm font-semibold text-slate-100">{incidentCounts[state]}</p>
                <p className="mt-0.5 text-[10px] capitalize text-slate-400">{state}</p>
              </div>
            ))}
          </div>
          {modelIsActive && (isDiagnosing || diagnosisQueue.length > 0) && <p className="mt-2 text-xs text-violet-200">The séance is reading {isDiagnosing ? "one trace" : "the next trace"}{diagnosisQueue.length > 1 ? ` · ${diagnosisQueue.length - 1} waiting` : ""}.</p>}
        </div>

        {localProjectOrigin && !activeCaptureSite && <section className="mt-4 rounded-xl border border-amber-300/25 bg-amber-400/5 p-4" aria-label="Choose local project">
          <p className="text-sm font-medium text-amber-100">Name this local project before recording</p>
          <p className="mt-1 text-xs text-slate-400">This choice belongs only to the current DevTools attachment, so a different app at the same localhost URL cannot inherit its history.</p>
          {sites.filter((site) => site.kind === "local-project" && site.origin === localProjectOrigin).length > 0 && <div className="mt-3 flex flex-wrap gap-2">{sites.filter((site) => site.kind === "local-project" && site.origin === localProjectOrigin).map((site) => <button key={site.id} type="button" onClick={() => panelPortRef.current?.postMessage({ type: "select-local-project", siteId: site.id })} className="rounded-md px-2 py-1 text-xs text-amber-100 ring-1 ring-inset ring-amber-300/25 hover:bg-amber-300/10">Use {site.label}</button>)}</div>}
          <div className="mt-3 flex gap-2"><input value={localProjectLabel} onChange={(event) => setLocalProjectLabel(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") createLocalProject(); }} placeholder="Project name" className="min-w-0 flex-1 rounded-md border border-white/15 bg-[#100d16] px-2 py-1.5 text-xs text-slate-100" /><button type="button" onClick={createLocalProject} className="rounded-md bg-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-950">Create</button></div>
        </section>}

        {runtimeBridge.status !== "attached" && <p className="mt-3 text-xs text-amber-200">Runtime capture unavailable: {runtimeBridge.detail ?? "reload the inspected page."}</p>}

        {(modelMenuOpen || ollamaStatus !== "online") && <section className="mt-5 rounded-xl border border-violet-300/20 bg-violet-400/5 p-4" aria-label="Local Ollama model settings">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-violet-100">Local AI model</p>
              <p className="mt-1 text-xs text-slate-400">The panel contacts Ollama only at 127.0.0.1:11434. No event data is sent to a hosted service.</p>
            </div>
            <button type="button" onClick={() => void refreshOllama()} className="rounded-md px-2 py-1 text-xs text-violet-100 ring-1 ring-inset ring-violet-300/25 hover:bg-violet-300/10">
              {ollamaStatus === "checking" ? "Checking…" : "Refresh"}
            </button>
          </div>
          <label className="mt-4 block text-xs font-medium text-slate-300" htmlFor="model-selection">Model</label>
          <select
            id="model-selection"
            value={selectedModelId}
            onChange={(event) => void selectModel(event.target.value as ModelConfig["id"])}
            disabled={activeModelId !== null || modelAction !== null}
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#100d16] px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-300"
          >
            {supportedModels.map((model) => <option key={model.id} value={model.id}>{model.label} - {model.id}</option>)}
          </select>
          <p className="mt-2 text-xs text-slate-400">{selectedModel.purpose}</p>
          <label className="mt-4 block text-xs font-medium text-slate-300" htmlFor="ghost-personality">Ghost voice</label>
          <select
            id="ghost-personality"
            value={personality}
            onChange={(event) => void selectPersonality(event.target.value as GhostPersonality)}
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#100d16] px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-300"
          >
            {ghostPersonalities.map((voice) => <option key={voice.id} value={voice.id}>{voice.label} — {voice.description}</option>)}
          </select>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-1 text-xs ${ollamaStatus === "online" && selectedModelInstalled ? "bg-emerald-400/10 text-emerald-200" : "bg-amber-400/10 text-amber-100"}`}>
              {ollamaStatus === "online" ? (selectedModelInstalled ? "Installed" : "Not installed") : "Ollama unavailable"}
            </span>
            <button type="button" disabled={!selectedModelInstalled || modelAction !== null} onClick={() => void changeModelState()} className={`${modelIsActive ? "bg-slate-700 text-slate-100" : "bg-emerald-300 text-emerald-950"} rounded-md px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40`}>
              {modelAction === "starting" ? "Starting…" : modelAction === "stopping" ? "Stopping…" : modelIsActive ? "Stop model" : "Start model"}
            </button>
          </div>
          {!selectedModelInstalled && ollamaStatus === "online" && <p className="mt-3 break-all font-mono text-xs text-amber-100">Install locally: ollama pull {selectedModelId}</p>}
          {modelNotice && <p className="mt-3 text-xs text-slate-300">{modelNotice}</p>}
        </section>}

        {viewMode === "archive" && archiveStep === "sites" ? (
          <section className="mt-4" aria-label="Haunted websites">
            <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-200">Haunted websites</p><p className="text-xs text-slate-500">Choose a registry</p></div>
            <ol className="space-y-2">{sites.map((site) => <li key={site.id}><button type="button" onClick={() => openArchiveSite(site.id)} className="w-full rounded-xl border border-white/10 bg-black/15 p-3 text-left hover:bg-white/5"><div className="flex items-center justify-between gap-3"><p className="truncate text-sm font-medium text-slate-100">{site.kind === "local-project" ? `Local · ${site.label}` : site.label}</p><span className="text-xs text-violet-200">Enter ›</span></div><p className="mt-1 text-xs text-slate-400">Last activity {new Date(site.updatedAt).toLocaleString()}</p></button></li>)}</ol>
          </section>
        ) : events.length === 0 ? (
          <div className="haunted-empty mt-4 rounded-xl border border-dashed border-violet-300/25 px-4 py-6 text-sm text-slate-300">
            <p className="text-base font-medium text-violet-100">The room is quiet… for now.</p>
            <p className="mt-2 text-xs leading-5 text-slate-400">Trigger a runtime error, rejected Promise, or failed HTTP request and its trace will appear here.</p>
          </div>
        ) : (
          <div className={`mt-4 grid gap-4 ${viewMode === "live" ? "" : "lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"}`}>
            {!(viewMode === "archive" && archiveStep === "case") && <section className="min-w-0" aria-label="Incident inbox">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-200">{viewMode === "live" ? "Live hauntings" : "Grouped hauntings"}</p>
                {viewMode === "archive" && archiveStep === "groups" && <button type="button" onClick={() => setArchiveStep("sites")} className="text-xs text-violet-200 hover:text-violet-100">All websites</button>}
                {viewMode === "live" && <p className="text-xs text-slate-500">Swipe to inspect</p>}
              </div>
            <ol className={viewMode === "live" ? "flex gap-2 overflow-x-auto pb-2" : "space-y-2"} aria-label="Detected anomalies">
              {events.map((event) => (
                <li key={event.id} className={viewMode === "live" ? "w-64 shrink-0" : ""}>
                  {(() => {
                    const state = incidentState(event, diagnoses[event.id], diagnosisQueue);
                    return (
                  <button
                    type="button"
                    onClick={() => { setSelectedEventId(event.id); if (viewMode === "archive") setArchiveStep("case"); }}
                    className={`w-full rounded-xl border p-3 text-left transition ${selectedEvent?.id === event.id ? "haunted-selected border-violet-300/60 bg-violet-400/10" : "border-white/10 bg-black/15 hover:bg-white/5"}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-medium text-slate-100">{event.title}</p>
                      <span className="flex shrink-0 items-center gap-1"><span className={`rounded-full px-2 py-1 text-[11px] font-medium capitalize ${lifecycleClass[lifecycleState(event)]}`}>{lifecycleLabel(event)}</span><span className={`rounded-full px-2 py-1 text-[11px] font-medium ${incidentStateClass[state]}`}>{diagnosisStateLabel[state]}</span></span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3 text-xs text-slate-400">
                      <p className="truncate capitalize">{eventLabel(event.type)} · {incidentSource(event)}{viewMode === "live" && event.occurrences > 1 ? ` · ×${event.occurrences}` : ""}</p>
                      <time className="shrink-0" dateTime={new Date(event.timestamp).toISOString()}>{new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                    </div>
                  </button>
                    );
                  })()}
                </li>
              ))}
            </ol>
            </section>}

            {selectedEvent && (
              <article className="rounded-xl border border-rose-300/20 bg-rose-400/5 p-4" aria-label="Selected anomaly details">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    {viewMode === "archive" && <button type="button" onClick={() => setArchiveStep("groups")} className="mb-3 text-xs text-violet-200 hover:text-violet-100">‹ {viewedSite?.label ?? "Error groups"}</button>}
                    <p className="text-xs font-semibold uppercase tracking-wide text-rose-200">Case file · {eventLabel(selectedEvent.type)} · {lifecycleLabel(selectedEvent)}</p>
                    <h2 className="mt-1 font-semibold text-rose-50">{selectedEvent.title}</h2>
                  </div>
                  <span className="rounded-full bg-rose-300/10 px-2 py-1 text-xs font-medium capitalize text-rose-100">{selectedEvent.severity}</span>
                </div>
                <p className="mt-4 break-all rounded-lg bg-black/20 p-3 font-mono text-xs leading-5 text-slate-200">{selectedEvent.message}</p>
                <p className="mt-3 text-xs text-slate-400">First seen {new Date(selectedEvent.firstSeenAt ?? selectedEvent.timestamp).toLocaleString()} · Last seen {new Date(selectedEvent.lastSeenAt ?? selectedEvent.timestamp).toLocaleString()}</p>
                {selectedEvent.exorcisedAt && <p className="mt-1 text-xs text-emerald-200">Exorcised {new Date(selectedEvent.exorcisedAt).toLocaleString()}</p>}
                {selectedEvent.resurrectedAt && <p className="mt-1 text-xs text-amber-200">Resurrected {new Date(selectedEvent.resurrectedAt).toLocaleString()} · ×{selectedEvent.resurrectionCount ?? 0}</p>}
                {selectedEvent.request && (
                  <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">
                    <dt className="text-slate-400">Request</dt>
                    <dd className="break-all font-mono text-slate-200">{selectedEvent.request.method} {selectedEvent.request.url}</dd>
                    <dt className="text-slate-400">Status</dt>
                    <dd className="text-slate-200">{selectedEvent.request.status ?? "No response"}{selectedEvent.request.statusText ? ` ${selectedEvent.request.statusText}` : ""}</dd>
                  </dl>
                )}
                {selectedEvent.source && (
                  <p className="mt-4 break-all font-mono text-xs text-slate-400">{selectedEvent.source.url}{selectedEvent.source.line ? `:${selectedEvent.source.line}${selectedEvent.source.column ? `:${selectedEvent.source.column}` : ""}` : ""}</p>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {lifecycleState(selectedEvent) !== "exorcised" && <button type="button" onClick={markExorcised} className="rounded-md bg-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-950">Mark exorcised</button>}
                  {lifecycleState(selectedEvent) === "exorcised" && <span className="text-xs text-emerald-200">This ghost is exorcised. A future match will be marked resurrected.</span>}
                  {!modelIsActive && <span className="text-xs text-slate-400">Start the selected local model to awaken automatic diagnoses.</span>}
                  {modelIsActive && selectedDiagnosis?.status === "loading" && <span className="summon-button rounded-md bg-violet-300 px-3 py-1.5 text-xs font-semibold text-violet-950">{selectedPersonality.label} ghost is reading this trace…</span>}
                  {modelIsActive && !selectedDiagnosis && diagnosisQueue.some((event) => event.id === selectedEvent.id) && <span className="text-xs text-violet-200">Queued for a {selectedPersonality.label.toLowerCase()} reading.</span>}
                </div>
                {selectedDiagnosis?.status === "error" && <p className="mt-3 text-xs text-amber-100">{selectedDiagnosis.error}</p>}
                {selectedDiagnosis?.status === "ready" && selectedDiagnosis.result?.kind === "fallback" && (
                  <section className="mt-4 rounded-lg border border-amber-300/20 bg-amber-400/5 p-3" aria-label="Unstructured model response">
                    <p className="text-xs font-semibold text-amber-100">Unstructured local-model response</p>
                    <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs text-slate-200">{selectedDiagnosis.result.raw}</pre>
                  </section>
                )}
                {selectedDiagnosis?.status === "ready" && selectedDiagnosis.result?.kind === "validated" && (
                  <section className="mt-4 rounded-lg border border-violet-300/20 bg-violet-400/5 p-3" aria-label="Local AI diagnosis">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-violet-100">{selectedDiagnosis.result.diagnosis.title}</p>
                      <span className="text-xs capitalize text-violet-200">{selectedDiagnosis.result.diagnosis.confidence} confidence</span>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-slate-200">{selectedDiagnosis.result.diagnosis.explanation}</p>
                    <p className="mt-3 text-xs text-slate-400">Likely cause</p>
                    <p className="mt-1 text-xs leading-5 text-slate-200">{selectedDiagnosis.result.diagnosis.likelyCause}</p>
                    <p className="mt-3 text-xs text-slate-400">Observed evidence</p>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-5 text-slate-200">{selectedDiagnosis.result.diagnosis.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <p className="text-xs text-slate-400">Suggested fix</p>
                      <button type="button" onClick={() => void copySuggestedFix(selectedDiagnosis.result?.kind === "validated" ? selectedDiagnosis.result.diagnosis.suggestedFix : "")} className="text-xs font-medium text-violet-200 hover:text-violet-100">Copy fix</button>
                    </div>
                    <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-black/20 p-2 font-mono text-xs leading-5 text-slate-100">{selectedDiagnosis.result.diagnosis.suggestedFix}</pre>
                    <p className="mt-3 text-xs italic text-violet-200">{decorateGhostCommentary(personality, selectedDiagnosis.result.diagnosis.ghostCommentary)}</p>
                  </section>
                )}
              </article>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
