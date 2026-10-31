export type GhostPersonality = 'spooky' | 'mentor' | 'sarcastic';

export const ghostPersonalityStorageKey = 'hauntedDevTools.ghostPersonality';

export const ghostPersonalities: ReadonlyArray<{
  id: GhostPersonality;
  label: string;
  icon: string;
  description: string;
}> = [
  { id: 'spooky', label: 'Spooky', icon: '◌', description: 'Quietly ominous' },
  {
    id: 'mentor',
    label: 'Mentor',
    icon: '✦',
    description: 'Calm and practical',
  },
  {
    id: 'sarcastic',
    label: 'Sarcastic',
    icon: '☠',
    description: 'Dry, never cruel',
  },
];

const introductions: Record<GhostPersonality, string> = {
  spooky: 'Something in this trace is whispering.',
  mentor: 'Let’s turn this clue into a reliable next step.',
  sarcastic:
    'Ah yes, a browser doing browser things—fortunately, the evidence is useful.',
};

export function decorateGhostCommentary(
  personality: GhostPersonality,
  modelCommentary: string,
): string {
  return modelCommentary
    ? `${introductions[personality]} ${modelCommentary}`
    : introductions[personality];
}
