import { useStore } from '../state/store';
import type { DataMode } from '../lib/providers/types';
import { ago } from '../lib/format';

const DOT: Record<DataMode, string> = {
  live: 'live', cache: 'cache', mock: 'mock', offline: 'offline', loading: 'loading',
};

export default function ProviderHealthBar() {
  const providers = useStore((s) => s.providers);
  const refreshAll = useStore((s) => s.refreshAll);

  return (
    <footer className="healthbar" aria-label="Provider health and data freshness">
      <span style={{ color: 'var(--muted)' }}>SOURCES</span>
      {Object.values(providers).map((p) => (
        <span className="health-chip" key={p.id} title={p.error ? `Error: ${p.error}` : `${p.name} — ${p.license}`}>
          <span className={`dot ${DOT[p.status]}`} />
          <b>{p.name}</b>
          <span>{p.status.toUpperCase()}</span>
          <span className="lat">{p.itemCount} items</span>
          {p.latencyMs != null && <span className="lat">{p.latencyMs}ms</span>}
          <span className="lat">{p.lastSuccessAt ? ago(p.lastSuccessAt) : '—'}</span>
        </span>
      ))}
      <button className="kbd" onClick={() => refreshAll()} style={{ marginLeft: 'auto' }}>↻ REFRESH</button>
    </footer>
  );
}
