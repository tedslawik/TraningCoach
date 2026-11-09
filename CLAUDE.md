# CLAUDE.md

TriCoach — triathlon training app (UI in Polish). npm-workspaces monorepo, deployed on Vercel.
Stack: React 18 + TS + Vite + React Router v6 · Supabase (auth + Postgres) · Strava API v3 · Anthropic SDK.

## Commands

```bash
npm run dev      # Vite dev server (apps/web) → http://localhost:5173  (api/* NOT served; use `vercel dev` for that)
npm run build    # tsc --noEmit on packages/core, then tsc -b + vite build on apps/web — run this to verify changes
npm run lint --workspace=apps/web
```

No test suite. "Verified" = `npm run build` passes.

## Map

```
api/                         Vercel serverless functions (Node, each file = one endpoint, self-contained)
  auth/strava.ts             GET  start Strava OAuth (?token=<supabase jwt>, userId in state)
  auth/callback.ts           GET  OAuth code → tokens → upsert strava_tokens
  strava/activities.ts       GET  last 7 days: {summary, activities}            ← Analyzer
  strava/athlete.ts          GET  ?weekStart  profile+zones+week, HR streams      ← AthletePage
  strava/discipline.ts       GET  ?sport=run|swim|bike&weekStart&daysBack         ← *CoachPage, TrainingInsights, Vdot
  strava/stream.ts           GET  ?activityId  streams+laps+zones+detail           ← ActivityDetailModal
  strava/prs.ts              GET  best efforts from ~400 activities                ← RacePredictor
  strava/profile.ts          GET  athlete (weight etc.)                            ← NutritionCalculator
  strava/sync.ts             POST user sync / GET daily cron (CRON_SECRET) → weekly_summaries
  training/run-zones.ts      GET/POST running_zones + run_insights                 ← Vdot, TrainingInsights
  ai/analyze-workout.ts      POST Claude analysis of one workout                   ← ActivityDetailModal, TrainingInsights
  ai/generate-plan.ts        GET latest / POST generate (?sport=…|atp) → training_plans ← PlannerPage, ATP, TrainingPlanSection
apps/web/src/
  App.tsx                    routes (see below), AuthProvider > PreferencesProvider
  context/AuthContext.tsx    session, stravaToken, signIn/Up/Out, refreshStravaToken
  context/PreferencesContext.tsx  FEATURES list + per-user feature toggles (usePreferences)
  lib/supabase.ts            browser Supabase client (anon key)
  index.css                  ALL styles + design tokens (single file)
  components/                Nav, Footer, HeroSm, CtaBanner, SectionLabel (shared chrome)
    analyzer/                Analyzer (tabs) → AnalyzerInput/Analysis/Plan, ActivitiesPreview
    athlete/                 ActivityDetailModal, RacePredictor, RunSummaryNote, TrainingInsights
    charts/                  ActivityCharts (983 lines, SVG), PMCChart, TrendsChart
    training/                ATPSection, TrainingPlanSection, VdotCalculator
    tri/NutritionCalculator  shared/WeekCalendar  auth/AuthModal, StravaConnectPrompt
  pages/                     one file per route
packages/core/src/           pure TS, no DOM/React — re-exported from index.ts as @tricoach/core
  types.ts targets.ts        RaceType, WorkoutData, RACE_TARGETS
  analyzer.ts planner.ts     analyzeWorkouts, daysUntil, generateWeekPlan
  assessment.ts              assessAthlete
  pmc.ts                     calculatePMC (CTL/ATL/TSB), predictRaceTime, formatMinutes
  runAnalysis.ts             analyzeRunStream, analyzeRunLaps
  runZones.ts                Daniels VDOT: calcVDOT, predictTime, calcRunZones, fmt/parse helpers
  nutrition.ts               generateNutritionPlan, DEFAULT_PRODUCTS
docs/features.md             analyzer/planner algorithm spec (Polish)
```

Routes: `/` Home · `/tri-coach` `/run-coach` `/swim-coach` `/bike-coach` · `/athlete` · `/dashboard` (PMC, Trends, TrainingInsights) · `/plan` (ATP) · `/calculators?tab=analyzer|nutrition|predictor|vdot` · `/settings`. `/analyzer` and `/run-zones` redirect into `/calculators`.

## Conventions

- **Business logic goes in `packages/core`** as pure typed functions (shared with a future React Native app). Components only fetch + render.
- **Frontend → API:** `fetch('/api/…', { headers: { Authorization: \`Bearer ${session.access_token}\` } })`. API verifies with `supabase.auth.getUser(jwt)` using the service-role client.
- **API files are self-contained:** each creates its own Supabase client and has its own copy of the Strava token-refresh helper (no shared module yet). For Strava/Supabase/AI endpoint work, use the `strava-api` skill.
- **Proportions are computed from time, not distance** (training load). Algorithm details: `training-algorithms` skill.
- **Styling:** tokens in `:root` of `index.css`; dark mode via `@media (prefers-color-scheme: dark)` only. Discipline colours `--swim #2563eb`, `--bike #16a34a`, `--run #dc2626`, `--tri #7c3aed` — use the discipline class suffix (`.tri`, `.fill-run`…), never hardcode hex. Many components also use inline styles referencing `var(--…)`.
- UI copy is Polish.

## Env vars

Client (build-time): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_STRAVA_CLIENT_ID`.
Server: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `APP_URL`, `ANTHROPIC_API_KEY`, `CRON_SECRET`.
