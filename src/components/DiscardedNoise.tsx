import type { DiscardedNoiseItem } from '../types/briefing';
import { discardReasonLabel, noiseLevelColor } from '../lib/tokens';

type Props = {
  items: DiscardedNoiseItem[];
};

export function DiscardedNoise({ items }: Props) {
  return (
    <section aria-label="Discarded noise" className="panel p-4 sm:p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="section-title">What does not deserve attention today</h2>
        <span className="text-[11px] text-ink-muted">ignoring is also a decision</span>
      </div>

      {items.length === 0 ? (
        <p className="text-[13px] text-ink-secondary">No noise worth listing today.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-bg-line">
          {items.map((it) => (
            <li key={it.id} className="py-3 first:pt-0 last:pb-0 flex flex-col gap-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="chip uppercase tracking-[0.1em]">{discardReasonLabel[it.reason]}</span>
                <span className={`text-[11px] ${noiseLevelColor[it.noiseLevel]}`}>noise: {it.noiseLevel}</span>
                {it.affectedVariable && (
                  <span className="text-[11px] text-ink-muted">var: {it.affectedVariable}</span>
                )}
              </div>
              <h3 className="text-[13.5px] font-medium tracking-tightish text-ink-primary">{it.title}</h3>
              <p className="text-[12.5px] leading-snug text-ink-secondary">{it.discardRationale}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
