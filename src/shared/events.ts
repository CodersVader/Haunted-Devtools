export type DebugEventType = "runtime-error" | "unhandled-rejection" | "network-failure";

export type DebugEventSeverity = "low" | "medium" | "high" | "critical";

export type DebugEvent = {
  id: string;
  type: DebugEventType;
  timestamp: number;
  severity: DebugEventSeverity;
  title: string;
  message: string;
  fingerprint: string;
  occurrences: number;
  source?: {
    url: string;
    line?: number;
    column?: number;
  };
  request?: {
    method: string;
    url: string;
    status?: number;
    statusText?: string;
  };
};
