import { useState } from 'react';
import { clearAllLocalData } from '../lib/privacy';

/** Clears every trace Terra Watch keeps in this browser (settings,
 *  monitors, graph, dossier, analyst key, snapshots). Nothing here has ever
 *  left the browser — there is no Terra Watch server to clear anything on.
 *  Two-step in-UI confirm (not a native confirm() dialog) so it stays
 *  reliably automatable. */
export default function PrivacyPanel() {
  const [confirming, setConfirming] = useState(false);

  return (
    <section aria-label="Privacy">
      <div className="rail-sec-title">PRIVACY</div>
      <p className="inspector-empty" style={{ marginTop: 0 }}>
        All Terra Watch data lives only in this browser (localStorage +
        IndexedDB). This clears settings, monitors, the link graph, the
        dossier, any saved analyst API key, and snapshots, then reloads.
        LIVE TV embeds load YouTube (Google) content only after you click a
        channel — nothing loads silently.
      </p>
      {confirming ? (
        <div className="graph-actions">
          <button className="kbd" style={{ color: 'var(--danger)', borderColor: 'rgba(255,90,82,0.5)' }} onClick={() => void clearAllLocalData()}>
            CONFIRM CLEAR?
          </button>
          <button className="kbd" onClick={() => setConfirming(false)}>CANCEL</button>
        </div>
      ) : (
        <div className="graph-actions">
          <button className="kbd" onClick={() => setConfirming(true)}>CLEAR LOCAL DATA</button>
        </div>
      )}
    </section>
  );
}
