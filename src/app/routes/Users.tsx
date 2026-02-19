import { useMemo, useState } from 'react';
import { BACKEND_FLAGS } from '../../backend/config';
import {
  addFriendDirectLocal,
  cancelOutgoingContactRequestLocal,
  createFakeUsersLocal,
  getCurrentSessionUser,
  isFakeCommunityUser,
  listLocalUsers,
  listFakeUsersLocal,
  listContactRequestsForUser,
  purgeFakeUsersLocal,
  removeFriendLocal,
  respondToContactRequestLocal,
  searchUsersLocal,
  sendContactRequestLocal
} from '../../backend/localAuth';

interface UsersProps {
  isModoEnabled: boolean;
}

type CommunityTab = 'FRIENDS' | 'INVITES' | 'DISCOVER';

const CONTACT_STATUS_LABEL: Record<'PENDING' | 'ACCEPTED' | 'DECLINED', string> = {
  PENDING: 'En attente',
  ACCEPTED: 'Acceptée',
  DECLINED: 'Refusée'
};

export default function Users({ isModoEnabled }: UsersProps): JSX.Element {
  const session = getCurrentSessionUser();
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<CommunityTab>('FRIENDS');
  const [refreshTick, setRefreshTick] = useState(0);
  const [pendingRemoveFriendId, setPendingRemoveFriendId] = useState<string | null>(null);
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
  const hiddenInSearchIds = useMemo(() => {
    if (!session) return new Set<string>();
    const ids = new Set<string>();
    for (const item of [...contacts.incoming, ...contacts.outgoing]) {
      if (item.status !== 'PENDING' && item.status !== 'ACCEPTED') continue;
      const otherId = item.requesterUserId === session.id ? item.targetUserId : item.requesterUserId;
      ids.add(otherId);
    }
    return ids;
  }, [contacts.incoming, contacts.outgoing, session]);
  const filteredResults = useMemo(
    () => results.filter((user) => !hiddenInSearchIds.has(user.id)),
    [results, hiddenInSearchIds]
  );
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
  const incomingPending = useMemo(
    () => contacts.incoming.filter((item) => item.status === 'PENDING'),
    [contacts.incoming]
  );
  const outgoingOpen = useMemo(
    () => contacts.outgoing.filter((item) => item.status !== 'ACCEPTED'),
    [contacts.outgoing]
  );

  const formatUserIdentity = (userId: string): string => {
    const identity = userById.get(userId);
    if (!identity) return 'Utilisateur inconnu';
    return `${identity.displayName} (@${identity.handle})`;
  };
  const getInitial = (userId: string): string => {
    const identity = userById.get(userId);
    const source = (identity?.displayName || identity?.handle || '?').trim();
    return source.charAt(0).toUpperCase();
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

  const onAddFriendDirect = (targetUserId: string): void => {
    if (!session) return;
    const result = addFriendDirectLocal(session.id, targetUserId);
    if (!result.ok) {
      setError(result.error ?? 'Ajout direct impossible.');
      return;
    }
    setError('');
    setMessage('Ami ajouté directement (mode modérateur).');
    setRefreshTick((value) => value + 1);
  };

  const onCancelOutgoingRequest = (requestId: string): void => {
    if (!session) return;
    const result = cancelOutgoingContactRequestLocal(requestId, session.id);
    if (!result.ok) {
      setError(result.error ?? "Annulation de la demande impossible.");
      return;
    }
    setError('');
    setMessage('Demande annulée.');
    setRefreshTick((value) => value + 1);
  };

  const onRemoveFriend = (friendId: string): void => {
    if (!session) return;
    const result = removeFriendLocal(session.id, friendId);
    if (!result.ok) {
      setError(result.error ?? "Suppression de l'ami impossible.");
      return;
    }
    setError('');
    setMessage('Ami retiré de la liste.');
    setRefreshTick((value) => value + 1);
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

  const onCreateThreeFakeUsers = (): void => {
    const result = createFakeUsersLocal(3);
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
      {pendingRemoveFriendId ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <article className="card session-modal">
            <h2>Retirer un ami</h2>
            <p>
              Confirmer la suppression de{' '}
              <strong>{formatUserIdentity(pendingRemoveFriendId)}</strong> de ta liste d&apos;amis ?
            </p>
            <div className="modal-actions">
              <button type="button" onClick={() => setPendingRemoveFriendId(null)}>
                Annuler
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  onRemoveFriend(pendingRemoveFriendId);
                  setPendingRemoveFriendId(null);
                }}
              >
                Confirmer
              </button>
            </div>
          </article>
        </div>
      ) : null}

      <h1>Utilisateurs</h1>
      <p className="page-subtitle">
        Ajoute des amis pour simplifier tes futures invitations d'équipe saison. Social actif:{' '}
        <strong>{String(BACKEND_FLAGS.socialEnabled)}</strong>
      </p>
      <div className="community-tabs">
        <button
          type="button"
          className={activeTab === 'FRIENDS' ? 'is-active' : ''}
          onClick={() => setActiveTab('FRIENDS')}
        >
          Amis ({friends.length})
        </button>
        <button
          type="button"
          className={activeTab === 'INVITES' ? 'is-active' : ''}
          onClick={() => setActiveTab('INVITES')}
        >
          Invitations ({incomingPending.length + outgoingOpen.length})
        </button>
        <button
          type="button"
          className={activeTab === 'DISCOVER' ? 'is-active' : ''}
          onClick={() => setActiveTab('DISCOVER')}
        >
          Trouver ({filteredResults.length})
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="inline-info">{message}</p> : null}

      {isModoEnabled ? (
        <article className="card premium-section">
          <h2>Mode modérateur · données de test</h2>
          <p className="page-subtitle">
            Les profils fictifs sont visibles uniquement en mode modérateur pour tester la communauté.
          </p>
          <div className="goal-actions">
            <button type="button" onClick={onCreateThreeFakeUsers}>
              Générer 3 utilisateurs fictifs
            </button>
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

      {session ? (
        <>
          {activeTab === 'FRIENDS' ? (
            <article className="card premium-section">
              <h2>Mes amis</h2>
              {friends.length === 0 ? (
                <div className="community-empty">
                  <p>Aucun ami pour le moment.</p>
                  <button type="button" className="btn-compact" onClick={() => setActiveTab('DISCOVER')}>
                    Trouver des utilisateurs
                  </button>
                </div>
              ) : null}
              <div className="community-card-grid">
                {friends.map((friendId) => (
                  <article key={friendId} className="community-user-card">
                    <div className="community-user-head">
                      <span className="community-avatar">{getInitial(friendId)}</span>
                      <div>
                        <p>{formatUserIdentity(friendId)}</p>
                        <small className="community-status-tag">Ami</small>
                      </div>
                    </div>
                    <div className="community-user-actions">
                      <button
                        type="button"
                        className="btn-compact danger-outline"
                        onClick={() => setPendingRemoveFriendId(friendId)}
                      >
                        Retirer
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </article>
          ) : null}

          {activeTab === 'INVITES' ? (
            <div className="list">
              <article className="card premium-section">
                <h2>Demandes reçues</h2>
                {incomingPending.length === 0 ? <p>Aucune demande en attente.</p> : null}
                <div className="community-card-grid">
                  {incomingPending.map((item) => (
                    <article key={item.id} className="community-user-card">
                      <div className="community-user-head">
                        <span className="community-avatar">{getInitial(item.requesterUserId)}</span>
                        <div>
                          <p>{formatUserIdentity(item.requesterUserId)}</p>
                          <small className="community-status-tag">
                            {CONTACT_STATUS_LABEL[item.status]}
                          </small>
                        </div>
                      </div>
                      <div className="community-user-actions">
                        <button type="button" className="btn-compact" onClick={() => onRespond(item.id, 'ACCEPTED')}>
                          Accepter
                        </button>
                        <button type="button" className="btn-compact danger-outline" onClick={() => onRespond(item.id, 'DECLINED')}>
                          Refuser
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </article>

              <article className="card premium-section">
                <h2>Demandes envoyées</h2>
                {outgoingOpen.length === 0 ? <p>Aucune demande envoyée.</p> : null}
                <div className="community-card-grid">
                  {outgoingOpen.map((item) => (
                    <article key={item.id} className="community-user-card">
                      <div className="community-user-head">
                        <span className="community-avatar">{getInitial(item.targetUserId)}</span>
                        <div>
                          <p>{formatUserIdentity(item.targetUserId)}</p>
                          <small className="community-status-tag">
                            {CONTACT_STATUS_LABEL[item.status]}
                          </small>
                        </div>
                      </div>
                      <div className="community-user-actions">
                        {item.status === 'PENDING' ? (
                          <button
                            type="button"
                            className="btn-compact danger-outline"
                            onClick={() => onCancelOutgoingRequest(item.id)}
                          >
                            Annuler
                          </button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </article>
            </div>
          ) : null}

          {activeTab === 'DISCOVER' ? (
            <article className="card premium-section form auth-form">
              <h2>Trouver un utilisateur</h2>
              <label>
                Rechercher
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="@handle ou pseudo"
                />
              </label>
              {filteredResults.length === 0 ? <p>Aucun résultat.</p> : null}
              <div className="community-card-grid">
                {filteredResults.map((user) => (
                  <article key={user.id} className="community-user-card">
                    <div className="community-user-head">
                      <span className="community-avatar">{getInitial(user.id)}</span>
                      <div>
                        <p>
                          {user.displayName} (@{user.handle}){' '}
                          {isModoEnabled && isFakeCommunityUser(user) ? <small className="nav-lock">Fictif</small> : null}
                        </p>
                        <small className="community-status-tag">Disponible</small>
                      </div>
                    </div>
                    <div className="community-user-actions">
                      <button type="button" className="btn-compact" onClick={() => onSendRequest(user.id)}>
                        Ajouter en ami
                      </button>
                      {isModoEnabled ? (
                        <button type="button" className="btn-compact" onClick={() => onAddFriendDirect(user.id)}>
                          Ajouter direct (modo)
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </article>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
