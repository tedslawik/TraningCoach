import { useState } from 'react';
import { usePreferences, FEATURES, type FeatureId } from '../context/PreferencesContext';
import SectionLabel from '../components/SectionLabel';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

/* ── Feature toggles ── */

const CATEGORY_META = {
  tabs:    { label: 'Zakładki Coach',  icon: '🗂️', color: 'var(--text)'  },
  tri:     { label: 'Tri Coach',       icon: '🏅', color: 'var(--tri)'   },
  run:     { label: 'Run Coach',       icon: '🏃', color: 'var(--run)'   },
  swim:    { label: 'Swim Coach',      icon: '🏊', color: 'var(--swim)'  },
  bike:    { label: 'Bike Coach',      icon: '🚴', color: 'var(--bike)'  },
  general: { label: 'Ogólne',          icon: '⚙️', color: 'var(--text-secondary)' },
};

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
        background: enabled ? 'var(--tri)' : 'var(--bg-secondary)',
        position: 'relative', flexShrink: 0, transition: 'background 0.2s',
        border: `0.5px solid ${enabled ? 'var(--tri)' : 'var(--border-md)'}`,
      }}
      aria-label={enabled ? 'Wyłącz' : 'Włącz'}
    >
      <div style={{
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        position: 'absolute', top: 2,
        left: enabled ? 22 : 2,
        transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
}

/* ── Integration hub ── */

interface Integration {
  id:          string;
  name:        string;
  logo:        string;
  accentColor: string;
  tagline:     string;
  dataPoints:  string[];
  status:      'live' | 'coming_soon';
}

const INTEGRATIONS: Integration[] = [
  {
    id:          'strava',
    name:        'Strava',
    logo:        'S',
    accentColor: '#FC4C02',
    tagline:     'Podstawowe źródło danych — aktywności, tętno, moc, strefy HR i TSS.',
    dataPoints:  ['Aktywności GPS', 'Tętno & strefy', 'Moc (FTP)', 'Cadence', 'TSS & IF'],
    status:      'live',
  },
  {
    id:          'garmin',
    name:        'Garmin Connect',
    logo:        'G',
    accentColor: '#007CC2',
    tagline:     'Dane z urządzenia Garmin — regeneracja, stres i gotowość do treningu.',
    dataPoints:  ['HRV nocne', 'Body Battery', 'Sleep score', 'Recovery time', 'VO2max (Garmin)'],
    status:      'coming_soon',
  },
  {
    id:          'trainingpeaks',
    name:        'TrainingPeaks',
    logo:        'TP',
    accentColor: '#4DAA57',
    tagline:     'Planowanie i analiza — porównaj co zaplanowano z tym co faktycznie wykonałeś.',
    dataPoints:  ['Planowane treningi', 'Plan vs wykonanie', 'TSS targets', 'PMC (ATL/CTL/TSB)', 'Notatki coacha'],
    status:      'coming_soon',
  },
];

function IntegrationCard({ integration, connected, athleteName, onConnect, onDisconnect, disconnecting }: {
  integration: Integration;
  connected:   boolean;
  athleteName: string | null;
  onConnect:   () => void;
  onDisconnect:() => void;
  disconnecting: boolean;
}) {
  const { id, name, logo, accentColor, tagline, dataPoints, status } = integration;
  const isComingSoon = status === 'coming_soon';

  return (
    <div style={{
      background: 'var(--bg)',
      border: `0.5px solid ${connected ? accentColor : 'var(--border-md)'}`,
      borderTop: `3px solid ${isComingSoon ? 'var(--border-md)' : accentColor}`,
      borderRadius: 'var(--radius-lg)',
      padding: '1.25rem',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      opacity: isComingSoon ? 0.8 : 1,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Logo circle */}
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: isComingSoon ? 'var(--bg-secondary)' : accentColor,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: logo.length > 1 ? 10 : 15, fontWeight: 800,
            color: isComingSoon ? 'var(--text-secondary)' : '#fff',
            letterSpacing: -0.5, flexShrink: 0,
          }}>
            {logo}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>{name}</div>
          </div>
        </div>

        {/* Status badge */}
        {isComingSoon ? (
          <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '0.5px solid var(--border-md)', borderRadius: 4, padding: '3px 8px', whiteSpace: 'nowrap' }}>
            Wkrótce
          </span>
        ) : connected ? (
          <span style={{ fontSize: 10, fontWeight: 700, background: '#dcfce7', color: '#15803d', borderRadius: 4, padding: '3px 8px', whiteSpace: 'nowrap' }}>
            ✓ Połączony
          </span>
        ) : (
          <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--bg-secondary)', color: 'var(--text-secondary)', borderRadius: 4, padding: '3px 8px', whiteSpace: 'nowrap' }}>
            Niepołączony
          </span>
        )}
      </div>

      {/* Tagline */}
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55, margin: 0 }}>{tagline}</p>

      {/* Data points */}
      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4, margin: 0 }}>
        {dataPoints.map(dp => (
          <li key={dp} style={{ fontSize: 12, color: isComingSoon ? 'var(--text-secondary)' : connected ? 'var(--text)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: isComingSoon ? 'var(--border-md)' : connected ? accentColor : 'var(--border-md)', fontSize: 10, fontWeight: 700 }}>
              {isComingSoon ? '○' : connected ? '●' : '○'}
            </span>
            {dp}
          </li>
        ))}
      </ul>

      {/* Action */}
      <div style={{ marginTop: 'auto', paddingTop: 4 }}>
        {isComingSoon ? (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            Integracja w przygotowaniu
          </div>
        ) : id === 'strava' && connected ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            {athleteName && (
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>@{athleteName}</span>
            )}
            <button
              onClick={onDisconnect}
              disabled={disconnecting}
              style={{
                fontSize: 12, fontWeight: 500, cursor: disconnecting ? 'not-allowed' : 'pointer',
                background: 'none', border: '0.5px solid var(--border-md)',
                color: 'var(--text-secondary)', borderRadius: 'var(--radius-md)',
                padding: '6px 12px', fontFamily: 'var(--font)',
                opacity: disconnecting ? 0.5 : 1,
              }}
            >
              {disconnecting ? 'Rozłączanie…' : 'Rozłącz'}
            </button>
          </div>
        ) : id === 'strava' && !connected ? (
          <button
            onClick={onConnect}
            style={{
              width: '100%', padding: '9px 14px', borderRadius: 'var(--radius-md)',
              background: accentColor, color: '#fff', border: 'none',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            Połącz ze Stravą
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ── Page ── */

export default function SettingsPage() {
  const { user, stravaToken, refreshStravaToken } = useAuth();
  const { isEnabled, toggle, loading } = usePreferences();
  const [disconnecting, setDisconnecting] = useState(false);

  if (!user) return (
    <div style={{ padding: '5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
      Zaloguj się, aby zarządzać ustawieniami.
    </div>
  );

  const handleStravaConnect = () => {
    window.location.href = '/api/strava/auth';
  };

  const handleStravaDisconnect = async () => {
    if (!confirm('Czy na pewno chcesz rozłączyć Stravę? Dane historyczne pozostaną, ale nowe aktywności nie będą synchronizowane.')) return;
    setDisconnecting(true);
    await supabase.from('strava_tokens').delete().eq('user_id', user.id);
    await refreshStravaToken();
    setDisconnecting(false);
  };

  const categories = ['tabs', 'tri', 'run', 'swim', 'bike', 'general'] as Array<keyof typeof CATEGORY_META>;
  const byCategory = categories
    .map(cat => ({ cat, meta: CATEGORY_META[cat], features: FEATURES.filter(f => f.category === cat) }))
    .filter(g => g.features.length > 0);

  return (
    <>
      {/* ── HERO ── */}
      <section style={{ background: 'var(--bg-tertiary)', padding: '3rem 5vw 2.5rem' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <SectionLabel discipline="tri">Ustawienia</SectionLabel>
          <h1 style={{ fontSize: 'clamp(24px,4vw,36px)', fontWeight: 700, letterSpacing: -1.2, marginTop: 4 }}>
            Konfiguracja aplikacji
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.6 }}>
            Zarządzaj połączeniami z platformami sportowymi i włącz funkcje, których potrzebujesz.
          </p>
        </div>
      </section>

      {/* ── INTEGRATION HUB ── */}
      <section style={{ padding: '3rem 5vw' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5 }}>Centrum integracji</h2>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Połącz platformy sportowe z TriCoach</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            {INTEGRATIONS.map(integration => (
              <IntegrationCard
                key={integration.id}
                integration={integration}
                connected={integration.id === 'strava' ? !!stravaToken : false}
                athleteName={integration.id === 'strava' ? (stravaToken?.athlete_name ?? null) : null}
                onConnect={handleStravaConnect}
                onDisconnect={handleStravaDisconnect}
                disconnecting={disconnecting}
              />
            ))}
          </div>

          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 14, lineHeight: 1.6 }}>
            Garmin Connect i TrainingPeaks wymagają partnerstwa API — integracje są w przygotowaniu.
            Jeśli Garmin synchronizuje się ze Stravą, dane już trafiają do TriCoach automatycznie.
          </p>
        </div>
      </section>

      {/* ── FEATURE TOGGLES ── */}
      <section style={{ background: 'var(--bg-tertiary)', padding: '3rem 5vw' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5 }}>Funkcje aplikacji</h2>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Zmiany zapisywane natychmiast</span>
          </div>

          {loading ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Ładowanie ustawień…</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
              {byCategory.map(({ cat, meta, features }) => (
                <div key={cat}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span style={{ fontSize: 18 }}>{meta.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: meta.color }}>
                      {meta.label}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                    {features.map((f, i) => {
                      const on = isEnabled(f.id as FeatureId);
                      return (
                        <div
                          key={f.id}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                            padding: '14px 18px',
                            borderBottom: i < features.length - 1 ? '0.5px solid var(--border)' : 'none',
                            background: on ? 'var(--bg)' : 'var(--bg-secondary)',
                            transition: 'background 0.15s',
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: on ? 'var(--text)' : 'var(--text-secondary)', marginBottom: 3 }}>
                              {f.label}
                              {!f.defaultOn && (
                                <span style={{ marginLeft: 8, fontSize: 10, background: '#ede9fd', color: 'var(--tri)', borderRadius: 3, padding: '1px 6px', fontWeight: 700 }}>
                                  AI
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                              {f.description}
                            </div>
                          </div>
                          <Toggle enabled={on} onToggle={() => toggle(f.id as FeatureId)} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg)', borderRadius: 'var(--radius-md)', padding: '12px 16px', lineHeight: 1.6 }}>
                Funkcje oznaczone <strong style={{ color: 'var(--tri)' }}>AI</strong> korzystają z Claude API — każde wywołanie ma koszt widoczny po generowaniu.
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
