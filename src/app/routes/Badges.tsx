import { CSSProperties, useEffect, useMemo, useState } from 'react';
import { GamificationState, MissionProgressStatus } from '../../gamification/types';
import { getCurrentSessionUser } from '../../backend/localAuth';

type MissionUiItem = {
  mission: import('../../gamification/types').GamificationMission;
  progressValue: number;
  status: MissionProgressStatus;
};

interface BadgesProps {
  gamificationState: GamificationState;
  gamificationMissions: MissionUiItem[];
  level: number;
}

interface BadgeItem {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  progressText?: string;
  tone: 'bronze' | 'silver' | 'gold' | 'platinum' | 'season' | 'level';
  art: string;
}

const CUSTOM_BADGE_BASE = '/badges/custom';
const FULL_TEAM_SIZE = 4;
const CUSTOM_BADGES = {
  bronze: `${CUSTOM_BADGE_BASE}/Badge_bronze.png`,
  silver: `${CUSTOM_BADGE_BASE}/Badge_argent.png`,
  gold: `${CUSTOM_BADGE_BASE}/Badge_or.png`,
  platinum: `${CUSTOM_BADGE_BASE}/Badge_platine.png`,
  participant: `${CUSTOM_BADGE_BASE}/Badge_participant.png`,
  equipe: `${CUSTOM_BADGE_BASE}/Badge_equipe.png`,
  capitaine: `${CUSTOM_BADGE_BASE}/Badge_capitaine.png`,
  saisonBronze: `${CUSTOM_BADGE_BASE}/Badge_saison_1_bronze.png`,
  saisonSilver: `${CUSTOM_BADGE_BASE}/Badge_saison_1_argent.png`,
  saisonGold: `${CUSTOM_BADGE_BASE}/Badge_saison_1_or.png`,
  saisonPlatinum: `${CUSTOM_BADGE_BASE}/Badge_saison_1_platine.png`,
  niv5: `${CUSTOM_BADGE_BASE}/Badge_niv5.png`,
  niv10: `${CUSTOM_BADGE_BASE}/Badge_niv10.png`,
  niv15: `${CUSTOM_BADGE_BASE}/Badge_niv15.png`,
  niv20: `${CUSTOM_BADGE_BASE}/Badge_niv20.png`,
  niv25: `${CUSTOM_BADGE_BASE}/Badge_niv25.png`,
  niv30: `${CUSTOM_BADGE_BASE}/Badge_niv30.png`,
  weeklyMissions: `${CUSTOM_BADGE_BASE}/Missions_hebdo.png`
} as const;

function badgeFromTier(
  id: string,
  title: string,
  description: string,
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM',
  missions: MissionUiItem[]
): BadgeItem {
  const tierMissions = missions.filter((item) => item.mission.tier === tier);
  const claimed = tierMissions.filter((item) => item.status === 'CLAIMED').length;
  const total = tierMissions.length;
  const toneByTier: Record<typeof tier, BadgeItem['tone']> = {
    BRONZE: 'bronze',
    SILVER: 'silver',
    GOLD: 'gold',
    PLATINUM: 'platinum'
  };
  return {
    id,
    title,
    description,
    unlocked: total > 0 && claimed === total,
    progressText: `${claimed}/${total} missions`,
    tone: toneByTier[tier],
    art:
      tier === 'BRONZE'
        ? CUSTOM_BADGES.bronze
        : tier === 'SILVER'
          ? CUSTOM_BADGES.silver
          : tier === 'GOLD'
            ? CUSTOM_BADGES.gold
            : CUSTOM_BADGES.platinum
  };
}

function levelBadge(level: number, target: number): BadgeItem {
  const artByTarget: Record<number, string> = {
    5: CUSTOM_BADGES.niv5,
    10: CUSTOM_BADGES.niv10,
    15: CUSTOM_BADGES.niv15,
    20: CUSTOM_BADGES.niv20,
    25: CUSTOM_BADGES.niv25,
    30: CUSTOM_BADGES.niv30
  };
  return {
    id: `level-${target}`,
    title: `Niveau ${target}`,
    description: `Atteindre le niveau ${target}.`,
    unlocked: level >= target,
    progressText: `Niveau actuel: ${level}`,
    tone: 'level',
    art: artByTarget[target] ?? CUSTOM_BADGES.niv5
  };
}

export default function Badges({
  gamificationState,
  gamificationMissions,
  level
}: BadgesProps): JSX.Element {
  const sessionUser = getCurrentSessionUser();
  const currentUserId = sessionUser?.id ?? gamificationState.userId;
  const [revealedBadgeIds, setRevealedBadgeIds] = useState<Set<string>>(new Set());
  const [newBadgeIds, setNewBadgeIds] = useState<Set<string>>(new Set());
  const [selectedBadgeId, setSelectedBadgeId] = useState<string | null>(null);
  const currentSeason =
    gamificationState.ascension.seasons.find(
      (season) => season.id === gamificationState.ascension.currentSeasonId
    ) ?? null;
  const seasonId = currentSeason?.id ?? '';
  const hasTeamMembership = gamificationState.ascension.teamMembers.some(
    (member) =>
      member.userId === currentUserId &&
      member.seasonId === seasonId &&
      member.leftAt == null
  );
  const ownedTeamsInSeason = gamificationState.ascension.teams.filter(
    (team) => team.seasonId === seasonId && team.ownerUserId === currentUserId
  );
  const isTeamOwner = ownedTeamsInSeason.length > 0;
  const hasCreatedFullTeam = ownedTeamsInSeason.some((team) => {
    const activeMembers = gamificationState.ascension.teamMembers.filter(
      (member) => member.seasonId === seasonId && member.teamId === team.id && member.leftAt == null
    );
    return activeMembers.length >= FULL_TEAM_SIZE;
  });
  const reachedMilestones = new Set(currentSeason?.milestoneReached ?? []);
  const seasonStarted = currentSeason ? currentSeason.status !== 'UPCOMING' : false;
  const weeklyMissionsClaimed = gamificationState.userXpLog.filter(
    (entry) => entry.reason === 'MISSION_CLAIM' && entry.sourceRef.startsWith('legacy-mission:weekly-')
  ).length;

  const coreBadges: BadgeItem[] = [
    badgeFromTier(
      'missions-bronze',
      'Bronze',
      'Valider toutes les missions Bronze.',
      'BRONZE',
      gamificationMissions
    ),
    badgeFromTier(
      'missions-silver',
      'Argent',
      'Valider toutes les missions Argent.',
      'SILVER',
      gamificationMissions
    ),
    badgeFromTier(
      'missions-gold',
      'Or',
      'Valider toutes les missions Or.',
      'GOLD',
      gamificationMissions
    ),
    badgeFromTier(
      'missions-platinum',
      'Platine',
      'Valider toutes les missions Platine.',
      'PLATINUM',
      gamificationMissions
    ),
    {
      id: 'weekly-missions-50',
      title: 'Missions hebdo',
      description: 'Valider 50 missions hebdomadaires.',
      unlocked: weeklyMissionsClaimed >= 50,
      progressText: `${Math.min(weeklyMissionsClaimed, 50)}/50 missions`,
      tone: 'season',
      art: CUSTOM_BADGES.weeklyMissions
    }
  ];

  const seasonBadges: BadgeItem[] = [
    {
      id: 'season-1-participant',
      title: 'Saison 1 - Participant',
      description: 'Participer a la Saison 1 Ascension.',
      unlocked: seasonStarted && hasTeamMembership,
      tone: 'season',
      art: CUSTOM_BADGES.participant
    },
    {
      id: 'season-1-team',
      title: 'Rejoindre une équipe',
      description: 'Rejoindre une équipe saisonnière.',
      unlocked: hasTeamMembership,
      tone: 'season',
      art: CUSTOM_BADGES.equipe
    },
    {
      id: 'season-1-founder',
      title: 'Capitaine',
      description: 'Créer une équipe complète (4/4) pendant la Saison 1.',
      unlocked: isTeamOwner && hasCreatedFullTeam,
      tone: 'season',
      art: CUSTOM_BADGES.capitaine
    },
    {
      id: 'season-1-camp-25',
      title: 'Camp 25%',
      description: 'Atteindre le premier camp de la Saison 1.',
      unlocked: reachedMilestones.has(25),
      tone: 'season',
      art: CUSTOM_BADGES.saisonBronze
    },
    {
      id: 'season-1-camp-50',
      title: 'Camp 50%',
      description: 'Atteindre le deuxieme camp de la Saison 1.',
      unlocked: reachedMilestones.has(50),
      tone: 'season',
      art: CUSTOM_BADGES.saisonSilver
    },
    {
      id: 'season-1-camp-75',
      title: 'Camp 75%',
      description: 'Atteindre le troisieme camp de la Saison 1.',
      unlocked: reachedMilestones.has(75),
      tone: 'season',
      art: CUSTOM_BADGES.saisonGold
    },
    {
      id: 'season-1-summit',
      title: 'Sommet 100%',
      description: 'Completer la Saison 1 a 100%.',
      unlocked: reachedMilestones.has(100),
      tone: 'season',
      art: CUSTOM_BADGES.saisonPlatinum
    }
  ];

  const levelBadges: BadgeItem[] = [5, 10, 15, 20, 25, 30].map((target) =>
    levelBadge(level, target)
  );

  const allBadges = [...coreBadges, ...seasonBadges, ...levelBadges];
  const selectedBadge = allBadges.find((badge) => badge.id === selectedBadgeId) ?? null;
  const unlockedBadgeIds = useMemo(
    () => allBadges.filter((badge) => badge.unlocked).map((badge) => badge.id),
    [allBadges]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storageKey = `nivelr_badges_seen_${currentUserId}`;
    const raw = window.localStorage.getItem(storageKey);
    const previouslySeen = new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
    const newlyUnlocked = unlockedBadgeIds.filter((id) => !previouslySeen.has(id));
    setRevealedBadgeIds(new Set(newlyUnlocked.length ? newlyUnlocked : unlockedBadgeIds));
    setNewBadgeIds(new Set(newlyUnlocked));
    window.localStorage.setItem(storageKey, JSON.stringify(unlockedBadgeIds));

    if (newlyUnlocked.length) {
      const timeoutId = window.setTimeout(() => setNewBadgeIds(new Set()), 2000);
      return () => window.clearTimeout(timeoutId);
    }
    return undefined;
  }, [currentUserId, unlockedBadgeIds]);

  const unlockedCount = allBadges.filter((badge) => badge.unlocked).length;
  const completionPct = allBadges.length ? Math.round((unlockedCount / allBadges.length) * 100) : 0;

  const renderBadge = (badge: BadgeItem): JSX.Element => (
    <article
      key={badge.id}
      className={`badge-medal ${badge.unlocked ? 'is-unlocked' : 'is-locked'} tone-${badge.tone} ${
        badge.unlocked && revealedBadgeIds.has(badge.id) ? 'is-reveal' : ''
      }`}
      role="button"
      tabIndex={0}
      onClick={() => setSelectedBadgeId(badge.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setSelectedBadgeId(badge.id);
        }
      }}
    >
      <div
        className="badge-medal-circle"
        style={
          {
            '--badge-art-image': `url(${badge.art})`
          } as CSSProperties
        }
      >
        {badge.unlocked && newBadgeIds.has(badge.id) ? <span className="badge-medal-new">Nouveau</span> : null}
        {!badge.unlocked ? <span className="badge-medal-lock">🔒</span> : null}
      </div>
      <strong>{badge.title}</strong>
      <p>{badge.description}</p>
      {badge.progressText ? <small>{badge.progressText}</small> : null}
    </article>
  );

  return (
    <section className="page badges-page">
      {selectedBadge ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setSelectedBadgeId(null)}>
          <article className="card session-modal badge-preview-modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="badge-preview-close"
              aria-label="Fermer"
              onClick={() => setSelectedBadgeId(null)}
            >
              ✕
            </button>
            <div className={`badge-preview-medal tone-${selectedBadge.tone} ${selectedBadge.unlocked ? 'is-unlocked' : 'is-locked'}`}>
              <div
                className="badge-preview-circle"
                style={{ '--badge-art-image': `url(${selectedBadge.art})` } as CSSProperties}
              >
                {!selectedBadge.unlocked ? <span className="badge-medal-lock">🔒</span> : null}
              </div>
            </div>
            <h2>{selectedBadge.title}</h2>
            <p className="page-subtitle">{selectedBadge.unlocked ? 'Badge débloqué' : 'Badge verrouillé'}</p>
            <p>{selectedBadge.description}</p>
            {selectedBadge.progressText ? <p className="inline-info">{selectedBadge.progressText}</p> : null}
          </article>
        </div>
      ) : null}

      <h1>Badges</h1>
      <p className="page-subtitle">
        Collection personnelle de progression: missions, saison et paliers de niveau.
      </p>

      <article className="card premium-section badges-overview">
        <div className="badges-overview-head">
          <strong>{unlockedCount}/{allBadges.length} badges</strong>
          <span>{completionPct}% complete</span>
        </div>
        <div className="mission-progress-track" aria-hidden="true">
          <div className="mission-progress-fill" style={{ width: `${completionPct}%` }} />
        </div>
      </article>

      <article className="card premium-section">
        <h2>Missions</h2>
        <div className="badge-medal-grid">{coreBadges.map(renderBadge)}</div>
      </article>

      <article className="card premium-section">
        <h2>Saison 1 - Ascension</h2>
        <div className="badge-medal-grid">{seasonBadges.map(renderBadge)}</div>
      </article>

      <article className="card premium-section">
        <h2>Paliers Niveau</h2>
        <div className="badge-medal-grid">{levelBadges.map(renderBadge)}</div>
      </article>
    </section>
  );
}
