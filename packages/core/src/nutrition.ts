import { RaceType } from './types';

export interface NutritionPlan {
  raceType:    RaceType;
  totalMin:    number;
  weightKg:    number;
  swimMin:     number;
  bikeMin:     number;
  runMin:      number;

  bikeCarbs_ph:  number;
  bikeFluids_ph: number;
  bikeSodium_ph: number;
  runCarbs_ph:   number;
  runFluids_ph:  number;
  runSodium_ph:  number;

  bikeCarbs:   number;
  bikeFluids:  number;
  bikeSodium:  number;
  runCarbs:    number;
  runFluids:   number;
  runSodium:   number;

  bikeGels:    number;
  bikeBottles: number;   // × 750 ml
  runGels:     number;
  runBottles:  number;   // 0 when runLiquidCarbs=false, × 500 ml when true

  bikeGelIntervalMin: number | null;  // null when no gels (drinks cover demand)
  runGelIntervalMin:  number | null;

  preRaceCarbs: number;
  preRaceMin:   number;
  keyRules:     string[];
}

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

const BIKE_BOTTLE_ML = 750;
const RUN_BOTTLE_ML  = 500;  // race-belt bottle

// Pre-race meal: grams of carbs per kg body weight + minutes before start.
// Longer races need bigger meal earlier (3h for full IM) to fully digest.
const PRE_RACE_BY_TYPE: Record<RaceType, { gPerKg: number; minBefore: number }> = {
  sprint:  { gPerKg: 1.5, minBefore: 75  },
  olympic: { gPerKg: 2.0, minBefore: 90  },
  half:    { gPerKg: 2.5, minBefore: 150 },
  full:    { gPerKg: 3.0, minBefore: 180 },
};

export interface ProductConfig {
  gelCarbs:       number;
  gelName:        string;
  drinkCarbs:     number;  // g per 500ml (scale to actual bottle size in calc)
  drinkName:      string;
  runLiquidCarbs: boolean; // carry liquid carbs on the run?
}

export const DEFAULT_PRODUCTS: ProductConfig = {
  gelCarbs:       22,
  gelName:        'Żel energetyczny',
  drinkCarbs:     36,
  drinkName:      'Napój izotoniczny',
  runLiquidCarbs: false,
};

export function generateNutritionPlan(
  raceType:  RaceType,
  totalMin:  number,
  weightKg:  number,
  splits?:   { swimMin?: number | null; bikeMin?: number | null; runMin?: number | null },
  products?: Partial<ProductConfig>,
): NutritionPlan {
  const GEL_CARBS       = products?.gelCarbs       ?? DEFAULT_PRODUCTS.gelCarbs;
  const DRINK_CARBS_500 = products?.drinkCarbs      ?? DEFAULT_PRODUCTS.drinkCarbs;
  const RUN_LIQUID      = products?.runLiquidCarbs  ?? false;

  // Scale drink carbs to actual bottle size
  const DRINK_CARBS_BIKE = DRINK_CARBS_500 * (BIKE_BOTTLE_ML / 500);
  const DRINK_CARBS_RUN  = DRINK_CARBS_500 * (RUN_BOTTLE_ML  / 500);

  const [sp, bp, rp] = SPLIT_PCT[raceType];
  const swimMin = splits?.swimMin ?? Math.round(totalMin * sp);
  const bikeMin = splits?.bikeMin ?? Math.round(totalMin * bp);
  const runMin  = splits?.runMin  ?? Math.round(totalMin * rp);

  const bikeH = bikeMin / 60;
  const runH  = runMin  / 60;

  const weightFactor  = Math.max(0.9, Math.min(1.2, weightKg / 70));
  const bikeCarbs_ph  = Math.round(BIKE_CARBS_PH[raceType] * weightFactor);
  const bikeFluids_ph = Math.round(650 * weightFactor);
  const bikeSodium_ph = 700;
  const runCarbs_ph   = Math.round(RUN_CARBS_PH[raceType]);
  const runFluids_ph  = 500;
  const runSodium_ph  = 500;

  // Bike (start eating after 20 min)
  const effectiveBikeH = Math.max(0, bikeH - 1 / 3);
  const bikeCarbs  = Math.round(effectiveBikeH * bikeCarbs_ph);
  const bikeFluids = Math.round(bikeH * bikeFluids_ph);
  const bikeSodium = Math.round(bikeH * bikeSodium_ph);

  // Run
  const runCarbs  = Math.round(runH * runCarbs_ph);
  const runFluids = Math.round(runH * runFluids_ph);
  const runSodium = Math.round(runH * runSodium_ph);

  // Bike products — 750ml bottles
  const bikeBottles       = Math.ceil(bikeFluids / BIKE_BOTTLE_ML);
  const carbsFromBikeDrink = bikeBottles * DRINK_CARBS_BIKE;
  const bikeGels           = Math.max(0, Math.round(Math.max(0, bikeCarbs - carbsFromBikeDrink) / GEL_CARBS));

  // Run products
  let runBottles = 0;
  let runGels    = 0;
  if (RUN_LIQUID) {
    runBottles = Math.ceil(runFluids / RUN_BOTTLE_ML);
    const carbsFromRunDrink = runBottles * DRINK_CARBS_RUN;
    runGels = Math.max(0, Math.round(Math.max(0, runCarbs - carbsFromRunDrink) / GEL_CARBS));
  } else {
    runGels = Math.max(0, Math.round(runCarbs / GEL_CARBS));
  }

  // Gel interval: based on ACTUAL gels needed (after subtracting drink carbs)
  // distributed over the effective eating window (no eating in first 20 min on bike).
  const effectiveBikeMin = Math.max(0, bikeMin - 20);
  const bikeGelIntervalMin = bikeGels > 0 && effectiveBikeMin > 0
    ? Math.max(8, Math.round(effectiveBikeMin / bikeGels))
    : null;
  const runGelIntervalMin = runGels > 0 && runMin > 0
    ? Math.max(8, Math.round(runMin / runGels))
    : null;

  // Rules are tailored to whether bike gels are actually needed (drinks may cover it)
  const bikeGelRule = bikeGelIntervalMin !== null
    ? `Żel co ~${bikeGelIntervalMin} min na rowerze${runGelIntervalMin !== null ? `, co ~${runGelIntervalMin} min na biegu` : ''}.`
    : runGelIntervalMin !== null
        ? `Na rowerze bidony pokrywają zapotrzebowanie węgli — żele zostaw na bieg (co ~${runGelIntervalMin} min).`
        : `Bidony i napój izotoniczny pokrywają zapotrzebowanie energetyczne — żele niepotrzebne.`;

  const halfFullRule = (raceType === 'full' || raceType === 'half')
    ? (bikeGelIntervalMin !== null
        ? `Na pierwszej połowie roweru jedz regularnie co ${bikeGelIntervalMin} min, na drugiej możesz zwiększyć tempo żelowania.`
        : `Skup się na regularnym piciu z bidonów (co 10–15 min) — to pokrywa węgle i nawodnienie jednocześnie.`)
    : `Skorzystaj z izotonika zamiast wody — mniej tabletek elektrolitowych do pamiętania.`;

  const keyRules: string[] = [
    `Zacznij jeść na rowerze po 20 minutach — nie czekaj na głód.`,
    bikeGelRule,
    `Pij co 10–15 min na rowerze (~${Math.round(bikeFluids_ph / 4)} ml na łyk), nie czekaj na pragnienie.`,
    halfFullRule,
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
    bikeGels, bikeBottles, runGels, runBottles,
    bikeGelIntervalMin, runGelIntervalMin,
    preRaceCarbs: Math.round(weightKg * PRE_RACE_BY_TYPE[raceType].gPerKg),
    preRaceMin:   PRE_RACE_BY_TYPE[raceType].minBefore,
    keyRules,
  };
}
