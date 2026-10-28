import { networkFailureToEvent, type NetworkRequestInput } from "../shared/network";
import { devtoolsRuntimePortName, isPanelCommand, panelPortName, type PanelMessage } from "../shared/messaging";
import { SessionEventStore } from "../shared/session-store";
import { isRuntimeExtensionMessage, runtimePayloadToEvent } from "../shared/runtime";
import { stopModel } from "../ai/ollama";

const panelTitle = "Haunted DevTools";
const sessionEvents = new SessionEventStore();
const panelPorts = new Set<chrome.runtime.Port>();
let activeModel: string | null = null;
let runtimeBridgeStatus: Extract<PanelMessage, { type: "runtime-bridge-status" }> = {
  type: "runtime-bridge-status",
  status: "unavailable",
  detail: "Reload the inspected page to attach runtime listeners.",
};

window.chrome.devtools.panels.create(panelTitle, "icons/ghost-16.svg", "panel.html");
const inspectedTabId = window.chrome.devtools.inspectedWindow.tabId;
let runtimePort: chrome.runtime.Port | null = null;

function watchInspectedTab(): void {
  try {
    runtimePort?.postMessage({ type: "watch-inspected-tab", tabId: inspectedTabId });
  } catch {
    // The reconnect loop below restores a port after the extension reloads.
  }
}

function connectRuntimePort(): void {
  const port = window.chrome.runtime.connect({ name: devtoolsRuntimePortName });
  runtimePort = port;
  port.onMessage.addListener((message: unknown) => {
    if (!isRuntimeExtensionMessage(message)) return;

    if (message.kind === "haunted-runtime-bridge-ready") {
      runtimeBridgeStatus = { type: "runtime-bridge-status", status: "attached" };
      broadcast(runtimeBridgeStatus);
      return;
    }

    recordEvent(runtimePayloadToEvent(message.payload));
  });
  port.onDisconnect.addListener(() => {
    if (runtimePort === port) runtimePort = null;
    window.setTimeout(connectRuntimePort, 500);
  });
  watchInspectedTab();
}

connectRuntimePort();
const runtimeHeartbeat = window.setInterval(watchInspectedTab, 20_000);

void hydrateNetworkSession();

window.chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== panelPortName) return;

  panelPorts.add(port);
  postToPanel(port, { type: "session-events", events: sessionEvents.list() });
  postToPanel(port, runtimeBridgeStatus);
  port.onMessage.addListener((message: unknown) => {
    if (!isPanelCommand(message)) return;
    if (message.type === "clear-session") {
      sessionEvents.clear();
      broadcast({ type: "session-events", events: [] });
    }
    if (message.type === "set-active-model") activeModel = message.model;
  });
  port.onDisconnect.addListener(() => panelPorts.delete(port));
});

window.addEventListener("unload", () => {
  window.clearInterval(runtimeHeartbeat);
  runtimePort?.disconnect();
  if (activeModel) void stopModel(activeModel);
});

window.chrome.devtools.network.onRequestFinished.addListener((request) => {
  recordNetworkRequest(request as NetworkRequestInput);
});

window.chrome.devtools.network.onNavigated.addListener(() => {
  runtimeBridgeStatus = {
    type: "runtime-bridge-status",
    status: "unavailable",
    detail: "Waiting for the runtime bridge…",
  };
  broadcast(runtimeBridgeStatus);
  watchInspectedTab();
});

async function hydrateNetworkSession(): Promise<void> {
  try {
    const har = await window.chrome.devtools.network.getHAR();
    har.entries.forEach((request) => recordNetworkRequest(request as NetworkRequestInput));
  } catch (error) {
    console.warn("Haunted DevTools could not read the current network session.", error);
  }
}

function recordNetworkRequest(request: NetworkRequestInput): void {
  const event = networkFailureToEvent(request);
  if (!event) return;

  recordEvent(event);
}

function recordEvent(event: Parameters<SessionEventStore["add"]>[0]): void {
  broadcast({ type: "event-detected", event: sessionEvents.add(event) });
}

function broadcast(message: PanelMessage): void {
  for (const port of panelPorts) postToPanel(port, message);
}

function postToPanel(port: chrome.runtime.Port, message: PanelMessage): void {
  try {
    port.postMessage(message);
  } catch {
    panelPorts.delete(port);
  }
}
