import { AnalysisResult, TrainingTarget } from './types';

export interface ActivityForAssessment {
  type: 'swim' | 'bike' | 'run' | 'other';
  timeMin: number;
  sufferScore: number | null;
  avgHeartRate: number | null;
}

export interface AssessmentInput {
  analysis: AnalysisResult;
  target: TrainingTarget;
  daysUntilRace: number | null;
  activities: ActivityForAssessment[];
  totalSufferScore: number;
}

export interface TrainingLoadInfo {
  level: 'low' | 'moderate' | 'high' | 'very_high';
  label: string;
  color: string;
  score: number;
  message: string;
}

export interface Assessment {
  score: number;
  scoreLabel: string;
  scoreColor: string;
  trainingLoad: TrainingLoadInfo;
  highlights: string[];
  warnings: string[];
  recommendations: string[];
}

function loadInfo(sufferScore: number): TrainingLoadInfo {
  if (sufferScore < 80)
    return { level: 'low', label: 'Niskie', color: '#60a5fa', score: sufferScore,
      message: 'Tydzień regeneracyjny lub niedostateczna aktywność.' };
  if (sufferScore < 250)
    return { level: 'moderate', label: 'Umiarkowane', color: '#34d399', score: sufferScore,
      message: 'Solidny tydzień treningowy — dobry bodziec adaptacyjny.' };
  if (sufferScore < 500)
    return { level: 'high', label: 'Wysokie', color: '#fb923c', score: sufferScore,
      message: 'Duże obciążenie — zadbaj o sen i regenerację.' };
  return { level: 'very_high', label: 'Bardzo wysokie', color: '#f87171', score: sufferScore,
    message: 'Ekstremalne obciążenie. Upewnij się, że to zamierzony szczyt formy.' };
}

export function assessAthlete(input: AssessmentInput): Assessment {
  const { analysis, target, daysUntilRace, activities, totalSufferScore } = input;
  const { swimPct, bikePct, runPct, totalSessions } = analysis;

  const swimOk = Math.abs(swimPct - target.swim) <= 5;
  const bikeOk = Math.abs(bikePct - target.bike) <= 8;
  const runOk  = Math.abs(runPct  - target.run)  <= 5;
  const balanceScore = [swimOk, bikeOk, runOk].filter(Boolean).length; // 0-3

  const hasSwim = activities.some(a => a.type === 'swim');
  const hasBike = activities.some(a => a.type === 'bike');
  const hasRun  = activities.some(a => a.type === 'run');
  const varietyScore = [hasSwim, hasBike, hasRun].filter(Boolean).length; // 0-3

  const sessionScore = totalSessions >= 8 ? 2 : totalSessions >= 5 ? 1 : 0;
  const loadScore    = totalSufferScore >= 80 && totalSufferScore < 600 ? 2
                     : totalSufferScore >= 600 && totalSufferScore < 900 ? 1 : 0;
  const isTaper      = daysUntilRace !== null && daysUntilRace < 14;

  const rawScore = balanceScore + varietyScore + sessionScore + loadScore; // max 10
  const score    = Math.min(10, rawScore);

  const scoreLabel =
    score >= 9 ? 'Szczytowa forma' :
    score >= 7 ? 'Świetna forma'   :
    score >= 5 ? 'Dobra forma'     :
    score >= 3 ? 'Przeciętna forma':
                 'Wymaga poprawy';

  const scoreColor =
    score >= 8 ? '#7c3aed' :
    score >= 6 ? '#16a34a' :
    score >= 4 ? '#d97706' :
                 '#dc2626';

  const highlights: string[] = [];
  const warnings:   string[] = [];
  const recommendations: string[] = [];

  // Balance
  if (swimOk)  highlights.push(`Pływanie w idealnej proporcji (${swimPct}%, cel ${target.swim}%)`);
  else         warnings.push(`Pływanie poza celem — masz ${swimPct}%, powinno być ${target.swim}%`);
  if (bikeOk)  highlights.push(`Rower dobrze zbilansowany (${bikePct}%)`);
  else         warnings.push(`Rower wymaga korekty — ${bikePct}% vs cel ${target.bike}%`);
  if (runOk)   highlights.push(`Bieg na właściwym poziomie (${runPct}%)`);
  else         warnings.push(`Bieg poza celem — ${runPct}% vs cel ${target.run}%`);

  // Variety
  if (!hasSwim) warnings.push('Brak sesji pływackich w tym tygodniu');
  if (!hasBike) warnings.push('Brak jazdy rowerem w tym tygodniu');
  if (!hasRun)  warnings.push('Brak biegu w tym tygodniu');

  // Load
  if (totalSufferScore < 80)
    warnings.push('Suffer Score bardzo niski — tydzień poniżej progu adaptacyjnego');
  else if (totalSufferScore > 700)
    warnings.push('Ekstremalnie wysokie obciążenie — ryzyko przetrenowania');
  else
    highlights.push(`Suffer Score ${totalSufferScore} — obciążenie w bezpiecznej strefie`);

  // Frequency
  if (totalSessions < 4)
    warnings.push(`Tylko ${totalSessions} sesje — zbyt mało bodźców treningowych`);
  else if (totalSessions >= 8)
    highlights.push(`${totalSessions} sesji w tygodniu — wysoka regularność`);

  // Taper
  if (isTaper)
    highlights.push(`Jesteś ${daysUntilRace} dni przed wyścigiem — redukcja objętości jest prawidłowa`);

  // Recommendations
  if (!swimOk && swimPct < target.swim)
    recommendations.push('Dodaj 1–2 sesje pływackie — basen w środę i w sobotę rano');
  if (!runOk && runPct < target.run)
    recommendations.push('Dołóż łatwy bieg 7–9 km w strefie 2 tętna');
  if (totalSufferScore < 80)
    recommendations.push('Zwiększ intensywność lub objętość — tydzień był za łatwy');
  if (!isTaper && totalSessions < 5)
    recommendations.push('Cel to 5–10 sesji tygodniowo — uzupełnij plan o brakujące jednostki');
  recommendations.push('Brick (rower + bieg) raz na 2 tygodnie to kluczowy trening triatlonisty');

  return {
    score, scoreLabel, scoreColor,
    trainingLoad: loadInfo(totalSufferScore),
    highlights, warnings, recommendations,
  };
}
