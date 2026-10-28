(() => {
  const eventType = "haunted-devtools:runtime-event";

  const sendToExtension = (message: unknown): void => {
    try {
      void chrome.runtime.sendMessage(message).catch(() => {
        // An extension reload invalidates old content-script contexts until the page reloads.
      });
    } catch {
      // The page can retain a stale content script briefly while Chrome reloads an extension.
    }
  };

  const announceReady = (): void => {
    sendToExtension({ kind: "haunted-runtime-bridge-ready" });
  };

  announceReady();

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (message && typeof message === "object" && (message as { kind?: unknown }).kind === "haunted-request-runtime-bridge") {
      announceReady();
      sendResponse({ kind: "haunted-runtime-bridge-ack" });
    }
  });

  const clip = (value: unknown, limit = 2_000): string | undefined =>
    typeof value === "string" ? value.slice(0, limit) : undefined;

  const sanitizeUrl = (value: unknown): string | undefined => {
    const source = clip(value, 4_000);
    if (!source) return undefined;
    try {
      const url = new URL(source);
      return `${url.origin}${url.pathname}`;
    } catch {
      return source.split("?")[0];
    }
  };

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data as { type?: unknown; payload?: Record<string, unknown> } | null;
    if (!data || data.type !== eventType || !data.payload) return;

    const type = data.payload.type;
    const message = clip(data.payload.message);
    const timestamp = data.payload.timestamp;
    if ((type !== "runtime-error" && type !== "unhandled-rejection") || !message || typeof timestamp !== "number") return;

    sendToExtension({
      kind: "haunted-runtime-event",
      payload: {
        type,
        message,
        source: sanitizeUrl(data.payload.source),
        line: typeof data.payload.line === "number" ? data.payload.line : undefined,
        column: typeof data.payload.column === "number" ? data.payload.column : undefined,
        timestamp,
      },
    });
  });
})();
