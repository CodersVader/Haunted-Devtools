export type ModelConfig = {
  id: 'gemma4:e2b-it-qat' | 'qwen2.5:7b-instruct';
  label: string;
  purpose: string;
  promptProfile: 'general-debugging' | 'code-debugging';
  defaultTemperature: number;
};

export const supportedModels: readonly ModelConfig[] = [
  {
    id: 'gemma4:e2b-it-qat',
    label: 'Gemma 4 E2B IT QAT',
    purpose: 'General local debugging explanations',
    promptProfile: 'general-debugging',
    defaultTemperature: 0.2,
  },
  {
    id: 'qwen2.5:7b-instruct',
    label: 'Qwen 2.5 7B Instruct',
    purpose: 'Code-focused debugging explanations',
    promptProfile: 'code-debugging',
    defaultTemperature: 0.15,
  },
];

export const defaultModelId = 'qwen2.5:7b-instruct' as const;
export const modelSelectionStorageKey = 'hauntedDevTools.selectedModel';
