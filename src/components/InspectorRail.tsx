import { useStore } from '../state/store';
import { ago, hhmm } from '../lib/format';
import { capitalFor, countryAsEvent, countryZoom, eventsInCountry } from '../lib/countries';
import { computeCountryRisk } from '../lib/risk';
import { layerIdForEvent } from '../lib/layers';

// Fields rendered explicitly (in order); everything else in props is shown generically.
const HANDLED = new Set(['magnitude', 'depthKm', 'place', 'category', 'note']);
const LABELS: Record<string, string> = {
  magnitudeUnit: 'Magnitude unit',
  observations: 'Observations',
  megawatts: 'Capacity (MW)',
  code: 'GCAT code',
  country: 'Country',
};

export default function InspectorRail() {
  const selected = useStore((s) => s.selected);
  const mobileRail = useStore((s) => s.mobileRail);
  const setMobileRail = useStore((s) => s.setMobileRail);
  const providers = useStore((s) => s.providers);
  const graph = useStore((s) => s.graph);
  const addToGraph = useStore((s) => s.addToGraph);
  const removeFromGraph = useStore((s) => s.removeFromGraph);
  const searchAround = useStore((s) => s.searchAround);
  const dossier = useStore((s) => s.dossier);
  const pinToDossier = useStore((s) => s.pinToDossier);
  const unpinFromDossier = useStore((s) => s.unpinFromDossier);
  const inGraph = selected != null && graph.nodes.some((n) => n.id === selected.id);
  const inDossier = selected != null && dossier.items.some((i) => i.id === selected.id);

  const selectedCountry = useStore((s) => s.selectedCountry);
  const selectCountry = useStore((s) => s.selectCountry);
  const countryTimeline = useStore((s) => s.countryTimeline);
  const setCountryTimeline = useStore((s) => s.setCountryTimeline);
  const capitals = useStore((s) => s.capitals);
  const events = useStore((s) => s.events);
  const layers = useStore((s) => s.layers);
  const flyTo = useStore((s) => s.flyTo);
  const select = useStore((s) => s.select);
  const setView = useStore((s) => s.setView);
  const railCollapsed = useStore((s) => s.railCollapsed);
  const toggleRail = useStore((s) => s.toggleRail);
  const showCountry = selectedCountry != null && selected == null;

  return (
    <aside className={`rail right ${mobileRail === 'right' ? 'open' : ''} ${railCollapsed.right ? 'collapsed' : ''}`} aria-label="Object inspector">
      <button
        className="rail-toggle"
        aria-label={railCollapsed.right ? 'Expand inspector' : 'Collapse inspector'}
        onClick={() => toggleRail('right')}
      >
        {railCollapsed.right ? '«' : '»'}
      </button>
      {railCollapsed.right ? null : (<>
      <button className="sheet-close" aria-label="Close inspector" onClick={() => setMobileRail(null)}>✕</button>
      <div className="rail-sec-title">
        INSPECTOR <span className="tag">{selected ? 'OBJECT' : showCountry ? 'COUNTRY' : 'IDLE'}</span>
      </div>

      {!selected && !showCountry && (
        <p className="inspector-empty">
          Select an object or a country on the map to inspect it. Every object shows
          its source, timestamp, and freshness — Terra Watch makes no claim it can't
          attribute.
        </p>
      )}

      {showCountry && (() => {
        const c = selectedCountry;
        const cp = c.properties;
        const asEvent = countryAsEvent(c);
        const cInGraph = graph.nodes.some((n) => n.id === asEvent.id);
        const cInDossier = dossier.items.some((i) => i.id === asEvent.id);
        const inCountry = eventsInCountry(events, c);
        const risk = computeCountryRisk(events).find(
          (r) => r.country.toLowerCase() === cp.NAME.toLowerCase() || r.country.toLowerCase() === cp.NAME_LONG.toLowerCase(),
        );
        const activeLayers = [...new Set(
          inCountry.map((e) => layerIdForEvent(e, layers)).filter((id): id is string => id != null),
        )].map((id) => layers.find((l) => l.id === id)).filter((l) => l != null);
        const p = providers[asEvent.sourceId];
        const gdpB = cp.GDP_MD >= 1_000_000 ? `$${(cp.GDP_MD / 1_000_000).toFixed(2)}T` : `$${(cp.GDP_MD / 1_000).toFixed(0)}B`;
        const capital = capitals ? capitalFor(capitals, cp) : undefined;
        return (
          <div>
            <div className="insp-type">Country (reference)</div>
            <div className="insp-title">{cp.NAME}</div>

            <div className="graph-actions">
              {cInGraph ? (
                <>
                  <span className="tag" style={{ color: 'var(--accent)', borderColor: 'rgba(69,224,176,0.5)' }}>✓ IN GRAPH</span>
                  <button className="kbd" onClick={() => { searchAround(asEvent.id); setView('graph'); }}>Search related</button>
                  <button className="kbd" onClick={() => removeFromGraph(asEvent.id)}>Remove</button>
                </>
              ) : (
                <>
                  <button className="kbd" onClick={() => addToGraph(asEvent)}>+ Add to graph</button>
                  <button className="kbd" onClick={() => { addToGraph(asEvent); searchAround(asEvent.id); setView('graph'); }}>Search related</button>
                </>
              )}
              {cInDossier ? (
                <>
                  <span className="tag" style={{ color: 'var(--accent)', borderColor: 'rgba(69,224,176,0.5)' }}>✓ IN DOSSIER</span>
                  <button className="kbd" onClick={() => unpinFromDossier(asEvent.id)}>Unpin</button>
                </>
              ) : (
                <button className="kbd" onClick={() => pinToDossier(asEvent)}>+ Pin to dossier</button>
              )}
              <button
                className="kbd"
                aria-pressed={countryTimeline}
                style={countryTimeline ? { color: 'var(--accent)', borderColor: 'rgba(69,224,176,0.5)' } : undefined}
                onClick={() => setCountryTimeline(!countryTimeline)}
              >
                {countryTimeline ? '✓ Timeline filtered' : 'View timeline'}
              </button>
              <button className="kbd" onClick={() => flyTo([cp.LABEL_X, cp.LABEL_Y], countryZoom(c))}>Zoom to</button>
              <button className="kbd" onClick={() => selectCountry(null)}>Clear selection</button>
            </div>

            <div style={{ marginTop: 10 }}>
              <div className="insp-kv"><span>Region</span><b>{cp.CONTINENT} · {cp.SUBREGION}</b></div>
              {capital && (
                <div className="insp-kv"><span>Capital</span><b>{capital}</b></div>
              )}
              <div className="insp-kv"><span>Population</span><b>{cp.POP_EST.toLocaleString()} <span style={{ color: 'var(--muted)' }}>({cp.POP_YEAR} est.)</span></b></div>
              <div className="insp-kv"><span>GDP</span><b>{gdpB} <span style={{ color: 'var(--muted)' }}>({cp.GDP_YEAR} est.)</span></b></div>
              <div className="insp-kv"><span>Income group</span><b>{cp.INCOME_GRP.replace(/^\d+\.\s*/, '')}</b></div>
              <div className="insp-kv"><span>Economy</span><b>{cp.ECONOMY.replace(/^\d+\.\s*/, '')}</b></div>
            </div>

            <div className="rail-sec-title" style={{ marginTop: 12 }}>
              RISK SUMMARY <span className="tag">INFERENCE</span>
            </div>
            {risk ? (
              <div className="insp-kv"><span>Alert weight {risk.score}</span><b>{risk.components.join(' · ')}</b></div>
            ) : (
              <p className="inspector-empty">No country-attributed alerts for {cp.NAME} in the current feed.</p>
            )}

            <div className="rail-sec-title" style={{ marginTop: 12 }}>
              EVENTS IN COUNTRY <span className="tag">{inCountry.length}</span>
            </div>
            {inCountry.length === 0 && (
              <p className="inspector-empty">
                No current-feed events inside {cp.NAME}'s borders (50m boundary
                resolution; offshore events don't attribute).
              </p>
            )}
            {inCountry.slice(0, 6).map((e) => (
              <button
                key={e.id}
                className="kbd"
                style={{ display: 'block', width: '100%', textAlign: 'left', marginTop: 4 }}
                onClick={() => { select(e); flyTo([e.lon, e.lat], 5); }}
              >
                {e.category ?? e.type} · {e.title.slice(0, 48)} · {ago(e.time)}
              </button>
            ))}

            {activeLayers.length > 0 && (
              <>
                <div className="rail-sec-title" style={{ marginTop: 12 }}>ACTIVE LAYERS HERE</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {activeLayers.map((l) => (
                    <span key={l.id} className="tag" style={{ borderColor: l.color, color: l.color }}>{l.name}</span>
                  ))}
                </div>
              </>
            )}

            <div className="source-card">
              <div className="sc-head">
                <span className={`dot ${p?.status ?? 'offline'}`} /> SOURCE · STATIC DATASET
              </div>
              <div><b>{p?.name ?? 'Natural Earth'}</b></div>
              <div style={{ color: 'var(--muted)', marginTop: 2 }}>{p?.license}</div>
              <div style={{ marginTop: 6 }}><a href={p?.homepage} target="_blank" rel="noreferrer">Dataset home ↗</a></div>
            </div>
          </div>
        );
      })()}

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
              {inDossier ? (
                <>
                  <span className="tag" style={{ color: 'var(--accent)', borderColor: 'rgba(69,224,176,0.5)' }}>✓ IN DOSSIER</span>
                  <button className="kbd" onClick={() => unpinFromDossier(selected.id)}>Unpin</button>
                </>
              ) : (
                <button className="kbd" onClick={() => pinToDossier(selected)}>+ Pin to dossier</button>
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
      </>)}
    </aside>
  );
}
