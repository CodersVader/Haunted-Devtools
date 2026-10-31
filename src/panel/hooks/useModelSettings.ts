import { useEffect, useMemo, useState } from 'react';
import {
  defaultModelId,
  modelSelectionStorageKey,
  supportedModels,
  type ModelConfig,
} from '../../ai/models';
import {
  listInstalledModelNames,
  listLoadedModelNames,
  startModel,
  stopModel,
} from '../../ai/ollama';
import {
  ghostPersonalities,
  ghostPersonalityStorageKey,
  type GhostPersonality,
} from '../personality';

type ModelAction = 'starting' | 'stopping' | null;

export function useModelSettings(
  onModelStateChange: (model: string | null) => void,
) {
  const [selectedModelId, setSelectedModelId] =
    useState<ModelConfig['id']>(defaultModelId);
  const [installedModels, setInstalledModels] = useState<Set<string>>(
    new Set(),
  );
  const [ollamaStatus, setOllamaStatus] = useState<
    'checking' | 'online' | 'offline'
  >('checking');
  const [modelAction, setModelAction] = useState<ModelAction>(null);
  const [modelNotice, setModelNotice] = useState<string | null>(null);
  const [activeModelId, setActiveModelId] = useState<ModelConfig['id'] | null>(
    null,
  );
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [personality, setPersonality] = useState<GhostPersonality>('spooky');

  const selectedModel = useMemo(
    () => supportedModels.find((model) => model.id === selectedModelId)!,
    [selectedModelId],
  );
  const selectedPersonality = useMemo(
    () => ghostPersonalities.find((voice) => voice.id === personality)!,
    [personality],
  );
  const selectedModelInstalled = installedModels.has(selectedModelId);
  const modelIsActive = activeModelId === selectedModelId;

  useEffect(() => {
    void (async () => {
      const stored = await window.chrome.storage.local.get([
        modelSelectionStorageKey,
        ghostPersonalityStorageKey,
      ]);
      const savedModel = stored[modelSelectionStorageKey];
      if (supportedModels.some((model) => model.id === savedModel))
        setSelectedModelId(savedModel as ModelConfig['id']);
      const savedPersonality = stored[ghostPersonalityStorageKey];
      if (ghostPersonalities.some((voice) => voice.id === savedPersonality))
        setPersonality(savedPersonality as GhostPersonality);
      await refreshOllama(true);
    })();
  }, []);

  async function refreshOllama(revealWhenInactive = false): Promise<void> {
    setOllamaStatus('checking');
    try {
      const [installed, loaded] = await Promise.all([
        listInstalledModelNames(),
        listLoadedModelNames(),
      ]);
      setInstalledModels(installed);
      setOllamaStatus('online');
      const active =
        supportedModels.find((model) => loaded.has(model.id))?.id ?? null;
      setActiveModelId(active);
      if (revealWhenInactive) setModelMenuOpen(active === null);
    } catch (error) {
      setInstalledModels(new Set());
      setOllamaStatus('offline');
      setActiveModelId(null);
      setModelMenuOpen(true);
      setModelNotice(
        error instanceof Error ? error.message : 'Ollama is unavailable.',
      );
    }
  }

  async function selectModel(modelId: ModelConfig['id']): Promise<void> {
    setSelectedModelId(modelId);
    setModelNotice(null);
    await window.chrome.storage.local.set({
      [modelSelectionStorageKey]: modelId,
    });
  }

  async function selectPersonality(next: GhostPersonality): Promise<void> {
    setPersonality(next);
    await window.chrome.storage.local.set({
      [ghostPersonalityStorageKey]: next,
    });
  }

  async function changeModelState(): Promise<void> {
    const action = activeModelId === selectedModelId ? 'stopping' : 'starting';
    setModelAction(action);
    setModelNotice(null);
    try {
      if (action === 'starting') {
        await startModel(selectedModelId);
        setActiveModelId(selectedModelId);
        onModelStateChange(selectedModelId);
        setModelMenuOpen(false);
      } else {
        await stopModel(selectedModelId);
        setActiveModelId(null);
        onModelStateChange(null);
        setModelMenuOpen(true);
      }
      setModelNotice(
        action === 'starting'
          ? 'Model is warmed and kept alive for 30 minutes.'
          : 'Model unloaded from local memory.',
      );
      await refreshOllama();
    } catch (error) {
      setModelNotice(
        error instanceof Error ? error.message : 'The model action failed.',
      );
    } finally {
      setModelAction(null);
    }
  }

  async function copySuggestedFix(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setModelNotice('Suggested fix copied to the clipboard.');
    } catch {
      setModelNotice(
        'Could not copy the suggested fix. Select and copy it manually.',
      );
    }
  }

  return {
    selectedModelId,
    selectedModel,
    selectedModelInstalled,
    ollamaStatus,
    modelAction,
    modelNotice,
    activeModelId,
    modelIsActive,
    modelMenuOpen,
    setModelMenuOpen,
    personality,
    selectedPersonality,
    refreshOllama,
    selectModel,
    selectPersonality,
    changeModelState,
    copySuggestedFix,
  };
}
