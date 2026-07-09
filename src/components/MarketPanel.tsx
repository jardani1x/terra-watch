import { useStore } from '../state/store';
import { downloadText, quotesToCsv } from '../lib/exports';
import { upcomingMeetings } from '../lib/econcalendar';

function formatRange(start: string, end: string): string {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  const month = s.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  const day1 = s.getUTCDate();
  const day2 = e.getUTCDate();
  return `${month} ${day1}–${day2}, ${s.getUTCFullYear()}`;
}

/** Market snapshot panel — non-geo data, so it lives in the rail, not on the
 *  map. Mode label is derived from the real fetch result, never hardcoded. */
export default function MarketPanel() {
  const market = useStore((s) => s.market);
  const enabled = useStore((s) => s.sources['markets'] ?? true);
  const fomcMeetings = useStore((s) => s.fomcMeetings);

  const live = market.mode === 'live';
  const upcoming = fomcMeetings ? upcomingMeetings(fomcMeetings) : [];
  return (
    <section aria-label="Markets">
      <div className="rail-sec-title">
        MARKETS{' '}
        {enabled && (
          <span
            className="tag"
            style={live
              ? { color: 'var(--green, #45e0b0)', borderColor: 'rgba(69,224,176,0.5)' }
              : { color: 'var(--amber)', borderColor: 'rgba(255,180,84,0.5)' }}
          >
            {live ? 'LIVE' : 'SAMPLE'}
          </span>
        )}
      </div>
      {!enabled && <p className="inspector-empty">Source disabled in SOURCES.</p>}
      {enabled && (
        <>
          {market.quotes.map((q) => (
            <div className="monitor-row market-row" key={q.id}>
              <span className="mon-term">
                {q.label}
                <div className="lr-meta">{q.source}{q.asOf ? ` · ${q.asOf}` : ''}</div>
              </span>
              <span className="mon-count">
                {q.value}
                {q.change24h != null && (
                  <span style={{ color: q.change24h >= 0 ? '#45e0b0' : '#ff5a52', marginLeft: 6 }}>
                    {q.change24h >= 0 ? '+' : ''}{q.change24h.toFixed(1)}%
                  </span>
                )}
              </span>
            </div>
          ))}
          {market.error && <div className="lr-meta" style={{ padding: '4px 7px' }}>⚠ {market.error}</div>}
          <div className="lr-meta" style={{ padding: '4px 7px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1 }}>ECB reference rates via Frankfurter · price data by CoinGecko</span>
            <button
              className="kbd"
              disabled={market.quotes.length === 0}
              aria-label="Export market quotes as CSV"
              onClick={() => downloadText(`terra-watch-markets-${Date.now()}.csv`, 'text/csv', quotesToCsv(market.quotes))}
            >
              ⤓ CSV
            </button>
          </div>
        </>
      )}
      {upcoming.length > 0 && (
        <>
          <div className="rail-sec-title" style={{ marginTop: 10 }}>FOMC CALENDAR</div>
          {upcoming.map((m) => (
            <div className="monitor-row market-row" key={m.start}>
              <span className="mon-term">
                {formatRange(m.start, m.end)}
                {m.sep && <span className="sep-badge" style={{ marginLeft: 6 }}>SEP</span>}
              </span>
            </div>
          ))}
          <div className="lr-meta" style={{ padding: '4px 7px' }}>
            Federal Reserve — vendored static meeting schedule
          </div>
        </>
      )}
    </section>
  );
}
