import { supportedModels as modelOptions } from '../ai/models';
import { ghostPersonalities, type GhostPersonality } from './personality';
import { IncidentInbox } from './components/IncidentInbox';
import { IncidentDetails } from './components/IncidentDetails';
import { PanelProvider, usePanelContext } from './context/PanelContext';

export function App() {
  return (
    <PanelProvider>
      <PanelScreen />
    </PanelProvider>
  );
}

function PanelScreen() {
  const panel = usePanelContext();
  const {
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
    selectedEvent,
    selectedDiagnosis,
    incidentCounts,
    isConnected,
    runtimeBridge,
    model,
    diagnosis,
    events,
    clearSite,
    clearAll,
    createLocalProject,
    markExorcised,
    openLiveFeed,
    openArchive,
    openArchiveSite,
    sendPanelCommand,
    setSelectedEventId,
  } = panel;
  return (
    <main className="haunted-canvas min-h-screen px-5 py-6 font-sans text-slate-100">
      <div className="haunted-static" aria-hidden="true" />
      <section className="haunted-shell mx-auto max-w-3xl rounded-2xl border border-violet-400/30 bg-[#191423] p-6 shadow-2xl shadow-violet-950/30">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">
              <span className="spectral-orb" aria-hidden="true" />
              Haunted DevTools
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">
              The séance is listening.
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => model.setModelMenuOpen((open) => !open)}
              className="rounded-md px-2 py-1 text-xs font-medium text-violet-100 ring-1 ring-inset ring-violet-300/25 hover:bg-violet-300/10"
            >
              AI settings
            </button>
            <span
              className={`rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${isConnected ? 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/30' : 'bg-amber-400/10 text-amber-100 ring-amber-400/30'}`}
            >
              {isConnected ? 'Listening' : 'Reconnecting'}
            </span>
          </div>
        </div>

        <nav
          className="mt-5 flex gap-2 border-b border-white/10 pb-3"
          aria-label="Haunted DevTools views"
        >
          <button
            type="button"
            onClick={openLiveFeed}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${viewMode === 'live' ? 'bg-violet-300 text-violet-950' : 'text-violet-100 ring-1 ring-inset ring-violet-300/25 hover:bg-violet-300/10'}`}
          >
            Live feed
          </button>
          <button
            type="button"
            onClick={openArchive}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${viewMode === 'archive' ? 'bg-violet-300 text-violet-950' : 'text-violet-100 ring-1 ring-inset ring-violet-300/25 hover:bg-violet-300/10'}`}
          >
            Haunted websites
          </button>
        </nav>

        <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-200">
                {viewMode === 'live' ? 'Live feed' : 'Haunted website archive'}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {viewMode === 'live'
                  ? `${liveEvents.length} grouped ${liveEvents.length === 1 ? 'anomaly' : 'anomalies'} captured for this visit`
                  : viewedSite
                    ? `${archiveEvents.length} grouped ${archiveEvents.length === 1 ? 'anomaly' : 'anomalies'} for ${viewedSite.label}`
                    : 'Choose a saved website to inspect its history.'}
              </p>
            </div>
            {viewMode === 'archive' && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={clearSite}
                  disabled={!viewedSite || events.length === 0}
                  className="rounded-md px-2 py-1 text-xs font-medium text-slate-300 ring-1 ring-inset ring-white/15 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Clear site
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  disabled={sites.length === 0}
                  className="rounded-md px-2 py-1 text-xs font-medium text-rose-200 ring-1 ring-inset ring-rose-300/25 hover:bg-rose-300/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {viewMode === 'archive' ? (
              <label className="text-xs text-slate-400" htmlFor="registry-site">
                Viewing saved site
                <select
                  id="registry-site"
                  value={viewedSite?.id ?? ''}
                  onChange={(event) => {
                    sendPanelCommand({
                      type: 'select-site',
                      siteId: event.target.value,
                    });
                    setArchiveStep('groups');
                  }}
                  className="mt-1 w-full rounded-md border border-white/15 bg-[#100d16] px-2 py-1.5 text-xs text-slate-100"
                >
                  <option value="" disabled>
                    Select a saved site
                  </option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.kind === 'local-project'
                        ? `Local · ${site.label}`
                        : site.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="pt-1 text-xs text-slate-400">
                <p>Current inspected site</p>
                <p className="mt-1 break-all text-violet-100">
                  {activeCaptureSite
                    ? activeCaptureSite.label
                    : localProjectOrigin
                      ? `Choose a local project for ${localProjectOrigin}`
                      : 'Unavailable for this page'}
                </p>
              </div>
            )}
            <div className="pt-1 text-xs text-slate-400">
              <p>{viewMode === 'live' ? 'Feed scope' : 'Recording'}</p>
              <p className="mt-1 break-all text-violet-100">
                {viewMode === 'live'
                  ? 'This DevTools visit'
                  : activeCaptureSite
                    ? activeCaptureSite.label
                    : 'Unavailable'}
              </p>
            </div>
          </div>
          <div
            className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5"
            aria-label="Incident queue summary"
          >
            {(['new', 'queued', 'reading', 'diagnosed', 'failed'] as const).map(
              (state) => (
                <div
                  key={state}
                  className="rounded-lg border border-white/8 bg-black/15 px-2 py-2 text-center"
                >
                  <p className="text-sm font-semibold text-slate-100">
                    {incidentCounts[state]}
                  </p>
                  <p className="mt-0.5 text-[10px] capitalize text-slate-400">
                    {state}
                  </p>
                </div>
              ),
            )}
          </div>
          {model.modelIsActive &&
            (diagnosis.isDiagnosing || diagnosis.diagnosisQueue.length > 0) && (
              <p className="mt-2 text-xs text-violet-200">
                The séance is reading{' '}
                {diagnosis.isDiagnosing ? 'one trace' : 'the next trace'}
                {diagnosis.diagnosisQueue.length > 1
                  ? ` · ${diagnosis.diagnosisQueue.length - 1} waiting`
                  : ''}
                .
              </p>
            )}
        </div>

        {localProjectOrigin && !activeCaptureSite && (
          <section
            className="mt-4 rounded-xl border border-amber-300/25 bg-amber-400/5 p-4"
            aria-label="Choose local project"
          >
            <p className="text-sm font-medium text-amber-100">
              Name this local project before recording
            </p>
            <p className="mt-1 text-xs text-slate-400">
              This choice belongs only to the current DevTools attachment, so a
              different app at the same localhost URL cannot inherit its
              history.
            </p>
            {sites.filter(
              (site) =>
                site.kind === 'local-project' &&
                site.origin === localProjectOrigin,
            ).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {sites
                  .filter(
                    (site) =>
                      site.kind === 'local-project' &&
                      site.origin === localProjectOrigin,
                  )
                  .map((site) => (
                    <button
                      key={site.id}
                      type="button"
                      onClick={() =>
                        sendPanelCommand({
                          type: 'select-local-project',
                          siteId: site.id,
                        })
                      }
                      className="rounded-md px-2 py-1 text-xs text-amber-100 ring-1 ring-inset ring-amber-300/25 hover:bg-amber-300/10"
                    >
                      Use {site.label}
                    </button>
                  ))}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <input
                value={localProjectLabel}
                onChange={(event) => setLocalProjectLabel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') createLocalProject();
                }}
                placeholder="Project name"
                className="min-w-0 flex-1 rounded-md border border-white/15 bg-[#100d16] px-2 py-1.5 text-xs text-slate-100"
              />
              <button
                type="button"
                onClick={createLocalProject}
                className="rounded-md bg-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-950"
              >
                Create
              </button>
            </div>
          </section>
        )}

        {runtimeBridge.status !== 'attached' && (
          <p className="mt-3 text-xs text-amber-200">
            Runtime capture unavailable:{' '}
            {runtimeBridge.detail ?? 'reload the inspected page.'}
          </p>
        )}

        {(model.modelMenuOpen || model.ollamaStatus !== 'online') && (
          <section
            className="mt-5 rounded-xl border border-violet-300/20 bg-violet-400/5 p-4"
            aria-label="Local Ollama model settings"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-violet-100">
                  Local AI model
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  The panel contacts Ollama only at 127.0.0.1:11434. No event
                  data is sent to a hosted service.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void model.refreshOllama()}
                className="rounded-md px-2 py-1 text-xs text-violet-100 ring-1 ring-inset ring-violet-300/25 hover:bg-violet-300/10"
              >
                {model.ollamaStatus === 'checking' ? 'Checking…' : 'Refresh'}
              </button>
            </div>
            <label
              className="mt-4 block text-xs font-medium text-slate-300"
              htmlFor="model-selection"
            >
              Model
            </label>
            <select
              id="model-selection"
              value={model.selectedModelId}
              onChange={(event) =>
                void model.selectModel(
                  event.target.value as typeof model.selectedModelId,
                )
              }
              disabled={
                model.activeModelId !== null || model.modelAction !== null
              }
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#100d16] px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-300"
            >
              {modelOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} - {option.id}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-slate-400">
              {model.selectedModel.purpose}
            </p>
            <label
              className="mt-4 block text-xs font-medium text-slate-300"
              htmlFor="ghost-personality"
            >
              Ghost voice
            </label>
            <select
              id="ghost-personality"
              value={model.personality}
              onChange={(event) =>
                void model.selectPersonality(
                  event.target.value as GhostPersonality,
                )
              }
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#100d16] px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-300"
            >
              {ghostPersonalities.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.label} — {voice.description}
                </option>
              ))}
            </select>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2 py-1 text-xs ${model.ollamaStatus === 'online' && model.selectedModelInstalled ? 'bg-emerald-400/10 text-emerald-200' : 'bg-amber-400/10 text-amber-100'}`}
              >
                {model.ollamaStatus === 'online'
                  ? model.selectedModelInstalled
                    ? 'Installed'
                    : 'Not installed'
                  : 'Ollama unavailable'}
              </span>
              <button
                type="button"
                disabled={
                  !model.selectedModelInstalled || model.modelAction !== null
                }
                onClick={() => void model.changeModelState()}
                className={`${model.modelIsActive ? 'bg-slate-700 text-slate-100' : 'bg-emerald-300 text-emerald-950'} rounded-md px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40`}
              >
                {model.modelAction === 'starting'
                  ? 'Starting…'
                  : model.modelAction === 'stopping'
                    ? 'Stopping…'
                    : model.modelIsActive
                      ? 'Stop model'
                      : 'Start model'}
              </button>
            </div>
            {!model.selectedModelInstalled &&
              model.ollamaStatus === 'online' && (
                <p className="mt-3 break-all font-mono text-xs text-amber-100">
                  Install locally: ollama pull {model.selectedModelId}
                </p>
              )}
            {model.modelNotice && (
              <p className="mt-3 text-xs text-slate-300">{model.modelNotice}</p>
            )}
          </section>
        )}

        {viewMode === 'archive' && archiveStep === 'sites' ? (
          <section className="mt-4" aria-label="Haunted websites">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-200">
                Haunted websites
              </p>
              <p className="text-xs text-slate-500">Choose a registry</p>
            </div>
            <ol className="space-y-2">
              {sites.map((site) => (
                <li key={site.id}>
                  <button
                    type="button"
                    onClick={() => openArchiveSite(site.id)}
                    className="w-full rounded-xl border border-white/10 bg-black/15 p-3 text-left hover:bg-white/5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-medium text-slate-100">
                        {site.kind === 'local-project'
                          ? `Local · ${site.label}`
                          : site.label}
                      </p>
                      <span className="text-xs text-violet-200">Enter ›</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      Last activity {new Date(site.updatedAt).toLocaleString()}
                    </p>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        ) : events.length === 0 ? (
          <div className="haunted-empty mt-4 rounded-xl border border-dashed border-violet-300/25 px-4 py-6 text-sm text-slate-300">
            <p className="text-base font-medium text-violet-100">
              The room is quiet… for now.
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              Trigger a runtime error, rejected Promise, or failed HTTP request
              and its trace will appear here.
            </p>
          </div>
        ) : (
          <div
            className={`mt-4 grid gap-4 ${viewMode === 'live' ? '' : 'lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]'}`}
          >
            {!(viewMode === 'archive' && archiveStep === 'case') && (
              <IncidentInbox
                events={events}
                diagnoses={diagnosis.diagnoses}
                diagnosisQueue={diagnosis.diagnosisQueue}
                selectedEventId={selectedEvent?.id ?? null}
                viewMode={viewMode}
                archiveStep={archiveStep}
                onSelect={(eventId) => {
                  setSelectedEventId(eventId);
                  if (viewMode === 'archive') setArchiveStep('case');
                }}
                onBackToSites={() => setArchiveStep('sites')}
              />
            )}

            {selectedEvent && (
              <IncidentDetails
                event={selectedEvent}
                diagnosis={selectedDiagnosis}
                isModelActive={model.modelIsActive}
                personality={model.personality}
                personalityLabel={model.selectedPersonality.label}
                isQueued={diagnosis.diagnosisQueue.some(
                  (event) => event.id === selectedEvent.id,
                )}
                viewedSiteLabel={viewedSite?.label}
                isArchive={viewMode === 'archive'}
                onBack={() => setArchiveStep('groups')}
                onMarkExorcised={markExorcised}
                onCopyFix={(value) => void model.copySuggestedFix(value)}
              />
            )}
          </div>
        )}
      </section>
    </main>
  );
}
