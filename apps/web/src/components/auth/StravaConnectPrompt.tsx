import { useAuth } from '../../context/AuthContext';

interface Props {
  fetching: boolean;
  fetched: boolean;
  onFetch: () => void;
}

export default function StravaConnectPrompt({ fetching, fetched, onFetch }: Props) {
  const { stravaToken } = useAuth();

  const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID as string;
  if (!clientId) return null;

  if (!stravaToken) return (
    <div style={wrapper}>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        Strava nie jest połączona. &nbsp;
        <a href="/athlete" style={{ color: 'var(--tri)', fontWeight: 600 }}>
          Połącz w Profilu Zawodnika →
        </a>
      </span>
    </div>
  );

  return (
    <div style={wrapper}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={greenDot} />
            {stravaToken.athlete_name} · Strava
            {fetched && <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}> · dane załadowane</span>}
            {fetching && <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}> · pobieranie…</span>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            {fetched ? 'Formularz wypełniony danymi z ostatnich 7 dni' : 'Automatyczne pobieranie…'}
          </div>
        </div>
        <button onClick={onFetch} disabled={fetching} style={{ ...stravaBtn, opacity: fetching ? 0.7 : 1 }}>
          {fetching ? 'Pobieranie…' : '↻ Odśwież dane'}
        </button>
      </div>
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
