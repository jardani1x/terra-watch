import { useStore } from '../state/store';
import { ago, hhmm } from '../lib/format';

// Fields rendered explicitly (in order); everything else in props is shown generically.
const HANDLED = new Set(['magnitude', 'depthKm', 'place', 'category', 'note']);
const LABELS: Record<string, string> = {
  magnitudeUnit: 'Magnitude unit',
  observations: 'Observations',
};

export default function InspectorRail() {
  const selected = useStore((s) => s.selected);
  const providers = useStore((s) => s.providers);
  const graph = useStore((s) => s.graph);
  const addToGraph = useStore((s) => s.addToGraph);
  const removeFromGraph = useStore((s) => s.removeFromGraph);
  const searchAround = useStore((s) => s.searchAround);
  const inGraph = selected != null && graph.nodes.some((n) => n.id === selected.id);

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
        const extra = Object.entries(selected.props).filter(
          ([k, v]) => !HANDLED.has(k) && v != null && v !== '',
        );
        return (
          <div>
            <div className="insp-type">{selected.category ?? selected.type}</div>
            <div className="insp-title">{selected.title}</div>

            <div className="graph-actions">
              {inGraph ? (
                <>
                  <span className="tag" style={{ color: 'var(--accent)', borderColor: 'rgba(69,224,176,0.5)' }}>✓ IN GRAPH</span>
                  <button className="kbd" onClick={() => searchAround(selected.id)}>Search around</button>
                  <button className="kbd" onClick={() => removeFromGraph(selected.id)}>Remove</button>
                </>
              ) : (
                <button className="kbd" onClick={() => addToGraph(selected)}>+ Add to graph</button>
              )}
            </div>

            <div style={{ marginTop: 10 }}>
              {selected.magnitude != null && (
                <div className="insp-kv"><span>Magnitude</span><b>{selected.magnitude}{selected.props.magnitudeUnit ? ` ${selected.props.magnitudeUnit}` : ''}</b></div>
              )}
              <div className="insp-kv"><span>Latitude</span><b>{selected.lat.toFixed(4)}</b></div>
              <div className="insp-kv"><span>Longitude</span><b>{selected.lon.toFixed(4)}</b></div>
              {selected.props.depthKm != null && (
                <div className="insp-kv"><span>Depth</span><b>{Number(selected.props.depthKm).toFixed(0)} km</b></div>
              )}
              <div className="insp-kv"><span>Observed</span><b>{hhmm(selected.time)} · {ago(selected.time)}</b></div>
              {extra.filter(([k]) => k !== 'magnitudeUnit').map(([k, v]) => (
                <div className="insp-kv" key={k}><span>{LABELS[k] ?? k}</span><b>{String(v)}</b></div>
              ))}
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
