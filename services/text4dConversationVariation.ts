const TEXT4D_VARIATION_PROFILES = [
  { envelope: 'balanced, short side about 76% of long side', planning: 'prioritize useful daylight' },
  { envelope: 'compact, short side about 86% of long side', planning: 'prioritize privacy zoning' },
  { envelope: 'moderately linear, short side about 68% of long side', planning: 'prioritize compact circulation' },
] as const;

export const getText4dConversationProfile = (variationIndex = 0) =>
  TEXT4D_VARIATION_PROFILES[Math.abs(Math.trunc(variationIndex)) % TEXT4D_VARIATION_PROFILES.length];
