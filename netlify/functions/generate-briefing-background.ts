import { getStore } from '@netlify/blobs';
import { briefings as mockBriefings, previousBriefing } from '../../src/data/mockBriefings';
import { computeSignalScore } from '../../src/lib/score';

/**
 * Background function (up to 15 minutes). Two-step generation:
 *   1) Grounded research — Gemini with the google_search tool finds the real,
 *      current AI/geopolitics developments and returns text + real sources.
 *   2) Structuring — a second (JSON) call turns that research into the full
 *      Signal Gate briefing, attaching the real source URLs to each signal.
 *
 * Grounding can't run together with JSON response mode, hence the two calls.
 * Falls back to ungrounded generation, then to mock, so the site never breaks.
 *
 * Writes [previous, current] to Netlify Blobs. The sync /briefings endpoint
 * only reads that blob.
 */

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const STORE = 'signal-gate';
const KEY = 'latest';

type Cat = { id: string; name: string; category: 'AI' | 'Geopolitics' };
type GroundSource = { title: string; uri: string };

export default async (): Promise<Response> => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return new Response('skipped: no GEMINI_API_KEY', { status: 200 });

  try {
    const { current, grounded } = await generateCurrentBriefing(key);
    const data = [previousBriefing, current];
    const store = getStore(STORE);
    await store.setJSON(KEY, { generatedAt: Date.now(), source: 'gemini', model: MODEL, grounded, data });
    return new Response(`ok: ${current.signals.length} signals, grounded=${grounded}`, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      const store = getStore(STORE);
      const existing = await store.get(KEY, { type: 'json' });
      if (!existing) {
        await store.setJSON(KEY, { generatedAt: Date.now(), source: 'mock', error: message.slice(0, 200), data: mockBriefings });
      }
    } catch {
      /* blobs unavailable */
    }
    return new Response(`error: ${message.slice(0, 300)}`, { status: 200 });
  }
};

// --- Two-step generation ----------------------------------------------------

async function generateCurrentBriefing(key: string): Promise<{ current: ReturnType<typeof coerceBriefing>; grounded: boolean }> {
  const nowIso = new Date().toISOString();
  const catalog: Cat[] = previousBriefing.variableRadar.map((v) => ({
    id: v.id,
    name: v.name,
    category: v.category as 'AI' | 'Geopolitics',
  }));

  // Step 1 — grounded research (best effort).
  let research = '';
  let sources: GroundSource[] = [];
  try {
    const r = await callGemini(key, MODEL, { user: researchPrompt(catalog, nowIso), grounded: true, temperature: 0.4 });
    research = r.text;
    sources = r.sources;
  } catch {
    research = '';
    sources = [];
  }

  // Step 2 — structure into the briefing JSON.
  const user = research ? structureWithResearch(catalog, nowIso, research, sources) : structureFromKnowledge(catalog, nowIso);
  const s = await callGemini(key, MODEL, { system: systemInstruction(), user, json: true, temperature: 0.5 });
  const raw = extractJson(s.text);
  return { current: coerceBriefing(raw, nowIso, catalog, sources), grounded: research.length > 0 };
}

// --- Gemini call ------------------------------------------------------------

type CallOpts = { system?: string; user: string; json?: boolean; grounded?: boolean; temperature?: number };

async function callGemini(key: string, model: string, opts: CallOpts): Promise<{ text: string; sources: GroundSource[] }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature ?? 0.5,
    maxOutputTokens: opts.json ? 8192 : 4096,
  };
  if (opts.json) generationConfig.responseMimeType = 'application/json';
  // Disable "thinking" only on the JSON step so it doesn't eat the output
  // budget; allow it on the research step for better reasoning.
  if (model.includes('2.5') && opts.json) generationConfig.thinkingConfig = { thinkingBudget: 0 };

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: opts.user }] }],
    generationConfig,
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
  if (opts.grounded) body.tools = [{ google_search: {} }];

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`gemini ${res.status}: ${errBody.slice(0, 180)}`);
    }
    const data = (await res.json()) as { candidates?: Candidate[] };
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!text.trim()) throw new Error('empty gemini response');
    return { text, sources: extractGroundingSources(candidate) };
  } finally {
    clearTimeout(timeout);
  }
}

type Candidate = {
  content?: { parts?: { text?: string }[] };
  groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] };
};

function extractGroundingSources(candidate: Candidate | undefined): GroundSource[] {
  const chunks = candidate?.groundingMetadata?.groundingChunks ?? [];
  const out: GroundSource[] = [];
  const seen = new Set<string>();
  for (const c of chunks) {
    const uri = c?.web?.uri;
    const title = c?.web?.title;
    if (typeof uri === 'string' && uri && !seen.has(uri)) {
      seen.add(uri);
      out.push({ uri, title: typeof title === 'string' && title ? title : uri });
    }
  }
  return out.slice(0, 12);
}

// --- Prompts ----------------------------------------------------------------

function systemInstruction(): string {
  return [
    'You are the Signal Gate engine: a personal intelligence filter for AI and geopolitics.',
    'You do not aggregate news; you decide what deserves attention. Cover the WHOLE AI + geopolitics',
    'landscape across all the radar variables provided in the task — do not favor any pre-chosen topic.',
    'You are not searching for specific named topics; the test below selects what matters.',
    '',
    'SIGNAL TEST — an item is a SIGNAL only if it meets AT LEAST 3 of these 5 criteria:',
    '1) Novelty: genuinely new vs the ongoing background narrative, not a re-run of the same story.',
    '2) Persistence: not an isolated short-cycle event; shows continuity, repetition or confirmation.',
    '3) Hard-variable impact: it alters a concrete variable from the radar catalog given in the task.',
    '4) Strategic consequence: it changes incentives, constraints, capabilities, costs, risks or probabilities.',
    '5) Verifiability: at least one traceable source or indicator.',
    'If it meets FEWER than 3, it is NOT a signal — put it in discardedNoise (with the matching reason) or omit it.',
    'This applies to EVERY domain equally — regulation, frontier models, energy, conflicts, chips, elections, etc.',
    'are signals ONLY when they pass (e.g. regulation counts only if it changes obligations, costs or market access;',
    'a conflict counts only if it alters energy, routes or alliances).',
    '',
    'DO NOT PAD. Return only the signals that genuinely pass — if there are only 2, return 2; if 1, return 1.',
    'Never invent, stretch or generalize an item to fill the interface. Specificity over volume.',
    '',
    'Scores are 0-100. signalScore = 0.30*impact + 0.25*confidence + 0.20*novelty + 0.15*actionability',
    '+ 0.10*persistence - 0.20*noiseRisk. >=80 nervous system; 60-79 monitor; <60 out.',
    'timeHorizon is 24h|72h|7d|30d|structural. status is confirmed|probable|rumor|inferred.',
    'level is critical|high|medium|low. change type is new|confirmed|weakened|discarded|escalated|degraded.',
    '',
    'Tone: direct, technical, dry. No newsletter style, no emotional language, no filler.',
    'Do NOT invent URLs or attribute quotes to real outlets. Write all prose fields in Spanish.',
  ].join('\n');
}

function researchPrompt(catalog: Cat[], nowIso: string): string {
  const vars = catalog.map((c) => `${c.name} (${c.category})`).join('; ');
  return [
    `Hoy es ${nowIso}. Investiga con búsqueda qué ha cambiado REALMENTE en las últimas 24-72h en el panorama`,
    'de IA y geopolítica. Evalúa, SIN favorecer ninguna, todas estas variables vivas del radar:',
    vars,
    '',
    'Para cada posible desarrollo aplica el TEST DE SEÑAL (necesita >=3 de 5):',
    '1) novedad real (no el mismo relato de siempre); 2) persistencia/confirmación (no evento aislado);',
    '3) impacto concreto en una de las variables del radar; 4) consecuencia estratégica (cambia incentivos,',
    'restricciones, capacidades, costes, riesgos o probabilidades); 5) verificabilidad con fuente.',
    'Descarta lo que NO pase el test: titular mainstream sin cambio operativo, proceso regulatorio/político sin',
    'nuevas obligaciones/costes/acceso, op-eds, "burbuja IA", hype sin adopción medible, rumores sin benchmark.',
    'No fuerces ni inventes temas: si una variable no tiene nada real hoy, omítela. Es válido encontrar pocas',
    'señales. Para cada hallazgo di qué cambió, qué variable altera y su confirmación. Cita las fuentes.',
  ].join('\n');
}

function schemaBlock(catalog: Cat[]): string[] {
  const cat = catalog.map((c) => `- ${c.id} | ${c.name} | ${c.category}`).join('\n');
  return [
    'Usa ÚNICAMENTE estos ids de variable para signal.variableId, change.relatedVariableId y threshold.relatedVariableId:',
    cat,
    '',
    'Devuelve JSON con EXACTAMENTE estas claves (sin markdown, sin comentarios):',
    '{',
    '  "executiveVerdict": { "whatChanged": str, "whatDidNotChange": str, "deservesAttentionToday": bool, "attentionRationale": str, "mainDistractionRisk": str, "watchTomorrow": str },',
    '  "signalLevels": { "ai": {"level":"high|medium|low","explanation":str}, "geopolitics": {"level":"high|medium|low","explanation":str}, "noise": {"level":"high|medium|low","explanation":str}, "changeSinceLastRun": {"level":"none|minor|material|structural","explanation":str} },',
    '  "signals": [ { "id": "sig-...", "title": str, "category":"AI|Geopolitics", "variableId": one-of-catalog, "variableName": str, "impactScore":0-100, "confidenceScore":0-100, "noveltyScore":0-100, "actionabilityScore":0-100, "persistenceScore":0-100, "noiseRiskScore":0-100, "level":"critical|high|medium|low", "status":"confirmed|probable|rumor|inferred", "timeHorizon":"24h|72h|7d|30d|structural", "whyItMatters": str, "summary": str, "winners":[str], "pressuredActors":[str], "newIncentive": str, "firstOrderConsequence": str, "secondOrderConsequence": str, "invalidationCriteria":[str], "sources":[{"label": str, "sourceIndex": optional int}] } ],',
    '  "changesSinceLastRun": [ { "id":"ch-...", "type":"new|confirmed|weakened|discarded|escalated|degraded", "category":"AI|Geopolitics", "title": str, "previousState": str, "currentState": str, "explanation": str, "impact":"low|medium|high|critical", "relatedSignalId": optional sig-id, "relatedVariableId": optional catalog-id } ],',
    '  "discardedNoise": [ { "id":"disc-...", "title": str, "reason":"hype|rumor|repetition|emotional_not_actionable|no_hard_variable|not_verifiable", "noiseLevel":"low|medium|high", "discardRationale": str } ],',
    '  "thresholds": [ { "id":"th-...", "condition": str, "consequence": str, "inverseCondition": optional str, "inverseConsequence": optional str, "relatedVariableId": optional catalog-id, "relatedSignalId": optional sig-id } ]',
    '}',
    '',
    'TEST DE SEÑAL: en "signals" incluye SOLO los desarrollos que cumplen >=3 de los 5 criterios',
    '(novedad, persistencia, impacto en una variable del catálogo, consecuencia estratégica, verificabilidad).',
    'Todo lo que no pase va a "discardedNoise" con su motivo. Aplica esto a TODOS los dominios por igual',
    '(regulación, frontier, energía, conflictos, chips, elecciones...): solo entran si pasan el test.',
    'NO RELLENES por volumen: muestra solo las señales reales (máx. 7). Si solo hay 2, devuelve 2; si 1, 1.',
    'No inventes ni estires señales. Puntúa de modo que solo lo que de verdad entra al sistema nervioso llegue a >=80.',
    'Como máximo 6 cambios, 6 descartes, 6 umbrales — también solo los reales.',
  ];
}

function structureWithResearch(catalog: Cat[], nowIso: string, research: string, sources: GroundSource[]): string {
  const srcList = sources.map((s, i) => `[${i}] ${s.title}`).join('\n');
  return [
    `Hoy es ${nowIso}. A partir de esta investigación con fuentes reales, produce el briefing ACTUAL como un único objeto JSON.`,
    '',
    'INVESTIGACIÓN:',
    research.slice(0, 6000),
    '',
    'FUENTES DISPONIBLES (en sources[].sourceIndex pon el número de la fuente que respalda esa señal):',
    srcList || '(ninguna)',
    '',
    ...schemaBlock(catalog),
    'En cada señal, adjunta 1-2 fuentes con su sourceIndex de la lista anterior. No inventes fuentes.',
  ].join('\n');
}

function structureFromKnowledge(catalog: Cat[], nowIso: string): string {
  return [
    `Hoy es ${nowIso}. Produce el briefing ACTUAL como un único objeto JSON con tu mejor conocimiento.`,
    '',
    ...schemaBlock(catalog),
    'No inventes URLs ni cites medios reales; en sources usa etiquetas genéricas y omite sourceIndex.',
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

function coerceBriefing(raw: Record<string, unknown>, nowIso: string, catalog: Cat[], groundSources: GroundSource[]) {
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
        sources: coerceSources(sig.sources, groundSources, i),
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

// Map model-emitted sources to real grounded URLs via sourceIndex; never trust
// a model-emitted URL (could be hallucinated) — only attach uris we searched.
function coerceSources(raw: unknown, groundSources: GroundSource[], i: number) {
  const list = arr(raw).map((src, j) => {
    const o = (src ?? {}) as Record<string, unknown>;
    const idx = Number(o.sourceIndex);
    const g = Number.isInteger(idx) && idx >= 0 && idx < groundSources.length ? groundSources[idx] : null;
    return {
      id: `src-gen-${i + 1}-${j + 1}`,
      label: g ? g.title : str(o.label, 'Gemini synthesis'),
      type: 'mock' as const,
      ...(g ? { url: g.uri } : {}),
    };
  });
  return list.length ? list : [{ id: `src-gen-${i + 1}-1`, label: 'Gemini synthesis', type: 'mock' as const }];
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
