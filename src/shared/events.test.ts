import { describe, expect, it } from "vitest";
import type { DebugEvent, DebugEventType } from "./events";
import { networkFailureToEvent, sanitizeRequestUrl } from "./network";
import { runtimePayloadToEvent } from "./runtime";
import { SessionEventStore } from "./session-store";

describe("shared DebugEvent contract", () => {
  it("supports each MVP event type", () => {
    const supported: DebugEventType[] = ["runtime-error", "unhandled-rejection", "network-failure"];
    const event: DebugEvent = {
      id: "event-1",
      type: supported[0],
      timestamp: Date.now(),
      severity: "high",
      title: "Test error",
      message: "A deterministic test event.",
      fingerprint: "test-error",
      occurrences: 1,
    };

    expect(supported).toHaveLength(3);
    expect(event.type).toBe("runtime-error");
  });
});

describe("session event store", () => {
  it("groups matching event fingerprints while retaining the newest timestamp", () => {
    const store = new SessionEventStore();
    const first: DebugEvent = {
      id: "first",
      type: "network-failure",
      timestamp: 10,
      severity: "medium",
      title: "HTTP 404",
      message: "A safe message",
      fingerprint: "network:GET:https://example.test/missing:404",
      occurrences: 1,
    };

    store.add(first);
    const grouped = store.add({ ...first, id: "second", timestamp: 20 });

    expect(grouped.id).toBe("first");
    expect(grouped.occurrences).toBe(2);
    expect(store.list()).toEqual([grouped]);
  });

  it("clears a session without persisting events", () => {
    const store = new SessionEventStore();
    store.add({
      id: "event",
      type: "runtime-error",
      timestamp: 1,
      severity: "high",
      title: "Runtime error",
      message: "Safe text",
      fingerprint: "runtime-error:safe",
      occurrences: 1,
    });

    store.clear();
    expect(store.list()).toEqual([]);
  });
});

describe("runtime error normalization", () => {
  it("redacts query secrets from runtime-error evidence", () => {
    const event = runtimePayloadToEvent({
      type: "runtime-error",
      message: "Failed to load /profile?token=do-not-store",
      source: "https://app.example.test/main.js?key=private",
      line: 42,
      column: 8,
      timestamp: 0,
    });

    expect(event.type).toBe("runtime-error");
    expect(event.message).not.toContain("do-not-store");
    expect(event.message).not.toContain("private");
    expect(event.source?.url).toContain("[REDACTED]");
  });
});

describe("network failure normalization", () => {
  it("strips query values before creating a failed-request event", () => {
    const event = networkFailureToEvent({
      startedDateTime: "2026-10-28T00:00:00.000Z",
      request: { method: "GET", url: "https://api.example.test/profile?token=do-not-store" },
      response: { status: 401, statusText: "Unauthorized" },
    });

    expect(event?.request?.url).toBe("https://api.example.test/profile");
    expect(event?.message).not.toContain("do-not-store");
  });

  it("does not create events for successful requests", () => {
    const event = networkFailureToEvent({
      startedDateTime: "2026-10-28T00:00:00.000Z",
      request: { method: "GET", url: "https://api.example.test/healthy" },
      response: { status: 200, statusText: "OK" },
    });

    expect(event).toBeNull();
  });

  it("removes query data from malformed URLs too", () => {
    expect(sanitizeRequestUrl("not a URL?secret=value")).toBe("not a URL");
  });
});
