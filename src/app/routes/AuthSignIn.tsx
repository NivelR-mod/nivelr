import { useEffect, useMemo, useState } from 'react';
import { BACKEND_FLAGS, BACKEND_PROVIDER } from '../../backend/config';
import {
  ensureModoSession,
  getCurrentSessionUser,
  isModoEnabledLocal,
  signInLocal,
  signOutLocal,
  signUpLocal
} from '../../backend/localAuth';

export default function AuthSignIn(): JSX.Element {
  const [mode, setMode] = useState<'SIGN_IN' | 'SIGN_UP'>('SIGN_IN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');
  const session = useMemo(() => getCurrentSessionUser(), [message]);
  const modoEnabled = isModoEnabledLocal();

  useEffect(() => {
    if (!modoEnabled) return;
    if (session) return;
    const modoUser = ensureModoSession();
    setMessage(`Connexion instantanée activée (${modoUser.displayName}).`);
  }, [modoEnabled, session]);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (modoEnabled) {
      const modoUser = ensureModoSession();
      setMessage(`Connexion instantanée activée (${modoUser.displayName}).`);
      return;
    }

    if (mode === 'SIGN_IN') {
      const result = signInLocal(email, password);
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage('Connexion réussie (mode safe local).');
      return;
    }

    const created = signUpLocal({ email, password, displayName });
    if (created.error) {
      setError(created.error);
      return;
    }
    setMessage('Compte créé et connecté (mode safe local).');
  };

  return (
    <section className="page">
      <h1>Connexion</h1>
      <p className="page-subtitle">
        Etat backend: <strong>{BACKEND_PROVIDER}</strong> · Flags: auth={String(BACKEND_FLAGS.authEnabled)}
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
