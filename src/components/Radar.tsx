import { useMemo } from 'react';
import type { RadarVariable } from '../types/briefing';
import { radarStatusToken, trendColor, trendGlyph } from '../lib/tokens';
import { relativeFromNow } from '../lib/format';

type Props = {
  variables: RadarVariable[];
  asOf: string;
};

export function Radar({ variables, asOf }: Props) {
  const { ai, geo } = useMemo(() => {
    const order: Record<string, number> = {
      breakout: 0,
      heating: 1,
      stable: 2,
      noise: 3,
      no_new_data: 4,
    };
    const sorted = [...variables].sort((a, b) => order[a.status] - order[b.status]);
    return {
      ai: sorted.filter((v) => v.category === 'AI'),
      geo: sorted.filter((v) => v.category === 'Geopolitics'),
    };
  }, [variables]);

  return (
    <section aria-label="Variable radar" className="panel p-4 sm:p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="section-title">Variable radar</h2>
        <span className="text-[11px] text-ink-muted">live variables, not headlines</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RadarColumn title="AI" rows={ai} asOf={asOf} />
        <RadarColumn title="Geopolitics" rows={geo} asOf={asOf} />
      </div>
    </section>
  );
}

function RadarColumn({ title, rows, asOf }: { title: string; rows: RadarVariable[]; asOf: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] uppercase tracking-[0.14em] text-ink-secondary">{title}</span>
      <ul className="flex flex-col divide-y divide-bg-line border border-bg-line rounded-md">
        {rows.map((v) => {
          const tok = radarStatusToken[v.status];
          return (
            <li key={v.id} className="px-3 py-2.5 flex items-start gap-3">
              <span className={`dot mt-1.5 ${tok.dot}`} />
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[13px] font-medium text-ink-primary truncate">{v.name}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] ${tok.text}`}>{tok.label}</span>
                    <span className={`text-[12px] font-mono ${trendColor[v.trend]}`}>{trendGlyph[v.trend]}</span>
                  </div>
                </div>
                <p className="text-[12px] leading-snug text-ink-secondary">{v.explanation}</p>
                <span className="text-[10.5px] font-mono text-ink-muted">
                  updated {relativeFromNow(v.lastUpdated, asOf)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
