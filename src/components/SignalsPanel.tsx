import { useMemo } from 'react';
import { useStore } from '../state/store';
import { computeSignals } from '../lib/signals';
import { pressable } from '../lib/a11y';

const MAX_ROWS = 8;

function fmtCell(v: number, pos: string, neg: string): string {
  return `${Math.abs(v).toFixed(1)}°${v >= 0 ? pos : neg}`;
}

/** Co-location signals over the current public feeds. Every signal is a
 *  transparent count with citable contributing events — labeled INFERENCE,
 *  never a prediction. */
export default function SignalsPanel() {
  const events = useStore((s) => s.events);
  const flyTo = useStore((s) => s.flyTo);
  const setView = useStore((s) => s.setView);

  const signals = useMemo(() => computeSignals(events), [events]);

  return (
    <section aria-label="Signals">
      <div className="rail-sec-title">
        SIGNALS <span className="tag" style={{ color: 'var(--amber)', borderColor: 'rgba(255,180,84,0.5)' }}>INFERENCE</span>
      </div>
      <p className="inspector-empty" style={{ marginTop: 0 }}>
        Cells (1°×1°) where ≥2 public event types co-occur in the current feed.
        A transparent count, not a prediction.
      </p>
      {signals.length === 0 && (
        <p className="inspector-empty">No multi-type co-locations in the current feed.</p>
      )}
      {signals.slice(0, MAX_ROWS).map((sig) => (
        <div
          className="monitor-row signal-row"
          key={sig.id}
          {...pressable(() => { setView('map'); flyTo([sig.lon, sig.lat], 5); })}
          aria-label={`Signal at ${fmtCell(sig.lat, 'N', 'S')} ${fmtCell(sig.lon, 'E', 'W')}: ${sig.types.length} event types`}
        >
          <span className="mon-term">
            {sig.types.join(' + ')}
            <div className="lr-meta">{fmtCell(sig.lat, 'N', 'S')} {fmtCell(sig.lon, 'E', 'W')} · click to view</div>
          </span>
          <span className="mon-count">{sig.count} events</span>
        </div>
      ))}
      {signals.length > MAX_ROWS && (
        <div className="lr-meta" style={{ padding: '4px 7px' }}>+{signals.length - MAX_ROWS} more cells</div>
      )}
    </section>
  );
}
