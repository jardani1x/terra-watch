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
      {/* whole bar toggles; the button has no own onClick — its click bubbles
          here — but stays for keyboard/AT access */}
      <header className="dock-bar" onClick={toggleDock}>
        <span className="dock-bar-title">INTEL DOCK</span>
        <button className="kbd" aria-label={open ? 'Collapse dock' : 'Expand dock'} aria-expanded={open}>
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
