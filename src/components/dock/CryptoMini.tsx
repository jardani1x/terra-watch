import { useStore } from '../../state/store';
import DockPanel from './DockPanel';

export default function CryptoMini() {
  const { coins, mode } = useStore((s) => s.dockCrypto);
  return (
    <DockPanel title="CRYPTO" mode={mode} source="CoinGecko">
      {coins.map((c) => (
        <div key={c.id} className="dock-row">
          <span className="dock-row-title">{c.symbol}</span>
          <b>${c.price.toLocaleString('en-US', { maximumFractionDigits: c.price >= 100 ? 0 : 2 })}</b>
          {c.change24h != null && (
            <small className={c.change24h >= 0 ? 'up' : 'down'}>{c.change24h >= 0 ? '+' : ''}{c.change24h.toFixed(1)}%</small>
          )}
        </div>
      ))}
    </DockPanel>
  );
}
