import { useEffect, useRef, useState } from 'react';
import { diagnoseEvent } from '../../ai/ollama';
import type { ModelConfig } from '../../ai/models';
import type { DebugEvent, PersistedDiagnosis } from '../../shared/events';
import type { RegistrySite } from '../../shared/registry';
import { addToQueue, type DiagnosisViewState } from '../incident';
import type { GhostPersonality } from '../personality';

type SaveDiagnosis = (
  siteId: string,
  eventId: string,
  diagnosis: PersistedDiagnosis,
) => void;

export function useDiagnosisQueue({
  activeCaptureSite,
  isModelActive,
  personality,
  selectedModel,
  saveDiagnosis,
}: {
  activeCaptureSite: RegistrySite | null;
  isModelActive: boolean;
  personality: GhostPersonality;
  selectedModel: ModelConfig;
  saveDiagnosis: SaveDiagnosis;
}) {
  const [diagnoses, setDiagnoses] = useState<
    Record<string, DiagnosisViewState>
  >({});
  const [diagnosisQueue, setDiagnosisQueue] = useState<DebugEvent[]>([]);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const diagnosedEventIdsRef = useRef(new Set<string>());
  const modelIsActiveRef = useRef(isModelActive);

  useEffect(() => {
    modelIsActiveRef.current = isModelActive;
  }, [isModelActive]);

  useEffect(() => {
    if (!isModelActive || isDiagnosing || diagnosisQueue.length === 0) return;
    const event = diagnosisQueue[0];
    const timer = globalThis.setTimeout(() => {
      setIsDiagnosing(true);
      setDiagnoses((current) => ({
        ...current,
        [event.id]: { eventId: event.id, status: 'loading' },
      }));
      void diagnoseEvent(event, selectedModel, personality)
        .then((result) => {
          diagnosedEventIdsRef.current.add(event.id);
          setDiagnoses((current) => ({
            ...current,
            [event.id]: { eventId: event.id, status: 'ready', result },
          }));
          if (activeCaptureSite)
            saveDiagnosis(activeCaptureSite.id, event.id, {
              status: 'ready',
              result,
              updatedAt: Date.now(),
            });
        })
        .catch((error: unknown) => {
          diagnosedEventIdsRef.current.add(event.id);
          const message =
            error instanceof Error
              ? error.message
              : 'The local model could not create a diagnosis.';
          setDiagnoses((current) => ({
            ...current,
            [event.id]: { eventId: event.id, status: 'error', error: message },
          }));
          if (activeCaptureSite)
            saveDiagnosis(activeCaptureSite.id, event.id, {
              status: 'error',
              error: message,
              updatedAt: Date.now(),
            });
        })
        .finally(() => {
          setDiagnosisQueue((queue) =>
            queue.filter((queuedEvent) => queuedEvent.id !== event.id),
          );
          setIsDiagnosing(false);
        });
    }, 0);
    return () => globalThis.clearTimeout(timer);
  }, [
    activeCaptureSite,
    diagnosisQueue,
    isDiagnosing,
    isModelActive,
    personality,
    saveDiagnosis,
    selectedModel,
  ]);

  function restoreDiagnoses(events: DebugEvent[]): void {
    setDiagnoses(
      Object.fromEntries(
        events.flatMap((event) =>
          event.diagnosis
            ? [
                [
                  event.id,
                  {
                    eventId: event.id,
                    status: event.diagnosis.status,
                    result: event.diagnosis.result,
                    error: event.diagnosis.error,
                  } satisfies DiagnosisViewState,
                ],
              ]
            : [],
        ),
      ),
    );
    setDiagnosisQueue([]);
    diagnosedEventIdsRef.current = new Set(
      events.filter((event) => !!event.diagnosis).map((event) => event.id),
    );
  }

  function recordIncomingEvent(event: DebugEvent, isNew: boolean): void {
    if (event.diagnosis)
      setDiagnoses((current) => ({
        ...current,
        [event.id]: {
          eventId: event.id,
          status: event.diagnosis!.status,
          result: event.diagnosis!.result,
          error: event.diagnosis!.error,
        },
      }));
    if (
      isNew &&
      modelIsActiveRef.current &&
      !event.diagnosis &&
      !diagnosedEventIdsRef.current.has(event.id)
    )
      setDiagnosisQueue((queue) => addToQueue(queue, event));
  }

  function clearQueue(): void {
    setDiagnosisQueue([]);
  }

  return {
    diagnoses,
    diagnosisQueue,
    isDiagnosing,
    restoreDiagnoses,
    recordIncomingEvent,
    clearQueue,
  };
}
