import { getStore } from '@netlify/blobs';
import { briefings as mockBriefings } from '../../src/data/mockBriefings';

/**
 * Synchronous endpoint the app fetches. It ONLY reads the precomputed briefing
 * from Netlify Blobs — never calls Gemini — so it always returns well under the
 * 10s limit. When the stored briefing is missing or stale it fires a
 * regeneration in the background (stale-while-revalidate) and returns whatever
 * it has right now (the stale blob, or the bundled mock on a cold start).
 *
 * Endpoint: /.netlify/functions/briefings
 */

const STORE = 'signal-gate';
const KEY = 'latest';
const STALE_MS = 24 * 60 * 60 * 1000; // passive floor: regenerate if older than a day
const TRIGGER_COOLDOWN_MS = 2 * 60 * 1000; // don't fire regen more than once / 2 min per instance

type StoredBriefing = { generatedAt?: number; source?: string; data?: unknown; error?: string; grounded?: boolean };

let lastTriggerAt = 0;

export default async (): Promise<Response> => {
  let stored: StoredBriefing | null = null;
  try {
    const store = getStore(STORE);
    stored = await store.get(KEY, { type: 'json' });
  } catch {
    /* Blobs unavailable in this context — fall through to mock */
  }

  const now = Date.now();
  const hasData = !!stored?.data;
  const generatedAt = stored?.generatedAt ?? 0;
  // A stored mock is a *fallback* (generation failed), not real data — keep
  // retrying (throttled) instead of treating it as fresh for 6h, so the site
  // recovers as soon as Gemini works again.
  const isFallback = (stored?.source ?? '') === 'mock';
  const stale = !hasData || isFallback || now - generatedAt > STALE_MS;

  if (stale && now - lastTriggerAt > TRIGGER_COOLDOWN_MS && process.env.GEMINI_API_KEY) {
    lastTriggerAt = now;
    void triggerRegen();
  }

  if (hasData) {
    return jsonResponse(stored!.data, stored!.source ?? 'blob', generatedAt, stored?.error, stored?.grounded === true);
  }
  return jsonResponse(mockBriefings, 'mock', 0);
};

async function triggerRegen(): Promise<void> {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (!base) return;
  try {
    await fetch(`${base}/.netlify/functions/generate-briefing-background`, { method: 'POST' });
  } catch {
    /* fire-and-forget */
  }
}

function jsonResponse(body: unknown, source: string, generatedAt: number, error?: string, grounded?: boolean): Response {
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-signal-gate-source': source,
    'x-signal-gate-generated-at': generatedAt ? new Date(generatedAt).toISOString() : 'never',
    'x-signal-gate-grounded': grounded ? 'true' : 'false',
  };
  if (error) headers['x-signal-gate-error'] = error.replace(/[^\x20-\x7E]/g, ' ').slice(0, 180);
  return new Response(JSON.stringify(body), { status: 200, headers });
}
