import { afterEach, describe, expect, it, vi } from "vitest";
import { listInstalledModelNames, listLoadedModelNames, startModel, stopModel } from "./ollama";

afterEach(() => vi.unstubAllGlobals());

describe("Ollama local client", () => {
  it("lists local model tags", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ models: [{ name: "qwen2.5:7b-instruct" }] }), { status: 200 })));
    await expect(listInstalledModelNames()).resolves.toEqual(new Set(["qwen2.5:7b-instruct"]));
  });

  it("lists models that are currently loaded", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ models: [{ name: "gemma4:e2b-it-qat" }] }), { status: 200 })));

    await expect(listLoadedModelNames()).resolves.toEqual(new Set(["gemma4:e2b-it-qat"]));
  });

  it("starts and stops a model with Ollama keep_alive", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await startModel("qwen2.5:7b-instruct");
    await stopModel("qwen2.5:7b-instruct");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://127.0.0.1:11434/api/generate", expect.objectContaining({ body: JSON.stringify({ model: "qwen2.5:7b-instruct", prompt: "", stream: false, keep_alive: "30m" }) }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://127.0.0.1:11434/api/generate", expect.objectContaining({ body: JSON.stringify({ model: "qwen2.5:7b-instruct", prompt: "", stream: false, keep_alive: 0 }) }));
  });

  it("explains how to allow the extension when Ollama returns 403", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("forbidden", { status: 403 })));

    await expect(startModel("qwen2.5:7b-instruct")).rejects.toThrow("OLLAMA_ORIGINS");
  });
});
