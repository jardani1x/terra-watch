import { useStore } from '../state/store';

export default function SourceManager() {
  const providers = useStore((s) => s.providers);
  const sources = useStore((s) => s.sources);
  const toggleSource = useStore((s) => s.toggleSource);

  const list = Object.values(providers);
  const onCount = list.filter((p) => sources[p.id] ?? true).length;

  return (
    <section aria-label="Source manager">
      <div className="rail-sec-title">
        SOURCES <span className="tag">{onCount}/{list.length} ON</span>
      </div>
      {list.map((p) => {
        const on = sources[p.id] ?? true;
        return (
          <label className="layer-row" key={p.id}>
            <input
              type="checkbox"
              checked={on}
              onChange={() => toggleSource(p.id)}
              aria-label={`Toggle source: ${p.name}`}
            />
            <span className="lr-body">
              <div className="lr-name">{p.name}</div>
              <div className="lr-meta">{on ? p.license : 'OFF · not fetched'}</div>
            </span>
          </label>
        );
      })}
    </section>
  );
}
