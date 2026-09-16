export const TEXT4C_LOW_LATENCY_GENERATION_CONFIG = {
  temperature: 0.2,
  candidateCount: 1,
  responseModalities: ['IMAGE'],
  thinkingConfig: {
    thinkingLevel: 'minimal',
    includeThoughts: false,
  },
  imageConfig: {
    aspectRatio: '1:1',
    imageSize: '1K',
  },
} as const;

