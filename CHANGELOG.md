# Changelog

Format oparty na [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Wersjonowanie: `MAJOR.MINOR.PATCH`.

---

## [0.4.0] — 2026-04-28

### Zmieniono — migracja architektury
- Przepisano całą aplikację na **React 18 + TypeScript + Vite**
- Wprowadzono **npm workspaces monorepo** (`apps/web`, `packages/core`)
- Logika biznesowa (analizator, planer, kalkulatory tempa) wydzielona do `packages/core` jako czysty TypeScript bez zależności od DOM — gotowy do współdzielenia z React Native
- React Router v6 zastąpił nawigację opartą na plikach HTML
- `ScrollHandler` w `App.tsx` obsługuje płynne przewijanie do `#analyzer` z dowolnej podstrony
- Analizator przepisany jako komponenty React ze stanem (`useState`) zamiast mutacji DOM
- Usunięte: `index.html`, `tri-coach.html`, `run-coach.html`, `swim-coach.html`, `bike-coach.html`, `css/style.css`, `js/analyzer.js`
- Dodane: `CLAUDE.md` — przewodnik dla przyszłych instancji Claude Code

---

## [0.3.0] — 2026-04-27

### Dodano
- **Podstrony** — każdy coach ma dedykowaną stronę HTML z unikalną treścią
  - `tri-coach.html` — tabela dystansów, fazy periodyzacji, przejścia T1/T2, brick, odżywianie wyścigowe
  - `run-coach.html` — 5 stref tętna, typy biegów, biomechanika biegu off-bike, najczęstsze błędy
  - `swim-coach.html` — fundamenty techniki, 6 dryli technicznych, plany dystansów, wody otwarte
  - `bike-coach.html` — 7 stref FTP, typy treningów, tabela prędkości/FTP, pacing wyścigowy, odżywianie
- `css/style.css` — wspólny arkusz stylów dla wszystkich stron (eliminacja duplikacji)
- `js/analyzer.js` — logika analizatora wydzielona do osobnego pliku

### Zmieniono
- `index.html` — sekcje coachów zastąpione siatką 4 kart linkujących do podstron
- Nawigacja wyróżnia aktywną stronę klasą `.active`
- Linki CTA w nawigacji i kartach kierują do odpowiednich podstron lub `index.html#analyzer`

---

## [0.2.0] — 2026-04-27

### Dodano
- Sticky nawigacja z linkami do sekcji i przyciskiem CTA
- Sekcja Hero — nagłówek, podtytuł, dwa przyciski akcji, kolorowe oznaczenia dyscyplin
- **Tri Coach** — opis, lista 5 funkcji, wykres proporcji swim/bike/run, statystyki, CTA
- **Run Coach** — opis, strefy tętna, cel tempa, CTA
- **Swim Coach** — opis, przykładowy plan tygodniowy, cel tempo /100m, CTA
- **Bike Coach** — opis, rozkład intensywności, statystyki FTP/kadencja, CTA
- Footer z linkami do wszystkich sekcji
- Smooth scroll między sekcjami (`scroll-behavior: smooth`)

### Zmieniono
- Analizator treningowy przeniesiony do dedykowanej sekcji `#analyzer` na stronie
- Klasy CSS zakładek zmienione z `.section` na `.az-section` (uniknięcie konfliktu z `<section>` HTML)
- Tytuł strony: `TriCoach — Analizator treningu` → `TriCoach — Coaching triathlonowy`

---

## [0.1.0] — 2026-04-27 *(commit `6512855`)*

### Dodano
- Analizator treningowy — dane pływanie / rower / bieg z ostatnich 7 dni
- Diagnoza proporcji względem targetu wyścigowego (Sprint / Olympic / Half / Full Ironman)
- Kalkulator tempa: min/100m dla pływania, km/h dla roweru, min/km dla biegu
- Generator tygodniowego planu treningowego (7 dni) z adaptacją do braków i odległości wyścigu
- Wskazówki coachingowe (taper, brick, nawodnienie)
- Dark mode via `prefers-color-scheme`
- Responsywny układ (2 kolumny → 1 kolumna na mobile)
