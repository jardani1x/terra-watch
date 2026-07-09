import { useStore } from '../state/store';
import { FIRMS_META } from '../lib/providers/firms';

/** Optional NASA FIRMS hotspot overlay — BYO MAP_KEY tier. The overlay is a
 *  raster rendered by NASA's WMS (last-24h VIIRS detections), not itemized
 *  events: detections never enter the timeline or inspector, and the panel
 *  says so. The key is stored only in this browser and sent only to NASA
 *  (same policy as the AI analyst key). */
export default function FirmsPanel() {
  const firmsKey = useStore((s) => s.firmsKey);
  const setFirmsKey = useStore((s) => s.setFirmsKey);
  const health = useStore((s) => s.providers[FIRMS_META.id]);

  const configured = !!firmsKey;

  return (
    <section aria-label="FIRMS hotspots">
      <div className="rail-sec-title">
        FIRMS HOTSPOTS{' '}
        <span className="tag" style={{ color: configured ? 'var(--amber)' : 'var(--muted)', borderColor: configured ? 'rgba(255,180,84,0.5)' : undefined }}>
          {configured ? 'BYO KEY · OVERLAY' : 'BYO KEY'}
        </span>
      </div>
      <p className="inspector-empty" style={{ marginTop: 0 }}>
        Last-24h VIIRS fire detections as a map overlay, rendered directly by
        NASA&apos;s FIRMS WMS. Needs a free{' '}
        <a href="https://firms.modaps.eosdis.nasa.gov/api/map_key/" target="_blank" rel="noopener noreferrer">MAP_KEY</a>
        {' '}(stored only in this browser, sent only to NASA). An overlay, not
        itemized events — detections don&apos;t appear in the timeline.
      </p>
      <input
        className="monitor-input"
        type="password"
        aria-label="NASA FIRMS MAP_KEY"
        placeholder="FIRMS MAP_KEY (stored only in this browser)…"
        value={firmsKey ?? ''}
        onChange={(e) => setFirmsKey(e.target.value || null)}
      />
      {configured && (
        <>
          <div className="lr-meta" style={{ padding: '0 2px 6px' }}>
            {health?.status === 'live' && `NASA WMS reachable · ${health.latencyMs ?? '—'} ms (reachability, not key validity)`}
            {health?.status === 'offline' && `WMS unreachable: ${health.error ?? 'unknown error'}`}
            {health?.status === 'loading' && 'Checking NASA WMS…'}
          </div>
          <div className="graph-actions" style={{ marginTop: -4, marginBottom: 8 }}>
            <button className="kbd" onClick={() => setFirmsKey(null)}>CLEAR KEY</button>
          </div>
        </>
      )}
    </section>
  );
}
