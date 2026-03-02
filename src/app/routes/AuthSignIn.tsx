import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  canUseModoForCurrentSession,
  ensureModoSession,
  getCurrentSessionUser,
  isModoEnabledLocal,
  isRemoteAuthEnabledLocal,
  LOCAL_AUTH_CHANGED_EVENT,
  signInLocal,
  signInWithOAuthLocal,
  signOutLocal,
  signUpLocal
} from '../../backend/localAuth';

export default function AuthSignIn(): JSX.Element {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'SIGN_IN' | 'SIGN_UP'>('SIGN_IN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [session, setSession] = useState(() => getCurrentSessionUser());
  const modoEnabled = isModoEnabledLocal() && canUseModoForCurrentSession();
  const remoteAuthEnabled = isRemoteAuthEnabledLocal();

  useEffect(() => {
    if (remoteAuthEnabled) return;
    if (!modoEnabled) return;
    if (session) return;
    const modoUser = ensureModoSession();
    setMessage(`Connexion instantanée activée (${modoUser.displayName}).`);
  }, [modoEnabled, session, remoteAuthEnabled]);

  useEffect(() => {
    const syncSession = (): void => {
      setSession(getCurrentSessionUser());
    };
    window.addEventListener(LOCAL_AUTH_CHANGED_EVENT, syncSession);
    window.addEventListener('storage', syncSession);
    return () => {
      window.removeEventListener(LOCAL_AUTH_CHANGED_EVENT, syncSession);
      window.removeEventListener('storage', syncSession);
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    if (modoEnabled) return;
    if (!remoteAuthEnabled) return;
    navigate('/explications');
  }, [session, modoEnabled, remoteAuthEnabled, navigate]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (modoEnabled && !remoteAuthEnabled) {
      const modoUser = ensureModoSession();
      setMessage(`Connexion instantanée activée (${modoUser.displayName}).`);
      navigate('/explications');
      return;
    }

    if (mode === 'SIGN_IN') {
      const result = await signInLocal(email, password);
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage('Connexion réussie.');
      navigate('/explications');
      return;
    }

    if (password !== confirmPassword) {
      setError('La confirmation du mot de passe ne correspond pas.');
      return;
    }

    const created = await signUpLocal({ email, password, displayName, marketingOptIn });
    if (created.error) {
      setError(created.error);
      return;
    }
    setMessage('Compte créé et connecté.');
    navigate('/profil-coureur');
  };

  const onOAuth = async (provider: 'google' | 'facebook'): Promise<void> => {
    setError('');
    setMessage('');
    const result = await signInWithOAuthLocal(provider);
    if (!result.ok) {
      setError(result.error ?? 'Connexion sociale indisponible.');
      return;
    }
    setMessage('Redirection vers le provider en cours...');
  };

  return (
    <section className="page">
      <h1>Connexion</h1>
      <p className="page-subtitle">
        Si ton compte a été créé via Google, reconnecte-toi avec le bouton Google (pas avec mot de passe).
      </p>
      <p className="page-subtitle">
        {remoteAuthEnabled
          ? 'Comptes en ligne activés: tes identifiants fonctionnent sur tous tes appareils.'
          : 'Mode local: le compte reste lié à ce navigateur tant que le backend online n’est pas activé.'}
      </p>
      {modoEnabled ? (
        <p className="inline-info">Mode modérateur actif: clique sur Connexion pour entrer sans identifiants.</p>
      ) : null}

      {session ? (
        <article className="card premium-section">
          <h2>Session active</h2>
          <p>
            Connecté en tant que <strong>{session.displayName}</strong> (@{session.handle})
          </p>
          <p>{session.email}</p>
          <button
            type="button"
            onClick={() => {
              signOutLocal();
              setMessage('Session fermée.');
            }}
          >
            Se déconnecter
          </button>
        </article>
      ) : null}

      <form className="card premium-section form auth-form" onSubmit={onSubmit}>
        <div className="goal-actions">
          <button type="button" onClick={() => setMode('SIGN_IN')} disabled={mode === 'SIGN_IN'}>
            Connexion
          </button>
          <button type="button" onClick={() => setMode('SIGN_UP')} disabled={mode === 'SIGN_UP'}>
            Inscription
          </button>
        </div>

        {!modoEnabled && remoteAuthEnabled ? (
          <div className="auth-oauth-wrap">
            <button type="button" className="auth-google-btn" onClick={() => void onOAuth('google')}>
              <span className="auth-google-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" role="img">
                  <path
                    fill="#EA4335"
                    d="M12 10.2v3.9h5.5c-.24 1.25-.95 2.3-2.01 3.01l3.26 2.53c1.9-1.75 2.99-4.33 2.99-7.41 0-.71-.06-1.39-.18-2.02H12z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 22c2.7 0 4.96-.89 6.62-2.41l-3.26-2.53c-.9.61-2.05.98-3.36.98-2.59 0-4.79-1.75-5.57-4.1H3.06v2.58A10 10 0 0 0 12 22z"
                  />
                  <path
                    fill="#4A90E2"
                    d="M6.43 13.94a5.96 5.96 0 0 1 0-3.88V7.48H3.06a10 10 0 0 0 0 9.04l3.37-2.58z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M12 5.96c1.46 0 2.77.5 3.8 1.49l2.85-2.85C16.95 3.05 14.7 2 12 2A10 10 0 0 0 3.06 7.48l3.37 2.58C7.21 7.71 9.41 5.96 12 5.96z"
                  />
                </svg>
              </span>
              <span>Continuer avec Google</span>
            </button>
            <div className="auth-divider">
              <span>ou</span>
            </div>
          </div>
        ) : null}

        {!modoEnabled && mode === 'SIGN_UP' ? (
          <>
            <label>
              Nom affiché
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </label>
          </>
        ) : null}

        {!modoEnabled ? (
          <>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              Mot de passe
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {mode === 'SIGN_UP' ? (
              <>
                <label>
                  Confirmer le mot de passe
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                  />
                </label>
                <label className="auth-checkbox-row">
                  <input
                    type="checkbox"
                    checked={marketingOptIn}
                    onChange={(event) => setMarketingOptIn(event.target.checked)}
                  />
                  <span>
                    J&apos;accepte de recevoir des emails d&apos;information NIVELR (news saison, mises à jour).
                  </span>
                </label>
              </>
            ) : null}
          </>
        ) : null}

        {error ? <p className="error pseudo-error-note">{error}</p> : null}
        {message ? <p className="inline-info">{message}</p> : null}
        <button type="submit">
          {modoEnabled ? 'Connexion instantanée' : mode === 'SIGN_IN' ? 'Se connecter' : 'Créer mon compte'}
        </button>
      </form>
    </section>
  );
}
