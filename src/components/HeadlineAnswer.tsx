import type { ChangeMagnitude } from '../types/briefing';
import { relativeFromNow } from '../lib/format';

type Props = {
  deservesAttention: boolean;
  magnitude: ChangeMagnitude;
  magnitudeExplanation: string;
  counts: { demandToday: number; monitor: number; ignored: number };
  newSinceVisit: number;
  lastVisitAt: string | null;
};

const magnitudeLabel: Record<ChangeMagnitude, string> = {
  none: 'sin cambio',
  minor: 'cambio menor',
  material: 'cambio material',
  structural: 'cambio estructural',
};

export function HeadlineAnswer({
  deservesAttention,
  magnitude,
  magnitudeExplanation,
  counts,
  newSinceVisit,
  lastVisitAt,
}: Props) {
  const answer = deservesAttention ? 'Sí' : 'No';
  const answerCls = deservesAttention ? 'text-signal-alert' : 'text-signal-ok';
  const accent = deservesAttention ? 'border-l-signal-alert' : 'border-l-signal-ok';

  const visitText = !lastVisitAt
    ? 'Primera visita registrada'
    : newSinceVisit > 0
    ? `${newSinceVisit} cambio${newSinceVisit === 1 ? '' : 's'} nuevo${newSinceVisit === 1 ? '' : 's'} desde tu última visita`
    : 'Sin novedades desde tu última visita';

  return (
    <section
      aria-label="Headline answer"
      className={`panel border-l-2 ${accent} p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4`}
    >
      <div className="flex flex-col gap-1.5">
        <span className="section-title">¿Ha cambiado algo que deba importarme?</span>
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className={`text-[28px] leading-none font-semibold tracking-tightish ${answerCls}`}>{answer}</span>
          <span className="text-[12px] uppercase tracking-[0.12em] text-ink-secondary">{magnitudeLabel[magnitude]}</span>
        </div>
        <p className="text-[13px] leading-relaxed text-ink-secondary max-w-2xl">{magnitudeExplanation}</p>
      </div>

      <div className="flex flex-col gap-3 sm:items-end">
        <div className="flex items-stretch gap-2">
          <Stat label="exigen hoy" value={counts.demandToday} cls="text-signal-alert" />
          <Stat label="monitorizar" value={counts.monitor} cls="text-signal-warn" />
          <Stat label="descartados" value={counts.ignored} cls="text-ink-muted" />
        </div>
        <div className="flex items-center gap-2 text-[11px] text-ink-muted">
          <span className="dot bg-signal-info" />
          <span>{visitText}</span>
          {lastVisitAt && <span className="font-mono">· hace {relativeFromNow(lastVisitAt)}</span>}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="panel-hi px-3 py-2 flex flex-col items-center gap-0.5 min-w-[72px]">
      <span className={`text-[20px] font-mono tabular-nums leading-none ${cls}`}>{value}</span>
      <span className="text-[10px] uppercase tracking-[0.1em] text-ink-muted">{label}</span>
    </div>
  );
}
