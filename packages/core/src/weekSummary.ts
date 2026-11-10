/**
 * Time summary of a generated training week (planner).
 * Sessions carry `minutes` (new plans) or a free-text `duration` like "50min", "1h30min", "1:15h" (older plans).
 */

export type PlanSport = 'swim' | 'bike' | 'run' | 'brick' | 'other';

export interface PlanSessionLike {
  type?: string;
  minutes?: number;
  duration?: string;
}

export interface WeekTimeSummary {
  totalMin: number;
  bySport: Record<PlanSport, number>;
  sessions: number;
}

/** Minutes from a free-text duration; 0 when it can't be read ("—", ""). */
export function parseDurationMin(text: string | undefined): number {
  if (!text) return 0;
  const s = text.toLowerCase().replace(',', '.').replace(/\s+/g, '');
  const hm = s.match(/^(\d+):(\d{1,2})(h)?$/);                  // 1:30 / 1:30h
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  let min = 0, matched = false;
  const h = s.match(/(\d+(?:\.\d+)?)(?:h|godz)(\d{1,2})?/);       // "2h", "1.5h", "3h15", "1h30min"
  if (h) { min += Number(h[1]) * 60 + (h[2] ? Number(h[2]) : 0); matched = true; }
  const rest = h ? s.slice((h.index ?? 0) + h[0].length) : s;
  const m = h?.[2] ? null : rest.match(/(\d+)(?:min|m(?!a)|')/);
  if (m) { min += Number(m[1]); matched = true; }
  if (!matched) { const n = s.match(/^(\d+)$/); if (n) min = Number(n[1]); }
  return Math.round(min);
}

export function sessionMinutes(s: PlanSessionLike): number {
  if (typeof s.minutes === 'number' && Number.isFinite(s.minutes) && s.minutes > 0) return Math.round(s.minutes);
  return parseDurationMin(s.duration);
}

/** Sums planned minutes per sport for one week (rest days count as 0). */
export function summarizeWeek(days: Array<{ sessions?: PlanSessionLike[] } & PlanSessionLike>): WeekTimeSummary {
  const bySport: Record<PlanSport, number> = { swim: 0, bike: 0, run: 0, brick: 0, other: 0 };
  let sessions = 0;
  for (const d of days) {
    const list = d.sessions ?? [d];                              // legacy flat day format
    for (const s of list) {
      if (!s.type || s.type === 'rest') continue;
      const min = sessionMinutes(s);
      const key: PlanSport = s.type === 'swim' || s.type === 'bike' || s.type === 'run' || s.type === 'brick' ? s.type : 'other';
      bySport[key] += min;
      sessions++;
    }
  }
  const totalMin = Object.values(bySport).reduce((a, b) => a + b, 0);
  return { totalMin, bySport, sessions };
}

/** "9h 30min", "45min". */
export function formatHoursMin(min: number): string {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  if (!h) return `${m}min`;
  return m ? `${h}h ${m}min` : `${h}h`;
}
