export interface FomcMeeting {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  /** Summary of Economic Projections released at this meeting */
  sep: boolean;
}

export const FOMC_META = {
  id: 'fomc',
  name: 'FOMC Meeting Calendar',
  license: 'Federal Reserve — public domain (vendored static schedule)',
  homepage: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
};

interface FomcFile {
  meetings: FomcMeeting[];
}

/** Vendored own-origin static schedule (federalreserve.gov has no CORS API). */
export async function fetchFomcCalendar(): Promise<FomcMeeting[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/fomc_2026.json`);
  if (!res.ok) throw new Error(`FOMC calendar: HTTP ${res.status}`);
  const json = (await res.json()) as FomcFile;
  return json.meetings;
}

/** Meetings that haven't ended yet, soonest first, capped to `count`. */
export function upcomingMeetings(meetings: FomcMeeting[], from: Date = new Date(), count = 3): FomcMeeting[] {
  const todayStr = from.toISOString().slice(0, 10);
  return meetings.filter((m) => m.end >= todayStr).slice(0, count);
}
