import { useMemo } from 'react';
import { useStore } from '../state/store';
import { CHOKEPOINTS, NEARBY_RADIUS_KM, nearbyEvents } from '../lib/chokepoints';

/** Route Explorer Lite — static chokepoint reference + a transparent count of
 *  current public events near each. Labeled ADVISORY; not a routing service
 *  and not a disruption prediction. */
export default function RouteExplorerPanel() {
  const events = useStore((s) => s.events);
  const flyTo = useStore((s) => s.flyTo);
  const setView = useStore((s) => s.setView);

  const rows = useMemo(
    () => CHOKEPOINTS.map((cp) => ({ cp, near: nearbyEvents(cp, events).length }))
      .sort((a, b) => b.near - a.near),
    [events],
  );

  return (
    <section aria-label="Route explorer">
      <div className="rail-sec-title">
        ROUTE EXPLORER <span className="tag" style={{ color: 'var(--amber)', borderColor: 'rgba(255,180,84,0.5)' }}>ADVISORY</span>
      </div>
      <p className="inspector-empty" style={{ marginTop: 0 }}>
        Maritime chokepoints (static reference) with a count of current public
        events within {NEARBY_RADIUS_KM} km. Not a routing service.
      </p>
      {rows.map(({ cp, near }) => (
        <div
          className="monitor-row route-row"
          key={cp.id}
          onClick={() => { setView('map'); flyTo([cp.lon, cp.lat], 5); }}
          role="button"
          aria-label={`Chokepoint ${cp.name}: ${near} events within ${NEARBY_RADIUS_KM} km`}
        >
          <span className="mon-term">
            {cp.name}
            <div className="lr-meta">{cp.region} · alt: {cp.alternate}</div>
          </span>
          <span className="mon-count">{near > 0 ? `${near} nearby` : 'clear feed'}</span>
        </div>
      ))}
    </section>
  );
}
