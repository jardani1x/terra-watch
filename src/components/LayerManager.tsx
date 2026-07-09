import { useStore } from '../state/store';
import type { DataMode } from '../lib/providers/types';
import { eventCounts } from '../lib/layers';
import { ago } from '../lib/format';
import { ALERT_COLORS, ALERT_LABELS, type AlertLevel } from '../lib/alertLevels';

const DOT: Record<DataMode, string> = {
  live: 'live', cache: 'cache', mock: 'mock', offline: 'offline', loading: 'loading',
};

export default function LayerManager() {
  const layers = useStore((s) => s.layers);
  const providers = useStore((s) => s.providers);
  const sources = useStore((s) => s.sources);
  const events = useStore((s) => s.events);
  const toggleLayer = useStore((s) => s.toggleLayer);
  const showAlertLevels = useStore((s) => s.showAlertLevels);
  const setShowAlertLevels = useStore((s) => s.setShowAlertLevels);

  const counts = eventCounts(events, layers);
  const groups = layers.reduce<Record<string, typeof layers>>((acc, l) => {
    (acc[l.group] ??= []).push(l);
    return acc;
  }, {});

  return (
    <section aria-label="Layer manager">
      <div className="rail-sec-title">
        LAYERS <span className="tag">{layers.filter((l) => l.enabled).length}/{layers.length} ON</span>
      </div>

      {Object.entries(groups).map(([group, ls]) => (
        <div key={group}>
          <div className="layer-group-label">{group.toUpperCase()}</div>
          {ls.map((l) => {
            const p = providers[l.providerId];
            const mode = p?.status ?? 'offline';
            const sourceOn = sources[l.providerId] ?? true;
            return (
              <label className="layer-row" key={l.id}>
                <input type="checkbox" checked={l.enabled} onChange={() => toggleLayer(l.id)} aria-label={l.name} />
                <span className="swatch" style={{ background: l.color }} title={l.name} />
                <span className="lr-body">
                  <div className="lr-name">{l.name}</div>
                  <div className="lr-meta">
                    {sourceOn ? (
                      <>
                        <span className={`dot ${DOT[mode]}`} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                        {p?.name ?? l.providerId}
                        {mode === 'mock' && ' · SAMPLE'}
                        {p?.lastSuccessAt ? ` · ${ago(p.lastSuccessAt)}` : ''}
                      </>
                    ) : (
                      <span style={{ color: 'var(--muted)' }}>OFF · source disabled</span>
                    )}
                  </div>
                </span>
                <span className="lr-count">{counts[l.id] ?? 0}</span>
              </label>
            );
          })}
        </div>
      ))}

      <div className="layer-group-label">DERIVED</div>
      <label className="layer-row">
        <input
          type="checkbox"
          checked={showAlertLevels}
          onChange={(e) => setShowAlertLevels(e.target.checked)}
          aria-label="Country alert levels"
        />
        <span className="lr-body">
          <div className="lr-name">Country alert levels</div>
          <div className="lr-meta">GDACS-derived + static conflict list · advisory</div>
        </span>
      </label>
      {showAlertLevels && (
        <div className="alert-legend">
          {(Object.keys(ALERT_LABELS) as AlertLevel[]).map((l) => (
            <span key={l} className="alert-legend-item">
              <i style={{ background: ALERT_COLORS[l] }} /> {ALERT_LABELS[l]}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
