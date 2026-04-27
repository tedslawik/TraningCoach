# TriCoach

Aplikacja webowa dla triathlonistów amatorów — profesjonalny landing page z analizatorem treningowym i generatorem planu tygodniowego.

## Co robi

- **Landing page** z czterema sekcjami coachingu (Tri / Run / Swim / Bike)
- **Analizator treningowy** — wpisujesz dane z ostatnich 7 dni, dostajesz diagnozę proporcji i tempa
- **Generator planu** — tygodniowy plan dopasowany do Twojego wyścigu docelowego i aktualnych braków
- Obsługa czterech dystansów: Sprint, Olympic, Half Ironman, Full Ironman

## Jak uruchomić

Otwórz `index.html` bezpośrednio w przeglądarce — brak zależności, brak buildu.

```
open index.html
```

## Struktura projektu

```
TraningCoach/
├── index.html          # landing page + analizator treningowy
├── tri-coach.html      # podstrona Tri Coach
├── run-coach.html      # podstrona Run Coach
├── swim-coach.html     # podstrona Swim Coach
├── bike-coach.html     # podstrona Bike Coach
├── css/
│   └── style.css       # wspólne style dla wszystkich stron
├── js/
│   └── analyzer.js     # logika analizatora treningowego
├── docs/
│   └── features.md     # szczegółowy opis funkcji i logiki
├── CHANGELOG.md        # historia zmian
└── README.md
```

## Sekcje landing page

| Sekcja | Opis |
|--------|------|
| **Tri Coach** | Proporcje swim/bike/run, periodyzacja, brick treningi |
| **Run Coach** | Strefy tętna, tempo wyścigowe, bieg off-bike |
| **Swim Coach** | Dryle techniczne, plan dystansów, tempo /100m |
| **Bike Coach** | FTP, sweet spot, strategia energetyczna |

## Stack

- Czysty HTML/CSS/JS — bez frameworków
- `prefers-color-scheme` — tryb jasny i ciemny automatycznie
- Responsywny układ (CSS Grid, `clamp()`)

## Changelog

Zobacz [CHANGELOG.md](CHANGELOG.md).
