import { useMemo } from 'react';
import { useStore } from '../state/store';
import { computeCountryRisk } from '../lib/risk';
import { findCountryByName } from '../lib/countries';
import { pressable } from '../lib/a11y';

const MAX_ROWS = 8;

function gdp(md: number): string {
  return md >= 1_000_000 ? `$${(md / 1_000_000).toFixed(1)}T` : `$${(md / 1_000).toFixed(0)}B`;
}

/** Explainable v1 country weighting over the current public alert feed.
 *  Every score is an itemized sum of live GDACS alert levels — labeled
 *  INFERENCE, never a forecast or a "threat" claim. Structural context
 *  (population/income group/GDP, from the vendored Natural Earth dataset)
 *  is shown alongside it, but never blended into the score — mixing a live
 *  alert count with static demographic/economic figures into one number
 *  would fabricate a methodology this app doesn't have. */
export default function CountryRiskPanel() {
  const events = useStore((s) => s.events);
  const countries = useStore((s) => s.countries);
  const flyTo = useStore((s) => s.flyTo);
  const setView = useStore((s) => s.setView);

  const risks = useMemo(() => computeCountryRisk(events), [events]);

  return (
    <section aria-label="Country risk">
      <div className="rail-sec-title">
        COUNTRY RISK <span className="tag" style={{ color: 'var(--amber)', borderColor: 'rgba(255,180,84,0.5)' }}>INFERENCE</span>
      </div>
      <p className="inspector-empty" style={{ marginTop: 0 }}>
        Sum of current GDACS alert weights (Red 3 · Orange 2 · Green 1) per
        country. An itemized count, not a forecast. Population/GDP/income
        group (Natural Earth, static) are shown for context only — never
        blended into the score.
      </p>
      {risks.length === 0 && (
        <p className="inspector-empty">No country-attributed alerts in the current feed.</p>
      )}
      {risks.slice(0, MAX_ROWS).map((r) => {
        const c = countries ? findCountryByName(countries, r.country) : null;
        const cp = c?.properties;
        return (
          <div
            className="monitor-row risk-row"
            key={r.country}
            {...pressable(() => { setView('map'); flyTo([r.lon, r.lat], 4); })}
            aria-label={`Country risk ${r.country}: weight ${r.score} from ${r.components.length} alerts`}
          >
            <span className="mon-term">
              {r.country}
              <div className="lr-meta">{r.types.join(' + ')} · {r.components.length} alerts · click to view</div>
              {cp && (
                <div className="lr-meta">
                  {cp.POP_EST.toLocaleString()} pop. ({cp.POP_YEAR}) · {gdp(cp.GDP_MD)} GDP · {cp.INCOME_GRP.replace(/^\d+\.\s*/, '')}
                </div>
              )}
            </span>
            <span className="mon-count" title={r.components.join(', ')}>{r.score}</span>
          </div>
        );
      })}
      {risks.length > MAX_ROWS && (
        <div className="lr-meta" style={{ padding: '4px 7px' }}>+{risks.length - MAX_ROWS} more countries</div>
      )}
    </section>
  );
}
