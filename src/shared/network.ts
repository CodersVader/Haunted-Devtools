import type { DebugEvent, DebugEventSeverity } from "./events";

export type NetworkRequestInput = {
  startedDateTime: string;
  request: { method: string; url: string };
  response: { status: number; statusText: string };
};

export function sanitizeRequestUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.split("?")[0].replace(/\/\/[^/@]+@/, "//");
  }
}

export function isFailedNetworkRequest(request: NetworkRequestInput): boolean {
  return request.response.status === 0 || request.response.status >= 400;
}

function severityForStatus(status: number): DebugEventSeverity {
  if (status === 0 || status >= 500) return "high";
  if (status >= 400) return "medium";
  return "low";
}

export function networkFailureToEvent(request: NetworkRequestInput): DebugEvent | null {
  if (!isFailedNetworkRequest(request)) return null;

  const safeUrl = sanitizeRequestUrl(request.request.url);
  const status = request.response.status;
  const transportFailure = status === 0;
  const statusLabel = transportFailure ? "Network request failed" : `HTTP ${status}`;
  const timestamp = Date.parse(request.startedDateTime);

  return {
    id: crypto.randomUUID(),
    type: "network-failure",
    timestamp: Number.isNaN(timestamp) ? Date.now() : timestamp,
    severity: severityForStatus(status),
    title: statusLabel,
    message: transportFailure
      ? `${request.request.method} ${safeUrl} did not receive a network response.`
      : `${request.request.method} ${safeUrl} returned ${status}${request.response.statusText ? ` ${request.response.statusText}` : ""}.`,
    fingerprint: `network:${request.request.method}:${safeUrl}:${status}`,
    occurrences: 1,
    request: {
      method: request.request.method,
      url: safeUrl,
      status: transportFailure ? undefined : status,
      statusText: request.response.statusText || undefined,
    },
  };
}
