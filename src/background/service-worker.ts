import type { RegistryResponse } from '../shared/registry-messaging';
import { isRegistryCommand } from '../shared/registry-messaging';
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
  registryStorageKey,
  saveDiagnosis,
  upsertEvent,
} from '../shared/registry';

const devtoolsRuntimePortName = 'haunted-devtools-runtime';

type RuntimeMessage =
  | { kind: 'haunted-runtime-bridge-ready' }
  | {
      kind: 'haunted-runtime-event';
      payload: {
        type: 'runtime-error' | 'unhandled-rejection';
        message: string;
        timestamp: number;
      };
    };

const devtoolsPortsByTab = new Map<number, Set<chrome.runtime.Port>>();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== devtoolsRuntimePortName) return;

  let watchedTabId: number | undefined;
  port.onMessage.addListener((message: unknown) => {
    if (!isWatchMessage(message)) return;

    watchedTabId = message.tabId;
    const ports =
      devtoolsPortsByTab.get(watchedTabId) ?? new Set<chrome.runtime.Port>();
    ports.add(port);
    devtoolsPortsByTab.set(watchedTabId, ports);

    void requestRuntimeBridge(watchedTabId);
  });
  port.onDisconnect.addListener(() => {
    if (watchedTabId === undefined) return;
    const ports = devtoolsPortsByTab.get(watchedTabId);
    ports?.delete(port);
    if (ports?.size === 0) devtoolsPortsByTab.delete(watchedTabId);
  });
});

async function requestRuntimeBridge(tabId: number): Promise<void> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      kind: 'haunted-request-runtime-bridge',
    });
    if (isBridgeAcknowledgement(response)) return;
  } catch {
    // No active bridge answered. Inject a fresh pair below.
  }
  await installRuntimeBridge(tabId);
}

async function installRuntimeBridge(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['page-errors-main.js'],
      world: 'MAIN',
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['error-bridge.js'],
      world: 'ISOLATED',
    });
  } catch {
    // Chrome internal pages and pages without host access cannot receive a bridge.
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender) => {
  if (isRegistryCommand(message)) return;
  const tabId = sender.tab?.id;
  if (tabId === undefined || !isRuntimeMessage(message)) return;

  for (const port of devtoolsPortsByTab.get(tabId) ?? []) {
    try {
      port.postMessage(message);
    } catch {
      // A disconnect handler removes stale ports after Chrome reports it.
    }
  }
});

// Chrome's callback listener requires the response callback to keep the service worker alive.
// Kept separate from runtime bridge messages so page-originated events cannot mutate the registry.
chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse) => {
    if (!isRegistryCommand(message)) return;
    void handleRegistryCommand(message).then(sendResponse);
    return true;
  },
);

let registryWrite = Promise.resolve();

async function withRegistry<T>(
  operation: (registry: ReturnType<typeof parseRegistry>) => T | Promise<T>,
  write = false,
): Promise<T> {
  let result!: T;
  const run = async (): Promise<void> => {
    const stored = await chrome.storage.local.get(registryStorageKey);
    const registry = parseRegistry(
      stored[registryStorageKey] ?? emptyRegistry(),
    );
    result = await operation(registry);
    if (write)
      await chrome.storage.local.set({ [registryStorageKey]: registry });
  };
  const queued = registryWrite.then(run, run);
  registryWrite = queued.catch(() => undefined);
  await queued;
  return result;
}

async function handleRegistryCommand(
  message: import('../shared/registry-messaging').RegistryCommand,
): Promise<RegistryResponse> {
  try {
    switch (message.action) {
      case 'ensure-website':
        return {
          ok: true,
          site: await withRegistry(
            (registry) => ensureWebsite(registry, message.origin),
            true,
          ),
        };
      case 'list-sites':
        return {
          ok: true,
          sites: await withRegistry((registry) =>
            [...registry.sites].sort((a, b) => b.updatedAt - a.updatedAt),
          ),
        };
      case 'list-events':
        return {
          ok: true,
          events: await withRegistry((registry) =>
            listEvents(registry, message.siteId),
          ),
        };
      case 'create-local-project':
        return {
          ok: true,
          site: await withRegistry(
            (registry) =>
              createLocalProject(
                registry,
                message.origin,
                message.label.trim().slice(0, 120),
              ),
            true,
          ),
        };
      case 'upsert-event':
        return {
          ok: true,
          event: await withRegistry(
            (registry) => upsertEvent(registry, message.siteId, message.event),
            true,
          ),
        };
      case 'find-archived-event':
        return {
          ok: true,
          event: await withRegistry((registry) =>
            findArchivedEvent(registry, message.siteId, message.fingerprint),
          ),
        };
      case 'commit-exorcised':
        return {
          ok: true,
          event: await withRegistry(
            (registry) =>
              commitExorcised(registry, message.siteId, message.event),
            true,
          ),
        };
      case 'save-diagnosis':
        return {
          ok: true,
          event: await withRegistry(
            (registry) =>
              saveDiagnosis(
                registry,
                message.siteId,
                message.eventId,
                message.diagnosis,
              ),
            true,
          ),
        };
      case 'mark-exorcised':
        return {
          ok: true,
          event: await withRegistry(
            (registry) =>
              markExorcised(registry, message.siteId, message.eventId),
            true,
          ),
        };
      case 'clear-site':
        await withRegistry(
          (registry) => clearSite(registry, message.siteId),
          true,
        );
        return { ok: true };
      case 'clear-all':
        await withRegistry((registry) => clearAll(registry), true);
        return { ok: true };
    }
  } catch {
    return {
      ok: false,
      error: 'Could not update the persistent error registry.',
    };
  }
}

function isBridgeAcknowledgement(value: unknown): boolean {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { kind?: unknown }).kind === 'haunted-runtime-bridge-ack'
  );
}

function isWatchMessage(
  value: unknown,
): value is { type: 'watch-inspected-tab'; tabId: number } {
  if (!value || typeof value !== 'object') return false;
  const message = value as { type?: unknown; tabId?: unknown };
  return (
    message.type === 'watch-inspected-tab' && typeof message.tabId === 'number'
  );
}

function isRuntimeMessage(value: unknown): value is RuntimeMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as { kind?: unknown; payload?: unknown };
  if (message.kind === 'haunted-runtime-bridge-ready') return true;
  if (
    message.kind !== 'haunted-runtime-event' ||
    !message.payload ||
    typeof message.payload !== 'object'
  )
    return false;

  const payload = message.payload as {
    type?: unknown;
    message?: unknown;
    timestamp?: unknown;
  };
  return (
    (payload.type === 'runtime-error' ||
      payload.type === 'unhandled-rejection') &&
    typeof payload.message === 'string' &&
    typeof payload.timestamp === 'number'
  );
}
