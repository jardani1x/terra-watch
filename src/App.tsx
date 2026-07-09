import { lazy, Suspense, useEffect, useState } from 'react';
import { useStore } from './state/store';
import StatusBar from './components/StatusBar';
import LayerManager from './components/LayerManager';
import SourceManager from './components/SourceManager';
import Monitors from './components/Monitors';
import FirmsPanel from './components/FirmsPanel';
import SnapshotPanel from './components/SnapshotPanel';
import SignalsPanel from './components/SignalsPanel';
import MarketPanel from './components/MarketPanel';
import CountryRiskPanel from './components/CountryRiskPanel';
import RouteExplorerPanel from './components/RouteExplorerPanel';
import ScenarioPanel from './components/ScenarioPanel';
import DossierPanel from './components/DossierPanel';
import AnalystPanel from './components/AnalystPanel';
import PrivacyPanel from './components/PrivacyPanel';
import ProviderHealthBar from './components/ProviderHealthBar';
import InspectorRail from './components/InspectorRail';
import TimelineDrawer from './components/TimelineDrawer';
import CommandPalette from './components/CommandPalette';
import GraphWorkspace from './components/GraphWorkspace';
import MapModeControls from './components/MapModeControls';

// MapLibre (~800 kB) is the heaviest dependency; load it as its own async
// chunk so the app shell paints without waiting for it.
const MapCanvas = lazy(() => import('./components/MapCanvas'));

export default function App() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const refreshAll = useStore((s) => s.refreshAll);
  const mobileRail = useStore((s) => s.mobileRail);
  const setMobileRail = useStore((s) => s.setMobileRail);
  const railCollapsed = useStore((s) => s.railCollapsed);
  const toggleRail = useStore((s) => s.toggleRail);
  const view = useStore((s) => s.view);
  const selected = useStore((s) => s.selected);
  const selectedCountry = useStore((s) => s.selectedCountry);

  // on phones the inspector is a bottom sheet — surface it when an object or country is selected
  useEffect(() => {
    if ((selected || selectedCountry) && window.matchMedia('(max-width: 860px)').matches) setMobileRail('right');
  }, [selected, selectedCountry, setMobileRail]);

  // initial + periodic data pull; snapshot metadata loads once from IndexedDB
  useEffect(() => {
    refreshAll();
    void useStore.getState().loadSnapshots();
    void useStore.getState().loadCountryData();
    void useStore.getState().loadConflictZones();
    void useStore.getState().loadFomcCalendar();
    const t = setInterval(refreshAll, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [refreshAll]);

  // Cmd/Ctrl-K opens the palette; Escape closes an open mobile sheet
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (e.key === 'Escape') {
        useStore.getState().setMobileRail(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="shell">
      <StatusBar onOpenPalette={() => setPaletteOpen(true)} />

      <div className="shell-body">
        <aside className={`rail left ${mobileRail === 'left' ? 'open' : ''} ${railCollapsed.left ? 'collapsed' : ''}`} aria-label="Layers and controls">
          <button
            className="rail-toggle"
            aria-label={railCollapsed.left ? 'Expand left panels' : 'Collapse left panels'}
            onClick={() => toggleRail('left')}
          >
            {railCollapsed.left ? '»' : '«'}
          </button>
          {!railCollapsed.left && (<>
          <button className="sheet-close" aria-label="Close panels" onClick={() => setMobileRail(null)}>✕</button>
          <LayerManager />
          <SourceManager />
          <FirmsPanel />
          <Monitors />
          <SignalsPanel />
          <CountryRiskPanel />
          <RouteExplorerPanel />
          <ScenarioPanel />
          <DossierPanel />
          <MarketPanel />
          <SnapshotPanel />
          <AnalystPanel />
          <PrivacyPanel />
          <div className="disclaimer">
            Data is fetched client-side from public providers. Nothing you do here
            is sent to a Terra Watch server. See <b>Privacy</b> in the docs.
          </div>
          </>)}
        </aside>

        <main className="map-wrap" aria-label="Workspace">
          {view === 'map' ? (
            <>
              <Suspense fallback={<div className="map-loading">LOADING MAP…</div>}>
                <MapCanvas />
              </Suspense>
              <MapModeControls />
              <TimelineDrawer />
            </>
          ) : (
            <GraphWorkspace />
          )}
        </main>

        <InspectorRail />
      </div>

      <ProviderHealthBar />

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}

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
