import { UsageEntry } from './types';

interface PricingTier {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

function getPricing(model: string): PricingTier {
  if (model.includes('haiku')) {
    return { input: 0.80, output: 4.00, cacheRead: 0.08, cacheWrite: 1.00 };
  }
  if (model.includes('opus')) {
    return { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 };
  }
  // Default: sonnet / unknown
  return { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 };
}

export function calculateCost(entry: UsageEntry): number {
  const pricing = getPricing(entry.model);
  return (
    (entry.inputTokens / 1_000_000) * pricing.input +
    (entry.outputTokens / 1_000_000) * pricing.output +
    (entry.cacheReadTokens / 1_000_000) * pricing.cacheRead +
    (entry.cacheCreationTokens / 1_000_000) * pricing.cacheWrite
  );
}

export function formatCost(usd: number): string {
  return '$' + usd.toFixed(2);
}

export function formatTokens(count: number): string {
  if (count < 1000) {
    return String(count);
  }
  if (count < 1_000_000) {
    return Math.round(count / 1000) + 'k';
  }
  return (count / 1_000_000).toFixed(1) + 'M';
}
