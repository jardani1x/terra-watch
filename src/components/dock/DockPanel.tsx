import type { ReactNode } from 'react';
import type { DataMode } from '../../lib/providers/types';

export default function DockPanel({ title, mode, source, children }: {
  title: string; mode?: DataMode; source?: string; children: ReactNode;
}) {
  return (
    <section className="dock-panel" aria-label={title}>
      <header className="dock-panel-head">
        <span className="dock-panel-title">{title}</span>
        {mode === 'mock' && <span className="demo-badge">DEMO</span>}
        {mode === 'live' && <span className="live-badge">LIVE</span>}
        {source && <span className="dock-source" title={source}>{source}</span>}
      </header>
      <div className="dock-panel-body">{children}</div>
    </section>
  );
}
