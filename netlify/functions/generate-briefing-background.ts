import { getStore } from '@netlify/blobs';
import { briefings as mockBriefings, previousBriefing } from '../../src/data/mockBriefings';
import { computeSignalScore } from '../../src/lib/score';

/**
 * Background function (up to 15 minutes) — this is where the slow work lives.
 * It asks Gemini for the FULL, rich current briefing under the Signal Gate
 * doctrine and writes [previous, current] to Netlify Blobs. The synchronous
 * /briefings endpoint only ever reads that blob, so it never hits the 10s limit.
 *
 * Triggered by:
 *  - the scheduled function (cron), and
 *  - the sync endpoint when the stored briefing is missing or stale.
 *
 * Invoke: POST /.netlify/functions/generate-briefing-background  (returns 202).
 */

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
const STORE = 'signal-gate';
const KEY = 'latest';

type Cat = { id: string; name: string; category: 'AI' | 'Geopolitics' };

export default async (): Promise<Response> => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return new Response('skipped: no GEMINI_API_KEY', { status: 200 });

  try {
    const current = await generateCurrentBriefing(key);
    const data = [previousBriefing, current];
    const store = getStore(STORE);
    await store.setJSON(KEY, { generatedAt: Date.now(), source: 'gemini', model: MODEL, data });
    return new Response(`ok: generated ${current.signals.length} signals`, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Persist a mock so the site has something coherent even if generation fails.
    try {
      const store = getStore(STORE);
      const existing = await store.get(KEY, { type: 'json' });
      if (!existing) {
        await store.setJSON(KEY, { generatedAt: Date.now(), source: 'mock', error: message.slice(0, 200), data: mockBriefings });
      }
    } catch {
      /* blobs unavailable — nothing else to do */
    }
    return new Response(`error: ${message.slice(0, 300)}`, { status: 200 });
  }
};

// --- Gemini call ------------------------------------------------------------

async function generateCurrentBriefing(key: string): Promise<ReturnType<typeof coerceBriefing>> {
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
  // Background functions allow up to 15 minutes, so give Gemini real room.
  const timeout = setTimeout(() => controller.abort(), 120000);
  const generationConfig: Record<string, unknown> = {
    responseMimeType: 'application/json',
    temperature: 0.6,
    maxOutputTokens: 8192,
  };
  if (model.includes('2.5')) generationConfig.thinkingConfig = { thinkingBudget: 0 };
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
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const out = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!out.trim()) throw new Error('empty gemini response');
    return out;
  } finally {
    clearTimeout(timeout);
  }
}

// --- Prompt (rich — no 10s budget here) -------------------------------------

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
    'Write all prose fields in Spanish.',
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
    'Rules: 4 to 7 signals, only the most decision-relevant current AI/geopolitics dynamics.',
    'Each signal: 2-3 short sentences max per prose field, up to 3 winners, 3 pressuredActors, 3 invalidationCriteria, 1-2 sources.',
    'Up to 6 changes, 6 discarded items, 6 thresholds.',
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

function coerceBriefing(raw: Record<string, unknown>, nowIso: string, catalog: Cat[]) {
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
      deservesAttentionToday:
        typeof verdict.deservesAttentionToday === 'boolean' ? verdict.deservesAttentionToday : signals.some((s) => computeSignalScore(s) >= 80),
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

function deriveMatrix(signals: ScoredSignal[], discarded: { title: string }[]) {
  return {
    nervousSystem: signals.filter((s) => computeSignalScore(s) >= 80).map((s) => s.title),
    monitorCalmly: signals
      .filter((s) => {
        const v = computeSignalScore(s);
        return v >= 60 && v < 80;
      })
      .map((s) => s.title),
    ignore: discarded.map((d) => d.title),
  };
}

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
