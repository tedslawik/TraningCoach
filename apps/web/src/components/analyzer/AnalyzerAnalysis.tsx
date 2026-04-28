import { AnalysisResult, TrainingTarget } from '@tricoach/core';

interface Props {
  results: AnalysisResult;
  target: TrainingTarget;
  daysUntilRace: number | null;
}

const disciplines = ['swim', 'bike', 'run'] as const;
const discLabels = { swim: 'Pływanie', bike: 'Rower', run: 'Bieg' };

export default function AnalyzerAnalysis({ results, target, daysUntilRace }: Props) {
  const { swimPct, bikePct, runPct, totalTime, totalSessions, swimPace, bikeSpeed, runPace, alerts } = results;
  const pcts = { swim: swimPct, bike: bikePct, run: runPct };
  const targets = { swim: target.swim, bike: target.bike, run: target.run };

  return (
    <>
      <div className="card">
        <div className="card-title">Podsumowanie tygodnia</div>
        <div className="metrics">
          <div className="metric">
            <div className="metric-val">{Math.round(totalTime)}</div>
            <div className="metric-lbl">min łącznie</div>
          </div>
          <div className="metric">
            <div className="metric-val">{totalSessions}</div>
            <div className="metric-lbl">sesji razem</div>
          </div>
          <div className="metric">
            <div className="metric-val">{daysUntilRace ?? '—'}</div>
            <div className="metric-lbl">dni do wyścigu</div>
          </div>
        </div>
        {disciplines.map(d => (
          <div className="bar-row" key={d}>
            <div className="bar-name">{discLabels[d]}</div>
            <div className="bar-track">
              <div
                className={`bar-fill bar-${d}`}
                style={{ width: `${pcts[d]}%`, minWidth: pcts[d] > 0 ? 28 : 0 }}
              >
                {pcts[d]}%
              </div>
            </div>
            <div className="bar-target">cel {targets[d]}%</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title">Diagnoza</div>
        {alerts.map((a, i) => (
          <div key={i} className={`alert alert-${a.type}`}>{a.message}</div>
        ))}
      </div>

      <div className="card">
        <div className="card-title">Twoje tempa</div>
        {swimPace && (
          <div className="pace-row">
            <span className="pace-label">Pływanie tempo</span>
            <strong>{swimPace}</strong>
          </div>
        )}
        {bikeSpeed && (
          <div className="pace-row">
            <span className="pace-label">Rower prędkość</span>
            <strong>{bikeSpeed}</strong>
          </div>
        )}
        {runPace && (
          <div className="pace-row">
            <span className="pace-label">Bieg tempo</span>
            <strong>{runPace}</strong>
          </div>
        )}
        {!swimPace && !bikeSpeed && !runPace && (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Uzupełnij dystans i czas, aby wyliczyć tempo.
          </p>
        )}
      </div>
    </>
  );
}
