import type { SignalLevels } from '../types/briefing';
import { changeMagnitudeColor, noiseLevelColor, signalLevelColor } from '../lib/tokens';

type Cell = {
  label: string;
  value: string;
  cls: string;
  hint: string;
};

type Props = {
  signalLevels: SignalLevels;
};

export function SignalLightboard({ signalLevels }: Props) {
  const cells: Cell[] = [
    {
      label: 'AI signal',
      value: signalLevels.ai.level,
      cls: signalLevelColor[signalLevels.ai.level],
      hint: signalLevels.ai.explanation,
    },
    {
      label: 'Geopolitics signal',
      value: signalLevels.geopolitics.level,
      cls: signalLevelColor[signalLevels.geopolitics.level],
      hint: signalLevels.geopolitics.explanation,
    },
    {
      label: 'Noise detected',
      value: signalLevels.noise.level,
      cls: noiseLevelColor[signalLevels.noise.level],
      hint: signalLevels.noise.explanation,
    },
    {
      label: 'Change since last query',
      value: signalLevels.changeSinceLastRun.level,
      cls: changeMagnitudeColor[signalLevels.changeSinceLastRun.level],
      hint: signalLevels.changeSinceLastRun.explanation,
    },
  ];

  return (
    <section aria-label="Executive lightboard" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {cells.map((c) => (
        <div key={c.label} className="panel p-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="section-title">{c.label}</span>
            <span className={`dot ${c.cls.replace('text-', 'bg-')}`} />
          </div>
          <div className={`text-[20px] font-medium tracking-tightish capitalize ${c.cls}`}>{c.value}</div>
          <p className="text-[12px] leading-snug text-ink-secondary">{c.hint}</p>
        </div>
      ))}
    </section>
  );
}
