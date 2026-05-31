import type { ActionMatrix as Matrix } from '../types/briefing';

type Props = {
  matrix: Matrix;
};

export function ActionMatrix({ matrix }: Props) {
  return (
    <section aria-label="Action matrix" className="panel p-4 sm:p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="section-title">Final mental action matrix</h2>
        <span className="text-[11px] text-ink-muted">three columns, no overlap</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Column
          title="Enters nervous system"
          accent="border-signal-alert/40"
          headerCls="text-signal-alert"
          items={matrix.nervousSystem}
          empty="Nothing crosses the threshold today."
        />
        <Column
          title="Monitor without anxiety"
          accent="border-signal-warn/40"
          headerCls="text-signal-warn"
          items={matrix.monitorCalmly}
          empty="Nothing in this zone today."
        />
        <Column
          title="Ignore"
          accent="border-bg-line"
          headerCls="text-ink-muted"
          items={matrix.ignore}
          empty="No noise worth listing."
        />
      </div>
    </section>
  );
}

function Column({
  title,
  accent,
  headerCls,
  items,
  empty,
}: {
  title: string;
  accent: string;
  headerCls: string;
  items: string[];
  empty: string;
}) {
  return (
    <div className={`panel-hi border ${accent} p-3 flex flex-col gap-2 min-h-[140px]`}>
      <span className={`text-[11px] uppercase tracking-[0.14em] ${headerCls}`}>{title}</span>
      {items.length === 0 ? (
        <p className="text-[12.5px] text-ink-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((it, i) => (
            <li key={i} className="text-[13px] leading-snug text-ink-primary">
              — {it}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
