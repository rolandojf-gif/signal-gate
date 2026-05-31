import { useEffect, useMemo, useState } from 'react';
import { Header } from './components/Header';
import { HeadlineAnswer } from './components/HeadlineAnswer';
import { SignalLightboard } from './components/SignalLightboard';
import { ExecutiveVerdict } from './components/ExecutiveVerdict';
import { Changes } from './components/Changes';
import { Signals } from './components/Signals';
import { Radar } from './components/Radar';
import { DiscardedNoise } from './components/DiscardedNoise';
import { ActionMatrix } from './components/ActionMatrix';
import { Thresholds } from './components/Thresholds';
import { getDataSourceId, loadBriefings } from './lib/briefingSource';
import { useLastVisit } from './lib/useLastVisit';
import type { BriefingRun } from './types/briefing';

export default function App() {
  const [data, setData] = useState<BriefingRun[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [justRefreshed, setJustRefreshed] = useState(false);

  const dataSourceId = getDataSourceId();

  useEffect(() => {
    let active = true;
    loadBriefings()
      .then((b) => {
        if (!active) return;
        setData(b);
        setIndex(Math.max(0, b.length - 1)); // open on the most recent snapshot
      })
      .catch((e) => {
        if (active) setLoadError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      active = false;
    };
  }, []);

  const sequence = useMemo(() => data ?? [], [data]);
  const briefing = sequence.length ? sequence[index] ?? sequence[sequence.length - 1] : null;
  const { newChangeIds, lastVisitAt } = useLastVisit(sequence);

  const counts = useMemo(
    () => ({
      demandToday: briefing ? briefing.signals.filter((s) => s.signalScore >= 80).length : 0,
      monitor: briefing ? briefing.signals.filter((s) => s.signalScore >= 60 && s.signalScore < 80).length : 0,
      ignored: briefing ? briefing.discardedNoise.length : 0,
    }),
    [briefing],
  );

  const newSinceVisit = useMemo(
    () => (briefing ? briefing.changesSinceLastRun.filter((c) => newChangeIds.has(c.id)).length : 0),
    [briefing, newChangeIds],
  );

  useEffect(() => {
    if (!justRefreshed) return;
    const t = window.setTimeout(() => setJustRefreshed(false), 2400);
    return () => window.clearTimeout(t);
  }, [justRefreshed]);

  function handleRefresh() {
    if (isRefreshing || sequence.length === 0) return;
    setIsRefreshing(true);
    const delay = 700 + Math.random() * 500;
    window.setTimeout(() => {
      setIndex((i) => (i + 1) % sequence.length);
      setIsRefreshing(false);
      setJustRefreshed(true);
    }, delay);
  }

  if (loadError) {
    return <CenteredNotice title="No se pudo cargar el snapshot" detail={loadError} tone="error" />;
  }

  if (!briefing) {
    return <CenteredNotice title="Cargando snapshot…" detail={`Fuente de datos: ${dataSourceId}`} tone="muted" />;
  }

  return (
    <div className="min-h-full flex flex-col">
      <Header
        timestamp={briefing.timestamp}
        isRefreshing={isRefreshing}
        justRefreshed={justRefreshed}
        onRefresh={handleRefresh}
        dataSourceId={dataSourceId}
      />

      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 max-w-[1440px] w-full mx-auto flex flex-col gap-4 sm:gap-5">
        <HeadlineAnswer
          deservesAttention={briefing.executiveVerdict.deservesAttentionToday}
          magnitude={briefing.signalLevels.changeSinceLastRun.level}
          magnitudeExplanation={briefing.signalLevels.changeSinceLastRun.explanation}
          counts={counts}
          newSinceVisit={newSinceVisit}
          lastVisitAt={lastVisitAt}
        />

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-5">
          <div className="xl:col-span-2 flex flex-col gap-4 sm:gap-5">
            <SignalLightboard signalLevels={briefing.signalLevels} />
            <ExecutiveVerdict verdict={briefing.executiveVerdict} />
          </div>
          <div className="xl:col-span-1">
            <ActionMatrix matrix={briefing.actionMatrix} />
          </div>
        </div>

        <Changes changes={briefing.changesSinceLastRun} newChangeIds={newChangeIds} />

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-5">
          <div className="xl:col-span-2">
            <Signals signals={briefing.signals} />
          </div>
          <div className="xl:col-span-1">
            <Radar variables={briefing.variableRadar} asOf={briefing.timestamp} />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5">
          <DiscardedNoise items={briefing.discardedNoise} />
          <Thresholds thresholds={briefing.thresholds} />
        </div>

        <footer className="text-[11px] text-ink-muted py-4 text-center">
          Signal Gate · source: {dataSourceId} · mock payload
        </footer>
      </main>
    </div>
  );
}

function CenteredNotice({ title, detail, tone }: { title: string; detail: string; tone: 'error' | 'muted' }) {
  const titleCls = tone === 'error' ? 'text-signal-alert' : 'text-ink-primary';
  return (
    <div className="min-h-full flex items-center justify-center p-8">
      <div className="panel p-6 max-w-md w-full flex flex-col gap-2 text-center">
        <span className="text-[11px] uppercase tracking-[0.14em] text-ink-muted">Signal Gate</span>
        <h1 className={`text-[15px] font-medium tracking-tightish ${titleCls}`}>{title}</h1>
        <p className="text-[12px] text-ink-secondary font-mono break-words">{detail}</p>
      </div>
    </div>
  );
}
