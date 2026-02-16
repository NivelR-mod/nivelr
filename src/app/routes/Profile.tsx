import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getCurrentSessionUser, updateProfileLocal } from '../../backend/localAuth';

export default function Profile(): JSX.Element {
  const session = getCurrentSessionUser();
  const [displayName, setDisplayName] = useState(session?.displayName ?? '');
  const [handle, setHandle] = useState(session?.handle ?? '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  if (!session) {
    return (
      <section className="page">
        <h1>Profil</h1>
        <article className="card premium-section">
          <p>Connecte-toi pour accéder à ton profil.</p>
          <Link to="/connexion">Aller à Connexion</Link>
        </article>
      </section>
    );
  }

  const onSave = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setError('');
    setMessage('');
    const result = updateProfileLocal(session.id, { displayName, handle });
    if (result.error) {
      setError(result.error);
      return;
    }
    setMessage('Profil mis à jour (mode safe local).');
  };

  return (
    <section className="page">
      <h1>Profil</h1>
      <p className="page-subtitle">Paramètres utilisateur, visibilité et identité de compte.</p>
      <form className="card premium-section form auth-form" onSubmit={onSave}>
        <label>
          Nom affiché
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </label>
        <label>
          Handle
          <input value={handle} onChange={(e) => setHandle(e.target.value)} required />
        </label>
        <p>Email: {session.email}</p>
        {error ? <p className="error">{error}</p> : null}
        {message ? <p className="inline-info">{message}</p> : null}
        <button type="submit">Enregistrer</button>
      </form>
    </section>
  );
}
