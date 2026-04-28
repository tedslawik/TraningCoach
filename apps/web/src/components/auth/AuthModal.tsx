import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

type Mode = 'login' | 'register';

export default function AuthModal() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode]       = useState<Mode>('login');
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (mode === 'login') {
      const { error } = await signIn(email, password);
      if (error) setError(error);
    } else {
      const { error } = await signUp(email, password);
      if (error) setError(error);
      else setSuccess(true);
    }

    setLoading(false);
  };

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1, marginBottom: 6 }}>
            TriCoach
          </div>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {mode === 'login'
              ? 'Zaloguj się, aby analizować swoje treningi.'
              : 'Utwórz konto — bezpłatnie.'}
          </p>
        </div>

        {success ? (
          <div className="alert alert-ok" style={{ marginBottom: 0 }}>
            Sprawdź skrzynkę — wysłaliśmy link potwierdzający rejestrację.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 12 }}>
              <div className="workout-label">Email</div>
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
            <div style={{ marginBottom: 20 }}>
              <div className="workout-label">Hasło</div>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="min. 8 znaków"
                minLength={8}
                required
                style={{ width: '100%' }}
              />
            </div>

            {error && (
              <div className="alert alert-warn" style={{ marginBottom: 16 }}>{error}</div>
            )}

            <button
              type="submit"
              className="analyze-btn"
              disabled={loading}
              style={{ marginTop: 0, opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'Ładowanie…' : mode === 'login' ? 'Zaloguj się' : 'Utwórz konto'}
            </button>
          </form>
        )}

        {!success && (
          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)', marginTop: 20 }}>
            {mode === 'login' ? 'Nie masz konta? ' : 'Masz już konto? '}
            <button
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tri)', fontWeight: 600, fontSize: 13, padding: 0 }}
            >
              {mode === 'login' ? 'Zarejestruj się' : 'Zaloguj się'}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.55)',
  backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 200, padding: '1rem',
};

const modal: React.CSSProperties = {
  background: 'var(--bg)',
  border: '0.5px solid var(--border-md)',
  borderRadius: 'var(--radius-xl)',
  padding: '2.5rem',
  width: '100%', maxWidth: 400,
  boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
};
