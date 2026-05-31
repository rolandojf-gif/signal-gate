export type Category = 'AI' | 'Geopolitics';

export type SignalLevelValue = 'high' | 'medium' | 'low';

export type NoiseLevel = 'high' | 'medium' | 'low';

export type ChangeMagnitude = 'none' | 'minor' | 'material' | 'structural';

export type SignalStatus = 'confirmed' | 'probable' | 'rumor' | 'inferred';

export type SignalPriorityLevel = 'critical' | 'high' | 'medium' | 'low';

export type TimeHorizon = '24h' | '72h' | '7d' | '30d' | 'structural';

export type ChangeType =
  | 'new'
  | 'confirmed'
  | 'weakened'
  | 'discarded'
  | 'escalated'
  | 'degraded';

export type ImpactLevel = 'low' | 'medium' | 'high' | 'critical';

export type RadarStatus =
  | 'stable'
  | 'heating'
  | 'breakout'
  | 'noise'
  | 'no_new_data';

export type Trend = 'up' | 'down' | 'stable';

export type DiscardReason =
  | 'hype'
  | 'rumor'
  | 'repetition'
  | 'emotional_not_actionable'
  | 'no_hard_variable'
  | 'not_verifiable';

export type MockSource = {
  id: string;
  label: string;
  type: 'mock';
  note?: string;
  /**
   * Phase 2: when a real, traceable source is attached the UI renders the label
   * as a link. Left undefined for mock sources so nothing pretends to be real.
   */
  url?: string;
};

export type ExecutiveVerdict = {
  whatChanged: string;
  whatDidNotChange: string;
  deservesAttentionToday: boolean;
  attentionRationale: string;
  mainDistractionRisk: string;
  watchTomorrow: string;
};

export type SignalLevels = {
  ai: {
    level: SignalLevelValue;
    explanation: string;
  };
  geopolitics: {
    level: SignalLevelValue;
    explanation: string;
  };
  noise: {
    level: NoiseLevel;
    explanation: string;
  };
  changeSinceLastRun: {
    level: ChangeMagnitude;
    explanation: string;
  };
};

export type Signal = {
  id: string;
  title: string;
  category: Category;
  variableId: string;
  variableName: string;

  signalScore: number;
  impactScore: number;
  confidenceScore: number;
  noveltyScore: number;
  actionabilityScore: number;
  persistenceScore: number;
  noiseRiskScore: number;

  level: SignalPriorityLevel;
  status: SignalStatus;
  timeHorizon: TimeHorizon;

  whyItMatters: string;
  summary: string;

  winners: string[];
  pressuredActors: string[];
  newIncentive: string;
  firstOrderConsequence: string;
  secondOrderConsequence: string;
  invalidationCriteria: string[];

  sources: MockSource[];
};

export type ChangeItem = {
  id: string;
  relatedSignalId?: string;
  relatedVariableId?: string;
  type: ChangeType;
  category: Category;
  title: string;
  previousState: string;
  currentState: string;
  explanation: string;
  impact: ImpactLevel;
};

export type RadarVariable = {
  id: string;
  name: string;
  category: Category;
  status: RadarStatus;
  trend: Trend;
  explanation: string;
  lastUpdated: string;
  relatedSignalIds?: string[];
};

export type DiscardedNoiseItem = {
  id: string;
  title: string;
  reason: DiscardReason;
  noiseLevel: NoiseLevel;
  affectedVariable?: string;
  discardRationale: string;
};

export type ActionMatrix = {
  nervousSystem: string[];
  monitorCalmly: string[];
  ignore: string[];
};

export type Threshold = {
  id: string;
  relatedVariableId?: string;
  relatedSignalId?: string;
  condition: string;
  consequence: string;
  inverseCondition?: string;
  inverseConsequence?: string;
};

export type BriefingRun = {
  id: string;
  timestamp: string;
  executiveVerdict: ExecutiveVerdict;
  signalLevels: SignalLevels;
  changesSinceLastRun: ChangeItem[];
  signals: Signal[];
  variableRadar: RadarVariable[];
  discardedNoise: DiscardedNoiseItem[];
  actionMatrix: ActionMatrix;
  thresholds: Threshold[];
};
