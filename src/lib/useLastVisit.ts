import { useEffect, useMemo, useState } from 'react';
import type { BriefingRun } from '../types/briefing';

const KEY = 'signal-gate:v1:lastVisit';

type VisitStore = {
  seenChangeIds: string[];
  lastVisitAt: string | null;
};

const EMPTY: VisitStore = { seenChangeIds: [], lastVisitAt: null };

function readStore(): VisitStore {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<VisitStore>;
    return {
      seenChangeIds: Array.isArray(parsed.seenChangeIds) ? parsed.seenChangeIds : [],
      lastVisitAt: typeof parsed.lastVisitAt === 'string' ? parsed.lastVisitAt : null,
    };
  } catch {
    return EMPTY;
  }
}

function writeStore(s: VisitStore): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode / quota — degrade silently */
  }
}

/**
 * Tracks which change ids the user has already seen across sessions, so the UI
 * can answer "has anything changed that should matter to *me*?" relative to the
 * person's own last visit — not just relative to the previous mock run.
 */
export function useLastVisit(briefings: BriefingRun[]) {
  // Snapshot of what was seen BEFORE this session — read exactly once.
  const [baseline] = useState<VisitStore>(() => readStore());

  const newChangeIds = useMemo(() => {
    // First visit ever: don't flag everything as "new" — that would be noise.
    if (!baseline.lastVisitAt) return new Set<string>();
    const seen = new Set(baseline.seenChangeIds);
    const ids = new Set<string>();
    for (const b of briefings) {
      for (const c of b.changesSinceLastRun) {
        if (!seen.has(c.id)) ids.add(c.id);
      }
    }
    return ids;
  }, [baseline, briefings]);

  // On mount, record everything currently in the dataset as seen and stamp the
  // visit time. Highlighting for this session still uses the mount-time baseline.
  useEffect(() => {
    const current = readStore();
    const merged = new Set(current.seenChangeIds);
    for (const b of briefings) {
      for (const c of b.changesSinceLastRun) merged.add(c.id);
    }
    writeStore({ seenChangeIds: [...merged], lastVisitAt: new Date().toISOString() });
  }, [briefings]);

  return { newChangeIds, lastVisitAt: baseline.lastVisitAt };
}
