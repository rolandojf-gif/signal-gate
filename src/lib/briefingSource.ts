import type { BriefingRun } from '../types/briefing';
import { briefings as mockBriefings } from '../data/mockBriefings';
import { computeSignalScore } from './score';
import { validateBriefings, type ValidationIssue } from './validateBriefing';

export type DataSourceId = 'mock' | 'netlify' | 'supabase';

const SOURCE: DataSourceId = import.meta.env.VITE_DATA_SOURCE ?? 'mock';

export function getDataSourceId(): DataSourceId {
  return SOURCE;
}

// What actually produced the last payload, read from the function's
// x-signal-gate-source header (gemini | gemini-cached | mock-*). Lets the UI
// label the source honestly instead of assuming.
let lastPayloadSource = 'mock';
export function getPayloadSource(): string {
  return lastPayloadSource;
}

// When the stored briefing was produced (ISO string from the function), used to
// detect that an on-demand regeneration has actually landed.
let lastGeneratedAt = '';
export function getPayloadGeneratedAt(): string {
  return lastGeneratedAt;
}

// Whether the last payload was grounded in real Google Search sources.
let lastGrounded = false;
export function getPayloadGrounded(): boolean {
  return lastGrounded;
}

// On-demand: ask the background function to generate a fresh briefing. Returns
// immediately (the work runs server-side); poll loadBriefings() for the result.
export async function requestRegeneration(): Promise<void> {
  if (SOURCE !== 'netlify') return;
  try {
    await fetch('/.netlify/functions/generate-briefing-background', { method: 'POST' });
  } catch {
    /* fire-and-forget */
  }
}

/**
 * Re-derive signalScore from its parts so *any* backend — mock today, a Netlify
 * Function or Supabase tomorrow — is guaranteed coherent with the formula the
 * UI shows. Backends only have to send the six component scores; this is the
 * single place that turns them into the headline number.
 */
export function normalizeBriefings(briefings: BriefingRun[]): BriefingRun[] {
  return briefings.map((b) => ({
    ...b,
    signals: b.signals.map((s) => ({ ...s, signalScore: computeSignalScore(s) })),
  }));
}

async function loadMock(): Promise<BriefingRun[]> {
  // Simulate async I/O so the loading path matches a real fetch.
  await new Promise((resolve) => setTimeout(resolve, 250));
  lastPayloadSource = 'mock';
  lastGeneratedAt = '';
  lastGrounded = false;
  return mockBriefings;
}

async function loadNetlify(): Promise<BriefingRun[]> {
  const res = await fetch('/.netlify/functions/briefings', {
    headers: { accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Netlify briefings function returned ${res.status} ${res.statusText}`);
  }
  lastPayloadSource = res.headers.get('x-signal-gate-source') ?? 'netlify';
  lastGeneratedAt = res.headers.get('x-signal-gate-generated-at') ?? '';
  lastGrounded = res.headers.get('x-signal-gate-grounded') === 'true';
  return (await res.json()) as BriefingRun[];
}

async function loadSupabase(): Promise<BriefingRun[]> {
  // Phase 2 seam — query the briefings table via the Supabase client here.
  throw new Error('Supabase source not wired yet. Set VITE_DATA_SOURCE=mock.');
}

const loaders: Record<DataSourceId, () => Promise<BriefingRun[]>> = {
  mock: loadMock,
  netlify: loadNetlify,
  supabase: loadSupabase,
};

/**
 * The one function the app calls. Swapping the entire backend is changing the
 * VITE_DATA_SOURCE env var (and implementing the matching loader above) — no UI
 * code changes. Normalizes scores, then validates coherence in dev.
 */
export async function loadBriefings(): Promise<BriefingRun[]> {
  const raw = await loaders[SOURCE]();
  const normalized = normalizeBriefings(raw);
  if (import.meta.env.DEV) {
    reportIssues(validateBriefings(normalized));
  }
  return normalized;
}

function reportIssues(issues: ValidationIssue[]): void {
  if (typeof window !== 'undefined') {
    (window as unknown as { __signalGateValidation?: ValidationIssue[] }).__signalGateValidation = issues;
  }
  if (issues.length === 0) {
    console.info('[Signal Gate] coherence check passed ✓');
    return;
  }
  const errors = issues.filter((i) => i.severity === 'error');
  const warns = issues.filter((i) => i.severity === 'warn');
  console.groupCollapsed(`[Signal Gate] coherence: ${errors.length} error(s), ${warns.length} warning(s)`);
  for (const i of issues) {
    const line = `[${i.rule}] ${i.briefingId}: ${i.message}`;
    if (i.severity === 'error') console.error(line);
    else console.warn(line);
  }
  console.groupEnd();
}
