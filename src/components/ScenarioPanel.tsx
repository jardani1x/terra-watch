import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { SCENARIOS } from '../lib/scenarios';
import { CHOKEPOINTS, NEARBY_RADIUS_KM, nearbyEvents } from '../lib/chokepoints';

/** Scenario Engine Lite — static what-if walkthroughs, labeled SIMULATION.
 *  The only live element is the transparent nearby-event count. */
export default function ScenarioPanel() {
  const events = useStore((s) => s.events);
  const flyTo = useStore((s) => s.flyTo);
  const setView = useStore((s) => s.setView);
  const [openId, setOpenId] = useState<string | null>(null);

  const open = SCENARIOS.find((s) => s.id === openId) ?? null;
  const openCps = useMemo(
    () => (open ? CHOKEPOINTS.filter((c) => open.chokepointIds.includes(c.id)) : []),
    [open],
  );
  const nearNow = useMemo(
    () => openCps.reduce((n, cp) => n + nearbyEvents(cp, events).length, 0),
    [openCps, events],
  );

  return (
    <section aria-label="Scenarios">
      <div className="rail-sec-title">
        SCENARIOS <span className="tag" style={{ color: 'var(--amber)', borderColor: 'rgba(255,180,84,0.5)' }}>SIMULATION</span>
      </div>
      <p className="inspector-empty" style={{ marginTop: 0 }}>
        Prebuilt what-if walkthroughs over static reference geography.
        Hypothetical — not a prediction or a live assessment.
      </p>
      {SCENARIOS.map((s) => (
        <div key={s.id}>
          <div
            className="monitor-row scenario-row"
            onClick={() => setOpenId(openId === s.id ? null : s.id)}
            role="button"
            aria-expanded={openId === s.id}
            aria-label={`Scenario: ${s.title}`}
          >
            <span className="mon-term">{s.title}</span>
            <span className="mon-count">{openId === s.id ? '−' : '+'}</span>
          </div>
          {openId === s.id && open && (
            <div className="scenario-detail" style={{ padding: '2px 7px 8px' }}>
              <div className="lr-meta" style={{ marginBottom: 4 }}>{s.premise}</div>
              <ul style={{ margin: '0 0 6px', paddingLeft: 16 }}>
                {s.effects.map((fx) => (
                  <li key={fx} className="lr-meta" style={{ marginBottom: 2 }}>{fx}</li>
                ))}
              </ul>
              <div
                className="lr-meta"
                role="button"
                style={{ cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => {
                  if (openCps.length === 0) return;
                  setView('map');
                  flyTo([openCps[0].lon, openCps[0].lat], 5);
                }}
              >
                Live context: {nearNow} public events within {NEARBY_RADIUS_KM} km of the
                affected chokepoint{openCps.length > 1 ? 's' : ''} · view on map
              </div>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
