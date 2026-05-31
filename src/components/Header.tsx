import { formatTimestamp } from '../lib/format';
import type { DataSourceId } from '../lib/briefingSource';

type Props = {
  timestamp: string;
  isRefreshing: boolean;
  justRefreshed: boolean;
  onRefresh: () => void;
  dataSourceId: DataSourceId;
  payloadSource?: string;
};

// Describe what actually produced the data. ok (green) = genuine AI/live data;
// info (blue) = function wired but serving the mock fallback; mute = bundled.
function describeSource(dataSourceId: DataSourceId, payloadSource?: string): { label: string; dot: string } {
  const p = payloadSource ?? '';
  if (p.startsWith('gemini')) return { label: 'Gemini · borrador en vivo', dot: 'bg-signal-ok' };
  if (dataSourceId === 'netlify') {
    return { label: 'Netlify Function · mock (fallback)', dot: 'bg-signal-info' };
  }
  if (dataSourceId === 'supabase') return { label: 'Supabase · live data', dot: 'bg-signal-ok' };
  return { label: 'Mock mode — bundled data', dot: 'bg-signal-mute' };
}

export function Header({ timestamp, isRefreshing, justRefreshed, onRefresh, dataSourceId, payloadSource }: Props) {
  const sourceInfo = describeSource(dataSourceId, payloadSource);
  return (
    <header className="hairline px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[15px] font-medium tracking-tightish text-ink-primary">Signal Gate</h1>
          <span className="text-[11px] uppercase tracking-[0.14em] text-ink-muted">
            AI &amp; Geopolitics signal filter
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-ink-muted">
          <span className="font-mono">last query — {formatTimestamp(timestamp)}</span>
          <span className="inline-flex items-center gap-1.5">
            <span className={`dot ${sourceInfo.dot}`} />
            {sourceInfo.label}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {justRefreshed && (
          <span className="text-[11px] text-signal-ok" role="status">
            Snapshot refreshed
          </span>
        )}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="text-[12px] px-3 py-1.5 border border-bg-line rounded-sm bg-bg-panelHi hover:bg-bg-panel hover:border-ink-faint disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-ink-primary"
        >
          {isRefreshing ? 'Refreshing…' : 'Refresh snapshot'}
        </button>
      </div>
    </header>
  );
}
