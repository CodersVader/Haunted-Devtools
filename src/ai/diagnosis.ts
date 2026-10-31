import { z } from 'zod';
import type { ModelConfig } from './models';
import type { DebugEvent } from '../shared/events';

export const diagnosisSchema = z.object({
  title: z.string().min(1).max(180),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  explanation: z.string().min(1).max(2_000),
  likelyCause: z.string().min(1).max(1_500),
  evidence: z.array(z.string().min(1).max(500)).min(1).max(8),
  suggestedFix: z.string().min(1).max(4_000),
  ghostCommentary: z.string().max(500),
  confidence: z.enum(['low', 'medium', 'high']),
});

export type Diagnosis = z.infer<typeof diagnosisSchema>;
export type DiagnosisResult =
  | { kind: 'validated'; diagnosis: Diagnosis }
  | { kind: 'fallback'; raw: string };
export type DiagnosisTone = 'spooky' | 'mentor' | 'sarcastic';

const toneInstructions: Record<DiagnosisTone, string> = {
  spooky:
    'PERSONA CONTRACT — You are the Velvet Ghost, an elegant nocturnal debugger speaking from inside the machine. Every prose field (title, explanation, likelyCause, suggestedFix, ghostCommentary) must sound unmistakably eerie and intimate: use one restrained spectral image or haunted metaphor in each field, then state the concrete engineering action plainly. Never become vague, theatrical, or frightening; no roleplay brackets, no emojis, no mention of this contract. Evidence stays literal and clinical.',
  mentor:
    'PERSONA CONTRACT — You are the Lantern Keeper, a seasoned debugger who makes difficult failures feel solvable. Every prose field (title, explanation, likelyCause, suggestedFix, ghostCommentary) must use warm, direct coaching language: name the next step, explain why it matters, and reassure without being patronizing. Avoid spooky language, emojis, and generic encouragement. Evidence stays literal and clinical.',
  sarcastic:
    'PERSONA CONTRACT — You are the Cryptic Critic, a sharp but kind debugger with dry wit. Every prose field (title, explanation, likelyCause, suggestedFix, ghostCommentary) must contain one concise, playful observation about the failure and then an exact practical action. The joke is always aimed at the bug, never the developer. Never use insults, snark without a fix, emojis, or roleplay brackets. Evidence stays literal and clinical.',
};

function compactEvent(event: DebugEvent): Record<string, unknown> {
  return {
    type: event.type,
    severity: event.severity,
    title: event.title,
    message: event.message,
    source: event.source,
    request: event.request,
    occurrences: event.occurrences,
  };
}

export function buildDiagnosisPrompt(
  event: DebugEvent,
  model: ModelConfig,
  tone: DiagnosisTone,
): string {
  const emphasis =
    model.promptProfile === 'code-debugging'
      ? 'Prioritize a concrete code-level debugging path.'
      : 'Explain the issue clearly for a developer before proposing the most likely repair.';
  return `You are a local browser-debugging assistant. Analyze only the sanitized event below. Do not invent request bodies, source code, credentials, browser state, or facts not present in the event. ${emphasis}

Return JSON only, with exactly these fields:
title, severity (low|medium|high|critical), explanation, likelyCause, evidence (array of observed facts), suggestedFix, ghostCommentary, confidence (low|medium|high).

Keep likelyCause explicitly probabilistic when the evidence does not prove it. The suggestedFix must be concise and copyable. The selected persona is mandatory, not optional: apply its voice consistently to every prose field, while preserving the same factual claims and technical recommendation a neutral debugger would give. Keep evidence as plain observed facts. ${toneInstructions[tone]} Do not use Markdown fences.

Sanitized event:
${JSON.stringify(compactEvent(event))}`;
}

function removeCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1] : trimmed;
}

export function parseDiagnosisResponse(raw: string): DiagnosisResult {
  try {
    const result = diagnosisSchema.safeParse(
      JSON.parse(removeCodeFence(raw)) as unknown,
    );
    if (result.success) return { kind: 'validated', diagnosis: result.data };
  } catch {
    // The raw response is displayed as an explicitly unstructured fallback.
  }
  return { kind: 'fallback', raw: raw.slice(0, 8_000) };
}
