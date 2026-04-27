# Changelog

Format oparty na [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Wersjonowanie: `MAJOR.MINOR.PATCH`.

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
