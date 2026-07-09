import { useStore } from '../../state/store';
import { REGION_QUERIES } from '../../lib/providers/gdelt';
import DockPanel from './DockPanel';

export default function RegionalNews() {
  const { region, articles, mode } = useStore((s) => s.dockNews);
  const setDockRegion = useStore((s) => s.setDockRegion);
  const regions = Object.keys(REGION_QUERIES);
  return (
    <DockPanel title="REGIONAL NEWS" mode={mode} source="GDELT">
      <div className="dock-tabs" role="tablist" aria-label="News region">
        {regions.map((r) => (
          <button key={r} role="tab" aria-selected={region === r} className={`dock-tab ${region === r ? 'active' : ''}`} onClick={() => setDockRegion(r)}>
            {r}
          </button>
        ))}
      </div>
      {articles.slice(0, 6).map((a) => (
        <a key={a.url} className="dock-row" href={a.url} target="_blank" rel="noreferrer">
          <span className="dock-row-title">{a.title}</span>
          <small>{a.domain}</small>
        </a>
      ))}
    </DockPanel>
  );
}
