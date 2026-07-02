import { useMemo } from 'react';
import { useStore, type GraphLayout } from '../state/store';
import { layerIdForEvent } from '../lib/layers';
import { layoutForce, layoutGrid, layoutRadial } from '../lib/graphLayout';

const LAYOUTS: GraphLayout[] = ['force', 'radial', 'grid'];

function downloadGraphJson(nodes: { event: unknown }[], edges: unknown[]) {
  const data = { nodes: nodes.map((n) => n.event), edges, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `terra-watch-graph-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Read-only correlation graph over public geo-events the user has explicitly
 *  added — proximity/time links only, never person or identity data. */
export default function GraphWorkspace() {
  const graph = useStore((s) => s.graph);
  const layers = useStore((s) => s.layers);
  const selected = useStore((s) => s.selected);
  const select = useStore((s) => s.select);
  const searchAround = useStore((s) => s.searchAround);
  const clearGraph = useStore((s) => s.clearGraph);
  const setGraphLayout = useStore((s) => s.setGraphLayout);

  const ids = graph.nodes.map((n) => n.id);
  const idsKey = ids.join(',');
  const edgesKey = graph.edges.map((e) => `${e.source}-${e.target}`).join(',');

  const positions = useMemo(() => {
    if (graph.layout === 'grid') return layoutGrid(ids);
    if (graph.layout === 'radial') return layoutRadial(ids);
    return layoutForce(ids, graph.edges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, edgesKey, graph.layout]);

  const posById = Object.fromEntries(positions.map((p) => [p.id, p]));
  const colorFor = (event: (typeof graph.nodes)[number]['event']) => {
    const layerId = layerIdForEvent(event, layers);
    return layers.find((l) => l.id === layerId)?.color ?? '#45e0b0';
  };

  const selectedInGraph = selected != null && graph.nodes.some((n) => n.id === selected.id);

  return (
    <div className="graph-wrap" aria-label="Graph workspace">
      <div className="graph-toolbar">
        <span className="tag">{graph.nodes.length} nodes · {graph.edges.length} links</span>
        <div className="graph-layout-btns">
          {LAYOUTS.map((l) => (
            <button
              key={l}
              className={`kbd ${graph.layout === l ? 'active' : ''}`}
              onClick={() => setGraphLayout(l)}
              aria-pressed={graph.layout === l}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          className="kbd"
          disabled={!selectedInGraph}
          onClick={() => selected && searchAround(selected.id)}
          title={selectedInGraph ? `Find public events near ${selected!.title}` : 'Select a node in the graph first'}
        >
          SEARCH AROUND
        </button>
        <button
          className="kbd"
          disabled={graph.nodes.length === 0}
          onClick={() => downloadGraphJson(graph.nodes, graph.edges)}
        >
          EXPORT JSON
        </button>
        <button className="kbd" disabled={graph.nodes.length === 0} onClick={clearGraph}>
          CLEAR
        </button>
      </div>

      {graph.nodes.length === 0 ? (
        <div className="inspector-empty" style={{ padding: 24 }}>
          Graph is empty. Select an object on the map and choose <b>+ Add to graph</b> in the
          inspector to start a relationship graph, then use <b>Search around</b> to expand it with
          related public events (same source/type, nearby in space and time). Correlations are
          transparent distance/time links over public data only — never person tracking.
        </div>
      ) : (
        <svg viewBox="0 0 1000 600" className="graph-svg" role="img" aria-label="Entity relationship graph">
          {graph.edges.map((e) => {
            const a = posById[e.source];
            const b = posById[e.target];
            if (!a || !b) return null;
            return (
              <g key={e.id}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(108,150,138,0.4)" strokeWidth={1} />
                <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2} className="graph-edge-label">{e.label}</text>
              </g>
            );
          })}
          {graph.nodes.map((n) => {
            const p = posById[n.id];
            if (!p) return null;
            const isSelected = selected?.id === n.id;
            return (
              <g
                key={n.id}
                transform={`translate(${p.x},${p.y})`}
                className="graph-node"
                onClick={() => select(n.event)}
                role="button"
                aria-label={n.event.title}
              >
                <circle
                  r={isSelected ? 12 : 9}
                  fill={colorFor(n.event)}
                  stroke={isSelected ? '#fff' : 'rgba(255,255,255,0.4)'}
                  strokeWidth={isSelected ? 2 : 1}
                />
                <text y={-14} className="graph-node-label">{n.event.title.slice(0, 28)}</text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
