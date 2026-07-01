import { useState } from 'react';
import { useStore } from '../state/store';
import { ago, hhmm } from '../lib/format';

/** Slice 1 timeline: a live, sorted rolling feed of the events on the map,
 *  click-to-inspect. Playback + correlation markers land in Slice 5. */
export default function TimelineDrawer() {
  const [collapsed, setCollapsed] = useState(true);
  const events = useStore((s) => s.events);
  const select = useStore((s) => s.select);

  const sorted = [...events].sort((a, b) => b.time - a.time).slice(0, 200);

  return (
    <div className={`timeline ${collapsed ? 'collapsed' : ''}`}>
      <div className="timeline-head" onClick={() => setCollapsed((c) => !c)} role="button" aria-expanded={!collapsed}>
        <span>{collapsed ? '▲' : '▼'} EVENT TIMELINE</span>
        <span className="tl-count">{sorted.length} events</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', fontWeight: 400 }}>
          rolling 24h · newest first
        </span>
      </div>
      <div className="timeline-list">
        {sorted.length === 0 && <div className="inspector-empty" style={{ padding: 12 }}>No events loaded yet.</div>}
        {sorted.map((e) => (
          <div className="tl-item" key={e.id} onClick={() => select(e)}>
            <span className="tl-time">{hhmm(e.time)}</span>
            <span className={`dot ${e.magnitude && e.magnitude >= 6 ? 'offline' : e.magnitude && e.magnitude >= 5 ? 'cache' : 'live'}`} />
            <span>{e.title}</span>
            <span className="tl-mag">{e.magnitude != null ? `M${e.magnitude.toFixed(1)}` : ''} <span style={{ color: 'var(--muted)' }}>{ago(e.time)}</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}
