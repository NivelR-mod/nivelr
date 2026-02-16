import { useMemo, useState } from 'react';
import { BACKEND_FLAGS } from '../../backend/config';
import {
  getCurrentSessionUser,
  listContactRequestsForUser,
  respondToContactRequestLocal,
  searchUsersLocal,
  sendContactRequestLocal
} from '../../backend/localAuth';

export default function Users(): JSX.Element {
  const session = getCurrentSessionUser();
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const results = useMemo(() => searchUsersLocal(query, session?.id), [query, session?.id]);
  const contacts = session ? listContactRequestsForUser(session.id) : { incoming: [], outgoing: [] };

  const onSendRequest = (targetUserId: string): void => {
    if (!session) {
      setError('Connecte-toi pour envoyer une demande.');
      return;
    }
    const result = sendContactRequestLocal(session.id, targetUserId);
    if (!result.ok) {
      setError(result.error ?? 'Impossible d’envoyer la demande.');
      return;
    }
    setError('');
    setMessage('Demande envoyée.');
  };

  const onRespond = (requestId: string, decision: 'ACCEPTED' | 'DECLINED'): void => {
    if (!session) return;
    const result = respondToContactRequestLocal(requestId, session.id, decision);
    if (!result.ok) {
      setError(result.error ?? 'Action impossible.');
      return;
    }
    setError('');
    setMessage(decision === 'ACCEPTED' ? 'Demande acceptée.' : 'Demande refusée.');
  };

  return (
    <section className="page">
      <h1>Utilisateurs</h1>
      <p className="page-subtitle">
        Recherche et contact pour la coopération saison. Social actif: <strong>{String(BACKEND_FLAGS.socialEnabled)}</strong>
      </p>

      <article className="card premium-section form auth-form">
        <label>
          Rechercher un utilisateur
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="@handle, nom, email"
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        {message ? <p className="inline-info">{message}</p> : null}
      </article>

      <article className="card premium-section">
        <h2>Résultats</h2>
        {results.length === 0 ? <p>Aucun résultat.</p> : null}
        <div className="list">
          {results.map((user) => (
            <article key={user.id} className="card">
              <p>
                <strong>{user.displayName}</strong> @{user.handle}
              </p>
              <p>{user.email}</p>
              <button type="button" onClick={() => onSendRequest(user.id)}>
                Demander le contact
              </button>
            </article>
          ))}
        </div>
      </article>

      {session ? (
        <div className="list">
          <article className="card premium-section">
            <h2>Demandes reçues</h2>
            {contacts.incoming.filter((item) => item.status === 'PENDING').length === 0 ? (
              <p>Aucune demande en attente.</p>
            ) : null}
            {contacts.incoming
              .filter((item) => item.status === 'PENDING')
              .map((item) => (
                <div key={item.id} className="goal-actions">
                  <span>{item.requesterUserId}</span>
                  <button type="button" onClick={() => onRespond(item.id, 'ACCEPTED')}>
                    Accepter
                  </button>
                  <button type="button" onClick={() => onRespond(item.id, 'DECLINED')}>
                    Refuser
                  </button>
                </div>
              ))}
          </article>

          <article className="card premium-section">
            <h2>Demandes envoyées</h2>
            {contacts.outgoing.length === 0 ? <p>Aucune demande envoyée.</p> : null}
            {contacts.outgoing.map((item) => (
              <p key={item.id}>
                {item.targetUserId} · <strong>{item.status}</strong>
              </p>
            ))}
          </article>
        </div>
      ) : null}
    </section>
  );
}
