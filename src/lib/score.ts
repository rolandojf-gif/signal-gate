export type ScoreParts = {
  impactScore: number;
  confidenceScore: number;
  noveltyScore: number;
  actionabilityScore: number;
  persistenceScore: number;
  noiseRiskScore: number;
};

export const SCORE_WEIGHTS = [
  { key: 'impactScore', label: 'impact', weight: 0.3 },
  { key: 'confidenceScore', label: 'confidence', weight: 0.25 },
  { key: 'noveltyScore', label: 'novelty', weight: 0.2 },
  { key: 'actionabilityScore', label: 'actionability', weight: 0.15 },
  { key: 'persistenceScore', label: 'persistence', weight: 0.1 },
  { key: 'noiseRiskScore', label: 'noise risk', weight: -0.2 },
] as const satisfies ReadonlyArray<{ key: keyof ScoreParts; label: string; weight: number }>;

export function computeSignalScore(p: ScoreParts): number {
  const raw = SCORE_WEIGHTS.reduce((acc, w) => acc + w.weight * p[w.key], 0);
  return Math.max(0, Math.min(100, Math.round(raw)));
}
