import { useStore } from '../../state/store';
import DockPanel from './DockPanel';

function ago(seendate: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/.exec(seendate);
  if (!m) return '';
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  return min < 60 ? `${min}m` : `${Math.round(min / 60)}h`;
}

export default function WorldNews() {
  const { region, articles, mode, error } = useStore((s) => s.dockNews);
  return (
    <DockPanel title="WORLD NEWS" mode={region === 'World' ? mode : undefined} source="GDELT">
      {region !== 'World' ? (
        <div className="dock-note">Regional tab active — see REGIONAL NEWS.</div>
      ) : (
        <>
          {error && mode === 'mock' && <div className="dock-err">feed unavailable — sample shown</div>}
          {articles.slice(0, 8).map((a) => (
            <a key={a.url} className="dock-row" href={a.url} target="_blank" rel="noreferrer">
              <span className="dock-row-title">{a.title}</span>
              <small>{a.domain} · {ago(a.seendate)}</small>
            </a>
          ))}
        </>
      )}
    </DockPanel>
  );
}
