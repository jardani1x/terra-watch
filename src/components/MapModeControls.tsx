import { useEffect, useState } from 'react';
import { useStore } from '../state/store';

/** Top-of-map controls: 2D/3D projection toggle + browser fullscreen.
 *  Projection lives in the store (persisted user setting) — switching it never
 *  touches layers, selection, filters, or the time window. Fullscreen targets
 *  the whole app shell so every open panel and selection is preserved. */
export default function MapModeControls() {
  const projection = useStore((s) => s.projection);
  const setProjection = useStore((s) => s.setProjection);
  const showTerminator = useStore((s) => s.showTerminator);
  const setShowTerminator = useStore((s) => s.setShowTerminator);
  const basemap = useStore((s) => s.basemap);
  const setBasemap = useStore((s) => s.setBasemap);
  const geo = useStore((s) => s.geo);
  const setGeoWatching = useStore((s) => s.setGeoWatching);
  const [fullscreen, setFullscreen] = useState(false);
  // phones: the six-button bar crowds the small map, so it folds behind a ⚙
  // expander (CSS-hidden on desktop); intentionally not persisted
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement != null);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {
      // some embedded/iframe contexts refuse — leave state as-is, no crash
    });
  };

  return (
    <div className={`map-mode-controls ${mobileOpen ? 'open' : ''}`} role="group" aria-label="Map view controls">
      <button
        className="mmc-btn mmc-expand"
        aria-expanded={mobileOpen}
        aria-label={mobileOpen ? 'Hide map view controls' : 'Show map view controls'}
        onClick={() => setMobileOpen((o) => !o)}
      >
        ⚙
      </button>
      <button
        className={`mmc-btn ${projection === '2d' ? 'active' : ''}`}
        aria-pressed={projection === '2d'}
        aria-label="2D map view"
        onClick={() => setProjection('2d')}
      >
        2D
      </button>
      <button
        className={`mmc-btn ${projection === '3d' ? 'active' : ''}`}
        aria-pressed={projection === '3d'}
        aria-label="3D globe view"
        onClick={() => setProjection('3d')}
      >
        3D
      </button>
      <button
        className={`mmc-btn ${showTerminator ? 'active' : ''}`}
        aria-pressed={showTerminator}
        aria-label={showTerminator ? 'Hide day/night terminator' : 'Show day/night terminator'}
        onClick={() => setShowTerminator(!showTerminator)}
      >
        ◐
      </button>
      <button
        className={`mmc-btn ${basemap === 'vivid' ? 'active' : ''}`}
        aria-pressed={basemap === 'vivid'}
        aria-label={basemap === 'vivid' ? 'Switch to dark basemap' : 'Switch to vivid basemap'}
        title={basemap === 'vivid' ? 'Vivid basemap (click for dark)' : 'Dark basemap (click for vivid)'}
        onClick={() => setBasemap(basemap === 'vivid' ? 'dark' : 'vivid')}
      >
        🎨
      </button>
      <button
        className={`mmc-btn ${geo.watching ? 'active' : ''}`}
        aria-pressed={geo.watching}
        aria-label={geo.watching ? 'Stop showing my device location' : 'Show my device location (GPS)'}
        title={geo.error ?? 'Your GPS position stays in this browser — never sent anywhere'}
        onClick={() => setGeoWatching(!geo.watching)}
      >
        🚀
      </button>
      <button
        className={`mmc-btn ${fullscreen ? 'active' : ''}`}
        aria-pressed={fullscreen}
        aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        onClick={toggleFullscreen}
      >
        ⛶
      </button>
    </div>
  );
}
