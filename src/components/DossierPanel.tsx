import { useStore } from '../state/store';
import { dossierMarkdown, dossierJson } from '../lib/dossier';
import { downloadText } from '../lib/exports';
import { ago } from '../lib/format';
import { pressable } from '../lib/a11y';

/** Dossier / report workspace — a pin board of public events with their
 *  citations frozen at pin time. Notes are user-authored and labeled as such
 *  in every export; stored only in this browser. */
export default function DossierPanel() {
  const dossier = useStore((s) => s.dossier);
  const select = useStore((s) => s.select);
  const flyTo = useStore((s) => s.flyTo);
  const setView = useStore((s) => s.setView);
  const unpin = useStore((s) => s.unpinFromDossier);
  const setNote = useStore((s) => s.setDossierNote);
  const setTitle = useStore((s) => s.setDossierTitle);
  const clearDossier = useStore((s) => s.clearDossier);

  const exportMd = () =>
    downloadText(`terra-watch-dossier-${Date.now()}.md`, 'text/markdown', dossierMarkdown(dossier));
  const exportJson = () =>
    downloadText(`terra-watch-dossier-${Date.now()}.json`, 'application/json', dossierJson(dossier));

  return (
    <section aria-label="Dossier">
      <div className="rail-sec-title">
        DOSSIER <span className="tag">{dossier.items.length} pinned</span>
      </div>
      {dossier.items.length === 0 ? (
        <p className="inspector-empty">
          Pin events from the inspector to build a citable report. Every pinned item keeps its
          source citation; your notes are labeled user-authored in exports. Stored only in this
          browser.
        </p>
      ) : (
        <>
          <input
            className="monitor-input"
            value={dossier.title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Dossier title"
            placeholder="Dossier title…"
          />
          {dossier.items.map((it) => (
            <div key={it.id} className="dossier-item">
              <div className="monitor-row" style={{ padding: '4px 7px 2px' }}>
                <span
                  className="mon-term"
                  style={{ cursor: 'pointer' }}
                  {...pressable(() => {
                    select(it.event);
                    setView('map');
                    flyTo([it.event.lon, it.event.lat], 5);
                  })}
                  aria-label={`Pinned: ${it.event.title}`}
                >
                  {it.event.title}
                  <div className="lr-meta">{it.citation.name} · pinned {ago(it.addedAt)}</div>
                </span>
                <button className="mon-remove" onClick={() => unpin(it.id)} aria-label={`Unpin ${it.event.title}`}>✕</button>
              </div>
              <input
                className="monitor-input dossier-note"
                value={it.note}
                onChange={(e) => setNote(it.id, e.target.value)}
                placeholder="Analyst note (user-authored)…"
                aria-label={`Note for ${it.event.title}`}
              />
            </div>
          ))}
          <div className="graph-actions" style={{ marginTop: 4 }}>
            <button className="kbd" onClick={exportMd}>EXPORT MD</button>
            <button className="kbd" onClick={exportJson}>EXPORT JSON</button>
            <button className="kbd" onClick={clearDossier}>CLEAR</button>
          </div>
        </>
      )}
    </section>
  );
}
