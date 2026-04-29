import { RaceType } from './types';

export interface NutritionPlan {
  raceType:    RaceType;
  totalMin:    number;
  weightKg:    number;
  swimMin:     number;
  bikeMin:     number;
  runMin:      number;

  // Per-hour targets
  bikeCarbs_ph:  number;  // g carbs per hour
  bikeFluids_ph: number;  // ml per hour
  bikeSodium_ph: number;  // mg per hour
  runCarbs_ph:   number;
  runFluids_ph:  number;
  runSodium_ph:  number;

  // Total per segment
  bikeCarbs:  number;
  bikeFluids: number;
  bikeSodium: number;
  runCarbs:   number;
  runFluids:  number;
  runSodium:  number;

  // Products to carry
  bikeGels:    number;
  bikeBars:    number;
  bikeBottles: number;
  runGels:     number;

  // Pre-race
  preRaceCarbs: number;
  preRaceMin:   number;  // minutes before start to eat main meal

  // Tips
  keyRules: string[];
}

// Typical amateur split percentages (swim / bike / run)
const SPLIT_PCT: Record<RaceType, [number, number, number]> = {
  sprint:  [0.15, 0.46, 0.39],
  olympic: [0.14, 0.45, 0.41],
  half:    [0.13, 0.48, 0.39],
  full:    [0.10, 0.52, 0.38],
};

const BIKE_CARBS_PH: Record<RaceType, number> = {
  sprint: 55, olympic: 65, half: 75, full: 80,
};
const RUN_CARBS_PH: Record<RaceType, number> = {
  sprint: 30, olympic: 40, half: 50, full: 60,
};

const GEL_CARBS = 22;   // g per gel
const BAR_CARBS = 45;   // g per bar

export function generateNutritionPlan(
  raceType:  RaceType,
  totalMin:  number,
  weightKg:  number,
  splits?:   { swimMin?: number | null; bikeMin?: number | null; runMin?: number | null },
): NutritionPlan {
  const [sp, bp, rp] = SPLIT_PCT[raceType];

  const swimMin = splits?.swimMin ?? Math.round(totalMin * sp);
  const bikeMin = splits?.bikeMin ?? Math.round(totalMin * bp);
  const runMin  = splits?.runMin  ?? Math.round(totalMin * rp);

  const bikeH = bikeMin / 60;
  const runH  = runMin  / 60;

  // Per-hour targets (adjusted by weight above 70 kg baseline)
  const weightFactor = Math.max(0.9, Math.min(1.2, weightKg / 70));
  const bikeCarbs_ph  = Math.round(BIKE_CARBS_PH[raceType] * weightFactor);
  const bikeFluids_ph = Math.round(650  * weightFactor);
  const bikeSodium_ph = 700;
  const runCarbs_ph   = Math.round(RUN_CARBS_PH[raceType]);
  const runFluids_ph  = 500;
  const runSodium_ph  = 500;

  // Totals (bike starts eating at 20 min → subtract 20 min from effective eating time)
  const effectiveBikeH = Math.max(0, bikeH - 1 / 3);
  const bikeCarbs  = Math.round(effectiveBikeH * bikeCarbs_ph);
  const bikeFluids = Math.round(bikeH * bikeFluids_ph);
  const bikeSodium = Math.round(bikeH * bikeSodium_ph);
  const runCarbs   = Math.round(runH  * runCarbs_ph);
  const runFluids  = Math.round(runH  * runFluids_ph);
  const runSodium  = Math.round(runH  * runSodium_ph);

  // Bike products: bars are more practical for long segments
  const bikeBars  = raceType === 'sprint' || raceType === 'olympic'
    ? 0
    : Math.round(bikeH * 0.7);   // ~1 bar/70 min on bike
  const bikeGels  = Math.max(0, Math.round((bikeCarbs - bikeBars * BAR_CARBS) / GEL_CARBS));
  const bikeBottles = Math.ceil(bikeFluids / 500);

  // Run products: gels only (aid stations for fluids)
  const runGels = Math.max(0, Math.round(runCarbs / GEL_CARBS));

  const gelInterval = bikeCarbs_ph > 0
    ? Math.round(60 / (bikeCarbs_ph / GEL_CARBS))
    : 25;

  const keyRules: string[] = [
    `Zacznij jeść na rowerze po 20 minutach — nie czekaj na głód.`,
    `Żel co ${gelInterval} min na rowerze, co 30–35 min na biegu.`,
    `Pij co 10–15 min na rowerze (${Math.round(bikeFluids_ph / 4)} ml na łyk), nie czekaj na pragnienie.`,
    raceType === 'full' || raceType === 'half'
      ? `Na pierwszej połowie roweru jedz solid food (batony), na drugiej przejdź na żele — żołądek będzie mniej tolerancyjny.`
      : `Skorzystaj z izotonika zamiast wody — mniej tabletek elektrolitowych do pamiętania.`,
    `Przetestuj KAŻDY produkt w treningach. Zero eksperymentów w dniu wyścigu.`,
    `Kola i żele z kofeiną — zostaw na ostatnie 10–15 km biegu jako boost.`,
  ];

  return {
    raceType, totalMin, weightKg,
    swimMin, bikeMin, runMin,
    bikeCarbs_ph, bikeFluids_ph, bikeSodium_ph,
    runCarbs_ph, runFluids_ph, runSodium_ph,
    bikeCarbs, bikeFluids, bikeSodium,
    runCarbs, runFluids, runSodium,
    bikeGels, bikeBars, bikeBottles, runGels,
    preRaceCarbs: 200,
    preRaceMin:   90,
    keyRules,
  };
}
