// Single source of truth for token prices. Shared by browser and server: import nothing node-only here.

export const ACTION_PRICES = {
  generateAndConvert: 50,
  convertOnly: 25,
  render: 50,
  revitJob: 25,
} as const;

// One user action makes several API calls; the step costs add up to the action prices above.
export const STEP_COSTS = {
  floorplanGeneration: 25,
  floorplanConversion: 25,
  aiRender: 50,
  revitJob: 25,
} as const;

export const SIGNUP_GRANT_TOKENS = 100;

export interface TokenPack {
  id: string;
  tokens: number;
  priceUsd: number;
  priceCents: number;
}

export const TOKEN_PACKS: TokenPack[] = [
  { id: 'pack-100', tokens: 100, priceUsd: 9.99, priceCents: 999 },
  { id: 'pack-500', tokens: 500, priceUsd: 25.99, priceCents: 2599 },
  { id: 'pack-1000', tokens: 1000, priceUsd: 49.99, priceCents: 4999 },
];

export const FREE_STORAGE_BYTES = 5 * 1024 * 1024 * 1024;

export const INSUFFICIENT_TOKENS_STATUS = 402;

export const findTokenPack = (packId: unknown): TokenPack | undefined =>
  TOKEN_PACKS.find(pack => pack.id === packId);

export const formatTokens = (n: number): string =>
  Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '—';

export const formatBytes = (n: number): string => {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const value = n / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1).replace(/\.0$/, '')} ${units[exponent]}`;
};

export const pricePer100Tokens = (pack: TokenPack): string =>
  `$${((pack.priceUsd / pack.tokens) * 100).toFixed(2)}`;
