import { briefings as mockBriefings, previousBriefing } from '../../src/data/mockBriefings';
import { computeSignalScore } from '../../src/lib/score';

/**
 * Phase 2 data transport + first real AI integration.
 *
 *  - No GEMINI_API_KEY            -> serves the bundled mock (site never breaks).
 *  - GEMINI_API_KEY present       -> asks Gemini to produce the *current*
 *                                    briefing under the Signal Gate doctrine and
 *                                    pairs it with the mock previous run as the
 *                                    comparison baseline.
 *  - Any error / timeout          -> falls back to mock.
 *
 * The client still normalizes scores and (in dev) validates coherence on top of
 * whatever this returns, so the formula and id-integrity hold even for AI output.
 *
 * Endpoint: /.netlify/functions/briefings
 */

// flash-lite is the model that reliably finishes within Netlify's 10s sync
// limit for this payload. Override with GEMINI_MODEL if quota/latency allows.
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

type Cat = { id: string; name: string; category: 'AI' | 'Geopolitics' };

// Module-level caches survive across warm invocations of the same function
// instance. They keep us from calling Gemini on every page load (which would
// burn the free-tier quota) and from hammering it while it is rate-limited.
const SUCCESS_TTL_MS = 10 * 60 * 1000;
const COOLDOWN_MS = 60 * 1000;
let success: { at: number; data: unknown } | null = null;
let cooldownUntil = 0;

export default async (): Promise<Response> => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return jsonResponse(mockBriefings, 'mock-no-key');
  }
  const now = Date.now();
  if (success && now - success.at < SUCCESS_TTL_MS) {
    return jsonResponse(success.data, 'gemini-cached');
  }
  if (now < cooldownUntil) {
    return jsonResponse(mockBriefings, 'mock-cooldown');
  }
  try {
    const data = [previousBriefing, await generateCurrentBriefing(key)];
    success = { at: now, data };
    return jsonResponse(data, 'gemini');
  } catch (err) {
    cooldownUntil = now + COOLDOWN_MS;
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(mockBriefings, 'mock-fallback', message);
  }
};

function jsonResponse(body: unknown, source: string, error?: string): Response {
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-signal-gate-source': source,
  };
  // Header values cannot contain newlines or non-ASCII control chars — Gemini
  // error bodies do, so sanitize before this becomes a 502.
  if (error) headers['x-signal-gate-error'] = error.replace(/[^\x20-\x7E]/g, ' ').slice(0, 180);
  return new Response(JSON.stringify(body), { status: 200, headers });
}

// --- Gemini call ------------------------------------------------------------

async function generateCurrentBriefing(key: string): Promise<unknown> {
  const nowIso = new Date().toISOString();
  const catalog: Cat[] = previousBriefing.variableRadar.map((v) => ({
    id: v.id,
    name: v.name,
    category: v.category as 'AI' | 'Geopolitics',
  }));

  const text = await callGemini(key, MODEL, systemInstruction(), userPrompt(catalog, nowIso));
  const raw = extractJson(text);
  return coerceBriefing(raw, nowIso, catalog);
}

async function callGemini(key: string, model: string, system: string, user: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9700);
  // Gemini 2.5 models "think" by default, which blows past Netlify's 10s sync
  // limit. Disable it so the call returns in a few seconds.
  const generationConfig: Record<string, unknown> = {
    responseMimeType: 'application/json',
    temperature: 0.6,
    maxOutputTokens: 3072,
  };
  if (model.includes('2.5')) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig,
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`gemini ${res.status}: ${body.slice(0, 180)}`);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const out = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!out.trim()) throw new Error('empty gemini response');
    return out;
  } finally {
    clearTimeout(timeout);
  }
}

// --- Prompt -----------------------------------------------------------------

function systemInstruction(): string {
  return [
    'You are the Signal Gate engine: a personal intelligence filter for AI and geopolitics.',
    'You do not aggregate news; you decide what deserves attention. Filter noise aggressively.',
    '',
    'A SIGNAL must meet at least 3 of 5 criteria: novelty, persistence, impact on a hard variable,',
    'strategic consequence (changes incentives/constraints/capabilities/costs/risks/probabilities),',
    'verifiability. Otherwise it is NOISE.',
    '',
    'Scores are 0-100. signalScore is derived as:',
    '0.30*impact + 0.25*confidence + 0.20*novelty + 0.15*actionability + 0.10*persistence - 0.20*noiseRisk.',
    'signalScore>=80 enters the nervous system; 60-79 monitor; <60 stays out.',
    'timeHorizon is one of 24h|72h|7d|30d|structural. status is confirmed|probable|rumor|inferred.',
    'level is critical|high|medium|low. change type is new|confirmed|weakened|discarded|escalated|degraded.',
    '',
    'Tone: direct, technical, dry. No newsletter style, no emotional language, no filler.',
    'Do NOT invent real URLs, journalists, or quotes attributed to real outlets.',
    'Write the prose fields in Spanish.',
  ].join('\n');
}

function userPrompt(catalog: Cat[], nowIso: string): string {
  const cat = catalog.map((c) => `- ${c.id} | ${c.name} | ${c.category}`).join('\n');
  return [
    `Today is ${nowIso}. Produce the CURRENT briefing as a single JSON object.`,
    '',
    'Use ONLY these variable ids for signal.variableId, change.relatedVariableId and threshold.relatedVariableId:',
    cat,
    '',
    'Return JSON with EXACTLY these keys (no markdown, no commentary):',
    '{',
    '  "executiveVerdict": { "whatChanged": str, "whatDidNotChange": str, "deservesAttentionToday": bool, "attentionRationale": str, "mainDistractionRisk": str, "watchTomorrow": str },',
    '  "signalLevels": { "ai": {"level":"high|medium|low","explanation":str}, "geopolitics": {"level":"high|medium|low","explanation":str}, "noise": {"level":"high|medium|low","explanation":str}, "changeSinceLastRun": {"level":"none|minor|material|structural","explanation":str} },',
    '  "signals": [ { "id": "sig-...", "title": str, "category":"AI|Geopolitics", "variableId": one-of-catalog, "variableName": str, "impactScore":0-100, "confidenceScore":0-100, "noveltyScore":0-100, "actionabilityScore":0-100, "persistenceScore":0-100, "noiseRiskScore":0-100, "level":"critical|high|medium|low", "status":"confirmed|probable|rumor|inferred", "timeHorizon":"24h|72h|7d|30d|structural", "whyItMatters": str, "summary": str, "winners":[str], "pressuredActors":[str], "newIncentive": str, "firstOrderConsequence": str, "secondOrderConsequence": str, "invalidationCriteria":[str], "sources":[{"id":str,"label":"MOCK: ...","type":"mock"}] } ],',
    '  "changesSinceLastRun": [ { "id":"ch-...", "type":"new|confirmed|weakened|discarded|escalated|degraded", "category":"AI|Geopolitics", "title": str, "previousState": str, "currentState": str, "explanation": str, "impact":"low|medium|high|critical", "relatedSignalId": optional sig-id, "relatedVariableId": optional catalog-id } ],',
    '  "discardedNoise": [ { "id":"disc-...", "title": str, "reason":"hype|rumor|repetition|emotional_not_actionable|no_hard_variable|not_verifiable", "noiseLevel":"low|medium|high", "discardRationale": str } ],',
    '  "thresholds": [ { "id":"th-...", "condition": str, "consequence": str, "inverseCondition": optional str, "inverseConsequence": optional str, "relatedVariableId": optional catalog-id, "relatedSignalId": optional sig-id } ]',
    '}',
    '',
    'Rules: EXACTLY 3 signals, the most decision-relevant current AI/geopolitics dynamics.',
    'Every prose field = ONE short sentence. Max 1 winner, 1 pressuredActor, 1 invalidationCriterion. Omit sources.',
    'Max 2 changes, 2 discarded items, 2 thresholds. Be very terse — must fit a 10s budget.',
    'Score signals so only genuine nervous-system items reach >=80; do not pad.',
  ].join('\n');
}

// --- Parse + coerce ---------------------------------------------------------

function extractJson(text: string): Record<string, unknown> {
  const tryParse = (s: string) => {
    try {
      return JSON.parse(s) as Record<string, unknown>;
    } catch {
      return null;
    }
  };
  let parsed = tryParse(text);
  if (!parsed) {
    const fenced = text.replace(/```json/gi, '```').split('```').map((s) => s.trim());
    for (const block of fenced) {
      const p = tryParse(block);
      if (p) {
        parsed = p;
        break;
      }
    }
  }
  if (!parsed) {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first !== -1 && last > first) parsed = tryParse(text.slice(first, last + 1));
  }
  if (!parsed) throw new Error('could not parse JSON from gemini output');
  return parsed;
}

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, d = ''): string => (typeof v === 'string' && v.trim() ? v : d);
const strList = (v: unknown): string[] => arr(v).map((x) => str(x)).filter(Boolean);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], d: T): T =>
  allowed.includes(v as T) ? (v as T) : d;
const clamp = (v: unknown, d = 50): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : d;
};

const HORIZONS = ['24h', '72h', '7d', '30d', 'structural'] as const;
const STATUSES = ['confirmed', 'probable', 'rumor', 'inferred'] as const;
const LEVELS = ['critical', 'high', 'medium', 'low'] as const;
const SIGNAL_LEVELS = ['high', 'medium', 'low'] as const;
const MAGNITUDES = ['none', 'minor', 'material', 'structural'] as const;
const CHANGE_TYPES = ['new', 'confirmed', 'weakened', 'discarded', 'escalated', 'degraded'] as const;
const IMPACTS = ['low', 'medium', 'high', 'critical'] as const;
const DISCARD_REASONS = ['hype', 'rumor', 'repetition', 'emotional_not_actionable', 'no_hard_variable', 'not_verifiable'] as const;
const CATEGORIES = ['AI', 'Geopolitics'] as const;

function coerceBriefing(raw: Record<string, unknown>, nowIso: string, catalog: Cat[]): unknown {
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const byName = new Map(catalog.map((c) => [c.name.toLowerCase(), c]));
  const resolveVar = (variableId: unknown, variableName: unknown, category: 'AI' | 'Geopolitics'): Cat => {
    if (typeof variableId === 'string' && byId.has(variableId)) return byId.get(variableId)!;
    const named = byName.get(String(variableName ?? '').toLowerCase());
    if (named) return named;
    return catalog.find((c) => c.category === category) ?? catalog[0];
  };

  const signals = arr(raw.signals)
    .slice(0, 7)
    .map((s, i) => {
      const sig = (s ?? {}) as Record<string, unknown>;
      const category = oneOf(sig.category, CATEGORIES, 'AI');
      const v = resolveVar(sig.variableId, sig.variableName, category);
      return {
        id: str(sig.id, `sig-gen-${i + 1}`),
        title: str(sig.title, 'Untitled signal'),
        category,
        variableId: v.id,
        variableName: v.name,
        signalScore: clamp(sig.signalScore, 0),
        impactScore: clamp(sig.impactScore),
        confidenceScore: clamp(sig.confidenceScore),
        noveltyScore: clamp(sig.noveltyScore),
        actionabilityScore: clamp(sig.actionabilityScore),
        persistenceScore: clamp(sig.persistenceScore),
        noiseRiskScore: clamp(sig.noiseRiskScore, 30),
        level: oneOf(sig.level, LEVELS, 'medium'),
        status: oneOf(sig.status, STATUSES, 'probable'),
        timeHorizon: oneOf(sig.timeHorizon, HORIZONS, '7d'),
        whyItMatters: str(sig.whyItMatters, ''),
        summary: str(sig.summary, ''),
        winners: strList(sig.winners),
        pressuredActors: strList(sig.pressuredActors),
        newIncentive: str(sig.newIncentive, ''),
        firstOrderConsequence: str(sig.firstOrderConsequence, ''),
        secondOrderConsequence: str(sig.secondOrderConsequence, ''),
        invalidationCriteria: strList(sig.invalidationCriteria),
        sources: arr(sig.sources).map((src, j) => {
          const o = (src ?? {}) as Record<string, unknown>;
          return { id: str(o.id, `src-gen-${i + 1}-${j + 1}`), label: str(o.label, 'MOCK: Gemini synthesis'), type: 'mock' as const };
        }),
      };
    });
  if (signals.length === 0) throw new Error('gemini returned no signals');
  const signalIds = new Set(signals.map((s) => s.id));

  const changesSinceLastRun = arr(raw.changesSinceLastRun).map((c, i) => {
    const ch = (c ?? {}) as Record<string, unknown>;
    const relatedSignalId =
      typeof ch.relatedSignalId === 'string' && signalIds.has(ch.relatedSignalId) ? ch.relatedSignalId : undefined;
    const relatedVariableId =
      typeof ch.relatedVariableId === 'string' && byId.has(ch.relatedVariableId) ? ch.relatedVariableId : undefined;
    return {
      id: str(ch.id, `ch-gen-${i + 1}`),
      type: oneOf(ch.type, CHANGE_TYPES, 'new'),
      category: oneOf(ch.category, CATEGORIES, 'AI'),
      title: str(ch.title, 'Change'),
      previousState: str(ch.previousState, '—'),
      currentState: str(ch.currentState, '—'),
      explanation: str(ch.explanation, ''),
      impact: oneOf(ch.impact, IMPACTS, 'medium'),
      ...(relatedSignalId ? { relatedSignalId } : {}),
      ...(relatedVariableId ? { relatedVariableId } : {}),
    };
  });

  const discardedNoise = arr(raw.discardedNoise).map((d, i) => {
    const o = (d ?? {}) as Record<string, unknown>;
    return {
      id: str(o.id, `disc-gen-${i + 1}`),
      title: str(o.title, 'Discarded item'),
      reason: oneOf(o.reason, DISCARD_REASONS, 'no_hard_variable'),
      noiseLevel: oneOf(o.noiseLevel, SIGNAL_LEVELS, 'medium'),
      discardRationale: str(o.discardRationale, ''),
    };
  });

  const thresholds = arr(raw.thresholds).map((t, i) => {
    const o = (t ?? {}) as Record<string, unknown>;
    const relatedSignalId =
      typeof o.relatedSignalId === 'string' && signalIds.has(o.relatedSignalId) ? o.relatedSignalId : undefined;
    const relatedVariableId =
      typeof o.relatedVariableId === 'string' && byId.has(o.relatedVariableId) ? o.relatedVariableId : undefined;
    return {
      id: str(o.id, `th-gen-${i + 1}`),
      condition: str(o.condition, ''),
      consequence: str(o.consequence, ''),
      ...(typeof o.inverseCondition === 'string' ? { inverseCondition: o.inverseCondition } : {}),
      ...(typeof o.inverseConsequence === 'string' ? { inverseConsequence: o.inverseConsequence } : {}),
      ...(relatedSignalId ? { relatedSignalId } : {}),
      ...(relatedVariableId ? { relatedVariableId } : {}),
    };
  });

  const verdict = (raw.executiveVerdict ?? {}) as Record<string, unknown>;
  const levels = (raw.signalLevels ?? {}) as Record<string, Record<string, unknown>>;
  const levelBlock = (b: Record<string, unknown> | undefined, allowed: readonly string[], d: string) => ({
    level: oneOf(b?.level, allowed as readonly string[], d),
    explanation: str(b?.explanation, ''),
  });

  return {
    id: `briefing-${nowIso.slice(0, 10)}`,
    timestamp: nowIso,
    executiveVerdict: {
      whatChanged: str(verdict.whatChanged, ''),
      whatDidNotChange: str(verdict.whatDidNotChange, ''),
      deservesAttentionToday: typeof verdict.deservesAttentionToday === 'boolean' ? verdict.deservesAttentionToday : signals.some((s) => s.signalScore >= 80),
      attentionRationale: str(verdict.attentionRationale, ''),
      mainDistractionRisk: str(verdict.mainDistractionRisk, ''),
      watchTomorrow: str(verdict.watchTomorrow, ''),
    },
    signalLevels: {
      ai: levelBlock(levels.ai, SIGNAL_LEVELS, 'medium'),
      geopolitics: levelBlock(levels.geopolitics, SIGNAL_LEVELS, 'medium'),
      noise: levelBlock(levels.noise, SIGNAL_LEVELS, 'medium'),
      changeSinceLastRun: levelBlock(levels.changeSinceLastRun, MAGNITUDES, 'minor'),
    },
    changesSinceLastRun,
    signals,
    variableRadar: deriveRadar(catalog, signals, discardedNoise, nowIso),
    discardedNoise,
    actionMatrix: deriveMatrix(signals, discardedNoise),
    thresholds,
  };
}

type ScoredSignal = {
  id: string;
  title: string;
  variableId: string;
  whyItMatters: string;
  impactScore: number;
  confidenceScore: number;
  noveltyScore: number;
  actionabilityScore: number;
  persistenceScore: number;
  noiseRiskScore: number;
};

// Action matrix is derived from the signals (using the same score formula the
// client applies) so the three columns can't contradict the signal tiers.
function deriveMatrix(signals: ScoredSignal[], discarded: { title: string }[]) {
  return {
    nervousSystem: signals.filter((s) => computeSignalScore(s) >= 80).map((s) => s.title),
    monitorCalmly: signals.filter((s) => {
      const v = computeSignalScore(s);
      return v >= 60 && v < 80;
    }).map((s) => s.title),
    ignore: discarded.map((d) => d.title),
  };
}

// Radar is derived from signals (not asked of the model) so it stays perfectly
// coherent with them and every relatedSignalId resolves.
function deriveRadar(catalog: Cat[], signals: ScoredSignal[], discarded: { title: string }[], nowIso: string) {
  return catalog.map((c) => {
    const related = signals.filter((s) => s.variableId === c.id);
    const top = related.reduce<number>((m, s) => Math.max(m, computeSignalScore(s)), 0);
    const mentionedAsNoise =
      related.length === 0 && discarded.some((d) => d.title.toLowerCase().includes(c.name.toLowerCase().split(' ')[0]));

    let status: string;
    let trend: string;
    if (top >= 80) {
      status = 'breakout';
      trend = 'up';
    } else if (top >= 60) {
      status = 'heating';
      trend = 'up';
    } else if (mentionedAsNoise) {
      status = 'noise';
      trend = 'stable';
    } else {
      status = related.length ? 'stable' : 'no_new_data';
      trend = 'stable';
    }

    return {
      id: c.id,
      name: c.name,
      category: c.category,
      status,
      trend,
      explanation: related[0]?.whyItMatters ?? 'Sin novedad relevante en este ciclo.',
      lastUpdated: nowIso,
      ...(related.length ? { relatedSignalIds: related.map((s) => s.id) } : {}),
    };
  });
}
