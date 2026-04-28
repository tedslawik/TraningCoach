export interface WeeklySummary {
  weekStart:    string;  // YYYY-MM-DD
  tss:          number;
  swimDistKm:   number;
  bikeDistKm:   number;
  runDistKm:    number;
  swimTimeMin:  number;
  bikeTimeMin:  number;
  runTimeMin:   number;
  sufferScore:  number;
  kilojoules:   number;
}

export interface PMCPoint {
  weekStart: string;
  tss:  number;
  ctl:  number;  // Chronic Training Load (42-day EWA)
  atl:  number;  // Acute Training Load  ( 7-day EWA)
  tsb:  number;  // Training Stress Balance = CTL − ATL
}

// Weekly decay constants
const CTL_DECAY = Math.exp(-7 / 42);  // ≈ 0.846
const ATL_DECAY = Math.exp(-7 /  7);  // ≈ 0.368

export function calculatePMC(summaries: WeeklySummary[]): PMCPoint[] {
  const sorted = [...summaries].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  let ctl = 0;
  let atl = 0;
  return sorted.map(s => {
    ctl = ctl * CTL_DECAY + s.tss * (1 - CTL_DECAY);
    atl = atl * ATL_DECAY + s.tss * (1 - ATL_DECAY);
    return {
      weekStart: s.weekStart,
      tss:  Math.round(s.tss),
      ctl:  Math.round(ctl),
      atl:  Math.round(atl),
      tsb:  Math.round(ctl - atl),
    };
  });
}

import { RaceType } from './types';

export interface RacePrediction {
  swimMin:  number | null;
  t1Min:    number;
  bikeMin:  number | null;
  t2Min:    number;
  runMin:   number | null;
  totalMin: number | null;
}

const RACE_DISTS: Record<RaceType, { swim: number; bike: number; run: number }> = {
  sprint:  { swim: 0.75, bike: 20,  run: 5    },
  olympic: { swim: 1.5,  bike: 40,  run: 10   },
  half:    { swim: 1.9,  bike: 90,  run: 21.1 },
  full:    { swim: 3.8,  bike: 180, run: 42.2 },
};

// Intensity factor vs training pace (race is harder than avg training)
const RACE_FACTOR: Record<RaceType, number> = {
  sprint:  0.90,
  olympic: 0.94,
  half:    0.97,
  full:    1.03,  // IM run is slower than training pace
};

const T1: Record<RaceType, number> = { sprint: 2, olympic: 3, half: 4, full: 5 };
const T2: Record<RaceType, number> = { sprint: 1, olympic: 2, half: 3, full: 4 };

export function predictRaceTime(
  raceType: RaceType,
  avgSwimPacePer100m: number | null,  // min per 100m
  avgBikeSpeedKmh:    number | null,  // km/h
  avgRunPacePerKm:    number | null,  // min per km
): RacePrediction {
  const dist = RACE_DISTS[raceType];
  const f    = RACE_FACTOR[raceType];

  const swimMin  = avgSwimPacePer100m != null
    ? (dist.swim * 1000 / 100) * avgSwimPacePer100m * f
    : null;
  const bikeMin  = avgBikeSpeedKmh != null && avgBikeSpeedKmh > 0
    ? (dist.bike / (avgBikeSpeedKmh * f)) * 60
    : null;
  const runMin   = avgRunPacePerKm != null
    ? dist.run * avgRunPacePerKm * f
    : null;

  const totalMin = swimMin != null && bikeMin != null && runMin != null
    ? swimMin + T1[raceType] + bikeMin + T2[raceType] + runMin
    : null;

  return { swimMin, t1Min: T1[raceType], bikeMin, t2Min: T2[raceType], runMin, totalMin };
}

export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}
