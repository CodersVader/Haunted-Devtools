import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { DebugEvent, PersistedDiagnosis } from '../../shared/events';
import {
  isPanelMessage,
  panelPortName,
  type PanelCommand,
} from '../../shared/messaging';
import type { RegistrySite } from '../../shared/registry';
import {
  incidentState,
  lifecycleState,
  replaceOrPrepend,
  type IncidentState,
} from '../incident';
import { useDiagnosisQueue } from '../hooks/useDiagnosisQueue';
import { useModelSettings } from '../hooks/useModelSettings';

function usePanelState() {
  const [archiveEvents, setArchiveEvents] = useState<DebugEvent[]>([]);
  const [liveEvents, setLiveEvents] = useState<DebugEvent[]>([]);
  const [viewMode, setViewMode] = useState<'live' | 'archive'>('live');
  const [archiveStep, setArchiveStep] = useState<'sites' | 'groups' | 'case'>(
    'sites',
  );
  const [sites, setSites] = useState<RegistrySite[]>([]);
  const [activeCaptureSite, setActiveCaptureSite] =
    useState<RegistrySite | null>(null);
  const [viewedSite, setViewedSite] = useState<RegistrySite | null>(null);
  const [localProjectOrigin, setLocalProjectOrigin] = useState<string>();
  const [localProjectLabel, setLocalProjectLabel] = useState('');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(true);
  const [runtimeBridge, setRuntimeBridge] = useState<{
    status: 'attached' | 'unavailable';
    detail?: string;
  }>({ status: 'unavailable', detail: 'Awaiting bridge status…' });
  const panelPortRef = useRef<chrome.runtime.Port | null>(null);
  const activeCaptureSiteIdRef = useRef<string | null>(null);
  const viewedSiteIdRef = useRef<string | null>(null);
  const viewModeRef = useRef<'live' | 'archive'>('live');
  const sendPanelCommand = useCallback(
    (command: PanelCommand): void => panelPortRef.current?.postMessage(command),
    [],
  );
  const updateActiveModel = useCallback(
    (modelId: string | null) =>
      sendPanelCommand({ type: 'set-active-model', model: modelId }),
    [sendPanelCommand],
  );
  const model = useModelSettings(updateActiveModel);
  const saveDiagnosis = useCallback(
    (siteId: string, eventId: string, diagnosis: PersistedDiagnosis) =>
      sendPanelCommand({ type: 'save-diagnosis', siteId, eventId, diagnosis }),
    [sendPanelCommand],
  );
  const diagnosis = useDiagnosisQueue({
    activeCaptureSite,
    isModelActive: model.activeModelId !== null,
    personality: model.personality,
    selectedModel: model.selectedModel,
    saveDiagnosis,
  });
  const diagnosisActionsRef = useRef({
    restoreDiagnoses: diagnosis.restoreDiagnoses,
    recordIncomingEvent: diagnosis.recordIncomingEvent,
  });
  const wasModelActiveRef = useRef(model.activeModelId !== null);

  useEffect(() => {
    diagnosisActionsRef.current = {
      restoreDiagnoses: diagnosis.restoreDiagnoses,
      recordIncomingEvent: diagnosis.recordIncomingEvent,
    };
  }, [diagnosis]);
  useEffect(() => {
    if (wasModelActiveRef.current && model.activeModelId === null)
      diagnosis.clearQueue();
    wasModelActiveRef.current = model.activeModelId !== null;
  }, [diagnosis, model.activeModelId]);
  useEffect(() => {
    const port = window.chrome.runtime.connect({ name: panelPortName });
    panelPortRef.current = port;
    port.onMessage.addListener((message: unknown) => {
      if (!isPanelMessage(message)) return;
      if (message.type === 'registry-state') {
        setArchiveEvents(message.events);
        setLiveEvents(message.liveEvents);
        setSites(message.sites);
        setActiveCaptureSite(message.activeCaptureSite);
        setViewedSite(message.viewedSite);
        activeCaptureSiteIdRef.current = message.activeCaptureSite?.id ?? null;
        viewedSiteIdRef.current = message.viewedSite?.id ?? null;
        setLocalProjectOrigin(message.localProjectOrigin);
        const visibleEvents =
          viewModeRef.current === 'live' ? message.liveEvents : message.events;
        setSelectedEventId((selected) =>
          visibleEvents.some((event) => event.id === selected)
            ? selected
            : (visibleEvents[0]?.id ?? null),
        );
        diagnosisActionsRef.current.restoreDiagnoses([
          ...message.events,
          ...message.liveEvents,
        ]);
      }
      if (message.type === 'event-detected') {
        if (message.siteId === activeCaptureSiteIdRef.current)
          setLiveEvents((current) => replaceOrPrepend(current, message.event));
        if (message.siteId === viewedSiteIdRef.current)
          setArchiveEvents((current) =>
            replaceOrPrepend(current, message.event),
          );
        if (
          (viewModeRef.current === 'live' &&
            message.siteId === activeCaptureSiteIdRef.current) ||
          (viewModeRef.current === 'archive' &&
            message.siteId === viewedSiteIdRef.current)
        )
          setSelectedEventId(message.event.id);
        diagnosisActionsRef.current.recordIncomingEvent(
          message.event,
          message.isNew,
        );
      }
      if (message.type === 'runtime-bridge-status') setRuntimeBridge(message);
    });
    port.onDisconnect.addListener(() => setIsConnected(false));
    return () => {
      panelPortRef.current = null;
      port.disconnect();
    };
  }, []);

  const events = viewMode === 'live' ? liveEvents : archiveEvents;
  const selectedEvent =
    events.find((event) => event.id === selectedEventId) ?? events[0] ?? null;
  const selectedDiagnosis = selectedEvent
    ? diagnosis.diagnoses[selectedEvent.id]
    : undefined;
  const incidentCounts = events.reduce<Record<IncidentState, number>>(
    (counts, event) => {
      counts[
        incidentState(
          event,
          diagnosis.diagnoses[event.id],
          diagnosis.diagnosisQueue,
        )
      ] += 1;
      return counts;
    },
    { new: 0, queued: 0, reading: 0, diagnosed: 0, failed: 0 },
  );
  const clearSite = () => {
    if (
      viewedSite &&
      window.confirm(`Clear every saved error for ${viewedSite.label}?`)
    )
      sendPanelCommand({ type: 'clear-site', siteId: viewedSite.id });
  };
  const clearAll = () => {
    if (
      window.confirm(
        'Clear all saved sites, local project labels, errors, and diagnoses?',
      )
    )
      sendPanelCommand({ type: 'clear-all' });
  };
  const createLocalProject = () => {
    const label = localProjectLabel.trim();
    if (label) {
      sendPanelCommand({ type: 'create-local-project', label });
      setLocalProjectLabel('');
    }
  };
  const markExorcised = () => {
    const site = viewMode === 'live' ? activeCaptureSite : viewedSite;
    if (site && selectedEvent && lifecycleState(selectedEvent) !== 'exorcised')
      sendPanelCommand({
        type: 'mark-exorcised',
        siteId: site.id,
        eventId: selectedEvent.id,
      });
  };
  const openLiveFeed = () => {
    setViewMode('live');
    viewModeRef.current = 'live';
    setSelectedEventId(liveEvents[0]?.id ?? null);
  };
  const openArchive = () => {
    setViewMode('archive');
    viewModeRef.current = 'archive';
    setArchiveStep('sites');
    setSelectedEventId(null);
  };
  const openArchiveSite = (siteId: string) => {
    sendPanelCommand({ type: 'select-site', siteId });
    setArchiveStep('groups');
  };

  return {
    archiveEvents,
    liveEvents,
    viewMode,
    archiveStep,
    setArchiveStep,
    sites,
    activeCaptureSite,
    viewedSite,
    localProjectOrigin,
    localProjectLabel,
    setLocalProjectLabel,
    selectedEventId,
    setSelectedEventId,
    isConnected,
    runtimeBridge,
    sendPanelCommand,
    model,
    diagnosis,
    events,
    selectedEvent,
    selectedDiagnosis,
    incidentCounts,
    clearSite,
    clearAll,
    createLocalProject,
    markExorcised,
    openLiveFeed,
    openArchive,
    openArchiveSite,
  };
}

type PanelContextValue = ReturnType<typeof usePanelState>;
const PanelContext = createContext<PanelContextValue | null>(null);

export function PanelProvider({ children }: { children: ReactNode }) {
  return (
    <PanelContext.Provider value={usePanelState()}>
      {children}
    </PanelContext.Provider>
  );
}

// This hook is intentionally colocated with its provider so consumers share one typed state contract.
// eslint-disable-next-line react-refresh/only-export-components
export function usePanelContext(): PanelContextValue {
  const value = useContext(PanelContext);
  if (!value)
    throw new Error('usePanelContext must be used inside PanelProvider.');
  return value;
}
