import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { ago, hhmm } from '../lib/format';
import { matchMonitor } from '../lib/monitors';
import { downloadText, eventsToCsv, eventsToJson } from '../lib/exports';
import { pressable } from '../lib/a11y';
import { pointInCountry } from '../lib/countries';

const DAY_MS = 24 * 3600_000;
const TICK_MS = 400;
const STEP_MS = 20 * 60_000; // playback advances 20min of history per tick

/** Rolling 24h feed with playback: scrub or play through history. Scrubbed
 *  views are labeled PLAYBACK — never presented as live. */
export default function TimelineDrawer() {
  const [collapsed, setCollapsed] = useState(true);
  const events = useStore((s) => s.events);
  const monitors = useStore((s) => s.monitors);
  const select = useStore((s) => s.select);
  const timeWindow = useStore((s) => s.timeWindow);
  const setTimeCursor = useStore((s) => s.setTimeCursor);
  const setPlaying = useStore((s) => s.setPlaying);
  const selectedCountry = useStore((s) => s.selectedCountry);
  const countryTimeline = useStore((s) => s.countryTimeline);
  const setCountryTimeline = useStore((s) => s.setCountryTimeline);

  const { cursor, playing } = timeWindow;
  const countryFilter = countryTimeline && selectedCountry ? selectedCountry : null;

  // playback ticker: advance the cursor through history until it reaches now
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const tw = useStore.getState().timeWindow;
      const next = (tw.cursor ?? Date.now() - DAY_MS) + STEP_MS;
      setTimeCursor(next >= Date.now() ? null : next);
    }, TICK_MS);
    return () => clearInterval(t);
  }, [playing, setTimeCursor]);

  const timeFiltered = cursor === null ? events : events.filter((e) => e.time <= cursor);
  const windowed = countryFilter
    ? timeFiltered.filter((e) => pointInCountry(e.lon, e.lat, countryFilter))
    : timeFiltered;
  const sorted = [...windowed].sort((a, b) => b.time - a.time).slice(0, 200);

  // slider maps [now-24h, now] → [0, 100]
  // eslint-disable-next-line react-hooks/purity -- the scrubber maps a moving 24h window; its position is now-relative by design and re-derives on every cursor/event change
  const pct = cursor === null ? 100 : Math.max(0, Math.min(100, ((cursor - (Date.now() - DAY_MS)) / DAY_MS) * 100));

  return (
    <div className={`timeline ${collapsed ? 'collapsed' : ''}`}>
      <div className="timeline-head" {...pressable(() => setCollapsed((c) => !c))} aria-expanded={!collapsed}>
        <span>{collapsed ? '▲' : '▼'} EVENT TIMELINE</span>
        <span className="tl-count">{sorted.length} events</span>

        <span onClick={(e) => e.stopPropagation()} className="tl-controls">
          <button
            className="kbd"
            aria-label={playing ? 'Pause timeline playback' : 'Play timeline'}
            onClick={() => setPlaying(!playing)}
          >
            {playing ? '⏸' : '▶'}
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={pct}
            aria-label="Timeline scrubber (last 24h)"
            onChange={(e) => {
              const v = Number(e.target.value);
              setTimeCursor(v >= 100 ? null : Date.now() - DAY_MS + (v / 100) * DAY_MS);
            }}
          />
          {countryFilter && (
            <span className="tl-playback" style={{ color: 'var(--accent)' }}>
              COUNTRY · {countryFilter.properties.NAME}
              <button className="kbd" aria-label="Clear country filter" onClick={() => setCountryTimeline(false)} style={{ marginLeft: 4 }}>✕</button>
            </span>
          )}
          {cursor === null ? (
            <span className="tl-live">LIVE FEED</span>
          ) : (
            <>
              <span className="tl-playback">PLAYBACK · {hhmm(cursor)}</span>
              <button className="kbd" onClick={() => setTimeCursor(null)}>GO LIVE</button>
            </>
          )}
        </span>

        <span onClick={(e) => e.stopPropagation()} className="tl-controls" style={{ marginLeft: 'auto' }}>
          <button
            className="kbd"
            disabled={windowed.length === 0}
            aria-label="Export timeline events as CSV"
            onClick={() => downloadText(`terra-watch-events-${Date.now()}.csv`, 'text/csv', eventsToCsv(windowed))}
          >
            ⤓ CSV
          </button>
          <button
            className="kbd"
            disabled={windowed.length === 0}
            aria-label="Export timeline events as JSON"
            onClick={() => downloadText(`terra-watch-events-${Date.now()}.json`, 'application/json', eventsToJson(windowed))}
          >
            ⤓ JSON
          </button>
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', fontWeight: 400 }}>
          rolling 24h · newest first
        </span>
      </div>
      <div className="timeline-list">
        {sorted.length === 0 && <div className="inspector-empty" style={{ padding: 12 }}>No events loaded yet.</div>}
        {sorted.map((e) => {
          const match = matchMonitor(e, monitors);
          return (
            <div
              className="tl-item"
              key={e.id}
              {...pressable(() => select(e))}
              style={match ? { borderLeft: `3px solid ${match.color}`, paddingLeft: 6 } : undefined}
            >
              <span className="tl-time">{hhmm(e.time)}</span>
              <span className={`dot ${e.magnitude && e.magnitude >= 6 ? 'offline' : e.magnitude && e.magnitude >= 5 ? 'cache' : 'live'}`} />
              <span>{e.title}</span>
              <span className="tl-mag">{e.magnitude != null ? `M${e.magnitude.toFixed(1)}` : ''} <span style={{ color: 'var(--muted)' }}>{ago(e.time)}</span></span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
