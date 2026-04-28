# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the project

No build system. Open directly in a browser:

```bash
open index.html
# or serve locally to avoid CORS issues with file:// URLs:
python3 -m http.server 8080
```

## Architecture

Multi-page static site — five HTML files sharing one CSS file and one JS file.

```
index.html           # Landing page (hero + 2×2 coach card grid) + training analyzer
tri-coach.html       # Dedicated Tri Coach subpage
run-coach.html       # Dedicated Run Coach subpage
swim-coach.html      # Dedicated Swim Coach subpage
bike-coach.html      # Dedicated Bike Coach subpage
css/style.css        # All shared styles — 828 lines, no scoping
js/analyzer.js       # All business logic — 3 global functions
docs/features.md     # Algorithm spec: targets, thresholds, planner decision table
```

Nav and footer HTML are duplicated across all five pages. When editing either, update all five files.

## Design system (css/style.css)

Theming is entirely via CSS custom properties in `:root`. Dark mode is automatic — `@media (prefers-color-scheme: dark)` overrides the same variables, no class toggling needed.

Discipline colours:
- `--tri: #7c3aed` (purple)
- `--swim: #2563eb` (blue)
- `--bike: #16a34a` (green)
- `--run: #dc2626` (red)

These are used for `.section-label.tri`, `.btn-coach.tri`, `.check.tri`, `.fill-tri`, etc. — always apply the discipline suffix rather than hardcoding hex values.

## Analyzer logic (js/analyzer.js)

Three globally-scoped functions consumed via `onclick` attributes in `index.html`:

- `switchTab(name, el)` — swaps `.active` on `.tab` and `.az-section` elements
- `daysUntil(dateStr)` — returns integer or `null` if no date
- `runAnalysis()` — reads form, computes, renders, then switches to the analysis tab

**Key invariant:** proportions are computed from *time*, not distance. This is intentional — time reflects actual training load regardless of discipline speed differences.

**Alert thresholds** (from `docs/features.md`):
- warn if discipline % < target − 5 pp
- warn if bike % > target + 10 pp (dominance)

**Weekly plan decision variables:**
- `needMoreSwim` — swimPct < target − 3
- `needMoreBike` — bikePct < target − 5
- `needMoreRun` — runPct < target − 3
- `isTaper` — days < 14
- `isPeak` — days > 60 or no date set

Race-type targets (% of total training time):

| Race | Swim | Bike | Run |
|------|------|------|-----|
| sprint | 15 | 45 | 40 |
| olympic | 18 | 42 | 40 |
| half | 20 | 45 | 35 |
| full | 18 | 50 | 32 |

## Planned migration

The project is being migrated to a React + TypeScript + Vite monorepo:

```
apps/web/        # React 18 + TypeScript + Vite + React Router v6
packages/core/   # Pure TypeScript — analyzer, planner, pace calculators (no DOM)
```

`packages/core` will contain the business logic currently in `js/analyzer.js`, extracted as pure functions with typed inputs/outputs so it can be shared with a future React Native mobile app. When adding new analyzer or planner features, implement them in `packages/core` (not inline in components), and keep the functions free of any browser/React dependencies.
