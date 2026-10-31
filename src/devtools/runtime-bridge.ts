import {
  devtoolsRuntimePortName,
  type PanelMessage,
} from '../shared/messaging';
import {
  isRuntimeExtensionMessage,
  runtimePayloadToEvent,
} from '../shared/runtime';

type RuntimeBridgeStatus = Extract<
  PanelMessage,
  { type: 'runtime-bridge-status' }
>;

export type RuntimeBridge = {
  watch: () => void;
  disconnect: () => void;
};

export function createRuntimeBridge(
  tabId: number,
  onStatus: (status: RuntimeBridgeStatus) => void,
  onEvent: (event: ReturnType<typeof runtimePayloadToEvent>) => void,
): RuntimeBridge {
  let port: chrome.runtime.Port | null = null;
  let reconnectTimer: number | undefined;

  function watch(): void {
    try {
      port?.postMessage({ type: 'watch-inspected-tab', tabId });
    } catch {
      // The reconnect handler will restore the tab subscription.
    }
  }

  function connect(): void {
    const nextPort = window.chrome.runtime.connect({
      name: devtoolsRuntimePortName,
    });
    port = nextPort;
    nextPort.onMessage.addListener((message: unknown) => {
      if (!isRuntimeExtensionMessage(message)) return;
      if (message.kind === 'haunted-runtime-bridge-ready')
        onStatus({ type: 'runtime-bridge-status', status: 'attached' });
      else onEvent(runtimePayloadToEvent(message.payload));
    });
    nextPort.onDisconnect.addListener(() => {
      if (port !== nextPort) return;
      port = null;
      reconnectTimer = window.setTimeout(connect, 500);
    });
    watch();
  }

  connect();
  return {
    watch,
    disconnect: () => {
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      port?.disconnect();
      port = null;
    },
  };
}
