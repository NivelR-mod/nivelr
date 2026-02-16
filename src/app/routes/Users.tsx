import { useMemo, useState } from 'react';
import { BACKEND_FLAGS } from '../../backend/config';
import {
  createFakeUsersLocal,
  getCurrentSessionUser,
  isFakeCommunityUser,
  listLocalUsers,
  listFakeUsersLocal,
  listContactRequestsForUser,
  purgeFakeUsersLocal,
  respondToContactRequestLocal,
  searchUsersLocal,
  sendContactRequestLocal
} from '../../backend/localAuth';

interface UsersProps {
  isModoEnabled: boolean;
}

export default function Users({ isModoEnabled }: UsersProps): JSX.Element {
  const session = getCurrentSessionUser();
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const usersCatalog = useMemo(() => listLocalUsers(), [refreshTick]);
  const userById = useMemo(
    () =>
      new Map(
        usersCatalog.map((user) => [
          user.id,
          {
            displayName: user.displayName,
            handle: user.handle
          }
        ])
      ),
    [usersCatalog]
  );
  const results = useMemo(
    () => searchUsersLocal(query, session?.id, { includeFakeUsers: isModoEnabled }),
    [query, session?.id, isModoEnabled, refreshTick]
  );
  const fakeUsers = useMemo(() => (isModoEnabled ? listFakeUsersLocal() : []), [isModoEnabled, refreshTick]);
  const contacts = session ? listContactRequestsForUser(session.id) : { incoming: [], outgoing: [] };
  const friends = useMemo(() => {
    if (!session) return [];
    const accepted = [...contacts.incoming, ...contacts.outgoing].filter((item) => item.status === 'ACCEPTED');
    const friendIds = new Set<string>();
    for (const item of accepted) {
      if (item.requesterUserId === session.id) {
        friendIds.add(item.targetUserId);
      } else if (item.targetUserId === session.id) {
        friendIds.add(item.requesterUserId);
      }
    }
    return Array.from(friendIds);
  }, [contacts.incoming, contacts.outgoing, session]);

  const formatUserIdentity = (userId: string): string => {
    const identity = userById.get(userId);
    if (!identity) return 'Utilisateur inconnu';
    return `${identity.displayName} (@${identity.handle})`;
  };

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
    setMessage("Demande d'ami envoyée.");
  };

  const onRespond = (requestId: string, decision: 'ACCEPTED' | 'DECLINED'): void => {
    if (!session) return;
    const result = respondToContactRequestLocal(requestId, session.id, decision);
    if (!result.ok) {
      setError(result.error ?? 'Action impossible.');
      return;
    }
    setError('');
    setMessage(decision === 'ACCEPTED' ? "Demande d'ami acceptée." : "Demande d'ami refusée.");
  };

  const onCreateFakeUsers = (): void => {
    const result = createFakeUsersLocal(12);
    if (!result.ok) {
      setError(result.error ?? 'Création impossible.');
      return;
    }
    setError('');
    setMessage(`${result.created} utilisateurs fictifs créés.`);
    setRefreshTick((value) => value + 1);
  };

  const onPurgeFakeUsers = (): void => {
    const result = purgeFakeUsersLocal();
    if (!result.ok) {
      setError(result.error ?? 'Suppression impossible.');
      return;
    }
    setError('');
    setMessage(`${result.removed} utilisateurs fictifs supprimés.`);
    setRefreshTick((value) => value + 1);
  };

  return (
    <section className="page">
      <h1>Utilisateurs</h1>
      <p className="page-subtitle">
        Ajoute des amis pour simplifier tes futures invitations d'équipe saison. Social actif:{' '}
        <strong>{String(BACKEND_FLAGS.socialEnabled)}</strong>
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

      {isModoEnabled ? (
        <article className="card premium-section">
          <h2>Mode modérateur · données de test</h2>
          <p className="page-subtitle">
            Les profils fictifs sont visibles uniquement en mode modérateur pour tester la communauté.
          </p>
          <div className="goal-actions">
            <button type="button" onClick={onCreateFakeUsers}>
              Générer 12 utilisateurs fictifs
            </button>
            <button type="button" className="danger" onClick={onPurgeFakeUsers}>
              Supprimer tous les fictifs
            </button>
          </div>
          <p>
            Fictifs disponibles: <strong>{fakeUsers.length}</strong>
          </p>
        </article>
      ) : null}

      <article className="card premium-section">
        <h2>Résultats</h2>
        {results.length === 0 ? <p>Aucun résultat.</p> : null}
        <div className="list">
          {results.map((user) => (
            <article key={user.id} className="card">
              <p>
                <strong>{user.displayName}</strong> @{user.handle}{' '}
                {isModoEnabled && isFakeCommunityUser(user) ? <small className="nav-lock">Fictif</small> : null}
              </p>
              <button type="button" onClick={() => onSendRequest(user.id)}>
                Ajouter en ami
              </button>
            </article>
          ))}
        </div>
      </article>

      {session ? (
        <div className="list">
          <article className="card premium-section">
            <h2>Demandes d'ami reçues</h2>
            {contacts.incoming.filter((item) => item.status === 'PENDING').length === 0 ? (
              <p>Aucune demande en attente.</p>
            ) : null}
            {contacts.incoming
              .filter((item) => item.status === 'PENDING')
              .map((item) => (
                <div key={item.id} className="goal-actions">
                  <span>{formatUserIdentity(item.requesterUserId)}</span>
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
            <h2>Demandes d'ami envoyées</h2>
            {contacts.outgoing.length === 0 ? <p>Aucune demande envoyée.</p> : null}
            {contacts.outgoing.map((item) => (
              <p key={item.id}>
                {formatUserIdentity(item.targetUserId)} · <strong>{item.status}</strong>
              </p>
            ))}
          </article>

          <article className="card premium-section">
            <h2>Mes amis</h2>
            {friends.length === 0 ? <p>Aucun ami pour le moment.</p> : null}
            {friends.map((friendId) => (
              <p key={friendId}>{formatUserIdentity(friendId)}</p>
            ))}
          </article>
        </div>
      ) : null}
    </section>
  );
}
