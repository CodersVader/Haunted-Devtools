import type { DebugEvent } from '../shared/events';
import {
  buildDiagnosisPrompt,
  parseDiagnosisResponse,
  type DiagnosisResult,
  type DiagnosisTone,
} from './diagnosis';
import type { ModelConfig } from './models';

const ollamaBaseUrl = 'http://127.0.0.1:11434';
const extensionOriginHelp =
  'Ollama rejected this extension (403). Allow its chrome-extension:// origin with OLLAMA_ORIGINS, then restart Ollama.';

type OllamaTagsResponse = {
  models?: Array<{ name?: unknown; model?: unknown }>;
};
type OllamaPsResponse = { models?: Array<{ name?: unknown; model?: unknown }> };
type OllamaGenerateResponse = { response?: unknown };

async function request(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${ollamaBaseUrl}${path}`, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      throw error;
    throw new Error(
      'Ollama is unavailable. Start the local Ollama service and try again.',
      { cause: error },
    );
  }
}

export async function listInstalledModelNames(): Promise<Set<string>> {
  const response = await request('/api/tags');
  if (!response.ok)
    throw new Error(
      response.status === 403
        ? extensionOriginHelp
        : `Ollama model check failed (${response.status}).`,
    );

  const payload = (await response.json()) as OllamaTagsResponse;
  return new Set(
    (payload.models ?? [])
      .flatMap((model) => [model.name, model.model])
      .filter((name): name is string => typeof name === 'string'),
  );
}

export async function listLoadedModelNames(): Promise<Set<string>> {
  const response = await request('/api/ps');
  if (!response.ok)
    throw new Error(
      response.status === 403
        ? extensionOriginHelp
        : `Ollama running-model check failed (${response.status}).`,
    );

  const payload = (await response.json()) as OllamaPsResponse;
  return new Set(
    (payload.models ?? [])
      .flatMap((model) => [model.name, model.model])
      .filter((name): name is string => typeof name === 'string'),
  );
}

async function setModelKeepAlive(
  model: string,
  keepAlive: '30m' | 0,
): Promise<void> {
  const response = await request('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: '',
      stream: false,
      keep_alive: keepAlive,
    }),
  });
  if (!response.ok)
    throw new Error(
      response.status === 403
        ? extensionOriginHelp
        : `Ollama could not update ${model} (${response.status}).`,
    );
}

export function startModel(model: string): Promise<void> {
  return setModelKeepAlive(model, '30m');
}

export function stopModel(model: string): Promise<void> {
  return setModelKeepAlive(model, 0);
}

export async function diagnoseEvent(
  event: DebugEvent,
  model: ModelConfig,
  tone: DiagnosisTone,
  timeoutMs = 45_000,
): Promise<DiagnosisResult> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await request('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: model.id,
        prompt: buildDiagnosisPrompt(event, model, tone),
        stream: false,
        format: 'json',
        options: { temperature: model.defaultTemperature },
        keep_alive: '30m',
      }),
    });
    if (!response.ok)
      throw new Error(
        response.status === 403
          ? extensionOriginHelp
          : `Ollama diagnosis failed (${response.status}).`,
      );
    const payload = (await response.json()) as OllamaGenerateResponse;
    if (typeof payload.response !== 'string')
      throw new Error('Ollama returned no diagnosis text.');
    return parseDiagnosisResponse(payload.response);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      throw new Error(
        'The local model took too long to respond. Try again or choose a smaller model.',
        { cause: error },
      );
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
