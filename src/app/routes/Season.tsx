import { CSSProperties, useEffect, useMemo, useState } from 'react';
import { getAscensionTeamOverview } from '../../gamification/ascension';
import { AscensionRole, AscensionStatKey, GamificationState } from '../../gamification/types';
import {
  getCurrentSessionUser,
  listContactRequestsForUser,
  listLocalUsers,
  listTeamInvitesForUser,
  respondTeamInviteLocal,
  sendTeamInviteLocal
} from '../../backend/localAuth';
import seasonAmbiance from '../../assets/season-ambiance.jpg';

interface SeasonProps {
  gamificationState: GamificationState;
  onSetRole: (role: AscensionRole) => void;
  onSetStats: (stats: Record<AscensionStatKey, number>) => void;
  onCreateTeam: (teamName: string, memberNames: string[]) => void;
  onJoinByCode: (inviteCode: string) => void;
  onLeaveTeam: () => void;
}

const ROLE_OPTIONS: Array<{ id: AscensionRole; label: string; desc: string }> = [
  { id: 'PERFORMEUR', label: 'Performeur', desc: '+20% PA sur séances RPE >= 7' },
  { id: 'PILIER', label: 'Pilier', desc: '+10% PA global +10 PA si semaine active' },
  { id: 'EXPLORATEUR', label: 'Explorateur', desc: '+20% PA si 3 types dans la semaine' },
  { id: 'STRATEGE', label: 'Stratège', desc: '+15% PA si semaine équilibrée' },
  { id: 'MENTOR', label: 'Mentor', desc: '+10% PA si défi mensuel actif (+collectif jalon)' }
];

const STAT_LABELS: Record<AscensionStatKey, string> = {
  ENDURANCE: 'Endurance',
  INTENSITE: 'Intensité',
  REGULARITE: 'Régularité',
  MAITRISE: 'Maîtrise',
  EXPLORATION: 'Exploration'
};

interface BuildPreset {
  id: 'DEBUTANT' | 'REGULARITE' | 'PERFORMANCE' | 'EQUILIBRE';
  label: string;
  audience: string;
  summary: string;
  role: AscensionRole;
  stats: Record<AscensionStatKey, number>;
}

const BUILD_PRESETS: BuildPreset[] = [
  {
    id: 'DEBUTANT',
    label: 'Pack Débutant',
    audience: 'Novice',
    summary: 'Simple et sécurisant: priorité à la régularité et à l’endurance.',
    role: 'PILIER',
    stats: { ENDURANCE: 10, INTENSITE: 2, REGULARITE: 10, MAITRISE: 4, EXPLORATION: 4 }
  },
  {
    id: 'REGULARITE',
    label: 'Pack Régularité',
    audience: 'Intermédiaire',
    summary: 'Stabilise tes semaines actives et ta progression durable.',
    role: 'STRATEGE',
    stats: { ENDURANCE: 6, INTENSITE: 4, REGULARITE: 10, MAITRISE: 7, EXPLORATION: 3 }
  },
  {
    id: 'PERFORMANCE',
    label: 'Pack Performance',
    audience: 'Ambitieux',
    summary: 'Accent sur les séances intenses et la montée en niveau.',
    role: 'PERFORMEUR',
    stats: { ENDURANCE: 4, INTENSITE: 12, REGULARITE: 6, MAITRISE: 5, EXPLORATION: 3 }
  },
  {
    id: 'EQUILIBRE',
    label: 'Pack Équilibré',
    audience: 'Polyvalent',
    summary: 'Un build complet pour varier tes séances sans te bloquer.',
    role: 'EXPLORATEUR',
    stats: { ENDURANCE: 6, INTENSITE: 6, REGULARITE: 6, MAITRISE: 6, EXPLORATION: 6 }
  }
];

function isSameStats(
  a: Record<AscensionStatKey, number>,
  b: Record<AscensionStatKey, number>
): boolean {
  return (
    a.ENDURANCE === b.ENDURANCE &&
    a.INTENSITE === b.INTENSITE &&
    a.REGULARITE === b.REGULARITE &&
    a.MAITRISE === b.MAITRISE &&
    a.EXPLORATION === b.EXPLORATION
  );
}

function fitStatsToBudget(
  stats: Record<AscensionStatKey, number>,
  budget: number
): Record<AscensionStatKey, number> {
  const keys: AscensionStatKey[] = ['ENDURANCE', 'INTENSITE', 'REGULARITE', 'MAITRISE', 'EXPLORATION'];
  const safeBudget = Math.max(0, Math.floor(budget));
  const next: Record<AscensionStatKey, number> = {
    ENDURANCE: Math.max(0, Math.min(25, Math.floor(stats.ENDURANCE || 0))),
    INTENSITE: Math.max(0, Math.min(25, Math.floor(stats.INTENSITE || 0))),
    REGULARITE: Math.max(0, Math.min(25, Math.floor(stats.REGULARITE || 0))),
    MAITRISE: Math.max(0, Math.min(25, Math.floor(stats.MAITRISE || 0))),
    EXPLORATION: Math.max(0, Math.min(25, Math.floor(stats.EXPLORATION || 0)))
  };
  let total = keys.reduce((sum, key) => sum + next[key], 0);
  if (total <= safeBudget) return next;

  while (total > safeBudget) {
    const key = keys.reduce((best, current) => (next[current] > next[best] ? current : best), keys[0]);
    if (next[key] <= 0) break;
    next[key] -= 1;
    total -= 1;
  }
  return next;
}

export default function Season({
  gamificationState,
  onSetRole,
  onSetStats,
  onCreateTeam,
  onJoinByCode,
  onLeaveTeam
}: SeasonProps): JSX.Element {
  const season =
    gamificationState.ascension.seasons.find(
      (s) => s.id === gamificationState.ascension.currentSeasonId
    ) ?? null;
  const teamOverview = useMemo(() => getAscensionTeamOverview(gamificationState), [gamificationState]);
  const myBuild = gamificationState.ascension.userBuilds.find(
    (b) => b.userId === gamificationState.userId && b.seasonId === gamificationState.ascension.currentSeasonId
  );
  const [teamName, setTeamName] = useState('');
  const [member1, setMember1] = useState('');
  const [member2, setMember2] = useState('');
  const [member3, setMember3] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [buildMode, setBuildMode] = useState<'GUIDE' | 'EXPERT'>('GUIDE');
  const [mainView, setMainView] = useState<'TEAM' | 'BUILD'>('TEAM');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [nowTs, setNowTs] = useState<number>(() => Date.now());
  const [showCountdownModal, setShowCountdownModal] = useState<boolean>(true);
  const [socialMessage, setSocialMessage] = useState('');
  const [socialError, setSocialError] = useState('');
  const [socialRefreshTick, setSocialRefreshTick] = useState(0);
  const [draftStats, setDraftStats] = useState<Record<AscensionStatKey, number>>(
    myBuild?.stats ?? { ENDURANCE: 0, INTENSITE: 0, REGULARITE: 0, MAITRISE: 0, EXPLORATION: 0 }
  );
  const session = getCurrentSessionUser();
  const usersCatalog = useMemo(() => listLocalUsers(), [socialRefreshTick]);
  const userIdentityById = useMemo(
    () =>
      new Map(
        usersCatalog.map((user) => [
          user.id,
          { displayName: user.displayName, handle: user.handle }
        ])
      ),
    [usersCatalog]
  );
  const contacts = session ? listContactRequestsForUser(session.id) : { incoming: [], outgoing: [] };
  const friends = useMemo(() => {
    if (!session) return [] as string[];
    const accepted = [...contacts.incoming, ...contacts.outgoing].filter((item) => item.status === 'ACCEPTED');
    const ids = new Set<string>();
    for (const item of accepted) {
      if (item.requesterUserId === session.id) ids.add(item.targetUserId);
      if (item.targetUserId === session.id) ids.add(item.requesterUserId);
    }
    return Array.from(ids);
  }, [contacts.incoming, contacts.outgoing, session]);
  const teamInvites = session
    ? listTeamInvitesForUser(session.id)
    : { incoming: [], outgoing: [] };

  useEffect(() => {
    const id = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const weekOneOpen = useMemo(() => {
    if (!season) return false;
    const start = new Date(season.startDate).getTime();
    const weekOneEnd = new Date(start + 6 * 24 * 60 * 60 * 1000).getTime();
    return nowTs >= start && nowTs <= weekOneEnd;
  }, [nowTs, season]);
  const seasonNotStarted = useMemo(() => {
    if (!season) return false;
    return nowTs < new Date(season.startDate).getTime();
  }, [nowTs, season]);
  const seasonCountdown = useMemo(() => {
    if (!seasonNotStarted || !season) return null;
    const diffMs = Math.max(0, new Date(season.startDate).getTime() - nowTs);
    const totalSeconds = Math.floor(diffMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return { days, hours, minutes, seconds };
  }, [nowTs, season, seasonNotStarted]);
  const seasonStartDateLabel = season
    ? new Date(season.startDate).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
    : '';

  const pointsUsed = Object.values(draftStats).reduce((sum, value) => sum + value, 0);
  const pointsBudget = Math.min(30, Math.max(0, (gamificationState.userLevel.level - 15) * 2));
  const activePresetId =
    myBuild?.role && myBuild?.stats
      ? BUILD_PRESETS.find((preset) => preset.role === myBuild.role && isSameStats(preset.stats, myBuild.stats))
          ?.id ?? null
      : null;
  const camps = [25, 50, 75, 100];
  const objectivePa = season?.objectivePa ?? null;
  const totalPa = teamOverview.totalPa;
  const progressRatio = objectivePa && objectivePa > 0 ? Math.min(1, totalPa / objectivePa) : 0;
  const progressPct = Math.round(progressRatio * 100);
  const nextCamp = camps.find((camp) => !season?.milestoneReached.includes(camp)) ?? null;
  const campThresholds = objectivePa
    ? camps.map((camp) => ({
        camp,
        pa: Math.round((objectivePa * camp) / 100)
      }))
    : null;
  const teamChangeLocked = !seasonNotStarted;
  const hasTeam = Boolean(teamOverview.team);
  const hasRole = Boolean(myBuild?.role);
  const formatUserIdentity = (userId: string): string => {
    const user = userIdentityById.get(userId);
    if (!user) return 'Utilisateur inconnu';
    return `${user.displayName} (@${user.handle})`;
  };
  const outgoingPendingByInvitedUserId = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const invite of teamInvites.outgoing) {
      if (
        invite.status === 'PENDING' &&
        invite.seasonId === gamificationState.ascension.currentSeasonId &&
        (!teamOverview.team || invite.teamId === teamOverview.team.id)
      ) {
        map.set(invite.invitedUserId, true);
      }
    }
    return map;
  }, [
    teamInvites.outgoing,
    gamificationState.ascension.currentSeasonId,
    teamOverview.team
  ]);
  const activeMemberNames = useMemo(() => {
    const names = new Set<string>();
    for (const member of teamOverview.members) {
      names.add(member.name.trim().toLowerCase());
    }
    return names;
  }, [teamOverview.members]);
  const onInviteFriend = (friendUserId: string): void => {
    if (!session || !teamOverview.team) return;
    const invite = sendTeamInviteLocal({
      seasonId: gamificationState.ascension.currentSeasonId,
      teamId: teamOverview.team.id,
      teamName: teamOverview.team.name,
      inviteCode: teamOverview.team.inviteCode,
      inviterUserId: session.id,
      invitedUserId: friendUserId
    });
    if (!invite.ok) {
      setSocialError(invite.error ?? 'Invitation impossible.');
      return;
    }
    setSocialError('');
    setSocialMessage('Invitation équipe envoyée.');
    setSocialRefreshTick((value) => value + 1);
  };
  const onAcceptTeamInvite = (inviteId: string, inviteCode: string): void => {
    if (!session) return;
    onJoinByCode(inviteCode);
    const result = respondTeamInviteLocal(inviteId, session.id, 'ACCEPTED');
    if (!result.ok) {
      setSocialError(result.error ?? 'Validation invitation impossible.');
      return;
    }
    setSocialError('');
    setSocialMessage('Invitation acceptée.');
    setSocialRefreshTick((value) => value + 1);
  };
  const onDeclineTeamInvite = (inviteId: string): void => {
    if (!session) return;
    const result = respondTeamInviteLocal(inviteId, session.id, 'DECLINED');
    if (!result.ok) {
      setSocialError(result.error ?? 'Refus invitation impossible.');
      return;
    }
    setSocialError('');
    setSocialMessage('Invitation refusée.');
    setSocialRefreshTick((value) => value + 1);
  };
  const endDateLabel = season
    ? new Date(season.endDate).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
    : '';

  return (
    <section
      className="page season-page"
      style={{ '--season-shared-image': `url(${seasonAmbiance})` } as CSSProperties}
    >
      {seasonCountdown && showCountdownModal ? (
        <div className="season-countdown-modal-backdrop" role="dialog" aria-modal="true">
          <article className="season-countdown-modal">
            <p className="season-kicker">Saison 1 - Ascension</p>
            <h2>Le sommet approche</h2>
            <p>Départ officiel le {seasonStartDateLabel}. Prépare ton équipe avant le lancement.</p>
            <div className="season-countdown-grid season-countdown-grid-modal">
              <div>
                <strong>{seasonCountdown.days}</strong>
                <span>Jours</span>
              </div>
              <div>
                <strong>{String(seasonCountdown.hours).padStart(2, '0')}</strong>
                <span>Heures</span>
              </div>
              <div>
                <strong>{String(seasonCountdown.minutes).padStart(2, '0')}</strong>
                <span>Min</span>
              </div>
              <div>
                <strong>{String(seasonCountdown.seconds).padStart(2, '0')}</strong>
                <span>Sec</span>
              </div>
            </div>
            <div className="season-countdown-modal-actions">
              <button type="button" onClick={() => setShowCountdownModal(false)}>
                Continuer
              </button>
            </div>
          </article>
        </div>
      ) : null}

      <div className="season-page-head">
        <h1>Saison</h1>
        {seasonCountdown ? (
          <button type="button" className="season-mini-countdown" onClick={() => setShowCountdownModal(true)}>
            <span>Départ S1</span>
            <strong>
              {seasonCountdown.days}j {String(seasonCountdown.hours).padStart(2, '0')}h{' '}
              {String(seasonCountdown.minutes).padStart(2, '0')}m
            </strong>
          </button>
        ) : null}
      </div>
      <p className="page-subtitle">
        Une seule mission: faire progresser ton équipe vers le sommet.
      </p>

      <article
        className="card premium-section season-hero-card"
      >
        <div className="season-hero-head">
          <div>
            <p className="season-kicker">Expédition collective</p>
            <h2>{season?.name ?? 'Saison Ascension'}</h2>
            <p className="season-hero-copy">Chaque séance validée fait monter vos PA d&apos;équipe.</p>
          </div>
          <div className="season-hero-badges">
            <article className="season-hero-meta-card">
              <small>Deadline</small>
              <strong>{endDateLabel}</strong>
            </article>
            <article className="season-hero-meta-card">
              <small>Durée</small>
              <strong>4 semaines</strong>
            </article>
          </div>
        </div>

        <div className="season-progress-wrap">
          <div className="season-progress-meta">
            <strong>{Math.round(totalPa)} PA</strong>
            <span>
              {objectivePa ? `Objectif ${Math.round(objectivePa)} PA` : 'Objectif en calibration (S1)'}
            </span>
          </div>
          <div className="season-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPct}>
            <div className="season-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="season-progress-foot">
            <span>Camps atteints: {season?.milestoneReached.length ? season.milestoneReached.map((m) => `${m}%`).join(' · ') : 'Aucun'}</span>
            <span>{nextCamp ? `Prochain camp: ${nextCamp}%` : 'Sommet atteint'}</span>
          </div>
        </div>

      </article>

      <div className="season-main-switch">
        <button
          type="button"
          className={mainView === 'TEAM' ? 'is-active' : ''}
          onClick={() => setMainView('TEAM')}
        >
          Equipe
        </button>
        <button
          type="button"
          className={mainView === 'BUILD' ? 'is-active' : ''}
          onClick={() => setMainView('BUILD')}
        >
          Build
        </button>
      </div>

      <div className="season-main-grid">
      {mainView === 'TEAM' ? (
      <article className="card premium-section season-team-card">
        <h2>Équipe</h2>
        {teamOverview.team ? (
          <>
            <div className="season-team-summary">
              <p>
                Team: <strong>{teamOverview.team.name}</strong>
              </p>
              <p>
                Bonus collectif permanent: <strong>{teamOverview.teamBonusPct}%</strong>
              </p>
              <p>
                PA cumulés: <strong>{Math.round(teamOverview.totalPa)}</strong>
              </p>
            </div>
            <div className="season-invite-box">
              <p>Code d&apos;invitation équipe</p>
              <div>
                <strong>{teamOverview.team.inviteCode}</strong>
                <button
                  type="button"
                  onClick={() => {
                    if (typeof navigator !== 'undefined' && navigator.clipboard) {
                      navigator.clipboard.writeText(teamOverview.team?.inviteCode ?? '');
                    }
                  }}
                >
                  Copier
                </button>
              </div>
            </div>

            <div className="season-member-list">
              {teamOverview.members.map((member) => (
                <article
                  key={member.id}
                  className={`season-member-card ${selectedMemberId === member.id ? 'is-selected' : ''}`}
                  onClick={() =>
                    setSelectedMemberId((current) => (current === member.id ? null : member.id))
                  }
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedMemberId((current) => (current === member.id ? null : member.id));
                    }
                  }}
                >
                  <div className="season-member-head">
                    <p>
                      <strong>{member.name}</strong>
                    </p>
                    <span>{member.role ?? 'Rôle non défini'}</span>
                  </div>
                  <p className="season-member-meta">
                    Contribution {member.contributionPct}% · {Math.round(member.totalPa)} PA
                  </p>
                  {selectedMemberId === member.id ? (
                    <div className="season-member-inline-detail">
                      <p>
                        Rôle: <strong>{member.role ?? 'Non défini'}</strong>
                      </p>
                      <p>
                        PA gagnés: <strong>{Math.round(member.totalPa)}</strong> · Contribution:{' '}
                        <strong>{member.contributionPct}%</strong>
                      </p>
                      <p>
                        Points investis:{' '}
                        <strong>
                          {(Object.keys(member.stats) as AscensionStatKey[]).reduce(
                            (sum, key) => sum + member.stats[key],
                            0
                          )}
                        </strong>
                      </p>
                      <div className="season-stat-bars">
                        {(Object.keys(member.stats) as AscensionStatKey[]).map((key) => (
                          <div key={key}>
                            <span>
                              {STAT_LABELS[key]}: {member.stats[key]}
                            </span>
                            <div className="season-stat-bar-track">
                              <div
                                className="season-stat-bar-fill"
                                style={{ width: `${Math.min(100, member.stats[key] * 4)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>

            <div className="goal-actions season-team-actions">
              <button type="button" onClick={onLeaveTeam} disabled={teamChangeLocked}>
                Quitter l&apos;équipe
              </button>
            </div>
            <article className="season-friends-invite">
              <h3>Inviter un ami</h3>
              {friends.length === 0 ? (
                <p>Ajoute d&apos;abord des amis dans la page Communauté.</p>
              ) : (
                <div className="season-friends-list">
                  {friends.map((friendId) => (
                    <div key={friendId} className="season-friend-row">
                      <span>{formatUserIdentity(friendId)}</span>
                      <div className="season-friend-actions">
                        {activeMemberNames.has(
                          (userIdentityById.get(friendId)?.displayName ?? '').trim().toLowerCase()
                        ) ? (
                          <small className="season-friend-badge is-member">Déjà dans ton équipe</small>
                        ) : null}
                        {outgoingPendingByInvitedUserId.get(friendId) ? (
                          <small className="season-friend-badge">Invitation envoyée</small>
                        ) : null}
                        <button
                          type="button"
                          disabled={
                            teamChangeLocked ||
                            activeMemberNames.has(
                              (userIdentityById.get(friendId)?.displayName ?? '').trim().toLowerCase()
                            ) ||
                            Boolean(outgoingPendingByInvitedUserId.get(friendId))
                          }
                          onClick={() => onInviteFriend(friendId)}
                        >
                          Inviter
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {socialError ? <p className="error">{socialError}</p> : null}
              {socialMessage ? <p className="inline-info">{socialMessage}</p> : null}
            </article>
            {teamChangeLocked ? (
              <p className="season-team-lock">
                La saison a démarré: la composition d&apos;équipe est maintenant verrouillée.
              </p>
            ) : null}
          </>
        ) : (
          <>
            <p className="season-no-team-copy">
              Crée ton équipe en solo ou avec des coéquipiers (jusqu&apos;à 4 membres au total).
            </p>
            <div className="season-join-box">
              <p>Tu as déjà un code d&apos;invitation ?</p>
              <div>
                <input
                  value={joinCode}
                  onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                  placeholder="Ex: ASC-7KQ2"
                />
                <button
                  type="button"
                  disabled={teamChangeLocked || !joinCode.trim()}
                  onClick={() => onJoinByCode(joinCode)}
                >
                  Rejoindre
                </button>
              </div>
            </div>
            <article className="season-friends-invite">
              <h3>Invitations d&apos;équipe reçues</h3>
              {teamInvites.incoming.filter((invite) => invite.status === 'PENDING').length === 0 ? (
                <p>Aucune invitation en attente.</p>
              ) : (
                <div className="season-friends-list">
                  {teamInvites.incoming
                    .filter((invite) => invite.status === 'PENDING')
                    .map((invite) => (
                      <div key={invite.id} className="season-friend-row">
                        <span>
                          {invite.teamName} · par {formatUserIdentity(invite.inviterUserId)}
                        </span>
                        <div className="goal-actions">
                          <button type="button" disabled={teamChangeLocked} onClick={() => onAcceptTeamInvite(invite.id, invite.inviteCode)}>
                            Rejoindre
                          </button>
                          <button type="button" disabled={teamChangeLocked} onClick={() => onDeclineTeamInvite(invite.id)}>
                            Refuser
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
              {socialError ? <p className="error">{socialError}</p> : null}
              {socialMessage ? <p className="inline-info">{socialMessage}</p> : null}
            </article>
            {teamChangeLocked ? (
              <p className="season-team-lock">
                La saison a démarré: création et changement d&apos;équipe sont verrouillés.
              </p>
            ) : null}
            <div className="season-team-form">
              <label>
                Nom équipe
                <input value={teamName} onChange={(event) => setTeamName(event.target.value)} />
              </label>
              <label>
                Coéquipier 1 (optionnel)
                <input
                  placeholder="Ex: Alex"
                  value={member1}
                  onChange={(event) => setMember1(event.target.value)}
                />
              </label>
              <label>
                Coéquipier 2 (optionnel)
                <input
                  placeholder="Ex: Sam"
                  value={member2}
                  onChange={(event) => setMember2(event.target.value)}
                />
              </label>
              <label>
                Coéquipier 3 (optionnel)
                <input
                  placeholder="Ex: Chris"
                  value={member3}
                  onChange={(event) => setMember3(event.target.value)}
                />
              </label>
            </div>
            <p className="season-team-hint">
              Tu peux valider sans renseigner de coéquipier pour démarrer immédiatement.
            </p>
            <div className="goal-actions season-team-actions">
              <button
                type="button"
                disabled={teamChangeLocked}
                onClick={() => onCreateTeam(teamName, [member1, member2, member3])}
              >
                Créer l&apos;équipe
              </button>
            </div>
          </>
        )}
      </article>
      ) : null}

      {mainView === 'BUILD' ? (
      <article className="card premium-section season-build-card">
        <h2>Build saisonnier</h2>
        <p className="page-subtitle season-build-state">
          {weekOneOpen
            ? `Semaine 1 active: rôle et stats modifiables (${pointsUsed}/${pointsBudget} points).`
            : 'Semaine 1 terminée: build verrouillé pour la saison.'}
        </p>
        <p className="season-build-budget-note">
          Budget lié au niveau: (Niveau {gamificationState.userLevel.level} - 15) x 2 = {pointsBudget} points (max 30).
        </p>

        <div className="season-build-mode-switch">
          <button
            type="button"
            className={buildMode === 'GUIDE' ? 'is-active' : ''}
            onClick={() => setBuildMode('GUIDE')}
          >
            Mode guidé
          </button>
          <button
            type="button"
            className={buildMode === 'EXPERT' ? 'is-active' : ''}
            onClick={() => setBuildMode('EXPERT')}
          >
            Mode expert
          </button>
        </div>

        {buildMode === 'GUIDE' ? (
          <div className="season-presets-grid">
            {BUILD_PRESETS.map((preset) => (
              <article
                key={preset.id}
                className={`season-preset-card ${activePresetId === preset.id ? 'is-active-preset' : ''}`}
              >
                <p className="season-preset-kicker">
                  {preset.audience} · Rôle conseillé: {preset.role}
                </p>
                <h3>{preset.label}</h3>
                <p>{preset.summary}</p>
                {activePresetId === preset.id ? (
                  <p className="season-preset-active-badge">Profil actif</p>
                ) : null}
                <button
                  type="button"
                  disabled={!weekOneOpen}
                  onClick={() => {
                    const fitted = fitStatsToBudget(preset.stats, pointsBudget);
                    setDraftStats(fitted);
                    onSetRole(preset.role);
                    onSetStats(fitted);
                  }}
                >
                  Appliquer ce build
                </button>
              </article>
            ))}
          </div>
        ) : (
          <>
            <div className="season-role-grid">
              {ROLE_OPTIONS.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  className={`season-role-card ${myBuild?.role === role.id ? 'is-active' : ''}`}
                  disabled={!weekOneOpen}
                  onClick={() => onSetRole(role.id)}
                >
                  <strong>{role.label}</strong>
                  <small>{role.desc}</small>
                </button>
              ))}
            </div>

            <div className="season-stats-grid">
              {(Object.keys(draftStats) as AscensionStatKey[]).map((key) => (
                <label key={key} className="season-stat-item">
                  <span>{STAT_LABELS[key]}</span>
                  <input
                    type="number"
                    min={0}
                    max={25}
                    value={draftStats[key]}
                    disabled={!weekOneOpen}
                    onChange={(event) =>
                      setDraftStats((prev) => ({
                        ...prev,
                        [key]: Math.max(0, Math.min(25, Number(event.target.value) || 0))
                      }))
                    }
                  />
                  <small>{draftStats[key]}%</small>
                </label>
              ))}
            </div>

            <div className="goal-actions season-build-actions">
              <button
                type="button"
                disabled={!weekOneOpen || pointsUsed > pointsBudget}
                onClick={() => onSetStats(draftStats)}
              >
                Enregistrer les stats
              </button>
            </div>
          </>
        )}
      </article>
      ) : null}
      </div>

      <details className="card premium-section season-pa-guide-card season-pa-guide-collapsed">
        <summary>Que faire maintenant</summary>
        <div className="season-next-grid">
          <article className={hasTeam ? 'is-done' : ''}>
            <h3>1) Rejoins ou crée une équipe</h3>
            <p>{hasTeam ? 'OK, ton équipe est prête.' : 'C’est la priorité pour lancer la saison.'}</p>
          </article>
          <article className={hasRole ? 'is-done' : ''}>
            <h3>2) Configure ton build</h3>
            <p>{hasRole ? 'OK, ton style est activé.' : 'Utilise le mode guidé si tu veux aller vite.'}</p>
          </article>
          <article>
            <h3>3) Cumule les PA</h3>
            <p>Enchaîne tes séances de la semaine pour accélérer l&apos;ascension.</p>
          </article>
        </div>
      </details>

      <details className="card premium-section season-pa-guide-card season-pa-guide-collapsed">
        <summary>Aide PA (optionnel)</summary>
        <div className="season-pa-thresholds">
          <h3>Etapes de l&apos;ascension</h3>
          {campThresholds ? (
            <div className="season-pa-threshold-list">
              {campThresholds.map((item) => (
                <div key={item.camp}>
                  <strong>{item.camp}%</strong>
                  <span>Camp {item.camp}</span>
                  <small>{item.pa} PA</small>
                </div>
              ))}
            </div>
          ) : (
            <p>Le sommet est calibré en semaine 1, puis les étapes se dévoilent.</p>
          )}
        </div>
        <p className="season-pa-mini">Base distance + bonus contexte + bonus build/equipe (cap +40%).</p>
      </details>
    </section>
  );
}
