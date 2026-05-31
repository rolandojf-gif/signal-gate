# Signal Gate

**AI & Geopolitics signal filter.** A personal intelligence panel that answers one
question — *"Has anything changed that should matter to me?"* — by filtering noise
aggressively instead of aggregating news. Every element on screen must help decide,
explain a change, justify attention, justify a discard, or define a future threshold.

Live: https://signal-gate.netlify.app

## Stack

Vite · React · TypeScript · Tailwind CSS. Deployed on Netlify. Phase 1 runs entirely
on local mock data — no API keys required.

## Develop

```bash
npm install
npm run dev        # http://localhost:5180
npm run build      # type-check + production build to dist/
npm run typecheck  # types only
```

## Architecture

```
src/
  types/briefing.ts        Domain types (the data contract)
  data/mockBriefings.ts    Mock previous + current snapshots
  lib/
    score.ts               signalScore formula — single source of truth
    briefingSource.ts      Async data seam: pick backend, normalize, validate
    validateBriefing.ts    Dev-time coherence checks (dangling ids, score drift)
    useLastVisit.ts        localStorage memory: what's new since *your* last visit
    tokens.ts / format.ts  Presentation helpers
  components/              One component per dashboard section
  App.tsx                 Loads data async, wires sections together
```

### Swapping the backend (Phase 2)

The app only ever calls `loadBriefings()`. To move off mock data you don't touch UI
code — you implement the matching loader in [`src/lib/briefingSource.ts`](src/lib/briefingSource.ts)
and set `VITE_DATA_SOURCE`:

| `VITE_DATA_SOURCE` | Loader to implement | Source |
| ------------------ | ------------------- | ------ |
| `mock` (default)   | ready               | `src/data/mockBriefings.ts` |
| `netlify`          | `loadNetlify()`     | `/.netlify/functions/briefings` |
| `supabase`         | `loadSupabase()`    | Supabase table |

Any backend only needs to return `BriefingRun[]`. `normalizeBriefings()` re-derives
`signalScore` from its six component scores, so backends never compute the headline
number themselves and it can't drift from the formula the UI shows.

### Coherence validator

In dev, every load runs `validateBriefings()` and logs a grouped report to the
console (also on `window.__signalGateValidation`). It fails loudly on dangling
signal/variable references and on any stored `signalScore` that disagrees with the
formula — the dashboard's value depends on the verdict, matrix, signals and radar
telling the same story.

## Mock data

All sources are clearly labelled `MOCK:` and carry no real URLs, outlets or
attributed quotes. The goal is to validate structure, UX and decision logic — not to
simulate real reporting.
