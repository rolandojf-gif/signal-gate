import type {
  ChangeType,
  ImpactLevel,
  NoiseLevel,
  RadarStatus,
  SignalLevelValue,
  SignalPriorityLevel,
  SignalStatus,
  Trend,
  ChangeMagnitude,
  DiscardReason,
  TimeHorizon,
} from '../types/briefing';

export const signalLevelColor: Record<SignalLevelValue, string> = {
  low: 'text-signal-ok',
  medium: 'text-signal-warn',
  high: 'text-signal-alert',
};

export const noiseLevelColor: Record<NoiseLevel, string> = {
  low: 'text-signal-mute',
  medium: 'text-signal-warn',
  high: 'text-signal-alert',
};

export const changeMagnitudeColor: Record<ChangeMagnitude, string> = {
  none: 'text-signal-mute',
  minor: 'text-signal-info',
  material: 'text-signal-warn',
  structural: 'text-signal-alert',
};

export const radarStatusToken: Record<RadarStatus, { label: string; dot: string; text: string }> = {
  stable: { label: 'stable', dot: 'bg-signal-ok', text: 'text-signal-ok' },
  heating: { label: 'heating', dot: 'bg-signal-warn', text: 'text-signal-warn' },
  breakout: { label: 'breakout', dot: 'bg-signal-alert', text: 'text-signal-alert' },
  noise: { label: 'noise', dot: 'bg-signal-mute', text: 'text-signal-mute' },
  no_new_data: { label: 'no new data', dot: 'bg-ink-faint', text: 'text-ink-muted' },
};

export const trendGlyph: Record<Trend, string> = {
  up: '↑',
  down: '↓',
  stable: '→',
};

export const trendColor: Record<Trend, string> = {
  up: 'text-signal-alert',
  down: 'text-signal-info',
  stable: 'text-ink-muted',
};

export const changeTypeToken: Record<ChangeType, { label: string; cls: string }> = {
  new: { label: 'new', cls: 'border-signal-info/40 text-signal-info' },
  confirmed: { label: 'confirmed', cls: 'border-signal-ok/40 text-signal-ok' },
  weakened: { label: 'weakened', cls: 'border-signal-mute/40 text-signal-mute' },
  discarded: { label: 'discarded', cls: 'border-ink-faint text-ink-muted' },
  escalated: { label: 'escalated', cls: 'border-signal-alert/40 text-signal-alert' },
  degraded: { label: 'degraded', cls: 'border-signal-info/40 text-signal-info' },
};

export const impactColor: Record<ImpactLevel, string> = {
  low: 'text-signal-mute',
  medium: 'text-signal-info',
  high: 'text-signal-warn',
  critical: 'text-signal-alert',
};

export const signalPriorityToken: Record<SignalPriorityLevel, { label: string; cls: string }> = {
  low: { label: 'low', cls: 'text-signal-mute' },
  medium: { label: 'medium', cls: 'text-signal-warn' },
  high: { label: 'high', cls: 'text-signal-alert' },
  critical: { label: 'critical', cls: 'text-signal-alert font-medium' },
};

export const signalStatusLabel: Record<SignalStatus, string> = {
  confirmed: 'confirmed',
  probable: 'probable',
  rumor: 'rumor',
  inferred: 'inferred',
};

export const timeHorizonLabel: Record<TimeHorizon, string> = {
  '24h': '24h',
  '72h': '72h',
  '7d': '7d',
  '30d': '30d',
  structural: 'structural',
};

export const discardReasonLabel: Record<DiscardReason, string> = {
  hype: 'hype',
  rumor: 'rumor',
  repetition: 'repetition',
  emotional_not_actionable: 'emotional, not actionable',
  no_hard_variable: 'no hard variable',
  not_verifiable: 'not verifiable',
};

export function scoreTier(score: number): 'nervous' | 'monitor' | 'below' {
  if (score >= 80) return 'nervous';
  if (score >= 60) return 'monitor';
  return 'below';
}
