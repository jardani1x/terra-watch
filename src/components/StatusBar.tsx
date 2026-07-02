import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { utcClock } from '../lib/format';

const MODE_LABEL: Record<string, { text: string; cls: string }> = {
  live: { text: 'LIVE · PUBLIC OSINT', cls: 'live' },
  loading: { text: 'SYNCING…', cls: 'demo' },
  cache: { text: 'CACHED', cls: 'demo' },
  mock: { text: 'DEMO / SAMPLE DATA', cls: 'demo' },
  offline: { text: 'OFFLINE / DEGRADED', cls: 'degraded' },
};

export default function StatusBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const [clock, setClock] = useState(utcClock());
  const overallMode = useStore((s) => s.overallMode());
  const setMobileRail = useStore((s) => s.setMobileRail);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);

  useEffect(() => {
    const t = setInterval(() => setClock(utcClock()), 1000);
    return () => clearInterval(t);
  }, []);

  const mode = MODE_LABEL[overallMode] ?? MODE_LABEL.mock;

  return (
    <header className="statusbar">
      <button className="kbd" aria-label="Toggle layers" onClick={() => setMobileRail('left')} style={{ display: 'none' }} />
      <div className="brand">
        <span className="brand-glyph">◈</span>
        <div>
          <div className="brand-name">TERRA WATCH</div>
          <div className="brand-sub">CIVILIAN OSINT · PUBLIC DATA</div>
        </div>
      </div>

      <span className={`mode-pill ${mode.cls}`} title="Data mode is derived from live provider health — never faked.">
        {mode.text}
      </span>

      <div className="view-toggle" role="tablist" aria-label="Workspace view">
        <button
          role="tab"
          aria-selected={view === 'map'}
          className={`kbd ${view === 'map' ? 'active' : ''}`}
          onClick={() => setView('map')}
        >
          MAP
        </button>
        <button
          role="tab"
          aria-selected={view === 'graph'}
          className={`kbd ${view === 'graph' ? 'active' : ''}`}
          onClick={() => setView('graph')}
        >
          GRAPH
        </button>
      </div>

      <div className="sb-spacer" />

      <input
        className="sb-search"
        placeholder="Search this view…"
        aria-label="Search"
        onFocus={onOpenPalette}
        readOnly
      />
      <button className="kbd" onClick={onOpenPalette} aria-label="Open command palette">⌘K</button>

      <div className="sb-clock" aria-label="UTC clock">
        {clock.time}
        <small>{clock.date} · UTC</small>
      </div>
    </header>
  );
}
