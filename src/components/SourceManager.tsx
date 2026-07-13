import { useStore } from '../state/store';

// groupCollapsed key for this panel — layer groups use plain group names, the
// `panel:` prefix keeps this out of their namespace
const PANEL_KEY = 'panel:sources';

export default function SourceManager() {
  const providers = useStore((s) => s.providers);
  const sources = useStore((s) => s.sources);
  const toggleSource = useStore((s) => s.toggleSource);
  const collapsed = useStore((s) => s.groupCollapsed[PANEL_KEY] ?? false);
  const toggleGroup = useStore((s) => s.toggleGroup);

  const list = Object.values(providers);
  const onCount = list.filter((p) => sources[p.id] ?? true).length;

  return (
    <section aria-label="Source manager">
      <div className="rail-sec-title">
        <button
          className="group-toggle sec-toggle"
          aria-expanded={!collapsed}
          onClick={() => toggleGroup(PANEL_KEY)}
        >
          <span className="group-caret">{collapsed ? '▸' : '▾'}</span>
          SOURCES
        </button>
        <span className="tag">{onCount}/{list.length} ON</span>
      </div>
      {!collapsed && list.map((p) => {
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
