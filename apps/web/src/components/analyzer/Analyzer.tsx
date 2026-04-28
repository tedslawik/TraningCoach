import { useState } from 'react';
import { WorkoutData, AnalysisResult, WeekPlan, RACE_TARGETS } from '@tricoach/core';
import { analyzeWorkouts, daysUntil, generateWeekPlan } from '@tricoach/core';
import AnalyzerInput from './AnalyzerInput';
import AnalyzerAnalysis from './AnalyzerAnalysis';
import AnalyzerPlan from './AnalyzerPlan';

type Tab = 'input' | 'analysis' | 'plan';

function defaultDate() {
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  return d.toISOString().split('T')[0];
}

const DEFAULTS: WorkoutData = {
  swimDist: 3.8, swimTime: 135, swimSessions: 3,
  bikeDist: 60,  bikeTime: 120, bikeSessions: 2,
  runDist: 15,   runTime: 90,   runSessions: 3,
  raceDate: defaultDate(),
  raceType: 'half',
};

export default function Analyzer() {
  const [tab, setTab] = useState<Tab>('input');
  const [inputs, setInputs] = useState<WorkoutData>(DEFAULTS);
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [plan, setPlan] = useState<WeekPlan | null>(null);

  const handleAnalyze = () => {
    const target = RACE_TARGETS[inputs.raceType];
    const r = analyzeWorkouts(inputs, target);
    const p = generateWeekPlan({ analysis: r, target, daysUntilRace: daysUntil(inputs.raceDate) });
    setResults(r);
    setPlan(p);
    setTab('analysis');
  };

  return (
    <div className="analyzer-wrap">
      <div className="tabs">
        {(['input', 'analysis', 'plan'] as Tab[]).map((t, i) => (
          <button
            key={t}
            className={`tab${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
            disabled={i > 0 && !results}
          >
            {t === 'input' ? 'Dane treningowe' : t === 'analysis' ? 'Analiza' : 'Plan tygodnia'}
          </button>
        ))}
      </div>

      {tab === 'input' && (
        <AnalyzerInput inputs={inputs} onChange={setInputs} onAnalyze={handleAnalyze} />
      )}
      {tab === 'analysis' && results && (
        <AnalyzerAnalysis results={results} target={RACE_TARGETS[inputs.raceType]} daysUntilRace={daysUntil(inputs.raceDate)} />
      )}
      {tab === 'plan' && plan && (
        <AnalyzerPlan plan={plan} />
      )}
    </div>
  );
}
