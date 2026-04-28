# TriCoach

Aplikacja webowa dla triathlonistów amatorów — coaching triathlonowy z analizatorem treningowym i generatorem planu tygodniowego.

## Uruchomienie

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # produkcja → apps/web/dist/
```

## Struktura monorepo

```
TraningCoach/
├── apps/
│   └── web/              # React 18 + TypeScript + Vite + React Router v6
│       ├── src/
│       │   ├── components/
│       │   │   ├── analyzer/   # Analyzer, AnalyzerInput, AnalyzerAnalysis, AnalyzerPlan
│       │   │   ├── Nav.tsx
│       │   │   ├── Footer.tsx
│       │   │   ├── HeroSm.tsx
│       │   │   ├── CtaBanner.tsx
│       │   │   └── SectionLabel.tsx
│       │   ├── pages/          # HomePage, TriCoachPage, RunCoachPage, SwimCoachPage, BikeCoachPage
│       │   ├── App.tsx         # Router + ScrollHandler
│       │   ├── index.css       # Design system (CSS custom properties + dark mode)
│       │   └── main.tsx
│       └── vite.config.ts
└── packages/
    └── core/             # Czysty TypeScript — zero zależności od DOM/React
        └── src/
            ├── types.ts        # Wszystkie typy (WorkoutData, AnalysisResult, WeekPlan…)
            ├── targets.ts      # RACE_TARGETS, RACE_LABELS
            ├── analyzer.ts     # analyzeWorkouts(), daysUntil()
            ├── planner.ts      # generateWeekPlan()
            └── index.ts        # Re-eksport wszystkiego
```

## Podstrony

| Ścieżka | Strona |
|---------|--------|
| `/` | Landing page + analizator treningowy |
| `/tri-coach` | Periodyzacja, dystanse, T1/T2, brick, odżywianie |
| `/run-coach` | Strefy tętna, typy biegów, biomechanika, błędy |
| `/swim-coach` | Technika, dryle, plany dystansów, wody otwarte |
| `/bike-coach` | Strefy FTP, sweet spot, pacing, odżywianie |

## Stack

- **React 18** + **TypeScript** + **Vite** — apps/web
- **packages/core** — czyste funkcje TS współdzielone z przyszłą apką mobilną (React Native)
- **React Router v6** — client-side routing
- **npm workspaces** — monorepo bez Turborepo (dodać gdy pojawi się apps/mobile)
- **CSS custom properties** — design tokens + dark mode via `prefers-color-scheme`

## Changelog

Zobacz [CHANGELOG.md](CHANGELOG.md).
