import { useState } from 'react';
import { WorkoutData, AnalysisResult, WeekPlan, RACE_TARGETS } from '@tricoach/core';
import { analyzeWorkouts, daysUntil, generateWeekPlan } from '@tricoach/core';
import { useAuth } from '../../context/AuthContext';
import StravaConnectPrompt from '../auth/StravaConnectPrompt';
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
  swimDist: 0, swimTime: 0, swimSessions: 0,
  bikeDist: 0, bikeTime: 0, bikeSessions: 0,
  runDist:  0, runTime:  0, runSessions:  0,
  raceDate: defaultDate(),
  raceType: 'half',
};

export default function Analyzer() {
  const { session } = useAuth();
  const [tab, setTab]       = useState<Tab>('input');
  const [inputs, setInputs] = useState<WorkoutData>(DEFAULTS);
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [plan, setPlan]     = useState<WeekPlan | null>(null);

  const handleAnalyze = () => {
    const target = RACE_TARGETS[inputs.raceType];
    const r = analyzeWorkouts(inputs, target);
    const p = generateWeekPlan({ analysis: r, target, daysUntilRace: daysUntil(inputs.raceDate) });
    setResults(r);
    setPlan(p);
    setTab('analysis');
  };

  const handleStravaData = (data: Record<string, number>) => {
    setInputs(prev => ({ ...prev, ...data }));
  };

  return (
    <div className="analyzer-wrap">
      {/* Strava connect strip — only if logged in */}
      {session && (
        <StravaConnectPrompt onFetched={handleStravaData} />
      )}

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
        <AnalyzerAnalysis
          results={results}
          target={RACE_TARGETS[inputs.raceType]}
          daysUntilRace={daysUntil(inputs.raceDate)}
        />
      )}
      {tab === 'plan' && plan && (
        <AnalyzerPlan plan={plan} />
      )}
    </div>
  );
}
