import type { Threshold } from '../types/briefing';

type Props = {
  thresholds: Threshold[];
};

export function Thresholds({ thresholds }: Props) {
  return (
    <section aria-label="Thresholds to watch" className="panel p-4 sm:p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="section-title">Thresholds to watch</h2>
        <span className="text-[11px] text-ink-muted">defined in advance, not after the fact</span>
      </div>

      <ul className="flex flex-col divide-y divide-bg-line">
        {thresholds.map((t) => (
          <li key={t.id} className="py-3 first:pt-0 last:pb-0 flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <div className="text-[13px] leading-relaxed text-ink-primary">
                <span className="text-ink-muted font-mono mr-1.5">if</span>
                {t.condition}
              </div>
              <div className="text-[13px] leading-relaxed text-signal-warn">
                <span className="text-ink-muted font-mono mr-1.5">then</span>
                {t.consequence}
              </div>
            </div>

            {t.inverseCondition && (
              <div className="flex flex-col gap-1 pt-1 border-t border-bg-line/60">
                <div className="text-[12.5px] leading-relaxed text-ink-secondary">
                  <span className="text-ink-muted font-mono mr-1.5">if not</span>
                  {t.inverseCondition}
                </div>
                {t.inverseConsequence && (
                  <div className="text-[12.5px] leading-relaxed text-signal-info">
                    <span className="text-ink-muted font-mono mr-1.5">then</span>
                    {t.inverseConsequence}
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
