import { useStore } from '../state/store';
import { ago, hhmm } from '../lib/format';

/** Local snapshot baselines (IndexedDB, 7-day retention). Comparing shows a
 *  transparent added/removed count vs the baseline — a labeled delta over
 *  public data, not a prediction. */
export default function SnapshotPanel() {
  const snapshots = useStore((s) => s.snapshots);
  const delta = useStore((s) => s.snapshotDelta);
  const events = useStore((s) => s.events);
  const takeSnapshot = useStore((s) => s.takeSnapshot);
  const removeSnapshot = useStore((s) => s.removeSnapshot);
  const compareSnapshot = useStore((s) => s.compareSnapshot);

  return (
    <section aria-label="Snapshots">
      <div className="rail-sec-title">
        SNAPSHOTS <span className="tag">{snapshots.length} · 7d local</span>
      </div>
      <button className="kbd" style={{ marginBottom: 8 }} disabled={events.length === 0} onClick={() => takeSnapshot()}>
        ⊕ SAVE SNAPSHOT
      </button>
      {snapshots.length === 0 && (
        <p className="inspector-empty">
          Save a baseline of the current events to see what changed later. Stored only in this
          browser (IndexedDB), kept 7 days.
        </p>
      )}
      {snapshots.map((m) => (
        <div className="monitor-row" key={m.id}>
          <span className="mon-term">{m.name}</span>
          <span className="mon-count">{ago(m.at)}</span>
          <button className="kbd" onClick={() => compareSnapshot(m.id)} aria-label={`Compare with snapshot ${m.name}`}>Δ</button>
          <button className="mon-remove" onClick={() => removeSnapshot(m.id)} aria-label={`Delete snapshot ${m.name}`}>✕</button>
        </div>
      ))}
      {delta && (
        <div className="snapshot-delta" aria-label="Snapshot comparison result">
          <b>Δ vs {hhmm(delta.snapshotAt)} baseline:</b> +{delta.added} new · −{delta.removed} no longer present
          <div style={{ color: 'var(--muted)', marginTop: 2 }}>
            Count of public events appearing/disappearing since the local snapshot.
          </div>
        </div>
      )}
    </section>
  );
}
