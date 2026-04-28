import { AnalysisResult, TrainingTarget, WeekPlan, DayPlan } from './types';

interface PlanInput {
  analysis: AnalysisResult;
  target: TrainingTarget;
  daysUntilRace: number | null;
}

export function generateWeekPlan({ analysis, target, daysUntilRace }: PlanInput): WeekPlan {
  const { swimPct, bikePct, runPct } = analysis;

  const needMoreSwim = swimPct < target.swim - 3;
  const needMoreBike = bikePct < target.bike - 5;
  const needMoreRun  = runPct  < target.run  - 3;
  const isTaper = daysUntilRace !== null && daysUntilRace < 14;
  const isPeak  = daysUntilRace === null  || daysUntilRace > 60;

  const days: DayPlan[] = [
    {
      name: 'Poniedziałek',
      type: 'rest',
      description: 'Odpoczynek lub lekka regeneracja — spacer, rozciąganie, rolowanie.',
    },
    {
      name: 'Wtorek',
      type: 'swim',
      description: needMoreSwim
        ? 'Pływanie skupione na technice: 2.5 km z foką, praca nad high elbow catch. Kluczowy priorytet tygodnia.'
        : 'Pływanie aerobowe 2.0 km — stałe tempo, interwały 4×400m.',
    },
    {
      name: 'Środa',
      type: 'run',
      description: needMoreRun
        ? 'Bieg łatwy 7–9 km w strefie 2 tętna. Celem jest objętość, nie prędkość.'
        : isTaper
          ? 'Bieg 4–5 km bardzo lekki — utrzymanie czucia nóg.'
          : 'Bieg tempo 6 km: 2 km rozgrzewki + 3 km w tempie wyścigowym + 1 km spokojnie.',
    },
    {
      name: 'Czwartek',
      type: 'swim',
      description: 'Pływanie techniczne — oddech i rotacja bioder. 1.5–2 km. Można użyć foki do dryli.',
    },
    {
      name: 'Piątek',
      type: 'rest',
      description: 'Odpoczynek aktywny lub joga. Przygotowanie na intensywny weekend.',
    },
    {
      name: 'Sobota',
      type: needMoreBike ? 'bike' : 'brick',
      description: needMoreBike
        ? 'Długa jazda rowerem 80–100 km w strefie 2–3. Ćwicz odżywianie i nawodnienie na trasie.'
        : 'Brick: rower 60 km + bieg 5 km od razu po zjeździe. Trenuj przejście T2 i uczucie cegły w nogach.',
    },
    {
      name: 'Niedziela',
      type: 'run',
      description: isPeak
        ? 'Długi bieg 14–16 km bardzo spokojnie. Budowanie bazy tlenowej na finiszowy bieg wyścigu.'
        : isTaper
          ? 'Bieg 8 km spokojnie — ostatnia dłuższa sesja przed wyścigiem.'
          : 'Bieg 10–12 km w spokojnym tempie. Uzupełnij elektrolity po treningu.',
    },
  ];

  const tips: string[] = [];
  if (needMoreSwim)
    tips.push('Pływanie to Twój priorytet — masz za mały udział względem celu wyścigowego. Nie odwołuj sesji w basenie.');
  if (isTaper)
    tips.push('Jesteś blisko wyścigu — redukuj objętość, nie intensywność. Śpij dużo, jedz dobrze, zero eksperymentów z jedzeniem.');
  if (!isTaper && !isPeak)
    tips.push('Jesteś w środkowym bloku budowania. Regularność bije heroizm — 6 tygodni solidnych jest lepsze niż 2 tygodnie ciężkie i 1 kontuzja.');
  tips.push('Brick (rower + bieg pod rząd) to kluczowy trening Half Ironmana — rób go przynajmniej raz na 2 tygodnie.');
  tips.push('Hydratacja: minimum 500 ml/h na rowerze. Zacznij pić 15 minut przed pierwszym pragnieniem — jeśli czujesz pragnienie, już jest za późno.');

  return { days, tips };
}
