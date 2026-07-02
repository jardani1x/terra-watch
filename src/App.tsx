import { useEffect, useState } from 'react';
import { useStore } from './state/store';
import StatusBar from './components/StatusBar';
import MapCanvas from './components/MapCanvas';
import LayerManager from './components/LayerManager';
import SourceManager from './components/SourceManager';
import Monitors from './components/Monitors';
import ProviderHealthBar from './components/ProviderHealthBar';
import InspectorRail from './components/InspectorRail';
import TimelineDrawer from './components/TimelineDrawer';
import CommandPalette from './components/CommandPalette';
import GraphWorkspace from './components/GraphWorkspace';

export default function App() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const refreshAll = useStore((s) => s.refreshAll);
  const mobileRail = useStore((s) => s.mobileRail);
  const setMobileRail = useStore((s) => s.setMobileRail);
  const view = useStore((s) => s.view);

  // initial + periodic data pull
  useEffect(() => {
    refreshAll();
    const t = setInterval(refreshAll, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [refreshAll]);

  // Cmd/Ctrl-K opens the palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="shell">
      <StatusBar onOpenPalette={() => setPaletteOpen(true)} />

      <div className="shell-body">
        <aside className={`rail left ${mobileRail === 'left' ? 'open' : ''}`} aria-label="Layers and controls">
          <LayerManager />
          <SourceManager />
          <Monitors />
          <div className="disclaimer">
            Data is fetched client-side from public providers. Nothing you do here
            is sent to a Terra Watch server. See <b>Privacy</b> in the docs.
          </div>
        </aside>

        <div className="map-wrap">
          {view === 'map' ? (
            <>
              <MapCanvas />
              <TimelineDrawer />
            </>
          ) : (
            <GraphWorkspace />
          )}
        </div>

        <InspectorRail />
      </div>

      <ProviderHealthBar />

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {mobileRail && (
        <div
          onClick={() => setMobileRail(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 15, background: 'rgba(0,0,0,0.4)' }}
          aria-hidden
        />
      )}
    </div>
  );
}
