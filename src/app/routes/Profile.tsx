import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import {
  formatRunnerArchetype,
  formatRunnerLevel,
  getRunnerArchetypeDescription
} from '../../domain/runnerProfile';
import {
  canUseModoForCurrentSession,
  getCurrentSessionUser,
  getSidebarStatsScopeLocal,
  getUserContactPreferencesLocal,
  getUserSubscriptionLocal,
  isModoEnabledLocal,
  isRemoteAuthEnabledLocal,
  listMarketingContactsLocal,
  deleteCurrentAccountLocal,
  signOutLocal,
  SidebarStatsScope,
  setSidebarStatsScopeLocal,
  updateAccountSecurityLocal,
  updateUserContactPreferencesLocal,
  updateProfileLocal
} from '../../backend/localAuth';
import { uploadCoachProgramAdmin } from '../../backend/coach';
import { getLastRemoteProgressSyncStatus, listRemoteUserProgress } from '../../backend/remoteProgress';
import { listRemoteAppStatesForAdmin } from '../../backend/remoteAppState';
import { RemoteUserProgressEntry } from '../../backend/types';
import { RunnerAssessmentSnapshot } from '../../types/models';

interface ProfileProps {
  runnerAssessment?: RunnerAssessmentSnapshot;
  shouldPromptRunnerAssessment?: boolean;
}

export default function Profile({ runnerAssessment, shouldPromptRunnerAssessment = false }: ProfileProps): JSX.Element {
  const navigate = useNavigate();
  const session = getCurrentSessionUser();
  const subscription = session ? getUserSubscriptionLocal(session.id) : null;
  const isModo = isModoEnabledLocal() && canUseModoForCurrentSession();
  const remoteAuthEnabled = isRemoteAuthEnabledLocal();
  const contactPrefs = session ? getUserContactPreferencesLocal(session.id) : { marketingOptIn: false };
  const [marketingOptIn, setMarketingOptIn] = useState(Boolean(contactPrefs.marketingOptIn));
  const [displayName, setDisplayName] = useState(session?.displayName ?? '');
  const [nextEmail, setNextEmail] = useState(session?.email ?? '');
  const [currentEmailConfirm, setCurrentEmailConfirm] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmNextPassword, setConfirmNextPassword] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [securityMessage, setSecurityMessage] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [sidebarMessage, setSidebarMessage] = useState('');
  const [adminMessage, setAdminMessage] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteReasonCategory, setDeleteReasonCategory] = useState('');
  const [deleteReasonOther, setDeleteReasonOther] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState('');
  const [progressRows, setProgressRows] = useState<RemoteUserProgressEntry[]>([]);
  const [progressLoading, setProgressLoading] = useState(false);
  const [lastSyncStatus, setLastSyncStatus] = useState(getLastRemoteProgressSyncStatus());
  const [coachProgramUserId, setCoachProgramUserId] = useState('');
  const [coachProgramWeek, setCoachProgramWeek] = useState('1');
  const [coachProgramFile, setCoachProgramFile] = useState<File | null>(null);
  const [coachProgramLoading, setCoachProgramLoading] = useState(false);
  const [coachProgramMessage, setCoachProgramMessage] = useState('');
  const [error, setError] = useState('');
  const [isIdentityEditing, setIsIdentityEditing] = useState(false);
  const [isSecurityEditing, setIsSecurityEditing] = useState(false);
  const [sidebarScope, setSidebarScope] = useState<SidebarStatsScope>(
    session ? getSidebarStatsScopeLocal(session.id) : 'WEEK'
  );

  const subscriptionLabelMap: Record<string, string> = {
    FREE_S1: 'Saison 1 Gratuite',
    PREMIUM: 'Premium',
    FOUNDER: 'Founder'
  };

  const marketingContacts = isModo ? listMarketingContactsLocal() : [];
  const consentingContacts = marketingContacts.filter((entry) => entry.marketingOptIn === true);

  const buildMarketingCsv = (): string => {
    const header = ['id', 'displayName', 'handle', 'email', 'consentEmail', 'consentAt'].join(',');
    const lines = marketingContacts.map((entry) =>
      [
        entry.id,
        `"${entry.displayName.replace(/"/g, '""')}"`,
        `@${entry.handle}`,
        entry.email,
        entry.marketingOptIn ? 'oui' : 'non',
        entry.marketingOptInAt ?? ''
      ].join(',')
    );
    return [header, ...lines].join('\n');
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

  const joinedAtLabel = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(
    new Date(session.createdAt)
  );
  const runnerLevelLabel = runnerAssessment ? formatRunnerLevel(runnerAssessment.result.level) : 'À déterminer';
  const runnerArchetypeLabel = runnerAssessment ? formatRunnerArchetype(runnerAssessment.result.archetype) : 'Inconnu';
  const maskEmail = (email: string): string => {
    const [localRaw, domainRaw] = email.trim().toLowerCase().split('@');
    if (!localRaw || !domainRaw) return '***@***.***';
    const domainParts = domainRaw.split('.');
    const ext = domainParts.length > 1 ? domainParts.pop() ?? '***' : '***';
    const domainMain = domainParts.join('.') || domainRaw;
    const maskPart = (input: string): string => {
      if (input.length <= 2) return `${input.charAt(0)}*`;
      if (input.length <= 4) return `${input.slice(0, 1)}${'*'.repeat(Math.max(1, input.length - 2))}${input.slice(-1)}`;
      return `${input.slice(0, 2)}${'*'.repeat(Math.max(2, input.length - 4))}${input.slice(-2)}`;
    };
    return `${maskPart(localRaw)}@${maskPart(domainMain)}.${ext}`;
  };

  const onSave = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError('');
    setProfileMessage('');
    const result = await updateProfileLocal(session.id, { displayName });
    if (result.error) {
      setError(result.error);
      return;
    }
    setDisplayName(result.user?.displayName ?? displayName);
    setProfileMessage(`Profil mis à jour. Nouveau handle: @${result.user?.handle ?? session.handle}`);
    setIsIdentityEditing(false);
  };

  const onSecuritySave = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError('');
    setSecurityMessage('');
    const nextEmailNormalized = nextEmail.trim().toLowerCase() || session.email;
    const wantsEmailChange = nextEmailNormalized !== session.email;
    if (wantsEmailChange && currentEmailConfirm.trim().toLowerCase() !== session.email.toLowerCase()) {
      setError("L'email actuel saisi ne correspond pas à ton compte.");
      return;
    }
    if (nextPassword && nextPassword !== confirmNextPassword) {
      setError('La confirmation du nouveau mot de passe ne correspond pas.');
      return;
    }

    const result = await updateAccountSecurityLocal({
      userId: session.id,
      currentPassword,
      nextEmail: nextEmailNormalized,
      nextPassword: nextPassword || undefined
    });
    if (result.error) {
      setError(result.error);
      return;
    }

    const updates: string[] = [];
    if (result.emailChanged) updates.push('email');
    if (result.passwordChanged) updates.push('mot de passe');
    setNextEmail('');
    setCurrentEmailConfirm('');
    setSecurityMessage(`Sécurité mise à jour (${updates.join(' + ')}).`);
    setCurrentPassword('');
    setNextPassword('');
    setConfirmNextPassword('');
    setIsSecurityEditing(false);
  };

  const onContactSave = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError('');
    setContactMessage('');
    const result = await updateUserContactPreferencesLocal(session.id, {
      marketingOptIn
    });
    if (result.error) {
      setError(result.error);
      return;
    }
    setContactMessage(
      marketingOptIn
        ? 'Préférences enregistrées. Tu recevras les informations NIVELR.'
        : 'Préférences enregistrées. Tu ne recevras pas de mails d’information.'
    );
  };

  const onSidebarSave = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setError('');
    setSidebarMessage('');
    const result = setSidebarStatsScopeLocal(session.id, sidebarScope);
    if (!result.ok) {
      setError(result.error ?? 'Enregistrement impossible.');
      return;
    }
    const label = sidebarScope === 'WEEK' ? 'hebdomadaire' : sidebarScope === 'MONTH' ? 'mensuelle' : 'totale';
    setSidebarMessage(`Vue sidebar enregistrée: ${label}.`);
  };

  const onDownloadMarketingCsv = (): void => {
    setAdminMessage('');
    const csv = buildMarketingCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'nivelr-contacts-email.csv';
    link.click();
    URL.revokeObjectURL(url);
    setAdminMessage('Export CSV téléchargé.');
  };

  const onCopyMarketingEmails = async (): Promise<void> => {
    setAdminMessage('');
    const emails = consentingContacts.map((entry) => entry.email).join(';');
    if (!emails) {
      setAdminMessage('Aucun email consentant à copier.');
      return;
    }
    try {
      await navigator.clipboard.writeText(emails);
      setAdminMessage(`${consentingContacts.length} emails consentants copiés.`);
    } catch {
      setAdminMessage('Copie impossible depuis ce navigateur.');
    }
  };

  const onLoadRemoteProgress = async (): Promise<void> => {
    setProgressLoading(true);
    setLastSyncStatus(getLastRemoteProgressSyncStatus());
    const result = await listRemoteUserProgress(500);
    setProgressRows(result.rows);
    setProgressLoading(false);
    setLastSyncStatus(getLastRemoteProgressSyncStatus());
    if (result.error) {
      setAdminMessage(`Lecture progression impossible: ${result.error}`);
      return;
    }
    setAdminMessage(
      result.rows.length
        ? `${result.rows.length} utilisateur(s) chargés depuis Supabase.`
        : 'Aucune donnée distante trouvée (table user_progress vide pour le moment).'
    );
  };

  const onExportCloudSafetyBackup = async (): Promise<void> => {
    setAdminMessage('');
    const result = await listRemoteAppStatesForAdmin(2000);
    if (result.error) {
      setAdminMessage(`Sauvegarde cloud impossible: ${result.error}`);
      return;
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      kind: 'remote_app_state_backup_v1',
      rows: result.rows
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nivelr-cloud-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setAdminMessage(`Sauvegarde cloud exportée (${result.rows.length} utilisateur(s)).`);
  };

  const onPublishCoachProgram = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError('');
    setCoachProgramMessage('');

    if (!coachProgramUserId.trim()) {
      setError('Renseigne l’UUID utilisateur.');
      return;
    }
    if (!coachProgramFile) {
      setError('Ajoute un PDF avant publication.');
      return;
    }

    setCoachProgramLoading(true);
    const result = await uploadCoachProgramAdmin({
      userId: coachProgramUserId.trim(),
      weekNumber: Number(coachProgramWeek),
      file: coachProgramFile
    });
    setCoachProgramLoading(false);

    if (!result.ok) {
      setError(result.error ?? 'Publication impossible.');
      return;
    }

    setCoachProgramMessage(`Programme semaine ${coachProgramWeek} publié pour ${coachProgramUserId.trim()}.`);
    setCoachProgramFile(null);
    const input = document.getElementById('coach-program-file') as HTMLInputElement | null;
    if (input) input.value = '';
  };

  const deleteReasonOptions = [
    { value: 'TOO_EXPENSIVE', label: "C'est trop cher" },
    { value: 'NOT_USEFUL', label: "Je n'en ai plus l'utilité" },
    { value: 'TOO_COMPLEX', label: "L'app est trop complexe" },
    { value: 'TECH_ISSUES', label: 'J’ai des problèmes techniques' },
    { value: 'MISSING_FEATURES', label: 'Fonctionnalités manquantes' },
    { value: 'OTHER', label: 'Autre' }
  ];

  const onDeleteAccount = async (): Promise<void> => {
    setError('');
    setDeleteMessage('');
    const category = deleteReasonCategory.trim();
    if (!category) {
      setDeleteMessage('Sélectionne un motif avant de confirmer.');
      return;
    }
    if (category === 'OTHER' && deleteReasonOther.trim().length < 4) {
      setDeleteMessage('Précise ton motif dans "Autre".');
      return;
    }

    const selected = deleteReasonOptions.find((item) => item.value === category);
    const label = selected?.label ?? category;
    const detail =
      category === 'OTHER' ? `Autre: ${deleteReasonOther.trim()}` : `${label}${deleteReasonOther.trim() ? ` — ${deleteReasonOther.trim()}` : ''}`;

    setDeleteLoading(true);
    const result = await deleteCurrentAccountLocal({
      reasonCategory: category,
      reasonDetail: detail
    });
    setDeleteLoading(false);
    if (!result.ok) {
      setDeleteMessage(result.error ?? 'Suppression impossible pour le moment.');
      return;
    }
    setDeleteModalOpen(false);
    navigate('/explications');
  };

  return (
    <section className="page profile-page">
      <h1>Profil</h1>
      <p className="page-subtitle">Ton espace compte, préférences et sécurité.</p>

      <article className="card premium-section profile-hero-card">
        <div className="profile-hero-main">
          <div className="profile-hero-identity">
            <div className="profile-avatar-preview is-large">
              <span>{(session.displayName || '?').trim().charAt(0).toUpperCase()}</span>
            </div>
            <div className="profile-hero-copy">
              <h2>{session.displayName}</h2>
              <p>@{session.handle}</p>
              <small>{session.email}</small>
            </div>
          </div>
          <div className="profile-hero-meta">
            <span className="profile-meta-pill">
              Offre: {subscription ? subscriptionLabelMap[subscription.plan] : 'Inconnue'}
            </span>
            <span className={`profile-meta-pill ${subscription?.status === 'ACTIVE' ? 'is-active' : ''}`}>
              Statut: {subscription?.status === 'ACTIVE' ? 'Actif' : 'Inactif'}
            </span>
          </div>
        </div>
        <div className="profile-hero-snapshot">
          <article className="profile-snapshot-item">
            <p>Membre depuis</p>
            <strong>{joinedAtLabel}</strong>
          </article>
          <article className="profile-snapshot-item">
            <p>Niveau coureur</p>
            <strong>{runnerLevelLabel}</strong>
          </article>
          <article className="profile-snapshot-item">
            <p>Archetype</p>
            <strong>{runnerArchetypeLabel}</strong>
          </article>
        </div>

        <div className="profile-runner-summary">
          <h3>Profil coureur</h3>
          {runnerAssessment ? (
            <>
              <p className="profile-runner-headline">
                <strong>{formatRunnerArchetype(runnerAssessment.result.archetype)}</strong> · Niveau{' '}
                <strong>{formatRunnerLevel(runnerAssessment.result.level)}</strong>
              </p>
              <p className="profile-runner-explainer">{getRunnerArchetypeDescription(runnerAssessment.result.archetype)}</p>
              <p className="profile-runner-caution">{runnerAssessment.result.caution}</p>
              {shouldPromptRunnerAssessment ? (
                <p className="inline-info">Un nouveau test est recommandé (plus de 30 jours).</p>
              ) : null}
            </>
          ) : (
            <p className="page-subtitle">Questionnaire profil coureur non complété.</p>
          )}
        </div>

        <div className="profile-quick-actions">
          <Link to="/profil-coureur" className="btn-compact">
            Faire / refaire le test
          </Link>
          <Link to="/abonnement" className="btn-compact">
            Voir abonnement
          </Link>
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
        </div>
      </article>

      <div className="list profile-grid profile-grid-premium">
        <article className="card premium-section profile-card">
          <h2>Identité</h2>
          <div className="profile-readonly">
            <div className="profile-readonly-row">
              <span>Nom affiché</span>
              <strong>{session.displayName || 'Ton nom'}</strong>
            </div>
            <div className="profile-readonly-row">
              <span>Handle</span>
              <strong>@{session.handle || 'ton_handle'}</strong>
            </div>
          </div>
          <div className="goal-actions">
            <button
              type="button"
              className="btn-compact profile-edit-toggle"
              onClick={() => {
                setError('');
                setProfileMessage('');
                setDisplayName(session.displayName);
                setIsIdentityEditing((prev) => !prev);
              }}
            >
              {isIdentityEditing ? "Fermer l'édition" : "Modifier l'identité"}
            </button>
          </div>
          {isIdentityEditing ? (
            <form className="form auth-form profile-edit-panel" onSubmit={onSave}>
              <label>
                Nom affiché
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
              </label>
              {profileMessage ? <p className="inline-info">{profileMessage}</p> : null}
              {error ? <p className="error pseudo-error-note">{error}</p> : null}
              <div className="goal-actions">
                <button
                  type="button"
                  className="btn-compact"
                  onClick={() => {
                    setIsIdentityEditing(false);
                    setDisplayName(session.displayName);
                    setError('');
                  }}
                >
                  Annuler
                </button>
                <button type="submit">Enregistrer l'identité</button>
              </div>
            </form>
          ) : null}
        </article>

        <article className="card premium-section profile-card">
          <h2>Sécurité du compte</h2>
          <div className="profile-readonly">
            <div className="profile-readonly-row">
              <span>Email</span>
              <strong>{maskEmail(session.email)}</strong>
            </div>
            <div className="profile-readonly-row">
              <span>Mot de passe</span>
              <strong>************</strong>
            </div>
          </div>
          <div className="goal-actions">
            <button
              type="button"
              className="btn-compact profile-edit-toggle"
              onClick={() => {
                setError('');
                setSecurityMessage('');
                setCurrentPassword('');
                setNextPassword('');
                setConfirmNextPassword('');
                setNextEmail('');
                setCurrentEmailConfirm('');
                setIsSecurityEditing((prev) => !prev);
              }}
            >
              {isSecurityEditing
                ? "Fermer l'édition"
                : 'Modifier les informations de sécurité personnelle'}
            </button>
          </div>
          {isSecurityEditing ? (
            <form className="form auth-form profile-edit-panel" onSubmit={onSecuritySave}>
              <label>
                Email du compte (masqué)
                <input type="text" value={maskEmail(session.email)} disabled />
              </label>
              <label>
                Confirme ton email actuel
                <input
                  type="email"
                  value={currentEmailConfirm}
                  onChange={(e) => setCurrentEmailConfirm(e.target.value)}
                  placeholder="Saisis ton email actuel"
                />
              </label>
              <label>
                Nouvel email (optionnel)
                <input
                  type="email"
                  value={nextEmail}
                  onChange={(e) => setNextEmail(e.target.value)}
                  placeholder="Laisse vide pour conserver l’email actuel"
                />
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
              <div className="goal-actions">
                <button
                  type="button"
                  className="btn-compact"
                  onClick={() => {
                    setIsSecurityEditing(false);
                    setCurrentPassword('');
                    setNextPassword('');
                    setConfirmNextPassword('');
                    setNextEmail('');
                    setCurrentEmailConfirm('');
                    setError('');
                  }}
                >
                  Annuler
                </button>
                <button type="submit">Mettre à jour la sécurité</button>
              </div>
            </form>
          ) : null}
        </article>

        <article className="card premium-section profile-card">
          <h2>Communication</h2>
          <form className="form auth-form" onSubmit={onContactSave}>
            <label className="auth-checkbox-row">
              <input
                type="checkbox"
                checked={marketingOptIn}
                onChange={(event) => setMarketingOptIn(event.target.checked)}
              />
              <span>
                J&apos;accepte de recevoir des emails NIVELR (infos produit, lancement de saison, nouveautés).
              </span>
            </label>
            <p className="page-subtitle">Tu peux modifier ce choix à tout moment.</p>
            {contactMessage ? <p className="inline-info">{contactMessage}</p> : null}
            {error ? <p className="error">{error}</p> : null}
            <button type="submit">Enregistrer les préférences email</button>
          </form>
        </article>

        <article className="card premium-section profile-card">
          <h2>Affichage sidebar</h2>
          <form className="form auth-form" onSubmit={onSidebarSave}>
            <label>
              Résumé d’activité
              <select
                value={sidebarScope}
                onChange={(event) => setSidebarScope(event.target.value as SidebarStatsScope)}
              >
                <option value="WEEK">Hebdomadaire</option>
                <option value="MONTH">Mensuelle</option>
                <option value="TOTAL">Totale</option>
              </select>
            </label>
            {sidebarMessage ? <p className="inline-info">{sidebarMessage}</p> : null}
            {error ? <p className="error">{error}</p> : null}
            <button type="submit">Enregistrer l’affichage</button>
          </form>
        </article>

        {isModo ? (
          <article className="card premium-section profile-card profile-card-modo">
            <h2>Espace modérateur · contacts email</h2>
            <p className="page-subtitle">
              Liste locale des utilisateurs de cet appareil avec statut de consentement email.
            </p>
            <p>
              Contacts consentants: <strong>{consentingContacts.length}</strong> / {marketingContacts.length}
            </p>
            <div className="goal-actions">
              <button type="button" onClick={onDownloadMarketingCsv}>
                Export CSV (statut consentement)
              </button>
              <button type="button" className="btn-compact" onClick={onCopyMarketingEmails}>
                Copier les emails
              </button>
              {remoteAuthEnabled ? (
                <button type="button" className="btn-compact" onClick={() => void onExportCloudSafetyBackup()}>
                  Sauvegarde cloud (JSON)
                </button>
              ) : null}
            </div>
            {adminMessage ? <p className="inline-info">{adminMessage}</p> : null}
            {remoteAuthEnabled ? (
              <>
                <form className="form auth-form" onSubmit={(event) => void onPublishCoachProgram(event)}>
                  <h3>Publier un programme coach</h3>
                  <p className="page-subtitle">
                    Upload du PDF + publication en base automatique. Plus besoin de SQL manuel.
                  </p>
                  <label>
                    UUID utilisateur
                    <input
                      type="text"
                      value={coachProgramUserId}
                      onChange={(event) => setCoachProgramUserId(event.target.value)}
                      placeholder="Ex: 759f4c42-a555-4a38-a4c2-8a21cceabdd6"
                      disabled={coachProgramLoading}
                    />
                  </label>
                  <label>
                    Semaine
                    <select
                      value={coachProgramWeek}
                      onChange={(event) => setCoachProgramWeek(event.target.value)}
                      disabled={coachProgramLoading}
                    >
                      {Array.from({ length: 12 }, (_, index) => String(index + 1)).map((week) => (
                        <option key={week} value={week}>
                          Semaine {week}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    PDF du programme
                    <input
                      id="coach-program-file"
                      type="file"
                      accept="application/pdf,.pdf"
                      onChange={(event) => setCoachProgramFile(event.target.files?.[0] ?? null)}
                      disabled={coachProgramLoading}
                    />
                  </label>
                  {coachProgramMessage ? <p className="inline-info">{coachProgramMessage}</p> : null}
                  {error ? <p className="error">{error}</p> : null}
                  <button type="submit" disabled={coachProgramLoading}>
                    {coachProgramLoading ? 'Publication...' : 'Publier le programme'}
                  </button>
                </form>

                <div className="goal-actions">
                  <button type="button" onClick={() => void onLoadRemoteProgress()}>
                    Charger progression utilisateurs
                  </button>
                </div>
                {progressLoading ? <p className="page-subtitle">Chargement...</p> : null}
                <p className="page-subtitle">Dernier statut de synchro cloud: {lastSyncStatus}</p>
                {progressRows.length ? (
                  <div className="table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Pseudo</th>
                          <th>Email</th>
                          <th>Niveau</th>
                          <th>XP total</th>
                          <th>Mise à jour</th>
                        </tr>
                      </thead>
                      <tbody>
                        {progressRows.map((row) => (
                          <tr key={row.userId}>
                            <td>
                              {row.displayName} (@{row.handle})
                            </td>
                            <td>{row.email}</td>
                            <td>{row.level}</td>
                            <td>{row.xpTotal}</td>
                            <td>{new Date(row.updatedAt).toLocaleString('fr-FR')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </>
            ) : null}
          </article>
        ) : null}

      </div>

      <div className="profile-delete-zone">
        <button
          type="button"
          className="profile-delete-btn"
          onClick={() => {
            setDeleteReasonCategory('');
            setDeleteReasonOther('');
            setDeleteMessage('');
            setDeleteModalOpen(true);
          }}
        >
          Supprimer mon compte
        </button>
      </div>

      {deleteModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setDeleteModalOpen(false)}>
          <article className="card session-modal style-confirm-modal profile-delete-modal" onClick={(event) => event.stopPropagation()}>
            <h2>Supprimer définitivement le compte ?</h2>
            <p>
              Cette action est irréversible. Avant suppression, indique la raison de ton départ pour améliorer NIVELR.
            </p>
            <label>
              Raison principale
              <select
                value={deleteReasonCategory}
                onChange={(event) => setDeleteReasonCategory(event.target.value)}
                disabled={deleteLoading}
              >
                <option value="">Choisir une raison</option>
                {deleteReasonOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {deleteReasonCategory === 'OTHER' ? (
              <label>
                Autre
                <textarea
                  value={deleteReasonOther}
                  onChange={(event) => setDeleteReasonOther(event.target.value)}
                  placeholder="Précise la raison..."
                  rows={4}
                  disabled={deleteLoading}
                />
              </label>
            ) : null}
            {deleteMessage ? <p className="error">{deleteMessage}</p> : null}
            <div className="modal-actions">
              <button type="button" onClick={() => setDeleteModalOpen(false)} disabled={deleteLoading}>
                Annuler
              </button>
              <button type="button" className="danger" onClick={() => void onDeleteAccount()} disabled={deleteLoading}>
                {deleteLoading ? 'Suppression...' : 'Confirmer la suppression'}
              </button>
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}
