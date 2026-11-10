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

## Season / ATP (`season.ts`)

`buildSeasonSkeleton(races, today)` computes the whole-season phase structure deterministically; the AI (`api/ai/generate-plan.ts`, `sport: 'atp'`) only fills `focus`, `targetWeeklyTSS`, `intensity`, `keyWorkouts` per phase index — it never sets dates.
- Plan starts the first Monday on/after today; weeks Mon–Sun, UTC math.
- Per A race, backwards from its week: taper (`taperWeeks` from `EVENT_DISTANCES`, 1–3) ← build (≤ 8 wks, split in 2 if ≥ 6) ← base in ~4-week blocks ← up to 6 wks "Przygotowanie ogólne" (first segment only, when base > 12). After it: `recoveryWeeks` of recovery.
- B/C races don't change phases (B = mini-taper, C = train through — handled in the AI prompt).
- Tail: B/C races after the last A → "Utrzymanie formy", then 2-week "Roztrenowanie"; if the season ends on an A race its recovery becomes the transition.
- `validateSeasonRaces` → Polish error or null: ≥ 1 A race, ≤ 20 races, dates from plan start up to 2 years; A races must match the plan discipline, B/C races may be any discipline (prompt tells the AI how to fit off-discipline races, e.g. marathon recovery).
The client (`ATPSection`) builds the skeleton (live preview) and POSTs `{ discipline, races, phases }`; the API validates shape and merges AI content by index.

### Weekly plan ← ATP
`api/ai/generate-plan.ts` (`loadAtpContext`, server-side): for the 2-week plan starting `nextMonday()`, reads the latest ATP (`training_plans`, `sport_type='atp'`) when its `discipline` equals the weekly plan's sport, and finds per week the covering phase (name, type, week N/M, focus, phase-average `targetWeeklyTSS`, intensity, key workouts), races in that week and the next A race. `atpPromptBlock` turns it into rules that override the generic ones: weekly TSS ≈ phase average ±10%, last week of a ≥3-week base/build block = deload (−30–40%), intensity by phase, races placed on their day (A taper week, B mini-taper, C replaces the key session). Context is returned by GET/POST (`atpContext`) and stored in `plan_json.atpContext`. Returns null (plan built from training data only) when there is no ATP, it is for another discipline, or doesn't cover these weeks.

### Triathlon weekly plan — time split
`triSplitBlock` in `generate-plan.ts`: target share of TIME per discipline for the next A race's distance from ATP (`TRI_TARGETS`, same numbers as `RACE_TARGETS`; default `half` without ATP), compared with the last 4 weeks of `weekly_summaries` (`*_time_min`). Gaps ≥ 5 pp are closed gradually (~5 pp per week). Bike minimum: 3 sessions/week for half/full (2 for sprint/olympic or < 5 training days), long Z2 ride at the weekend; brick counts as bike. Triathlete level = average weekly hours (< 5 h beginner, < 9 h intermediate). Note: `weekly_summaries` are fetched newest-first — take `slice(0, n)` for recent weeks.
Sessions carry `minutes`; `summarizeWeek` / `parseDurationMin` (`weekSummary.ts`) build the planner's weekly hours column, falling back to the `duration` text for older plans.

## Other modules

- `assessment.ts` — `assessAthlete(input)` → score 0–100 + label/colour, training load from weekly suffer score (<80 low, <250 …), highlights/warnings/recommendations.
- `runAnalysis.ts` — `analyzeRunStream(stream…)`, `analyzeRunLaps(laps)` → intervals, HR drift, splits (feeds ActivityDetailModal).
- `nutrition.ts` — `generateNutritionPlan(...)` with `DEFAULT_PRODUCTS` (gel/drink config); gel interval math was audited in commit 9f00073/4f14ac9 — keep totals consistent with the interval schedule.
