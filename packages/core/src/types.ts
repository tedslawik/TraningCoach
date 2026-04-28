export type RaceType = 'sprint' | 'olympic' | 'half' | 'full';
export type DisciplineType = 'swim' | 'bike' | 'run' | 'brick' | 'rest';
export type AlertType = 'warn' | 'ok';

export interface WorkoutData {
  swimDist: number;    // km
  swimTime: number;    // min
  swimSessions: number;
  bikeDist: number;
  bikeTime: number;
  bikeSessions: number;
  runDist: number;
  runTime: number;
  runSessions: number;
  raceDate: string;    // YYYY-MM-DD
  raceType: RaceType;
}

export interface TrainingTarget {
  swim: number;  // % of total training time
  bike: number;
  run: number;
}

export interface Alert {
  type: AlertType;
  message: string;
}

export interface AnalysisResult {
  swimPct: number;
  bikePct: number;
  runPct: number;
  totalTime: number;
  totalSessions: number;
  swimPace: string | null;   // "1:55 /100m"
  bikeSpeed: string | null;  // "32.5 km/h"
  runPace: string | null;    // "5:20 /km"
  alerts: Alert[];
}

export interface DayPlan {
  name: string;
  type: DisciplineType;
  description: string;
}

export interface WeekPlan {
  days: DayPlan[];
  tips: string[];
}
