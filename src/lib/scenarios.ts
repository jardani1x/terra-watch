/** Scenario Engine Lite — prebuilt what-if walkthroughs. Each scenario is
 *  static reference material (with historical analogues where they exist),
 *  labeled SIMULATION in the UI. The only live element is a transparent count
 *  of current public events near the affected chokepoints. Never a
 *  prediction, forecast, or assessment of intent. */
export interface Scenario {
  id: string;
  title: string;
  /** the hypothetical, stated as such */
  premise: string;
  /** static reference effects, with historical analogue citations */
  effects: string[];
  /** ids from CHOKEPOINTS affected by the scenario */
  chokepointIds: string[];
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'suez-blocked',
    title: 'Suez Canal blocked',
    premise: 'What if the Suez Canal were impassable for days–weeks?',
    effects: [
      'Europe–Asia traffic reroutes via Cape of Good Hope: ≈ +9,600 km, +10–14 days',
      'Historical analogue: Ever Given grounding, Mar 2021 (6-day closure, ~370 ships queued)',
      'Red Sea and Mediterranean feeder ports see queueing and schedule slip',
    ],
    chokepointIds: ['suez', 'bab-el-mandeb'],
  },
  {
    id: 'hormuz-disruption',
    title: 'Strait of Hormuz disruption',
    premise: 'What if tanker transit through Hormuz were curtailed?',
    effects: [
      'Roughly a fifth of global seaborne oil transits Hormuz (EIA reference)',
      'No maritime alternate; overland pipelines carry only a fraction of volume',
      'Tanker freight rates and insurance premiums historically spike on disruption news',
    ],
    chokepointIds: ['hormuz'],
  },
  {
    id: 'panama-drought',
    title: 'Panama Canal drought restrictions',
    premise: 'What if low water again forced draft and transit limits?',
    effects: [
      'Historical analogue: 2023–24 drought (daily transits cut ~36%, weeks-long queues)',
      'Deep-draft traffic lightens loads or reroutes via Suez / Cape Horn',
      'US East–Asia services shift toward US West Coast + rail land-bridge',
    ],
    chokepointIds: ['panama'],
  },
  {
    id: 'malacca-congestion',
    title: 'Strait of Malacca congestion',
    premise: 'What if Malacca throughput were sharply reduced?',
    effects: [
      'Reroute via Sunda or Lombok straits: ≈ +1–3 days for most services',
      'Malacca carries an estimated quarter of global traded goods (reference)',
      'Singapore bunkering and transshipment schedules compress downstream',
    ],
    chokepointIds: ['malacca'],
  },
  {
    id: 'bosphorus-closure',
    title: 'Bosphorus closure',
    premise: 'What if Bosphorus transit were suspended?',
    effects: [
      'No maritime alternate — the strait is the sole Black Sea access',
      'Black Sea grain and tanker exports pause; rail/river alternates are partial',
      'Historical analogue: Montreux-regime transit constraints, 2022 onward',
    ],
    chokepointIds: ['bosphorus'],
  },
];
