import { describe, expect, it } from 'vitest';
import { buildDiagnosisPrompt, parseDiagnosisResponse } from './diagnosis';
import type { ModelConfig } from './models';
import type { DebugEvent } from '../shared/events';

const event: DebugEvent = {
  id: 'event-1',
  type: 'network-failure',
  timestamp: 1,
  severity: 'medium',
  title: 'HTTP 404',
  message: 'GET https://example.test/missing returned 404 Not Found.',
  fingerprint: 'network:test',
  occurrences: 1,
  request: {
    method: 'GET',
    url: 'https://example.test/missing',
    status: 404,
    statusText: 'Not Found',
  },
};
const model: ModelConfig = {
  id: 'qwen2.5:7b-instruct',
  label: 'Qwen',
  purpose: 'Test',
  promptProfile: 'code-debugging',
  defaultTemperature: 0.15,
};

describe('structured diagnosis', () => {
  it('builds a prompt containing only the compact event contract', () => {
    const prompt = buildDiagnosisPrompt(event, model, 'sarcastic');
    expect(prompt).toContain('https://example.test/missing');
    expect(prompt).toContain('code-level debugging path');
    expect(prompt).toContain('Cryptic Critic');
    expect(prompt).not.toContain('authorization');
  });

  it('validates a complete JSON diagnosis', () => {
    const result = parseDiagnosisResponse(
      JSON.stringify({
        title: 'Missing route',
        severity: 'medium',
        explanation: 'The route was not found.',
        likelyCause: 'The endpoint may be incorrect.',
        evidence: ['The request returned 404.'],
        suggestedFix: 'Check the route.',
        ghostCommentary: 'A route has vanished.',
        confidence: 'high',
      }),
    );
    expect(result.kind).toBe('validated');
  });

  it('keeps invalid model output in an explicitly unstructured fallback', () => {
    expect(parseDiagnosisResponse('not JSON')).toEqual({
      kind: 'fallback',
      raw: 'not JSON',
    });
  });
});
