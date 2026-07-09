import { useStore } from '../state/store';
import WorldNews from './dock/WorldNews';
import RegionalNews from './dock/RegionalNews';
import YouTubeNews from './dock/YouTubeNews';
import MarketsMini from './dock/MarketsMini';
import CryptoMini from './dock/CryptoMini';

export default function BottomDock() {
  const open = useStore((s) => s.dockOpen);
  const toggleDock = useStore((s) => s.toggleDock);
  return (
    <div className={`bottom-dock ${open ? 'open' : ''}`} data-testid="bottom-dock">
      <header className="dock-bar">
        <span className="dock-bar-title">INTEL DOCK</span>
        <button className="kbd" aria-label={open ? 'Collapse dock' : 'Expand dock'} onClick={toggleDock}>
          {open ? '▾' : '▴'}
        </button>
      </header>
      {open && (
        <div className="dock-strip">
          <WorldNews />
          <RegionalNews />
          <YouTubeNews />
          <MarketsMini />
          <CryptoMini />
        </div>
      )}
    </div>
  );
}
