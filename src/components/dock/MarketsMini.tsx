import { useStore } from '../../state/store';
import DockPanel from './DockPanel';

export default function MarketsMini() {
  const { quotes, mode } = useStore((s) => s.market);
  const fx = quotes.filter((q) => q.id.startsWith('fx-'));
  return (
    <DockPanel title="MARKETS" mode={mode} source="ECB via Frankfurter">
      {fx.map((q) => (
        <div key={q.id} className="dock-row">
          <span className="dock-row-title">{q.label}</span>
          <b>{q.value}</b>
          {q.asOf && <small>{q.asOf}</small>}
        </div>
      ))}
      <div className="dock-note">Indices need a keyed source — not shown rather than faked.</div>
    </DockPanel>
  );
}
