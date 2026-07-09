import { useStore } from '../state/store';
import type { DataMode } from '../lib/providers/types';
import { ago } from '../lib/format';

const DOT: Record<DataMode, string> = {
  live: 'live', cache: 'cache', mock: 'mock', offline: 'offline', loading: 'loading',
};

export default function ProviderHealthBar() {
  const providers = useStore((s) => s.providers);
  const sources = useStore((s) => s.sources);
  const refreshAll = useStore((s) => s.refreshAll);

  return (
    <footer className="healthbar" aria-label="Provider health and data freshness">
      <span style={{ color: 'var(--muted)' }}>SOURCES</span>
      {Object.values(providers).map((p) => {
        const on = sources[p.id] ?? true;
        return (
          <span
            className={`health-chip${on ? '' : ' off'}`}
            key={p.id}
            title={on ? (p.error ? `Error: ${p.error}` : `${p.name} — ${p.license}`) : `${p.name} — disabled by user`}
          >
            <span className={`dot ${on ? DOT[p.status] : 'offline'}`} />
            <b>{p.name}</b>
            <span>{on ? p.status.toUpperCase() : 'OFF'}</span>
            {on && p.itemCount != null && <span className="lat">{p.itemCount} items</span>}
            {on && p.latencyMs != null && <span className="lat">{p.latencyMs}ms</span>}
            {on && <span className="lat">{p.lastSuccessAt ? ago(p.lastSuccessAt) : '—'}</span>}
          </span>
        );
      })}
      <button className="kbd" onClick={() => refreshAll()} style={{ marginLeft: 'auto' }}>↻ REFRESH</button>
    </footer>
  );
}
