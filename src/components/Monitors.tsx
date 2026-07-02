import { useState } from 'react';
import { useStore } from '../state/store';

export default function Monitors() {
  const [input, setInput] = useState('');
  const monitors = useStore((s) => s.monitors);
  const events = useStore((s) => s.events);
  const addMonitor = useStore((s) => s.addMonitor);
  const removeMonitor = useStore((s) => s.removeMonitor);

  const countFor = (term: string) => {
    const t = term.toLowerCase();
    return events.filter((e) => e.title.toLowerCase().includes(t)).length;
  };

  return (
    <section aria-label="Monitors">
      <div className="rail-sec-title">
        MONITORS <span className="tag">{monitors.length}</span>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          addMonitor(input);
          setInput('');
        }}
      >
        <input
          className="monitor-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add keyword to watch…"
          aria-label="Add monitor keyword"
        />
      </form>
      {monitors.length === 0 && (
        <p className="inspector-empty">No monitors yet. Add a keyword to highlight matching events in the timeline and on the map.</p>
      )}
      {monitors.map((m) => (
        <div className="monitor-row" key={m.id}>
          <span className="swatch" style={{ background: m.color }} title={m.term} />
          <span className="mon-term">{m.term}</span>
          <span className="mon-count">{countFor(m.term)}</span>
          <button className="mon-remove" onClick={() => removeMonitor(m.id)} aria-label={`Remove monitor ${m.term}`}>✕</button>
        </div>
      ))}
    </section>
  );
}
