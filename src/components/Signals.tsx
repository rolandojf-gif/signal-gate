import { useMemo, useState } from 'react';
import type { Signal } from '../types/briefing';
import {
  scoreTier,
  signalPriorityToken,
  signalStatusLabel,
  timeHorizonLabel,
} from '../lib/tokens';
import { SCORE_WEIGHTS, computeSignalScore } from '../lib/score';

type Tier = 'nervous' | 'monitor' | 'below';

type Props = {
  signals: Signal[];
};

export function Signals({ signals }: Props) {
  const ordered = useMemo(() => {
    return [...signals]
      .filter((s) => s.signalScore >= 60)
      .sort((a, b) => b.signalScore - a.signalScore)
      .slice(0, 7);
  }, [signals]);

  return (
    <section aria-label="Signals" className="panel p-4 sm:p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="section-title">Signals entering the nervous system</h2>
        <span className="text-[11px] text-ink-muted">
          {ordered.length} of max 7 — none added for volume
        </span>
      </div>

      {ordered.length === 0 ? (
        <p className="text-[13px] text-ink-secondary">No signal crosses the 60 threshold today.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {ordered.map((s) => (
            <SignalCard key={s.id} signal={s} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SignalCard({ signal }: { signal: Signal }) {
  const [open, setOpen] = useState(false);
  const tier = scoreTier(signal.signalScore);
  const priority = signalPriorityToken[signal.level];
  const highImpactLowConfidence = signal.impactScore >= 75 && signal.confidenceScore < 60;

  const containerCls =
    tier === 'nervous'
      ? 'border-signal-alert/30 bg-bg-panelHi'
      : 'border-bg-line bg-bg-panel';

  return (
    <li className={`border ${containerCls} rounded-md`}>
      <div className="px-3.5 py-3 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="chip">{signal.category}</span>
            <span className={`chip ${priority.cls}`}>{priority.label}</span>
            <span className="chip">{signalStatusLabel[signal.status]}</span>
            <span className="chip font-mono">{timeHorizonLabel[signal.timeHorizon]}</span>
            <span className="chip">var: {signal.variableName}</span>
            {tier === 'monitor' && (
              <span className="chip border-signal-warn/40 text-signal-warn">monitor</span>
            )}
            {highImpactLowConfidence && (
              <span className="chip border-signal-alert/40 text-signal-alert">
                high impact / low confidence
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ScorePopover signal={signal} tier={tier} />
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={open ? 'Collapse signal' : 'Expand signal'}
              className="text-[13px] font-mono text-ink-muted hover:text-ink-primary w-5 h-5 flex items-center justify-center"
            >
              {open ? '−' : '+'}
            </button>
          </div>
        </div>

        <button type="button" onClick={() => setOpen((v) => !v)} className="text-left flex flex-col gap-1">
          <h3 className="text-[14px] font-medium tracking-tightish text-ink-primary">{signal.title}</h3>
          <p className="text-[12.5px] leading-snug text-ink-secondary">{signal.whyItMatters}</p>
        </button>
      </div>

      {open && (
        <div className="px-3.5 pb-4 pt-1 flex flex-col gap-4 border-t border-bg-line">
          <p className="text-[13px] leading-relaxed text-ink-primary">{signal.summary}</p>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <ScoreCell label="impact" value={signal.impactScore} />
            <ScoreCell label="confidence" value={signal.confidenceScore} />
            <ScoreCell label="novelty" value={signal.noveltyScore} />
            <ScoreCell label="actionability" value={signal.actionabilityScore} />
            <ScoreCell label="persistence" value={signal.persistenceScore} />
            <ScoreCell label="noise risk" value={signal.noiseRiskScore} inverse />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
            <DetailList label="Winners" items={signal.winners} />
            <DetailList label="Pressured actors" items={signal.pressuredActors} />
            <DetailField label="New incentive" body={signal.newIncentive} />
            <DetailField label="First-order consequence" body={signal.firstOrderConsequence} />
            <DetailField label="Second-order consequence" body={signal.secondOrderConsequence} className="md:col-span-2" />
            <DetailList label="What would invalidate this" items={signal.invalidationCriteria} className="md:col-span-2" />
          </div>

          <div className="flex flex-col gap-1">
            <span className="section-title">Sources</span>
            <ul className="flex flex-wrap gap-1.5">
              {signal.sources.map((src) =>
                src.url ? (
                  <li key={src.id}>
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="chip font-mono text-[10.5px] hover:border-ink-faint hover:text-ink-primary"
                    >
                      {src.label} ↗
                    </a>
                  </li>
                ) : (
                  <li
                    key={src.id}
                    className="chip font-mono text-[10.5px]"
                    title="Mock source — no live link until APIs are connected"
                  >
                    {src.label}
                  </li>
                ),
              )}
            </ul>
          </div>
        </div>
      )}
    </li>
  );
}

function ScorePopover({ signal, tier }: { signal: Signal; tier: Tier }) {
  const [open, setOpen] = useState(false);
  const barColor =
    tier === 'nervous' ? 'bg-signal-alert' : tier === 'monitor' ? 'bg-signal-warn' : 'bg-signal-mute';
  const total = computeSignalScore(signal);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Ver derivación del score"
        className="flex items-center gap-1.5 group"
      >
        <span className="h-1.5 w-12 bg-bg-line rounded-sm overflow-hidden inline-block">
          <span className={`block h-full ${barColor}`} style={{ width: `${Math.max(2, signal.signalScore)}%` }} />
        </span>
        <span className="text-[12px] font-mono tabular-nums text-ink-primary w-7 text-right">{signal.signalScore}</span>
        <span className="text-[10px] text-ink-muted group-hover:text-ink-secondary">ⓘ</span>
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute right-0 top-full mt-1.5 z-20 w-64 panel-hi p-3 flex flex-col gap-2 shadow-xl shadow-black/40">
            <div className="flex items-center justify-between">
              <span className="section-title">Signal score</span>
              <span className="text-[10px] text-signal-ok">✓ derived from formula</span>
            </div>
            <ul className="flex flex-col gap-1">
              {SCORE_WEIGHTS.map((w) => {
                const v = signal[w.key];
                const c = w.weight * v;
                return (
                  <li key={w.key} className="flex items-center justify-between gap-2 text-[11px] font-mono">
                    <span className="text-ink-secondary flex-1">{w.label}</span>
                    <span className="text-ink-muted">
                      {w.weight.toFixed(2)}×{v}
                    </span>
                    <span className={`tabular-nums w-12 text-right ${c < 0 ? 'text-signal-alert' : 'text-ink-primary'}`}>
                      {c < 0 ? '−' : '+'}
                      {Math.abs(c).toFixed(1)}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center justify-between border-t border-bg-line pt-1.5 text-[12px] font-mono">
              <span className="text-ink-secondary">signalScore</span>
              <span className="tabular-nums text-ink-primary">{total}</span>
            </div>
            <p className="text-[10.5px] leading-snug text-ink-muted">
              {'≥80 entra al sistema nervioso · 60–79 monitorizar · <60 fuera.'}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function ScoreCell({ label, value, inverse = false }: { label: string; value: number; inverse?: boolean }) {
  const color = inverse
    ? value >= 60
      ? 'text-signal-alert'
      : value >= 30
      ? 'text-signal-warn'
      : 'text-signal-ok'
    : value >= 75
    ? 'text-signal-ok'
    : value >= 50
    ? 'text-signal-warn'
    : 'text-signal-mute';
  return (
    <div className="flex flex-col gap-0.5 panel-hi p-2">
      <span className="text-[10.5px] uppercase tracking-[0.1em] text-ink-muted">{label}</span>
      <span className={`text-[14px] font-mono tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

function DetailField({ label, body, className = '' }: { label: string; body: string; className?: string }) {
  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      <span className="section-title">{label}</span>
      <p className="text-[13px] leading-relaxed text-ink-primary">{body}</p>
    </div>
  );
}

function DetailList({ label, items, className = '' }: { label: string; items: string[]; className?: string }) {
  if (items.length === 0) {
    return (
      <div className={`flex flex-col gap-0.5 ${className}`}>
        <span className="section-title">{label}</span>
        <p className="text-[13px] text-ink-muted">—</p>
      </div>
    );
  }
  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      <span className="section-title">{label}</span>
      <ul className="flex flex-col gap-0.5">
        {items.map((it, i) => (
          <li key={i} className="text-[13px] leading-relaxed text-ink-primary">
            — {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
