import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, REGIONS } from '../state/store';

interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const layers = useStore((s) => s.layers);
  const providers = useStore((s) => s.providers);
  const sources = useStore((s) => s.sources);
  const toggleLayer = useStore((s) => s.toggleLayer);
  const toggleSource = useStore((s) => s.toggleSource);
  const refreshAll = useStore((s) => s.refreshAll);
  const flyTo = useStore((s) => s.flyTo);
  const setView = useStore((s) => s.setView);
  const clearGraph = useStore((s) => s.clearGraph);
  const graphNodeCount = useStore((s) => s.graph.nodes.length);

  const commands = useMemo<Command[]>(() => {
    const base: Command[] = [
      { id: 'refresh', label: 'Refresh all sources', hint: 'data', run: () => refreshAll() },
      { id: 'view-map', label: 'Switch to Map view', hint: 'view', run: () => setView('map') },
      { id: 'view-graph', label: 'Switch to Graph view', hint: 'view', run: () => setView('graph') },
      ...(graphNodeCount > 0
        ? [{ id: 'graph-clear', label: 'Clear graph workspace', hint: 'graph', run: () => clearGraph() }]
        : []),
    ];
    const layerCmds = layers.map((l) => ({
      id: `toggle-${l.id}`,
      label: `${l.enabled ? 'Hide' : 'Show'} layer: ${l.name}`,
      hint: 'layer',
      run: () => toggleLayer(l.id),
    }));
    const regionCmds = Object.entries(REGIONS).map(([name, r]) => ({
      id: `region-${name}`,
      label: `Go to region: ${name}`,
      hint: 'region',
      run: () => flyTo(r.center, r.zoom),
    }));
    const sourceCmds = Object.values(providers).map((p) => ({
      id: `source-${p.id}`,
      label: `${(sources[p.id] ?? true) ? 'Disable' : 'Enable'} source: ${p.name}`,
      hint: 'source',
      run: () => toggleSource(p.id),
    }));
    return [...base, ...regionCmds, ...sourceCmds, ...layerCmds];
  }, [layers, providers, sources, toggleLayer, toggleSource, refreshAll, flyTo, setView, clearGraph, graphNodeCount]);

  const filtered = commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  if (!open) return null;

  const runActive = () => {
    const cmd = filtered[active];
    if (cmd) { cmd.run(); onClose(); }
  };

  return (
    <div
      role="dialog"
      aria-label="Command palette"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.55)', display: 'flex', justifyContent: 'center', paddingTop: '12vh' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(560px, 92vw)', height: 'fit-content', maxHeight: '70vh', background: 'var(--panel-2)', border: '1px solid var(--line-2)', borderRadius: 6, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); runActive(); }
            else if (e.key === 'Escape') onClose();
          }}
          placeholder="Type a command…  (regions, layers, refresh)"
          aria-label="Command input"
          style={{ background: 'transparent', border: 'none', borderBottom: '1px solid var(--line)', color: 'var(--text)', padding: '14px 16px', fontSize: 15, outline: 'none', fontFamily: 'var(--mono)' }}
        />
        <div style={{ overflowY: 'auto' }}>
          {filtered.length === 0 && <div style={{ padding: 16, color: 'var(--muted)' }}>No matching commands.</div>}
          {filtered.map((c, i) => (
            <div
              key={c.id}
              onMouseEnter={() => setActive(i)}
              onClick={runActive}
              style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', background: i === active ? 'rgba(69,224,176,0.12)' : 'transparent', cursor: 'pointer', fontSize: 13 }}
            >
              <span>{c.label}</span>
              {c.hint && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>{c.hint}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
