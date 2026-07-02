export interface LayoutNode {
  id: string;
  x: number;
  y: number;
}

const W = 1000;
const H = 600;

export function layoutGrid(ids: string[]): LayoutNode[] {
  const cols = Math.max(1, Math.ceil(Math.sqrt(ids.length)));
  const rows = Math.max(1, Math.ceil(ids.length / cols));
  const cellW = W / cols;
  const cellH = H / rows;
  return ids.map((id, i) => ({
    id,
    x: ((i % cols) + 0.5) * cellW,
    y: (Math.floor(i / cols) + 0.5) * cellH,
  }));
}

export function layoutRadial(ids: string[]): LayoutNode[] {
  const cx = W / 2;
  const cy = H / 2;
  const r = Math.min(W, H) / 2 - 60;
  return ids.map((id, i) => {
    const a = (i / Math.max(ids.length, 1)) * Math.PI * 2;
    return { id, x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
}

interface EdgeRef {
  source: string;
  target: string;
}

/** Small deterministic force-directed layout (Coulomb repulsion + spring edges),
 *  computed synchronously in fixed iterations — fine for user-curated graphs
 *  (dozens, not thousands, of nodes) with no animation/frame budget needed. */
export function layoutForce(ids: string[], edges: EdgeRef[], iterations = 220): LayoutNode[] {
  const cx = W / 2;
  const cy = H / 2;
  const pos = new Map(layoutRadial(ids).map((n) => [n.id, { x: n.x, y: n.y }]));

  for (let iter = 0; iter < iterations; iter++) {
    const disp = new Map(ids.map((id) => [id, { x: 0, y: 0 }]));

    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = pos.get(ids[i])!;
        const b = pos.get(ids[j])!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        const dist2 = dx * dx + dy * dy || 0.01;
        const force = 4000 / dist2;
        const dist = Math.sqrt(dist2);
        dx /= dist;
        dy /= dist;
        disp.get(ids[i])!.x += dx * force;
        disp.get(ids[i])!.y += dy * force;
        disp.get(ids[j])!.x -= dx * force;
        disp.get(ids[j])!.y -= dy * force;
      }
    }

    for (const e of edges) {
      const a = pos.get(e.source);
      const b = pos.get(e.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01);
      const force = dist * 0.02;
      const ux = dx / dist;
      const uy = dy / dist;
      disp.get(e.source)!.x += ux * force;
      disp.get(e.source)!.y += uy * force;
      disp.get(e.target)!.x -= ux * force;
      disp.get(e.target)!.y -= uy * force;
    }

    for (const id of ids) {
      const p = pos.get(id)!;
      const d = disp.get(id)!;
      p.x += d.x * 0.9 + (cx - p.x) * 0.01;
      p.y += d.y * 0.9 + (cy - p.y) * 0.01;
      p.x = Math.min(W - 40, Math.max(40, p.x));
      p.y = Math.min(H - 40, Math.max(40, p.y));
    }
  }

  return ids.map((id) => ({ id, ...pos.get(id)! }));
}
