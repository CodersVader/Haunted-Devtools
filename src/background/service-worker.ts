const devtoolsRuntimePortName = "haunted-devtools-runtime";

type RuntimeMessage =
  | { kind: "haunted-runtime-bridge-ready" }
  | {
      kind: "haunted-runtime-event";
      payload: {
        type: "runtime-error" | "unhandled-rejection";
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
    const ports = devtoolsPortsByTab.get(watchedTabId) ?? new Set<chrome.runtime.Port>();
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
    const response = await chrome.tabs.sendMessage(tabId, { kind: "haunted-request-runtime-bridge" });
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
      files: ["page-errors-main.js"],
      world: "MAIN",
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["error-bridge.js"],
      world: "ISOLATED",
    });
  } catch {
    // Chrome internal pages and pages without host access cannot receive a bridge.
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender) => {
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

function isBridgeAcknowledgement(value: unknown): boolean {
  return !!value && typeof value === "object" && (value as { kind?: unknown }).kind === "haunted-runtime-bridge-ack";
}

function isWatchMessage(value: unknown): value is { type: "watch-inspected-tab"; tabId: number } {
  if (!value || typeof value !== "object") return false;
  const message = value as { type?: unknown; tabId?: unknown };
  return message.type === "watch-inspected-tab" && typeof message.tabId === "number";
}

function isRuntimeMessage(value: unknown): value is RuntimeMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as { kind?: unknown; payload?: unknown };
  if (message.kind === "haunted-runtime-bridge-ready") return true;
  if (message.kind !== "haunted-runtime-event" || !message.payload || typeof message.payload !== "object") return false;

  const payload = message.payload as { type?: unknown; message?: unknown; timestamp?: unknown };
  return (
    (payload.type === "runtime-error" || payload.type === "unhandled-rejection") &&
    typeof payload.message === "string" &&
    typeof payload.timestamp === "number"
  );
}
