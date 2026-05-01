import { WorkoutData, RaceType, RACE_LABELS } from '@tricoach/core';

interface Props {
  inputs: WorkoutData;
  onChange: (inputs: WorkoutData) => void;
  onAnalyze: () => void;
}

export default function AnalyzerInput({ inputs, onChange, onAnalyze }: Props) {
  const set = (field: keyof WorkoutData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ ...inputs, [field]: e.target.type === 'number' ? +e.target.value : e.target.value });

  return (
    <div className="card">
      <div className="card-title">Twoje treningi z ostatnich 7 dni</div>
      <div className="workout-grid">

        <div className="workout-item">
          <div className="disc-badge swim-badge">Pływanie</div>
          <div className="workout-label">Dystans</div>
          <div className="input-row">
            <input type="number" value={inputs.swimDist} onChange={set('swimDist')} min={0} step={0.1} />
            <span className="input-unit">km</span>
          </div>
          <div className="workout-label">Czas</div>
          <div className="input-row">
            <input type="number" value={inputs.swimTime} onChange={set('swimTime')} min={0} />
            <span className="input-unit">min</span>
          </div>
          <div className="workout-label">Liczba sesji</div>
          <input type="number" value={inputs.swimSessions} onChange={set('swimSessions')} min={0} max={14} className="input-compact" />
        </div>

        <div className="workout-item">
          <div className="disc-badge bike-badge">Rower</div>
          <div className="workout-label">Dystans</div>
          <div className="input-row">
            <input type="number" value={inputs.bikeDist} onChange={set('bikeDist')} min={0} />
            <span className="input-unit">km</span>
          </div>
          <div className="workout-label">Czas</div>
          <div className="input-row">
            <input type="number" value={inputs.bikeTime} onChange={set('bikeTime')} min={0} />
            <span className="input-unit">min</span>
          </div>
          <div className="workout-label">Liczba sesji</div>
          <input type="number" value={inputs.bikeSessions} onChange={set('bikeSessions')} min={0} max={14} className="input-compact" />
        </div>

        <div className="workout-item">
          <div className="disc-badge run-badge">Bieg</div>
          <div className="workout-label">Dystans</div>
          <div className="input-row">
            <input type="number" value={inputs.runDist} onChange={set('runDist')} min={0} />
            <span className="input-unit">km</span>
          </div>
          <div className="workout-label">Czas</div>
          <div className="input-row">
            <input type="number" value={inputs.runTime} onChange={set('runTime')} min={0} />
            <span className="input-unit">min</span>
          </div>
          <div className="workout-label">Liczba sesji</div>
          <input type="number" value={inputs.runSessions} onChange={set('runSessions')} min={0} max={14} className="input-compact" />
        </div>

        <div className="workout-item">
          <div className="disc-badge race-badge">Wyścig docelowy</div>
          <div className="workout-label">Data wyścigu</div>
          <input type="date" value={inputs.raceDate} onChange={set('raceDate')}  />
          <div className="workout-label">Dystans</div>
          <select value={inputs.raceType} onChange={set('raceType')} >
            {(Object.entries(RACE_LABELS) as [RaceType, string][]).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>

      </div>
      <button className="analyze-btn" onClick={onAnalyze}>Analizuj i generuj plan →</button>
    </div>
  );
}
