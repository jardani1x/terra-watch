import { useStore } from '../state/store';

/** Market snapshot panel — non-geo data, so it lives in the rail, not on the
 *  map. Mode label is derived from the real fetch result, never hardcoded. */
export default function MarketPanel() {
  const market = useStore((s) => s.market);
  const enabled = useStore((s) => s.sources['markets'] ?? true);

  const live = market.mode === 'live';
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
          <div className="lr-meta" style={{ padding: '4px 7px' }}>
            ECB reference rates via Frankfurter · price data by CoinGecko
          </div>
        </>
      )}
    </section>
  );
}
