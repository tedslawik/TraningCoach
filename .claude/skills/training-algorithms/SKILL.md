---
name: training-algorithms
description: Domain rules and algorithms in packages/core — race targets, analyzer alert thresholds, weekly-planner decision variables, PMC/race prediction, VDOT zones, nutrition, run stream analysis. Use when changing or adding analyzer/planner/calculator logic, or when a UI number looks wrong and you need the formula.
---

# TriCoach training algorithms (`packages/core`)

All of this lives in `packages/core/src` as pure functions exported via `@tricoach/core`. Never put formulas in components; never import DOM/React into core. Verify with `npm run build`. Full Polish spec of analyzer/planner: `docs/features.md`.

## Key invariant

Discipline proportions are computed from **time**, not distance (time = training load regardless of speed differences).

## Race targets (`targets.ts`, % of total training time)

| Race | Swim | Bike | Run | Label |
|------|------|------|-----|-------|
| sprint | 15 | 45 | 40 | 0.75/20/5 |
| olympic | 18 | 42 | 40 | 1.5/40/10 |
| half | 20 | 45 | 35 | 1.9/90/21 |
| full | 18 | 50 | 32 | 3.8/180/42 |

## Analyzer (`analyzer.ts` → `analyzeWorkouts(data, target)`)

- pct = round(discTime / totalTime × 100)
- warn if discipline % < target − 5 pp
- warn if bike % > target + 10 pp (dominance)
- otherwise an `ok` alert per discipline
- paces: swim `/100m`, bike km/h, run `/km`
- `daysUntil(dateStr)` → ceil days or `null`

## Weekly planner (`planner.ts` → `generateWeekPlan`)

- `needMoreSwim` swimPct < target − 3
- `needMoreBike` bikePct < target − 5
- `needMoreRun`  runPct < target − 3
- `isTaper` days < 14
- `isPeak` days > 60 or no date
Mon is always rest; each day's description branches on these flags.

## PMC & race prediction (`pmc.ts`)

- `calculatePMC(weeklySummaries)` → weekly CTL (42-day EWA, decay e^(−7/42)), ATL (7-day EWA, decay e^(−1)), TSB = CTL − ATL.
- `predictRaceTime(raceType, swimPace/100m, bikeKmh, runPace/km)` — training pace × RACE_FACTOR (sprint 0.90, olympic 0.94, half 0.97, full 1.03) + T1 {2,3,4,5} + T2 {1,2,3,4} min.

## VDOT (`runZones.ts`, Jack Daniels)

`calcVDOT(distM, timeSec)`, `predictTime(distM, refDistM, refTimeSec)`, `calcRunZones(...)` → pace zones + race predictions; helpers `fmtPaceMmSs`, `fmtTimeHMMS`, `parseTimeInput`. Must stay self-consistent: predicting the reference distance must return the reference time.

## Other modules

- `assessment.ts` — `assessAthlete(input)` → score 0–100 + label/colour, training load from weekly suffer score (<80 low, <250 …), highlights/warnings/recommendations.
- `runAnalysis.ts` — `analyzeRunStream(stream…)`, `analyzeRunLaps(laps)` → intervals, HR drift, splits (feeds ActivityDetailModal).
- `nutrition.ts` — `generateNutritionPlan(...)` with `DEFAULT_PRODUCTS` (gel/drink config); gel interval math was audited in commit 9f00073/4f14ac9 — keep totals consistent with the interval schedule.
