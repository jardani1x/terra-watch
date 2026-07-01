import { useStore } from '../state/store';
import type { DataMode } from '../lib/providers/types';
import { ago } from '../lib/format';

const DOT: Record<DataMode, string> = {
  live: 'live', cache: 'cache', mock: 'mock', offline: 'offline', loading: 'loading',
};

export default function LayerManager() {
  const layers = useStore((s) => s.layers);
  const providers = useStore((s) => s.providers);
  const toggleLayer = useStore((s) => s.toggleLayer);

  // group layers by their .group field
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
            return (
              <label className="layer-row" key={l.id}>
                <input type="checkbox" checked={l.enabled} onChange={() => toggleLayer(l.id)} aria-label={l.name} />
                <span className={`dot ${DOT[mode]}`} title={`Source status: ${mode}`} />
                <span className="lr-body">
                  <div className="lr-name">{l.name}</div>
                  <div className="lr-meta">
                    {p?.name ?? l.providerId}
                    {mode === 'mock' && ' · SAMPLE'}
                    {p?.lastSuccessAt ? ` · ${ago(p.lastSuccessAt)}` : ''}
                  </div>
                </span>
                <span className="lr-count">{p?.itemCount ?? 0}</span>
              </label>
            );
          })}
        </div>
      ))}
    </section>
  );
}
