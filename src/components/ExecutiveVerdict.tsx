import type { ExecutiveVerdict as Verdict } from '../types/briefing';

type Props = {
  verdict: Verdict;
};

export function ExecutiveVerdict({ verdict }: Props) {
  const attentionCls = verdict.deservesAttentionToday ? 'text-signal-alert' : 'text-signal-ok';
  const attentionLabel = verdict.deservesAttentionToday ? 'Deserves attention today' : 'Does not deserve attention today';

  return (
    <section aria-label="Executive verdict" className="panel p-4 sm:p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h2 className="section-title">Executive verdict</h2>
        <span className={`text-[12px] font-medium ${attentionCls}`}>{attentionLabel}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
        <Field label="What changed" body={verdict.whatChanged} />
        <Field label="What did not change" body={verdict.whatDidNotChange} />
        <Field label="Why it deserves (or not) attention" body={verdict.attentionRationale} />
        <Field label="Main distraction risk" body={verdict.mainDistractionRisk} />
        <Field label="Watch tomorrow" body={verdict.watchTomorrow} className="md:col-span-2" />
      </div>
    </section>
  );
}

function Field({ label, body, className = '' }: { label: string; body: string; className?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <span className="section-title">{label}</span>
      <p className="text-[13px] leading-relaxed text-ink-primary">{body}</p>
    </div>
  );
}
