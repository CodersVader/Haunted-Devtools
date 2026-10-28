import type { DebugEvent } from "./events";

export const panelPortName = "haunted-devtools-panel";
export const devtoolsRuntimePortName = "haunted-devtools-runtime";

export type PanelMessage =
  | { type: "session-events"; events: DebugEvent[] }
  | { type: "event-detected"; event: DebugEvent }
  | { type: "runtime-bridge-status"; status: "attached" | "unavailable"; detail?: string };

export type PanelCommand =
  | { type: "clear-session" }
  | { type: "set-active-model"; model: string | null };

export function isPanelMessage(value: unknown): value is PanelMessage {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  return value.type === "session-events" || value.type === "event-detected" || value.type === "runtime-bridge-status";
}

export function isPanelCommand(value: unknown): value is PanelCommand {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  if (value.type === "clear-session") return true;
  return value.type === "set-active-model" && "model" in value && (typeof value.model === "string" || value.model === null);
}
