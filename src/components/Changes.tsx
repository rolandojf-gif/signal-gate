import type { ChangeItem } from '../types/briefing';
import { changeTypeToken, impactColor } from '../lib/tokens';

type Props = {
  changes: ChangeItem[];
  newChangeIds?: Set<string>;
};

export function Changes({ changes, newChangeIds }: Props) {
  return (
    <section aria-label="Changes since last query" className="panel p-4 sm:p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="section-title">Changes since last query</h2>
        <span className="text-[11px] text-ink-muted">{changes.length} change{changes.length === 1 ? '' : 's'}</span>
      </div>

      {changes.length === 0 ? (
        <p className="text-[13px] text-ink-secondary">No material changes since the previous query.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-bg-line">
          {changes.map((c) => {
            const t = changeTypeToken[c.type];
            const isNew = newChangeIds?.has(c.id) ?? false;
            return (
              <li key={c.id} className="py-3 first:pt-0 last:pb-0 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`chip uppercase tracking-[0.1em] ${t.cls}`}>{t.label}</span>
                    <span className="chip">{c.category}</span>
                    <span className={`text-[11px] ${impactColor[c.impact]}`}>impact: {c.impact}</span>
                    {isNew && (
                      <span className="chip border-signal-info/50 text-signal-info">
                        <span className="dot bg-signal-info" />
                        nuevo desde tu última visita
                      </span>
                    )}
                  </div>
                </div>
                <h3 className="text-[14px] font-medium tracking-tightish text-ink-primary">{c.title}</h3>
                <div className="text-[12px] text-ink-secondary font-mono">
                  <span className="text-ink-muted">{c.previousState}</span>
                  <span className="text-ink-faint mx-2">→</span>
                  <span className="text-ink-primary">{c.currentState}</span>
                </div>
                <p className="text-[13px] leading-relaxed text-ink-secondary">{c.explanation}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
