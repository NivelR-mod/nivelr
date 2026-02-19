import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import {
  getCurrentSessionUser,
  getUserSubscriptionLocal,
  signOutLocal,
  updateAccountSecurityLocal,
  updateProfileAvatarLocal,
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
  const [avatarMessage, setAvatarMessage] = useState('');
  const [securityMessage, setSecurityMessage] = useState('');
  const [error, setError] = useState('');
  const [avatarCropSource, setAvatarCropSource] = useState<string | null>(null);
  const [avatarZoom, setAvatarZoom] = useState(1);
  const [avatarOffsetX, setAvatarOffsetX] = useState(0);
  const [avatarOffsetY, setAvatarOffsetY] = useState(0);

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

  const onAvatarFileChange = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    if (!session) return;
    setError('');
    setAvatarMessage('');
    const file = event.target.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Format invalide. Utilise une image (jpg, png, webp).');
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      setError('Image trop lourde (max 1.5 MB).');
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('read_error'));
      reader.readAsDataURL(file);
    }).catch(() => '');
    if (!dataUrl) {
      setError("Impossible de lire l'image.");
      return;
    }
    setAvatarZoom(1);
    setAvatarOffsetX(0);
    setAvatarOffsetY(0);
    setAvatarCropSource(dataUrl);
  };

  const onRemoveAvatar = (): void => {
    if (!session) return;
    setError('');
    setAvatarMessage('');
    const result = updateProfileAvatarLocal(session.id, null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setAvatarMessage('Photo de profil supprimée.');
  };

  const buildCroppedAvatar = async (
    dataUrl: string,
    zoom: number,
    offsetX: number,
    offsetY: number
  ): Promise<string | null> =>
    new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        const width = image.naturalWidth;
        const height = image.naturalHeight;
        const side = Math.min(width, height);
        const safeZoom = Math.max(1, Math.min(3, zoom));
        const cropSize = side / safeZoom;

        const centerXBase = width / 2;
        const centerYBase = height / 2;
        const centerX = centerXBase + (offsetX / 100) * ((width - cropSize) / 2);
        const centerY = centerYBase + (offsetY / 100) * ((height - cropSize) / 2);
        const sx = Math.max(0, Math.min(width - cropSize, centerX - cropSize / 2));
        const sy = Math.max(0, Math.min(height - cropSize, centerY - cropSize / 2));

        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(image, sx, sy, cropSize, cropSize, 0, 0, 512, 512);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      image.onerror = () => resolve(null);
      image.src = dataUrl;
    });

  const onConfirmAvatarCrop = async (): Promise<void> => {
    if (!session || !avatarCropSource) return;
    setError('');
    setAvatarMessage('');
    const cropped = await buildCroppedAvatar(avatarCropSource, avatarZoom, avatarOffsetX, avatarOffsetY);
    if (!cropped) {
      setError('Recadrage impossible.');
      return;
    }
    const result = updateProfileAvatarLocal(session.id, cropped);
    if (result.error) {
      setError(result.error);
      return;
    }
    setAvatarCropSource(null);
    setAvatarMessage('Photo de profil mise à jour.');
  };

  return (
    <section className="page">
      {avatarCropSource ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <article className="card session-modal profile-crop-modal">
            <h2>Recadrer la photo</h2>
            <div className="profile-crop-stage">
              <img
                src={avatarCropSource}
                alt="Recadrage avatar"
                style={{
                  transform: `translate(${avatarOffsetX}%, ${avatarOffsetY}%) scale(${avatarZoom})`
                }}
              />
              <div className="profile-crop-mask" />
            </div>
            <div className="profile-crop-controls">
              <label>
                Zoom
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={avatarZoom}
                  onChange={(event) => setAvatarZoom(Number(event.target.value))}
                />
              </label>
              <label>
                Décalage horizontal
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={1}
                  value={avatarOffsetX}
                  onChange={(event) => setAvatarOffsetX(Number(event.target.value))}
                />
              </label>
              <label>
                Décalage vertical
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={1}
                  value={avatarOffsetY}
                  onChange={(event) => setAvatarOffsetY(Number(event.target.value))}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" onClick={() => setAvatarCropSource(null)}>
                Annuler
              </button>
              <button type="button" onClick={onConfirmAvatarCrop}>
                Enregistrer la photo
              </button>
            </div>
          </article>
        </div>
      ) : null}

      <h1>Profil</h1>
      <p className="page-subtitle">Gère ton identité, la sécurité du compte et ton abonnement.</p>

      <div className="list">
        <article className="card premium-section">
          <h2>Identité</h2>
          <div className="profile-avatar-wrap">
            <div className="profile-avatar-preview">
              {session.avatarDataUrl ? (
                <img src={session.avatarDataUrl} alt="Photo de profil" />
              ) : (
                <span>{(session.displayName || '?').trim().charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="profile-avatar-actions">
              <label className="btn-compact import-label profile-photo-import-btn">
                Importer une photo
                <input type="file" accept="image/*" onChange={onAvatarFileChange} className="import-input" />
              </label>
              <button type="button" className="btn-compact danger-outline" onClick={onRemoveAvatar}>
                Supprimer la photo
              </button>
            </div>
          </div>
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
            {avatarMessage ? <p className="inline-info">{avatarMessage}</p> : null}
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
