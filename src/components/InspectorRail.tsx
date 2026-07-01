import { useStore } from '../state/store';
import { ago, hhmm } from '../lib/format';

export default function InspectorRail() {
  const selected = useStore((s) => s.selected);
  const providers = useStore((s) => s.providers);

  return (
    <aside className="rail right" aria-label="Object inspector">
      <div className="rail-sec-title">
        INSPECTOR <span className="tag">{selected ? 'OBJECT' : 'IDLE'}</span>
      </div>

      {!selected && (
        <p className="inspector-empty">
          Select an object on the map to inspect it. Every object shows its source,
          timestamp, and freshness — Terra Watch makes no claim it can't attribute.
        </p>
      )}

      {selected && (() => {
        const p = providers[selected.sourceId];
        return (
          <div>
            <div className="insp-type">{selected.type}</div>
            <div className="insp-title">{selected.title}</div>

            <div style={{ marginTop: 10 }}>
              {selected.magnitude != null && (
                <div className="insp-kv"><span>Magnitude</span><b>{selected.magnitude.toFixed(1)}</b></div>
              )}
              <div className="insp-kv"><span>Latitude</span><b>{selected.lat.toFixed(4)}</b></div>
              <div className="insp-kv"><span>Longitude</span><b>{selected.lon.toFixed(4)}</b></div>
              {selected.props.depthKm != null && (
                <div className="insp-kv"><span>Depth</span><b>{Number(selected.props.depthKm).toFixed(0)} km</b></div>
              )}
              <div className="insp-kv"><span>Observed</span><b>{hhmm(selected.time)} · {ago(selected.time)}</b></div>
            </div>

            <div className="source-card">
              <div className="sc-head">
                <span className={`dot ${p?.status ?? 'offline'}`} /> SOURCE · {(p?.status ?? 'offline').toUpperCase()}
              </div>
              <div><b>{p?.name ?? selected.sourceId}</b></div>
              <div style={{ color: 'var(--muted)', marginTop: 2 }}>{p?.license}</div>
              {selected.url && <div style={{ marginTop: 6 }}><a href={selected.url} target="_blank" rel="noreferrer">Authoritative record ↗</a></div>}
            </div>
          </div>
        );
      })()}

      <div className="disclaimer">
        <b>Civilian use only.</b> Terra Watch aggregates public open data for
        situational awareness and research. It is <b>not</b> an emergency-authority
        source and must not be used for targeting, surveillance of individuals, or
        life-safety decisions. Verify with official sources.
      </div>
    </aside>
  );
}
