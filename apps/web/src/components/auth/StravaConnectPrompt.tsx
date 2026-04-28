import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { ActivityItem } from '../analyzer/ActivitiesPreview';

interface Props {
  onFetched: (summary: Record<string, number>, activities: ActivityItem[]) => void;
}

export default function StravaConnectPrompt({ onFetched }: Props) {
  const { session, stravaToken, refreshStravaToken } = useAuth();
  const [fetching, setFetching] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [fetched, setFetched]   = useState(false);

  const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID as string;

  const handleConnect = () => {
    if (!session) return;
    window.location.href = `/api/auth/strava?token=${session.access_token}`;
  };

  const handleFetch = async () => {
    const current = stravaToken ?? await refreshStravaToken();
    if (!current || !session) return;

    setFetching(true);
    setError(null);

    try {
      const res = await fetch('/api/strava/activities', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.status === 401) { setError('Sesja Stravy wygasła — połącz ponownie.'); return; }
      if (!res.ok) throw new Error('Błąd serwera');

      const data = await res.json();
      onFetched(data.summary, data.activities ?? []);
      setFetched(true);
    } catch {
      setError('Nie udało się pobrać danych ze Stravy. Spróbuj ponownie.');
    } finally {
      setFetching(false);
    }
  };

  if (!clientId) return null;

  return (
    <div style={wrapper}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          {stravaToken ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={greenDot} />
                {stravaToken.athlete_name} · Strava
                {fetched && <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>· dane załadowane</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                {fetched ? 'Formularz wypełniony danymi z ostatnich 7 dni' : 'Kliknij, aby pobrać ostatnie treningi'}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Połącz ze Stravą</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                Dane z ostatnich 7 dni załadują się automatycznie
              </div>
            </>
          )}
        </div>

        {stravaToken ? (
          <button onClick={handleFetch} disabled={fetching} style={{ ...stravaBtn, opacity: fetching ? 0.7 : 1 }}>
            {fetching ? 'Pobieranie…' : fetched ? '↻ Odśwież' : '↓ Pobierz treningi'}
          </button>
        ) : (
          <button onClick={handleConnect} style={stravaBtn}>
            Połącz Stravę →
          </button>
        )}
      </div>

      {error && <div className="alert alert-warn" style={{ marginTop: 10, marginBottom: 0 }}>{error}</div>}
    </div>
  );
}

const wrapper: React.CSSProperties = {
  background: 'var(--bg-secondary)',
  border: '0.5px solid var(--border-md)',
  borderRadius: 'var(--radius-lg)',
  padding: '12px 16px',
  marginBottom: '1rem',
};

const stravaBtn: React.CSSProperties = {
  background: '#FC4C02', color: '#fff',
  border: 'none', borderRadius: 'var(--radius-md)',
  padding: '9px 16px', fontSize: 13, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'var(--font)',
  whiteSpace: 'nowrap', transition: 'opacity 0.15s',
};

const greenDot: React.CSSProperties = {
  display: 'inline-block', width: 7, height: 7,
  borderRadius: '50%', background: '#22c55e', flexShrink: 0,
};
