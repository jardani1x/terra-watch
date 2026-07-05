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
  const [fullscreen, setFullscreen] = useState(false);

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
    <div className="map-mode-controls" role="group" aria-label="Map view controls">
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
