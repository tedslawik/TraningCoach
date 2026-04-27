# Opis funkcji

Szczegółowy opis logiki analizatora i generatora planu.

---

## Analizator treningowy

### Dane wejściowe

| Pole | Jednostka | Opis |
|------|-----------|------|
| Dystans pływania | km | Łączny dystans z 7 dni |
| Czas pływania | min | Łączny czas z 7 dni |
| Liczba sesji pływania | szt. | Ile razy byłeś na basenie |
| Dystans roweru | km | j.w. dla roweru |
| Czas roweru | min | j.w. |
| Liczba sesji roweru | szt. | |
| Dystans biegu | km | j.w. dla biegu |
| Czas biegu | min | j.w. |
| Liczba sesji biegu | szt. | |
| Data wyścigu | YYYY-MM-DD | Wyścig docelowy |
| Dystans wyścigu | enum | Sprint / Olympic / Half / Full |

### Obliczenia proporcji

Proporcje liczone są z czasu (nie dystansu), bo odzwierciedla to rzeczywisty wysiłek:

```
swimPct = swimTime / (swimTime + bikeTime + runTime) * 100
```

### Wartości docelowe proporcji

| Dystans | Pływanie | Rower | Bieg |
|---------|----------|-------|------|
| Sprint | 15% | 45% | 40% |
| Olympic | 18% | 42% | 40% |
| Half Ironman | 20% | 45% | 35% |
| Full Ironman | 18% | 50% | 32% |

### Diagnoza (alerty)

- **Warn** jeśli dyscyplina jest > 5 pp. poniżej targetu
- **Warn** jeśli rower jest > 10 pp. powyżej targetu (dominacja kosztem reszty)
- **OK** w pozostałych przypadkach

---

## Generator planu tygodniowego

Plan generowany jest na 7 dni (Poniedziałek–Niedziela) z uwzględnieniem:

### Zmienne decyzyjne

| Zmienna | Warunek | Wpływ |
|---------|---------|-------|
| `needMoreSwim` | swimPct < target − 3 | Wtorek → sesja techniczna zamiast aerobowej |
| `needMoreRun` | runPct < target − 3 | Środa → łatwy bieg objętościowy zamiast tempo |
| `needMoreBike` | bikePct < target − 5 | Sobota → długa jazda zamiast brick |
| `isTaper` | dni do wyścigu < 14 | Redukcja objętości, lekkie sesje |
| `isPeak` | dni do wyścigu > 60 | Budowanie bazy, długi niedzielny bieg |

### Stały szkielet tygodnia

```
Poniedziałek  REST
Wtorek        SWIM
Środa         RUN
Czwartek      SWIM (techniczne)
Piątek        REST
Sobota        BIKE / BRICK
Niedziela     RUN (długi)
```

---

## Kalkulator tempa

| Dyscyplina | Wzór | Jednostka |
|------------|------|-----------|
| Pływanie | `swimTime / swimDist` → min:sek | /100 m |
| Rower | `bikeDist / bikeTime * 60` | km/h |
| Bieg | `runTime / runDist` → min:sek | /km |

Tempo wyświetlane tylko gdy oba pola (dystans i czas) są > 0.
