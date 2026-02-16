import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import {
  getCurrentSessionUser,
  getUserSubscriptionLocal,
  signOutLocal,
  updateAccountSecurityLocal,
  updateProfileLocal
} from '../../backend/localAuth';

export default function Profile(): JSX.Element {
  const navigate = useNavigate();
  const session = getCurrentSessionUser();
  const subscription = session ? getUserSubscriptionLocal(session.id) : null;
  const [displayName, setDisplayName] = useState(session?.displayName ?? '');
  const [nextEmail, setNextEmail] = useState(session?.email ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmNextPassword, setConfirmNextPassword] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [securityMessage, setSecurityMessage] = useState('');
  const [error, setError] = useState('');

  const subscriptionLabelMap: Record<string, string> = {
    FREE_S1: 'Saison 1 Gratuite',
    PREMIUM: 'Premium',
    FOUNDER: 'Founder'
  };

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
    setProfileMessage('');
    const result = updateProfileLocal(session.id, { displayName });
    if (result.error) {
      setError(result.error);
      return;
    }
    setProfileMessage(`Profil mis à jour. Nouveau handle: @${result.user?.handle ?? session.handle}`);
  };

  const onSecuritySave = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setError('');
    setSecurityMessage('');
    if (nextPassword && nextPassword !== confirmNextPassword) {
      setError('La confirmation du nouveau mot de passe ne correspond pas.');
      return;
    }

    const result = updateAccountSecurityLocal({
      userId: session.id,
      currentPassword,
      nextEmail: nextEmail.trim().toLowerCase(),
      nextPassword: nextPassword || undefined
    });
    if (result.error) {
      setError(result.error);
      return;
    }

    const updates: string[] = [];
    if (result.emailChanged) updates.push('email');
    if (result.passwordChanged) updates.push('mot de passe');
    setSecurityMessage(`Sécurité mise à jour (${updates.join(' + ')}).`);
    setCurrentPassword('');
    setNextPassword('');
    setConfirmNextPassword('');
  };

  return (
    <section className="page">
      <h1>Profil</h1>
      <p className="page-subtitle">Gère ton identité, la sécurité du compte et ton abonnement.</p>

      <div className="list">
        <article className="card premium-section">
          <h2>Identité</h2>
          <p className="page-subtitle">
            Aperçu public actuel: <strong>{session.displayName || 'Ton nom'}</strong> ·{' '}
            <strong>@{session.handle || 'ton_handle'}</strong>
          </p>
          <form className="form auth-form" onSubmit={onSave}>
            <label>
              Nom affiché
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </label>
            {profileMessage ? <p className="inline-info">{profileMessage}</p> : null}
            {error ? <p className="error pseudo-error-note">{error}</p> : null}
            <button type="submit">Enregistrer l'identité</button>
          </form>
        </article>

        <article className="card premium-section">
          <h2>Sécurité du compte</h2>
          <form className="form auth-form" onSubmit={onSecuritySave}>
            <label>
              Email du compte
              <input type="email" value={nextEmail} onChange={(e) => setNextEmail(e.target.value)} required />
            </label>
            <label>
              Mot de passe actuel
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </label>
            <label>
              Nouveau mot de passe (optionnel)
              <input
                type="password"
                value={nextPassword}
                onChange={(e) => setNextPassword(e.target.value)}
                placeholder="Laisse vide pour garder l'actuel"
              />
            </label>
            <label>
              Confirmer le nouveau mot de passe
              <input
                type="password"
                value={confirmNextPassword}
                onChange={(e) => setConfirmNextPassword(e.target.value)}
                placeholder="Seulement si nouveau mot de passe"
              />
            </label>
            {securityMessage ? <p className="inline-info">{securityMessage}</p> : null}
            {error ? <p className="error">{error}</p> : null}
            <button type="submit">Mettre à jour la sécurité</button>
          </form>
        </article>

        <article className="card premium-section">
          <h2>Abonnement</h2>
          <p>
            Offre actuelle: <strong>{subscription ? subscriptionLabelMap[subscription.plan] : 'Inconnue'}</strong>
          </p>
          <p>
            Statut: <strong>{subscription?.status === 'ACTIVE' ? 'Actif' : 'Inactif'}</strong>
          </p>
          <p className="page-subtitle">
            La saison 1 reste gratuite pendant la phase de lancement. Le premium sera proposé ensuite.
          </p>
          <p>
            Voir les options: <Link to="/abonnement">ouvrir la page Abonnement</Link>
          </p>
        </article>

      </div>
      <button
        type="button"
        className="danger"
        onClick={() => {
          signOutLocal();
          navigate('/explications');
        }}
      >
        Se déconnecter
      </button>
    </section>
  );
}
