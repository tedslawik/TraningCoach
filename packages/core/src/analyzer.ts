import { WorkoutData, TrainingTarget, AnalysisResult, Alert } from './types';

function formatPace(timeMin: number, distKm: number): string {
  const pace = timeMin / distKm;
  const m = Math.floor(pace);
  const s = Math.round((pace - m) * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function analyzeWorkouts(
  data: WorkoutData,
  target: TrainingTarget,
): AnalysisResult {
  const { swimTime, bikeTime, runTime, swimDist, bikeDist, runDist, swimSessions, bikeSessions, runSessions } = data;
  const totalTime = swimTime + bikeTime + runTime;

  const swimPct = totalTime ? Math.round((swimTime / totalTime) * 100) : 0;
  const bikePct = totalTime ? Math.round((bikeTime / totalTime) * 100) : 0;
  const runPct  = totalTime ? Math.round((runTime  / totalTime) * 100) : 0;

  const alerts: Alert[] = [];

  if (swimPct < target.swim - 5)
    alerts.push({ type: 'warn', message: `Za mało pływania — masz ${swimPct}%, cel to ${target.swim}%. Dodaj 1 sesję w basenie w kolejnym tygodniu.` });
  else
    alerts.push({ type: 'ok', message: `Pływanie na właściwym poziomie (${swimPct}%).` });

  if (bikePct < target.bike - 5)
    alerts.push({ type: 'warn', message: `Rower niedostateczny (${bikePct}%, cel ${target.bike}%). Rozważ dłuższą jazdę w weekend.` });
  else if (bikePct > target.bike + 10)
    alerts.push({ type: 'warn', message: `Dominacja roweru (${bikePct}%) — może kosztem biegu i pływania. Zbalansuj.` });
  else
    alerts.push({ type: 'ok', message: `Rower w normie (${bikePct}%).` });

  if (runPct < target.run - 5)
    alerts.push({ type: 'warn', message: `Bieg zaniedbany (${runPct}%, cel ${target.run}%). Dołóż jeden łatwy bieg 5–8 km.` });
  else
    alerts.push({ type: 'ok', message: `Bieg w dobrej proporcji (${runPct}%).` });

  return {
    swimPct,
    bikePct,
    runPct,
    totalTime,
    totalSessions: swimSessions + bikeSessions + runSessions,
    swimPace:  swimDist > 0 && swimTime > 0 ? `${formatPace(swimTime, swimDist)} /100m` : null,
    bikeSpeed: bikeDist > 0 && bikeTime > 0 ? `${(bikeDist / bikeTime * 60).toFixed(1)} km/h` : null,
    runPace:   runDist  > 0 && runTime  > 0 ? `${formatPace(runTime, runDist)} /km` : null,
    alerts,
  };
}
