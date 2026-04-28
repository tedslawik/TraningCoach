import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

type Mode = 'login' | 'register';

export default function AuthModal() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode]         = useState<Mode>('login');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [success, setSuccess]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fn = mode === 'login' ? signIn : signUp;
    const { error } = await fn(email, password);
    if (error) setError(error);
    else if (mode === 'register') setSuccess(true);
    setLoading(false);
  };

  const switchMode = (m: Mode) => { setMode(m); setError(null); setSuccess(false); };

  return (
    <div style={overlay}>
      <div style={modal}>

        {/* Brand header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 14 }}>
            {['--tri','--swim','--bike','--run'].map(c => (
              <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: `var(${c})` }} />
            ))}
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -1, color: 'var(--text)', marginBottom: 6 }}>
            TriCoach
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Twój personalny coach triathlonowy
          </p>
        </div>

        {/* Mode tabs */}
        <div style={tabWrapper}>
          {(['login', 'register'] as Mode[]).map(m => (
            <button key={m} onClick={() => switchMode(m)} style={tabBtn(mode === m)}>
              {m === 'login' ? 'Logowanie' : 'Rejestracja'}
            </button>
          ))}
        </div>

        {success ? (
          <div className="alert alert-ok">
            Sprawdź skrzynkę email — wysłaliśmy link potwierdzający.
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div className="workout-label" style={{ marginBottom: 6 }}>Adres email</div>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="ty@example.com"
                required
                style={{ width: '100%' }}
                autoFocus
              />
            </div>
            <div>
              <div className="workout-label" style={{ marginBottom: 6 }}>Hasło</div>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'min. 8 znaków' : '••••••••'}
                minLength={mode === 'register' ? 8 : undefined}
                required
                style={{ width: '100%' }}
              />
            </div>

            {error && (
              <div className="alert alert-warn" style={{ margin: 0 }}>{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={submitBtn(loading)}
            >
              {loading ? 'Ładowanie…' : mode === 'login' ? 'Zaloguj się' : 'Utwórz konto'}
            </button>
          </form>
        )}

        {/* Footer hint */}
        {!success && (
          <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)', marginTop: 20 }}>
            {mode === 'login'
              ? <>Nie masz konta? <Btn onClick={() => switchMode('register')}>Zarejestruj się</Btn></>
              : <>Masz już konto? <Btn onClick={() => switchMode('login')}>Zaloguj się</Btn></>
            }
          </p>
        )}
      </div>
    </div>
  );
}

function Btn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tri)', fontWeight: 600, fontSize: 12, padding: 0 }}>
      {children}
    </button>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.6)',
  backdropFilter: 'blur(6px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 200, padding: '1rem',
};

const modal: React.CSSProperties = {
  background: 'var(--bg)',
  border: '0.5px solid var(--border-md)',
  borderRadius: 'var(--radius-xl)',
  padding: '2.5rem 2.25rem',
  width: '100%', maxWidth: 400,
  boxShadow: '0 32px 80px rgba(0,0,0,0.22)',
};

const tabWrapper: React.CSSProperties = {
  display: 'flex',
  background: 'var(--bg-secondary)',
  borderRadius: 'var(--radius-md)',
  padding: 3,
  marginBottom: '1.5rem',
  gap: 3,
};

const tabBtn = (active: boolean): React.CSSProperties => ({
  flex: 1, padding: '9px 0',
  borderRadius: 'var(--radius-md)',
  border: 'none', cursor: 'pointer',
  fontSize: 13, fontWeight: active ? 600 : 400,
  fontFamily: 'var(--font)',
  background: active ? 'var(--bg)' : 'transparent',
  color: active ? 'var(--text)' : 'var(--text-secondary)',
  boxShadow: active ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
  transition: 'all 0.15s',
});

const submitBtn = (loading: boolean): React.CSSProperties => ({
  width: '100%', padding: '12px',
  background: 'var(--tri)', color: '#fff',
  border: 'none', borderRadius: 'var(--radius-md)',
  fontSize: 15, fontWeight: 600, fontFamily: 'var(--font)',
  cursor: loading ? 'not-allowed' : 'pointer',
  opacity: loading ? 0.7 : 1,
  transition: 'opacity 0.15s',
  marginTop: 4,
});
