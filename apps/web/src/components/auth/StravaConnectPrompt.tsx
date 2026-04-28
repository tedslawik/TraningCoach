import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

interface Props {
  onFetched: (data: Record<string, number>) => void;
}

export default function StravaConnectPrompt({ onFetched }: Props) {
  const { session, stravaToken, refreshStravaToken } = useAuth();
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID as string;

  const handleConnect = async () => {
    if (!session) return;
    const token = session.access_token;
    window.location.href = `/api/auth/strava?token=${token}`;
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

      if (!res.ok) {
        if (res.status === 401) {
          setError('Token Stravy wygasł — połącz ponownie.');
          return;
        }
        throw new Error('Błąd pobierania danych');
      }

      const data = await res.json();
      onFetched(data);
    } catch (e) {
      setError('Nie udało się pobrać danych ze Stravy. Spróbuj ponownie.');
    } finally {
      setFetching(false);
    }
  };

  if (!clientId) {
    return (
      <div className="alert alert-warn">
        Brak konfiguracji Strava — ustaw <code>VITE_STRAVA_CLIENT_ID</code> w zmiennych środowiskowych.
      </div>
    );
  }

  return (
    <div style={wrapper}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          {stravaToken ? (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                <span style={dot} /> Połączono ze Stravą · {stravaToken.athlete_name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                Pobierz dane z ostatnich 7 dni i wypełnij formularz automatycznie
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                Połącz ze Stravą
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                Dane z ostatnich 7 dni załadują się automatycznie
              </div>
            </div>
          )}
        </div>

        {stravaToken ? (
          <button
            onClick={handleFetch}
            disabled={fetching}
            style={{ ...stravaBtn, opacity: fetching ? 0.7 : 1 }}
          >
            {fetching ? 'Pobieranie…' : '↓ Pobierz z Stravy'}
          </button>
        ) : (
          <button onClick={handleConnect} style={stravaBtn}>
            Połącz Stravę →
          </button>
        )}
      </div>

      {error && (
        <div className="alert alert-warn" style={{ marginTop: 10, marginBottom: 0 }}>{error}</div>
      )}
    </div>
  );
}

const wrapper: React.CSSProperties = {
  background: 'var(--bg-secondary)',
  border: '0.5px solid var(--border-md)',
  borderRadius: 'var(--radius-lg)',
  padding: '14px 16px',
  marginBottom: '1rem',
};

const stravaBtn: React.CSSProperties = {
  background: '#FC4C02',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  padding: '9px 18px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'var(--font)',
  whiteSpace: 'nowrap',
  transition: 'opacity 0.15s',
};

const dot: React.CSSProperties = {
  display: 'inline-block',
  width: 8, height: 8,
  borderRadius: '50%',
  background: '#22c55e',
  marginRight: 6,
};
