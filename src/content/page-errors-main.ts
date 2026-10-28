(() => {
  const installedFlag = "__hauntedDevToolsRuntimeListenerInstalled__";
  const eventType = "haunted-devtools:runtime-event";
  const maxMessageLength = 2_000;
  const pageWindow = window as unknown as Window & Record<string, boolean | undefined>;

  if (pageWindow[installedFlag]) return;
  pageWindow[installedFlag] = true;

  const compactMessage = (value: unknown): string => {
    if (typeof value === "string") return value.slice(0, maxMessageLength);
    if (value instanceof Error) return value.message.slice(0, maxMessageLength);
    if (value === null || value === undefined) return "Unhandled Promise rejection";
    try {
      return String(value).slice(0, maxMessageLength);
    } catch {
      return "Unhandled Promise rejection";
    }
  };

  window.addEventListener(
    "error",
    (event) => {
      window.postMessage(
        {
          type: eventType,
          payload: {
            type: "runtime-error",
            message: compactMessage(event.message),
            source: event.filename || undefined,
            line: event.lineno || undefined,
            column: event.colno || undefined,
            timestamp: Date.now(),
          },
        },
        window.location.origin,
      );
    },
    true,
  );

  window.addEventListener("unhandledrejection", (event) => {
    window.postMessage(
      {
        type: eventType,
        payload: {
          type: "unhandled-rejection",
          message: compactMessage(event.reason),
          timestamp: Date.now(),
        },
      },
      window.location.origin,
    );
  });
})();
