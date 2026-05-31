import { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { SignalLightboard } from './components/SignalLightboard';
import { ExecutiveVerdict } from './components/ExecutiveVerdict';
import { Changes } from './components/Changes';
import { Signals } from './components/Signals';
import { Radar } from './components/Radar';
import { DiscardedNoise } from './components/DiscardedNoise';
import { ActionMatrix } from './components/ActionMatrix';
import { Thresholds } from './components/Thresholds';
import { briefings, currentBriefing, previousBriefing } from './data/mockBriefings';
import type { BriefingRun } from './types/briefing';

const sequence: BriefingRun[] = [previousBriefing, currentBriefing, ...briefings.slice(2)];

export default function App() {
  const [index, setIndex] = useState(1);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [justRefreshed, setJustRefreshed] = useState(false);

  const briefing = sequence[index] ?? currentBriefing;

  useEffect(() => {
    if (!justRefreshed) return;
    const t = window.setTimeout(() => setJustRefreshed(false), 2400);
    return () => window.clearTimeout(t);
  }, [justRefreshed]);

  function handleRefresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    const delay = 700 + Math.random() * 500;
    window.setTimeout(() => {
      setIndex((i) => (i + 1) % sequence.length);
      setIsRefreshing(false);
      setJustRefreshed(true);
    }, delay);
  }

  return (
    <div className="min-h-full flex flex-col">
      <Header
        timestamp={briefing.timestamp}
        isRefreshing={isRefreshing}
        justRefreshed={justRefreshed}
        onRefresh={handleRefresh}
      />

      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 max-w-[1440px] w-full mx-auto flex flex-col gap-4 sm:gap-5">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-5">
          <div className="xl:col-span-2 flex flex-col gap-4 sm:gap-5">
            <SignalLightboard signalLevels={briefing.signalLevels} />
            <ExecutiveVerdict verdict={briefing.executiveVerdict} />
          </div>
          <div className="xl:col-span-1">
            <ActionMatrixWrapper briefing={briefing} />
          </div>
        </div>

        <Changes changes={briefing.changesSinceLastRun} />

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
          Signal Gate · mock snapshot · no live sources connected
        </footer>
      </main>
    </div>
  );
}

function ActionMatrixWrapper({ briefing }: { briefing: BriefingRun }) {
  return <ActionMatrix matrix={briefing.actionMatrix} />;
}
