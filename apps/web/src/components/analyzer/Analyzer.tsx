import { useState, useEffect, useCallback, useRef } from 'react';
import { WorkoutData, AnalysisResult, WeekPlan, RACE_TARGETS } from '@tricoach/core';
import { analyzeWorkouts, daysUntil, generateWeekPlan } from '@tricoach/core';
import { useAuth } from '../../context/AuthContext';
import StravaConnectPrompt from '../auth/StravaConnectPrompt';
import ActivitiesPreview, { type ActivityItem } from './ActivitiesPreview';
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
  const { session, stravaToken } = useAuth();
  const [tab, setTab]               = useState<Tab>('input');
  const [inputs, setInputs]         = useState<WorkoutData>(DEFAULTS);
  const [results, setResults]       = useState<AnalysisResult | null>(null);
  const [plan, setPlan]             = useState<WeekPlan | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [fetchingStrava, setFetchingStrava] = useState(false);
  const [stravaFetched, setStravaFetched]   = useState(false);
  const autoFetchedRef = useRef(false);

  // Keep a ref of current inputs so callbacks always see the latest value
  const inputsRef = useRef(inputs);
  useEffect(() => { inputsRef.current = inputs; }, [inputs]);

  // Core analysis function — accepts explicit data to avoid stale closures
  const runAnalysis = useCallback((data: WorkoutData) => {
    const target = RACE_TARGETS[data.raceType];
    const r = analyzeWorkouts(data, target);
    const p = generateWeekPlan({ analysis: r, target, daysUntilRace: daysUntil(data.raceDate) });
    setResults(r);
    setPlan(p);
    setTab('analysis');
  }, []);

  const fetchFromStrava = useCallback(async () => {
    if (!session) return;
    setFetchingStrava(true);
    try {
      const res = await fetch('/api/strava/activities', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const data = await res.json();

      // Merge Strava summary with current config (race type, date stay as-is)
      const merged: WorkoutData = { ...inputsRef.current, ...data.summary };
      setInputs(merged);
      setActivities(data.activities ?? []);
      setStravaFetched(true);

      // Auto-analyze immediately with fresh merged data
      runAnalysis(merged);
    } catch { /* silent — manual button still available */ }
    finally { setFetchingStrava(false); }
  }, [session, runAnalysis]);

  // Auto-fetch once when Strava token becomes available
  useEffect(() => {
    if (session && stravaToken && !autoFetchedRef.current) {
      autoFetchedRef.current = true;
      fetchFromStrava();
    }
  }, [session, stravaToken, fetchFromStrava]);

  return (
    <div className="analyzer-wrap">

      {session && (
        <StravaConnectPrompt
          fetching={fetchingStrava}
          fetched={stravaFetched}
          onFetch={fetchFromStrava}
        />
      )}

      {activities.length > 0 && (
        <ActivitiesPreview activities={activities} />
      )}

      {fetchingStrava && activities.length === 0 && (
        <div style={{ textAlign: 'center', padding: '1rem 0', fontSize: 13, color: 'var(--text-secondary)' }}>
          Pobieranie i analiza danych ze Stravy…
        </div>
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
        <AnalyzerInput
          inputs={inputs}
          onChange={setInputs}
          onAnalyze={() => runAnalysis(inputs)}
        />
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
