import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import Home from './app/routes/Home';
import Sessions from './app/routes/Sessions';
import AddSession from './app/routes/AddSession';
import Missions from './app/routes/Missions';
import XpGuide from './app/routes/XpGuide';
import Progression from './app/routes/Progression';
import Season from './app/routes/Season';
import Explications from './app/routes/Explications';
import AuthSignIn from './app/routes/AuthSignIn';
import Profile from './app/routes/Profile';
import Subscription from './app/routes/Subscription';
import Users from './app/routes/Users';
import Badges from './app/routes/Badges';
import LegalMentions from './app/routes/LegalMentions';
import PrivacyPolicy from './app/routes/PrivacyPolicy';
import CookiesPolicy from './app/routes/CookiesPolicy';
import TermsOfUse from './app/routes/TermsOfUse';
import ContactLegal from './app/routes/ContactLegal';
import RunnerAssessment from './app/routes/RunnerAssessment';
import Coach from './app/routes/Coach';
import CoachQuestionnaire from './app/routes/CoachQuestionnaire';
import {
  canUseModoForCurrentSession,
  getCurrentSessionUser,
  getSidebarStatsScopeLocal,
  initAuthProviderSession,
  isModoAdminEmail,
  isRemoteAuthEnabledLocal,
  listContactRequestsForUserAsync,
  LOCAL_AUTH_CHANGED_EVENT,
  subscribeRemoteAuthState,
  setModoEnabledLocal
} from './backend/localAuth';
import { syncCurrentUserProgressRemote } from './backend/remoteProgress';
import { loadRemoteAppState, saveRemoteAppState } from './backend/remoteAppState';
import { getMissions, getMissionStatus } from './domain/missions';
import { getLevelFromXp, getXpToNextLevel } from './domain/levels';
import { createSession } from './domain/sessions';
import Toast, { ToastKind } from './components/Toast';
import CookieConsentModal from './components/CookieConsentModal';
import {
  createDefaultState,
  getCurrentWeekKey,
  getWeekKeyFromDate,
  loadState,
  normalizeState,
  resetState,
  saveState
} from './storage/localStore';
import { AppState, GoalConfig, Session, SessionInput } from './types/models';
import { formatRunnerArchetype, shouldSuggestReassessment } from './domain/runnerProfile';
import { GAMIFICATION_V1_ENABLED } from './gamification/config';
import {
  apiDeleteSessionValidated,
  apiDeleteGamificationData,
  apiPostAscensionCreateTeam,
  apiPostAscensionJoinTeamByCode,
  apiPostAscensionLeaveTeam,
  apiPostAscensionSetRole,
  apiPostAscensionSetStats,
  apiPostChooseMonthlyChallenge,
  apiPostLegacyMissionClaim,
  apiPostMissionClaim,
  apiPostResetGoal8Weeks,
  apiPostResetMonthlyChallenge,
  apiPostSessionValidated,
  apiPostStartGoal8Weeks,
  apiPostUnlockNotificationsSeen
} from './gamification/api';
import { getMissionsForUi } from './gamification/selectors';
import {
  createDefaultGamificationState,
  loadGamificationState,
  saveGamificationState
} from './gamification/storage';
import { GamificationState } from './gamification/types';
import { ensureMonthlyChallengeChoices, computeWeeklyStats } from './gamification/progression';
import './index.css';

interface ToastState {
  id: number;
  kind: ToastKind;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ImportPreviewState {
  normalized: AppState;
  sourceLabel: string;
  sessionCount: number;
  totalXp: number;
  bonusXp: number;
}

interface ExportEnvelope {
  version: number;
  exportedAt: string;
  kind: 'full-state' | 'filtered-sessions';
  state?: AppState;
  sessions?: Session[];
}

interface UnlockContent {
  title: string;
  features: string[];
}

interface BadgeUnlockPreview {
  id: string;
  title: string;
  art: string;
}

type GamificationMissionUiEntry = ReturnType<typeof getMissionsForUi>[number];

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

function computeUnlockedBadgePreviews(
  gamificationState: GamificationState,
  gamificationMissions: GamificationMissionUiEntry[],
  level: number,
  currentUserId: string
): BadgeUnlockPreview[] {
  const tierBadge = (
    id: string,
    title: string,
    tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM',
    art: string
  ): BadgeUnlockPreview | null => {
    const tierMissions = gamificationMissions.filter((item) => item.mission.tier === tier);
    if (!tierMissions.length) return null;
    const claimed = tierMissions.filter((item) => item.status === 'CLAIMED').length;
    return claimed === tierMissions.length ? { id, title, art } : null;
  };

  const currentSeason =
    gamificationState.ascension.seasons.find(
      (season) => season.id === gamificationState.ascension.currentSeasonId
    ) ?? null;
  const seasonId = currentSeason?.id ?? '';
  const hasTeamMembership = gamificationState.ascension.teamMembers.some(
    (member) => member.userId === currentUserId && member.seasonId === seasonId && member.leftAt == null
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

  const levelBadges: BadgeUnlockPreview[] = [
    { id: 'level-5', title: 'Niveau 5', art: CUSTOM_BADGES.niv5 },
    { id: 'level-10', title: 'Niveau 10', art: CUSTOM_BADGES.niv10 },
    { id: 'level-15', title: 'Niveau 15', art: CUSTOM_BADGES.niv15 },
    { id: 'level-20', title: 'Niveau 20', art: CUSTOM_BADGES.niv20 },
    { id: 'level-25', title: 'Niveau 25', art: CUSTOM_BADGES.niv25 },
    { id: 'level-30', title: 'Niveau 30', art: CUSTOM_BADGES.niv30 }
  ].filter((badge) => {
    const target = Number(badge.id.replace('level-', ''));
    return level >= target;
  });

  const all = [
    tierBadge('missions-bronze', 'Bronze', 'BRONZE', CUSTOM_BADGES.bronze),
    tierBadge('missions-silver', 'Argent', 'SILVER', CUSTOM_BADGES.silver),
    tierBadge('missions-gold', 'Or', 'GOLD', CUSTOM_BADGES.gold),
    tierBadge('missions-platinum', 'Platine', 'PLATINUM', CUSTOM_BADGES.platinum),
    weeklyMissionsClaimed >= 50 ? { id: 'weekly-missions-50', title: 'Missions hebdo', art: CUSTOM_BADGES.weeklyMissions } : null,
    seasonStarted && hasTeamMembership
      ? { id: 'season-1-participant', title: 'Saison 1 - Participant', art: CUSTOM_BADGES.participant }
      : null,
    hasTeamMembership ? { id: 'season-1-team', title: 'Rejoindre une équipe', art: CUSTOM_BADGES.equipe } : null,
    isTeamOwner && hasCreatedFullTeam
      ? { id: 'season-1-founder', title: 'Capitaine', art: CUSTOM_BADGES.capitaine }
      : null,
    reachedMilestones.has(25)
      ? { id: 'season-1-camp-25', title: 'Camp 25%', art: CUSTOM_BADGES.saisonBronze }
      : null,
    reachedMilestones.has(50)
      ? { id: 'season-1-camp-50', title: 'Camp 50%', art: CUSTOM_BADGES.saisonSilver }
      : null,
    reachedMilestones.has(75)
      ? { id: 'season-1-camp-75', title: 'Camp 75%', art: CUSTOM_BADGES.saisonGold }
      : null,
    reachedMilestones.has(100)
      ? { id: 'season-1-summit', title: 'Sommet 100%', art: CUSTOM_BADGES.saisonPlatinum }
      : null,
    ...levelBadges
  ];

  return all.filter((badge): badge is BadgeUnlockPreview => Boolean(badge));
}

function toSessionInput(session: Session): SessionInput {
  return {
    sportType: session.sportType,
    subtype: session.subtype,
    durationMin: session.durationMin,
    distanceKm: session.distanceKm,
    feelings: session.feelings,
    comment: session.comment
  };
}

function downloadJson(data: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function getUnlockContent(level: number): UnlockContent {
  if (level === 5) {
    return {
      title: 'Niveau 5 débloqué',
      features: ['Missions Argent', 'Streak visible', 'Statistiques hebdomadaires enrichies']
    };
  }
  if (level === 10) {
    return {
      title: 'Niveau 10 débloqué',
      features: ['Défis mensuels', 'Missions spéciales', 'Mini classement saison']
    };
  }
  if (level === 15) {
    return {
      title: 'Niveau 15 débloqué',
      features: ['Saison collective', 'Équipes', 'Build saisonnier']
    };
  }
  if (level === 20) {
    return {
      title: 'Niveau 20 débloqué',
      features: ['Missions Or', 'Indicateurs avancés']
    };
  }
  if (level === 25) {
    return {
      title: 'Niveau 25 débloqué',
      features: ['Missions Platine', 'Bonus équipe', 'Nouveaux objectifs experts']
    };
  }
  if (level === 30) {
    return {
      title: 'Niveau 30 débloqué',
      features: ['Sommet atteint', 'Cycle maître', 'Contenus saisonniers avancés']
    };
  }
  return {
    title: `Niveau ${level} débloqué`,
    features: ['Nouveau contenu disponible']
  };
}

function bindGamificationStateToUser(
  input: GamificationState,
  targetUserId: string | null | undefined
): GamificationState {
  const nextUserId = (targetUserId ?? '').trim();
  if (!nextUserId || input.userId === nextUserId) return input;
  const previousUserId = input.userId;
  const remap = (id: string): string => (id === previousUserId ? nextUserId : id);

  const missionsUserProgress = Object.fromEntries(
    Object.entries(input.missionsUserProgress).map(([missionId, progress]) => [
      missionId,
      { ...progress, userId: remap(progress.userId) }
    ])
  );

  return {
    ...input,
    userId: nextUserId,
    userLevel: { ...input.userLevel, userId: remap(input.userLevel.userId) },
    userStreak: { ...input.userStreak, userId: remap(input.userStreak.userId) },
    userXpLog: input.userXpLog.map((entry) => ({ ...entry, userId: remap(entry.userId) })),
    weeklyStats: input.weeklyStats.map((entry) => ({ ...entry, userId: remap(entry.userId) })),
    userMonthlyChallenges: input.userMonthlyChallenges.map((entry) => ({
      ...entry,
      userId: remap(entry.userId)
    })),
    userGoal8Weeks: input.userGoal8Weeks
      ? { ...input.userGoal8Weeks, userId: remap(input.userGoal8Weeks.userId) }
      : null,
    hallOfFameEntries: input.hallOfFameEntries.map((entry) => ({
      ...entry,
      userId: remap(entry.userId)
    })),
    missionsUserProgress,
    teamMembers: input.teamMembers.map((member) => ({ ...member, userId: remap(member.userId) })),
    ascension: {
      ...input.ascension,
      teams: input.ascension.teams.map((team) => ({ ...team, ownerUserId: remap(team.ownerUserId) })),
      teamMembers: input.ascension.teamMembers.map((member) => ({
        ...member,
        userId: remap(member.userId)
      })),
      teamPa: input.ascension.teamPa.map((entry) => ({ ...entry, userId: remap(entry.userId) })),
      userBuilds: input.ascension.userBuilds.map((build) => ({
        ...build,
        userId: remap(build.userId)
      }))
    }
  };
}

function App(): JSX.Element {
  const [state, setState] = useState<AppState>(() => loadState());
  const [gamificationState, setGamificationState] = useState<GamificationState>(() =>
    loadGamificationState()
  );
  const [toast, setToast] = useState<ToastState | null>(null);
  const [pendingImport, setPendingImport] = useState<ImportPreviewState | null>(null);
  const [deletedBuffer, setDeletedBuffer] = useState<{ session: Session; timeoutId: number } | null>(null);
  const [unlockModalLevels, setUnlockModalLevels] = useState<number[]>([]);
  const [badgeUnlockQueue, setBadgeUnlockQueue] = useState<BadgeUnlockPreview[]>([]);
  const [activeBadgeUnlock, setActiveBadgeUnlock] = useState<BadgeUnlockPreview | null>(null);
  const [sessionUser, setSessionUser] = useState(() => getCurrentSessionUser());
  const [cloudHydrationDone, setCloudHydrationDone] = useState(false);
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);
  const [cloudSaveEnabled, setCloudSaveEnabled] = useState(false);
  const [sidebarStatsScope, setSidebarStatsScope] = useState<'WEEK' | 'MONTH' | 'TOTAL'>('WEEK');
  const [communityNotifCount, setCommunityNotifCount] = useState(0);
  const [modoEnabled, setModoEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('nivelr_modo_enabled') === '1';
  });
  const isAdminSession = Boolean(sessionUser && isModoAdminEmail(sessionUser.email));
  const effectiveModo = isAdminSession && modoEnabled;
  const canShowModoToggle = isAdminSession;

  const totalXp = state.sessions.reduce((sum, session) => sum + session.xp, 0) + state.bonusXp;
  const displayXp = GAMIFICATION_V1_ENABLED ? gamificationState.userLevel.xpTotal : totalXp;
  const displayLevel = GAMIFICATION_V1_ENABLED
    ? gamificationState.userLevel.level
    : getLevelFromXp(displayXp);
  const canAccessStats = effectiveModo || displayLevel >= 5;
  const canAccessMonthly = effectiveModo || displayLevel >= 10;
  const canAccessSeason = effectiveModo || displayLevel >= 15;
  const canAccessGoal = effectiveModo || displayLevel >= 20;
  const xpToNextLevel = GAMIFICATION_V1_ENABLED
    ? gamificationState.userLevel.xpToNextLevel
    : getXpToNextLevel(displayXp);
  const xpTarget = xpToNextLevel > 0 ? displayXp + xpToNextLevel : displayXp;
  const streakWeeks = gamificationState.userStreak.activeWeeks;
  const activeBuildRole =
    gamificationState.ascension.userBuilds.find(
      (build) =>
        build.userId === gamificationState.userId &&
        build.seasonId === gamificationState.ascension.currentSeasonId
    )?.role ?? null;
  const currentAscSeason =
    gamificationState.ascension.seasons.find(
      (season) => season.id === gamificationState.ascension.currentSeasonId
    ) ?? null;
  const reachedCamp =
    currentAscSeason && currentAscSeason.milestoneReached.length
      ? Math.max(...currentAscSeason.milestoneReached)
      : null;
  const currentWeekKey = getCurrentWeekKey();
  const weekSessions = state.sessions.filter(
    (session) => getWeekKeyFromDate(new Date(session.createdAt)) === currentWeekKey
  );
  const now = new Date();
  const monthSessions = state.sessions.filter((session) => {
    const date = new Date(session.createdAt);
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  });
  const statsSessions =
    sidebarStatsScope === 'MONTH' ? monthSessions : sidebarStatsScope === 'TOTAL' ? state.sessions : weekSessions;
  const weekMinutes = statsSessions.reduce((sum, session) => sum + session.durationMin, 0);
  const weekDistance = statsSessions.reduce((sum, session) => sum + (session.distanceKm ?? 0), 0);
  const hasRunnerAssessment = Boolean(state.runnerAssessment);
  const runnerArchetype = state.runnerAssessment?.result.archetype;
  const runnerArchetypeLabel = runnerArchetype ? formatRunnerArchetype(runnerArchetype) : null;
  const runnerArchetypeIcon = (() => {
    if (runnerArchetype === 'EXPLORATEUR') return '🧭';
    if (runnerArchetype === 'PILIER') return '🛡️';
    if (runnerArchetype === 'STRATEGE') return '♟️';
    if (runnerArchetype === 'PERFORMEUR') return '⚡';
    return null;
  })();
  const shouldPromptRunnerAssessment = shouldSuggestReassessment(
    state.runnerAssessment?.result.nextRecommendedAt
  );
  const runnerAssessmentGateReady = Boolean(
    sessionUser && cloudHydrationDone && hydratedUserId === sessionUser.id
  );
  const mustCompleteRunnerAssessment = Boolean(runnerAssessmentGateReady && !hasRunnerAssessment);
  const gateWithRunnerAssessment = (element: JSX.Element): JSX.Element =>
    mustCompleteRunnerAssessment ? <Navigate to="/profil-coureur" replace /> : element;

  const showToast = (
    kind: ToastKind,
    message: string,
    options?: { actionLabel?: string; onAction?: () => void; durationMs?: number }
  ): void => {
    const nextToast: ToastState = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      kind,
      message,
      actionLabel: options?.actionLabel,
      onAction: options?.onAction
    };

    setToast(nextToast);
    const duration = options?.durationMs ?? 2800;
    window.setTimeout(() => {
      setToast((current) => (current?.id === nextToast.id ? null : current));
    }, duration);
  };

  const toggleModo = (): void => {
    if (!canShowModoToggle) return;
    const next = !modoEnabled;
    setModoEnabledLocal(next);
    setModoEnabled(next);
    showToast('info', next ? 'Mode modérateur activé.' : 'Mode modérateur désactivé.');
  };

  const renderLockedPage = (title: string, unlockLevel: number, hint: string): JSX.Element => (
    <section className="page">
      <h1>{title}</h1>
      <article className="card premium-section week-curve-card is-locked">
        <div className="week-curve-locked-wrap progression-lock-wrap">
          <div className="week-curve-lock-overlay">
            <p className="week-curve-lock-title">🔒 Débloqué au niveau {unlockLevel}</p>
            <p>{hint}</p>
          </div>
        </div>
      </article>
    </section>
  );

  const renderAuthLockedPage = (title: string, hint: string): JSX.Element => (
    <section className="page">
      <h1>{title}</h1>
      <article className="card premium-section week-curve-card is-locked">
        <div className="week-curve-locked-wrap progression-lock-wrap">
          <div className="week-curve-lock-overlay">
            <p className="week-curve-lock-title">🔒 Connexion requise</p>
            <p>{hint}</p>
          </div>
        </div>
      </article>
    </section>
  );

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    saveGamificationState(gamificationState);
  }, [gamificationState]);

  useEffect(() => {
    if (!GAMIFICATION_V1_ENABLED) return;
    setGamificationState((prev) => {
      const withChallenges = ensureMonthlyChallengeChoices(
        {
          ...prev,
          weeklyStats: computeWeeklyStats(state.sessions, prev.userId)
        },
        state.sessions
      );
      return withChallenges;
    });
  }, [state.sessions, gamificationState.userLevel.level]);

  useEffect(() => {
    void initAuthProviderSession().then((user) => {
      setSessionUser(user);
    });
    const syncSession = (): void => {
      const currentSession = getCurrentSessionUser();
      setSessionUser(currentSession);
      setSidebarStatsScope(getSidebarStatsScopeLocal(currentSession?.id));
      const allowed = canUseModoForCurrentSession();
      if (!allowed) {
        setModoEnabledLocal(false);
        setModoEnabled(false);
        return;
      }
      setModoEnabled(window.localStorage.getItem('nivelr_modo_enabled') === '1');
    };
    window.addEventListener(LOCAL_AUTH_CHANGED_EVENT, syncSession);
    window.addEventListener('storage', syncSession);
    const unsubscribeRemoteAuth = isRemoteAuthEnabledLocal()
      ? subscribeRemoteAuthState(() => {
          setSessionUser(getCurrentSessionUser());
          setModoEnabled(window.localStorage.getItem('nivelr_modo_enabled') === '1');
        })
      : () => {};
    return () => {
      window.removeEventListener(LOCAL_AUTH_CHANGED_EVENT, syncSession);
      window.removeEventListener('storage', syncSession);
      unsubscribeRemoteAuth();
    };
  }, []);

  useEffect(() => {
    if (deletedBuffer) {
      window.clearTimeout(deletedBuffer.timeoutId);
      setDeletedBuffer(null);
    }
    setPendingImport(null);
    setCloudHydrationDone(false);
    setHydratedUserId(null);
    setCloudSaveEnabled(false);
    setSidebarStatsScope(getSidebarStatsScopeLocal(sessionUser?.id));
    const localState = loadState();
    const localGamification = bindGamificationStateToUser(loadGamificationState(), sessionUser?.id);
    setState(localState);
    setGamificationState(localGamification);
    if (!sessionUser) {
      setCloudHydrationDone(true);
      setHydratedUserId(null);
      setCloudSaveEnabled(false);
      return;
    }
    void loadRemoteAppState().then((remote) => {
      if (remote.status === 'ok') {
        setState(remote.state);
        setGamificationState(bindGamificationStateToUser(remote.gamificationState, sessionUser.id));
        setCloudSaveEnabled(true);
      } else if (remote.status === 'not_found') {
        setCloudSaveEnabled(true);
      } else {
        setCloudSaveEnabled(false);
        showToast(
          'error',
          'Synchronisation cloud indisponible. Données conservées en local pour éviter tout écrasement.'
        );
      }
      setCloudHydrationDone(true);
      setHydratedUserId(sessionUser.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUser?.id]);

  useEffect(() => {
    if (!sessionUser || !cloudHydrationDone || hydratedUserId !== sessionUser.id) return;
    void syncCurrentUserProgressRemote({
      level: displayLevel,
      xpTotal: displayXp
    });
  }, [sessionUser?.id, displayLevel, displayXp, cloudHydrationDone, hydratedUserId]);

  useEffect(() => {
    if (!sessionUser || !cloudHydrationDone || hydratedUserId !== sessionUser.id || !cloudSaveEnabled) return;
    void saveRemoteAppState({
      state,
      gamificationState
    });
  }, [sessionUser?.id, state, gamificationState, cloudHydrationDone, hydratedUserId, cloudSaveEnabled]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const currentWeek = getCurrentWeekKey();
      setState((prev) =>
        prev.missionWeekKey === currentWeek
          ? prev
          : { ...prev, missionWeekKey: currentWeek, weeklyClaimedMissions: [] }
      );
    }, 60000);

    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (!import.meta.env.PROD) {
      const cleanupDevServiceWorker = async (): Promise<void> => {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((reg) => reg.unregister()));
          if ('caches' in window) {
            const keys = await window.caches.keys();
            await Promise.all(
              keys
                .filter((key) => key.startsWith('sportxp-cache') || key.startsWith('nivelr-cache'))
                .map((key) => window.caches.delete(key))
            );
          }
        } catch (error) {
          console.warn('SW cleanup dev failed', error);
        }
      };
      cleanupDevServiceWorker();
      return;
    }
    const register = async (): Promise<void> => {
      try {
        await navigator.serviceWorker.register('/sw.js');
      } catch {
        // Silent fallback: app continue sans mode offline
      }
    };
    register();
  }, []);

  const onAddSession = (session: Session): void => {
    let sessionsAfterInsert: Session[] = [];
    setState((prev) => {
      sessionsAfterInsert = [session, ...prev.sessions];
      return {
        ...prev,
        sessions: sessionsAfterInsert
      };
    });

    if (GAMIFICATION_V1_ENABLED) {
      const nextGami = apiPostSessionValidated(session, sessionsAfterInsert);
      setGamificationState(nextGami);
    }
  };

  const onUpdateSession = (session: Session): void => {
    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.map((item) => (item.id === session.id ? session : item))
    }));
    showToast('success', 'Séance mise à jour.');
  };

  const onDuplicateSession = (session: Session): void => {
    const duplicated = createSession(toSessionInput(session));
    setState((prev) => ({
      ...prev,
      sessions: [duplicated, ...prev.sessions]
    }));
    showToast('success', `Séance dupliquée: +${duplicated.xp} XP.`);
  };

  const onDeleteSession = (sessionId: string): void => {
    const removed = state.sessions.find((session) => session.id === sessionId);
    if (!removed) return;
    const sessionsAfterDelete = state.sessions.filter((session) => session.id !== sessionId);

    if (deletedBuffer) {
      window.clearTimeout(deletedBuffer.timeoutId);
      setDeletedBuffer(null);
    }

    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.filter((session) => session.id !== sessionId)
    }));

    if (GAMIFICATION_V1_ENABLED) {
      const next = apiDeleteSessionValidated(sessionId, sessionsAfterDelete);
      setGamificationState(next);
    }

    const timeoutId = window.setTimeout(() => {
      setDeletedBuffer((current) => (current?.session.id === removed.id ? null : current));
    }, 5000);

    setDeletedBuffer({ session: removed, timeoutId });
    showToast('info', 'Séance supprimée.', {
      actionLabel: 'Annuler',
      onAction: () => {
        window.clearTimeout(timeoutId);
        setDeletedBuffer(null);
        let sessionsAfterRestore: Session[] = [];
        setState((prev) => ({
          ...prev,
          sessions: (() => {
            sessionsAfterRestore = [removed, ...prev.sessions];
            return sessionsAfterRestore;
          })()
        }));
        if (GAMIFICATION_V1_ENABLED) {
          const next = apiPostSessionValidated(removed, sessionsAfterRestore);
          setGamificationState(next);
        }
        showToast('success', 'Suppression annulée.');
      },
      durationMs: 5200
    });
  };

  const onReset = (): void => {
    if (deletedBuffer) {
      window.clearTimeout(deletedBuffer.timeoutId);
      setDeletedBuffer(null);
    }
    apiDeleteGamificationData();
    resetState();
    setState(createDefaultState());
    setGamificationState(createDefaultGamificationState());
    showToast('info', 'Toutes les données locales ont été réinitialisées.');
  };

  const onExportState = (): void => {
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(
      now.getMinutes()
    ).padStart(2, '0')}`;

    const payload: ExportEnvelope = {
      version: 2,
      exportedAt: now.toISOString(),
      kind: 'full-state',
      state
    };

    const fileName = `sport-xp-backup-v2-${stamp}.json`;
    downloadJson(payload, fileName);
    showToast('info', `Export terminé: ${fileName}`);
  };

  const onExportFiltered = (sessions: Session[]): void => {
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(
      now.getMinutes()
    ).padStart(2, '0')}`;

    const payload: ExportEnvelope = {
      version: 2,
      exportedAt: now.toISOString(),
      kind: 'filtered-sessions',
      sessions
    };

    const fileName = `sport-xp-filtered-${sessions.length}-${stamp}.json`;
    downloadJson(payload, fileName);
    showToast('info', `Export filtré terminé: ${sessions.length} séance(s).`);
  };

  const onImportState = async (file: File): Promise<void> => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as ExportEnvelope | AppState;
      const source = parsed as ExportEnvelope;
      const candidateState = source && typeof source === 'object' && 'state' in source ? source.state : parsed;
      const normalized = normalizeState(candidateState);
      const importedXp = normalized.sessions.reduce((sum, session) => sum + session.xp, 0) + normalized.bonusXp;

      setPendingImport({
        normalized,
        sourceLabel:
          source && typeof source === 'object' && 'version' in source
            ? `v${source.version}${source.exportedAt ? ` - ${new Date(source.exportedAt).toLocaleString('fr-FR')}` : ''}`
            : 'format legacy',
        sessionCount: normalized.sessions.length,
        totalXp: importedXp,
        bonusXp: normalized.bonusXp
      });
      showToast('info', 'Import prêt: confirme pour appliquer.');
    } catch {
      showToast('error', "Import impossible: fichier JSON invalide ou non compatible.");
    }
  };

  const onUpdateGoals = (goals: GoalConfig): void => {
    setState((prev) => ({
      ...prev,
      goals
    }));
    showToast('info', 'Objectifs hebdo mis à jour.');
  };

  const onApplyRunnerAssessment = (runnerAssessment: AppState['runnerAssessment']): void => {
    if (!runnerAssessment) return;
    setState((prev) => ({
      ...prev,
      runnerAssessment
    }));
    showToast('success', 'Profil coureur mis a jour.');
  };

  const onClaimMission = (missionId: string): void => {
    let claimedXp = 0;
    let claimedType: 'WEEKLY' | 'ONE_SHOT' | null = null;
    setState((prev) => {
      const mission = getMissions(prev.goals, prev.missionWeekKey).find((m) => m.id === missionId);
      if (!mission) return prev;

      const weekSessions = prev.sessions.filter(
        (s) => getWeekKeyFromDate(new Date(s.createdAt)) === prev.missionWeekKey
      );

      const status = getMissionStatus(mission, { sessions: prev.sessions, weekSessions }, prev);

      if (status !== 'DONE') return prev;

      if (mission.type === 'WEEKLY') {
        if (prev.weeklyClaimedMissions.includes(mission.id)) return prev;
        claimedXp = mission.xpReward;
        claimedType = 'WEEKLY';
        showToast('success', `Mission validée: +${mission.xpReward} XP.`);
        return {
          ...prev,
          bonusXp: prev.bonusXp + mission.xpReward,
          weeklyClaimedMissions: [...prev.weeklyClaimedMissions, mission.id]
        };
      }

      if (prev.completedMissions.includes(mission.id)) return prev;
      claimedXp = mission.xpReward;
      claimedType = 'ONE_SHOT';
      showToast('success', `Mission validée: +${mission.xpReward} XP.`);
      return {
        ...prev,
        bonusXp: prev.bonusXp + mission.xpReward,
        completedMissions: [...prev.completedMissions, mission.id]
      };
    });

    if (GAMIFICATION_V1_ENABLED && claimedXp > 0 && claimedType) {
      const suffix = claimedType === 'WEEKLY' ? state.missionWeekKey : 'oneshot';
      const next = apiPostLegacyMissionClaim(missionId, claimedXp, suffix);
      setGamificationState(next);
    }
  };

  const onClaimMissionV1 = (missionId: string): void => {
    if (!GAMIFICATION_V1_ENABLED) return;
    const next = apiPostMissionClaim(missionId, state.sessions);
    setGamificationState(next);
    showToast('success', 'Mission V1 reclamee.');
  };

  const onChooseMonthlyChallenge = (optionId: string): void => {
    const next = apiPostChooseMonthlyChallenge(optionId);
    setGamificationState(next);
    showToast('success', 'Défi mensuel verrouillé.');
  };

  const onResetMonthlyChallenge = (): void => {
    const month = new Date().toISOString().slice(0, 7);
    const next = apiPostResetMonthlyChallenge(month);
    setGamificationState(next);
    showToast('info', 'Défi mensuel réinitialisé (mode test).');
  };

  const onStartGoal8Weeks = (
    goalType: 'PR_5K' | 'PR_10K' | 'PR_HALF' | 'PR_MARATHON' | 'MONTHLY_DISTANCE' | 'LONG_RUN_90MIN_X2',
    target: number,
    durationWeeks: number
  ): void => {
    const next = apiPostStartGoal8Weeks(goalType, target, durationWeeks, state.sessions);
    setGamificationState(next);
    showToast('success', 'Objectif personnel démarré.');
  };

  const onResetGoal8Weeks = (): void => {
    const next = apiPostResetGoal8Weeks();
    setGamificationState(next);
    showToast('info', 'Objectif personnel réinitialisé (mode test).');
  };

  const onSetAscensionRole = (
    role: 'PERFORMEUR' | 'PILIER' | 'EXPLORATEUR' | 'STRATEGE' | 'MENTOR'
  ): void => {
    const next = apiPostAscensionSetRole(role);
    setGamificationState(next);
    showToast('info', `Rôle saisonnier: ${role}.`);
  };

  const onSetAscensionStats = (stats: {
    ENDURANCE: number;
    INTENSITE: number;
    REGULARITE: number;
    MAITRISE: number;
    EXPLORATION: number;
  }): void => {
    const next = apiPostAscensionSetStats(stats);
    setGamificationState(next);
    showToast('success', 'Build saisonnier enregistré.');
  };

  const onCreateAscensionTeam = (teamName: string, memberNames: string[]): void => {
    const currentSeasonId = gamificationState.ascension.currentSeasonId;
    const hadActiveTeam = gamificationState.ascension.teamMembers.some(
      (member) =>
        member.userId === gamificationState.userId &&
        member.seasonId === currentSeasonId &&
        member.leftAt === null
    );
    const safeName = teamName.trim() || `Cordee ${new Date().toLocaleDateString('fr-FR')}`;
    const next = apiPostAscensionCreateTeam(safeName, memberNames);
    const hasActiveTeamNow = next.ascension.teamMembers.some(
      (member) =>
        member.userId === next.userId &&
        member.seasonId === next.ascension.currentSeasonId &&
        member.leftAt === null
    );
    setGamificationState(next);
    if (!hadActiveTeam && hasActiveTeamNow) {
      showToast('success', "Équipe Ascension créée.");
      return;
    }
    showToast(
      'error',
      "Création impossible. Vérifie si tu as déjà quitté une équipe cette saison."
    );
  };

  const onLeaveAscensionTeam = (): void => {
    const currentSeasonId = gamificationState.ascension.currentSeasonId;
    const hadActiveTeam = gamificationState.ascension.teamMembers.some(
      (member) =>
        member.userId === gamificationState.userId &&
        member.seasonId === currentSeasonId &&
        member.leftAt === null
    );
    const next = apiPostAscensionLeaveTeam();
    const hasActiveTeamNow = next.ascension.teamMembers.some(
      (member) =>
        member.userId === next.userId &&
        member.seasonId === next.ascension.currentSeasonId &&
        member.leftAt === null
    );
    setGamificationState(next);
    if (hadActiveTeam && !hasActiveTeamNow) {
      showToast('info', "Tu as quitté l'équipe Ascension.");
      return;
    }
    showToast('error', "Changement d'équipe verrouillé à partir de la semaine 2.");
  };

  const onJoinAscensionTeamByCode = (inviteCode: string): void => {
    const currentSeasonId = gamificationState.ascension.currentSeasonId;
    const hadActiveTeam = gamificationState.ascension.teamMembers.some(
      (member) =>
        member.userId === gamificationState.userId &&
        member.seasonId === currentSeasonId &&
        member.leftAt === null
    );
    const next = apiPostAscensionJoinTeamByCode(inviteCode);
    const hasActiveTeamNow = next.ascension.teamMembers.some(
      (member) =>
        member.userId === next.userId &&
        member.seasonId === next.ascension.currentSeasonId &&
        member.leftAt === null
    );
    setGamificationState(next);
    if (!hadActiveTeam && hasActiveTeamNow) {
      showToast('success', 'Équipe rejointe avec succès.');
      return;
    }
    showToast('error', "Impossible de rejoindre l'équipe (code invalide, équipe complète ou verrouillage S2).");
  };

  const onMarkUnlockSeen = (): void => {
    if (!GAMIFICATION_V1_ENABLED) return;
    const hasUnseen = gamificationState.unlockNotifications.some((item) => !item.seen);
    if (!hasUnseen) return;
    const next = apiPostUnlockNotificationsSeen();
    setGamificationState(next);
  };

  useEffect(() => {
    if (!GAMIFICATION_V1_ENABLED) return;
    const unseenLevels = Array.from(
      new Set(
        gamificationState.unlockNotifications
          .filter((item) => !item.seen)
          .map((item) => item.level)
      )
    ).sort((a, b) => a - b);
    if (!unseenLevels.length) return;
    setUnlockModalLevels((current) => (current.join('|') === unseenLevels.join('|') ? current : unseenLevels));
  }, [gamificationState.unlockNotifications]);

  const closeUnlockModal = (): void => {
    if (!unlockModalLevels.length) return;
    setUnlockModalLevels([]);
    onMarkUnlockSeen();
  };

  const gamificationMissions = GAMIFICATION_V1_ENABLED
    ? getMissionsForUi(state.sessions, gamificationState)
    : [];
  const currentUserId = (sessionUser?.id ?? gamificationState.userId ?? '').trim();
  const unlockedBadgePreviews = computeUnlockedBadgePreviews(
    gamificationState,
    gamificationMissions,
    displayLevel,
    currentUserId
  );
  const weekContext = {
    sessions: state.sessions,
    weekSessions: state.sessions.filter(
      (session) => getWeekKeyFromDate(new Date(session.createdAt)) === state.missionWeekKey
    )
  };
  const legacyMissionNotifCount = getMissions(state.goals, state.missionWeekKey).filter(
    (mission) => getMissionStatus(mission, weekContext, state) === 'DONE'
  ).length;
  const v1MissionNotifCount = gamificationMissions.filter((item) => item.status === 'DONE').length;
  const missionNotifCount = legacyMissionNotifCount + v1MissionNotifCount;
  const badgesNotifCount = gamificationState.unlockNotifications.filter((item) => !item.seen).length;

  useEffect(() => {
    if (typeof window === 'undefined' || !currentUserId) return;
    const storageKey = `nivelr_badges_seen_${currentUserId}`;
    const raw = window.localStorage.getItem(storageKey);
    const previouslySeen = new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
    const unlockedIds = unlockedBadgePreviews.map((badge) => badge.id);
    const newlyUnlocked = unlockedBadgePreviews.filter((badge) => !previouslySeen.has(badge.id));
    if (newlyUnlocked.length) {
      setBadgeUnlockQueue((current) => {
        const existing = new Set([
          ...current.map((item) => item.id),
          ...(activeBadgeUnlock ? [activeBadgeUnlock.id] : [])
        ]);
        const additions = newlyUnlocked.filter((item) => !existing.has(item.id));
        return additions.length ? [...current, ...additions] : current;
      });
    }
    window.localStorage.setItem(storageKey, JSON.stringify(unlockedIds));
  }, [currentUserId, unlockedBadgePreviews, activeBadgeUnlock]);

  useEffect(() => {
    if (activeBadgeUnlock || !badgeUnlockQueue.length) return;
    setActiveBadgeUnlock(badgeUnlockQueue[0]);
    setBadgeUnlockQueue((current) => current.slice(1));
  }, [activeBadgeUnlock, badgeUnlockQueue]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    const refreshCommunityNotifs = async (): Promise<void> => {
      if (!sessionUser) {
        setCommunityNotifCount(0);
        return;
      }
      const contacts = await listContactRequestsForUserAsync(sessionUser.id);
      if (cancelled) return;
      setCommunityNotifCount(contacts.incoming.filter((item) => item.status === 'PENDING').length);
    };
    void refreshCommunityNotifs();
    timer = window.setInterval(() => {
      void refreshCommunityNotifs();
    }, 15000);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [sessionUser?.id]);

  return (
    <BrowserRouter>
      <div
        className={`app-shell ${sessionUser ? 'is-authenticated' : 'is-guest'} ${
          mustCompleteRunnerAssessment ? 'is-assessment-locked' : ''
        }`}
      >
        {sessionUser ? (
          <aside className="app-sidebar">
            <div className="brand-block">
              <div className="sidebar-profile-head">
                <div className="sidebar-avatar-shell">
                  {sessionUser.avatarDataUrl ? (
                    <img src={sessionUser.avatarDataUrl} alt="Photo de profil" className="sidebar-avatar" />
                  ) : (
                    <span className="sidebar-avatar-fallback">
                      {(sessionUser.displayName || '?').trim().charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="sidebar-profile-text">
                  <strong>{sessionUser.displayName}</strong>
                  <span>@{sessionUser.handle}</span>
                  <p className="brand-description">Earn Your Level.</p>
                </div>
              </div>
              <div className="sidebar-sport-glance">
                <span>
                  {statsSessions.length} seance(s){' '}
                  <small>
                    {sidebarStatsScope === 'WEEK'
                      ? 'hebdo'
                      : sidebarStatsScope === 'MONTH'
                        ? 'mois'
                        : 'total'}
                  </small>
                </span>
                <span>{weekMinutes} min</span>
                <span>{weekDistance.toFixed(1)} km</span>
              </div>
              <div className="sidebar-achievements">
                {streakWeeks > 0 ? <span className="sidebar-achievement">Streak {streakWeeks} sem</span> : null}
                {activeBuildRole ? <span className="sidebar-achievement">Style {activeBuildRole}</span> : null}
                {reachedCamp ? <span className="sidebar-achievement">Camp {reachedCamp}%</span> : null}
              </div>
            </div>

            <nav>
              <NavLink to="/add-session">Nouvelle séance</NavLink>
              <NavLink to="/sessions">Sessions</NavLink>
              <NavLink to="/missions">
                <span className="nav-link-row">
                  <span>Missions</span>
                  {missionNotifCount > 0 ? <small className="nav-count">{missionNotifCount}</small> : null}
                </span>
              </NavLink>
              <NavLink
                to="/statistiques"
                className={({ isActive }) =>
                  [isActive ? 'active' : '', !canAccessStats ? 'is-disabled' : '']
                    .filter(Boolean)
                    .join(' ')
                }
                onClick={(event) => {
                  if (!canAccessStats) event.preventDefault();
                }}
                aria-disabled={!canAccessStats}
              >
                <span className="nav-link-row">
                  <span>Statistiques</span>
                  {!canAccessStats ? <small className="nav-lock">🔒 N5</small> : null}
                </span>
              </NavLink>
              <NavLink
                to="/defi-mensuel"
                className={({ isActive }) =>
                  [isActive ? 'active' : '', !canAccessMonthly ? 'is-disabled' : '']
                    .filter(Boolean)
                    .join(' ')
                }
                onClick={(event) => {
                  if (!canAccessMonthly) event.preventDefault();
                }}
                aria-disabled={!canAccessMonthly}
              >
                <span className="nav-link-row">
                  <span>Défi mensuel</span>
                  {!canAccessMonthly ? <small className="nav-lock">🔒 N10</small> : null}
                </span>
              </NavLink>
              <NavLink
                to="/season"
                className={({ isActive }) =>
                  [isActive ? 'active' : '', !canAccessSeason ? 'is-disabled' : '']
                    .filter(Boolean)
                    .join(' ')
                }
                onClick={(event) => {
                  if (!canAccessSeason) event.preventDefault();
                }}
                aria-disabled={!canAccessSeason}
              >
                <span className="nav-link-row">
                  <span>Saison</span>
                  {!canAccessSeason ? <small className="nav-lock">🔒 N15</small> : null}
                </span>
              </NavLink>
              <NavLink
                to="/objectif-personnel"
                className={({ isActive }) =>
                  [isActive ? 'active' : '', !canAccessGoal ? 'is-disabled' : '']
                    .filter(Boolean)
                    .join(' ')
                }
                onClick={(event) => {
                  if (!canAccessGoal) event.preventDefault();
                }}
                aria-disabled={!canAccessGoal}
              >
                <span className="nav-link-row">
                  <span>Objectif personnel</span>
                  {!canAccessGoal ? <small className="nav-lock">🔒 N20</small> : null}
                </span>
              </NavLink>
              <NavLink to="/badges">
                <span className="nav-link-row">
                  <span>Badges</span>
                  {badgesNotifCount > 0 ? <small className="nav-count">{badgesNotifCount}</small> : null}
                </span>
              </NavLink>
              <NavLink to="/coach">Coach</NavLink>
              <NavLink to="/guide-xp">Guide XP</NavLink>
            </nav>

          </aside>
        ) : null}

        <div className="app-content">
          <header className="topbar topbar-global">
            <NavLink to="/explications" className="topbar-brand-link" aria-label="Accueil NIVELR">
              <img
                src="/logo_nivelr_top.png?v=20260221-2"
                alt="NIVELR"
                className="topbar-brand-logo"
              />
            </NavLink>
            <nav className="topbar-links" aria-label="Navigation globale">
              {canShowModoToggle ? (
                <button
                  type="button"
                  className={`modo-toggle-btn ${effectiveModo ? 'is-on' : ''}`}
                  onClick={toggleModo}
                >
                  {effectiveModo ? 'Modo ON' : 'Modo OFF'}
                </button>
              ) : null}
              <NavLink to="/explications">Accueil</NavLink>
              {sessionUser ? (
                <NavLink to="/utilisateurs">
                  <span className="nav-link-row">
                    <span>Communauté</span>
                    {communityNotifCount > 0 ? <small className="nav-count">{communityNotifCount}</small> : null}
                  </span>
                </NavLink>
              ) : null}
              {sessionUser ? (
                <>
                  <NavLink to="/profil" className="topbar-profile-link">
                    <span>Profil</span>
                  </NavLink>
                  <div className="topbar-profile-meta" aria-label="Niveau et progression XP">
                    {runnerArchetypeLabel && runnerArchetypeIcon ? (
                      <small className={`topbar-archetype-badge is-${runnerArchetype?.toLowerCase()}`}>
                        {runnerArchetypeIcon} {runnerArchetypeLabel}
                      </small>
                    ) : null}
                    <small>Lvl {displayLevel}</small>
                    <small>{displayXp}xp/{xpTarget}xp</small>
                  </div>
                </>
              ) : (
                <NavLink to="/connexion">Login</NavLink>
              )}
            </nav>
          </header>
          {sessionUser ? (
            <nav className="mobile-user-nav" aria-label="Navigation utilisateur mobile">
              <NavLink to="/add-session">Nouvelle séance</NavLink>
              <NavLink to="/sessions">Sessions</NavLink>
              <NavLink to="/missions">Missions</NavLink>
              <NavLink
                to="/statistiques"
                className={({ isActive }) =>
                  [isActive ? 'active' : '', !canAccessStats ? 'is-disabled' : ''].filter(Boolean).join(' ')
                }
                onClick={(event) => {
                  if (!canAccessStats) event.preventDefault();
                }}
                aria-disabled={!canAccessStats}
                title={!canAccessStats ? 'Debloque au niveau 5' : undefined}
              >
                Statistiques
              </NavLink>
              <NavLink
                to="/season"
                className={({ isActive }) =>
                  [isActive ? 'active' : '', !canAccessSeason ? 'is-disabled' : ''].filter(Boolean).join(' ')
                }
                onClick={(event) => {
                  if (!canAccessSeason) event.preventDefault();
                }}
                aria-disabled={!canAccessSeason}
                title={!canAccessSeason ? 'Debloque au niveau 15' : undefined}
              >
                Saison
              </NavLink>
              <NavLink
                to="/objectif-personnel"
                className={({ isActive }) =>
                  [isActive ? 'active' : '', !canAccessGoal ? 'is-disabled' : ''].filter(Boolean).join(' ')
                }
                onClick={(event) => {
                  if (!canAccessGoal) event.preventDefault();
                }}
                aria-disabled={!canAccessGoal}
                title={!canAccessGoal ? 'Debloque au niveau 20' : undefined}
              >
                Objectif perso
              </NavLink>
              <NavLink to="/badges">Badges</NavLink>
              <NavLink to="/coach">Coach</NavLink>
              <NavLink to="/guide-xp">Guide XP</NavLink>
            </nav>
          ) : null}
          <main>
            {toast ? (
              <Toast
                message={toast.message}
                kind={toast.kind}
                actionLabel={toast.actionLabel}
                onAction={toast.onAction}
                onClose={() => setToast(null)}
              />
            ) : null}

            {pendingImport ? (
              <div className="modal-backdrop" role="dialog" aria-modal="true">
                <article className="card session-modal">
                  <h2>Confirmer l'import</h2>
                  <p>Source: {pendingImport.sourceLabel}</p>
                  <p>Séances: {pendingImport.sessionCount}</p>
                  <p>XP total: {pendingImport.totalXp}</p>
                  <p>Bonus missions: {pendingImport.bonusXp}</p>
                  <p>L'import remplacera l'état local actuel.</p>

                  <div className="modal-actions">
                    <button type="button" onClick={() => setPendingImport(null)}>
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setState(pendingImport.normalized);
                        setPendingImport(null);
                        showToast('success', 'Import JSON appliqué.');
                      }}
                    >
                      Confirmer
                    </button>
                  </div>
                </article>
              </div>
            ) : null}

            {unlockModalLevels.length ? (
              <div className="modal-backdrop" role="dialog" aria-modal="true">
                <article className="card session-modal unlock-modal">
                  <h2>Félicitations, nouveau palier atteint !</h2>
                  <p className="page-subtitle">
                    Tu as débloqué {unlockModalLevels.length} palier
                    {unlockModalLevels.length > 1 ? 's' : ''} de progression.
                  </p>

                  <div className="unlock-level-list">
                    {unlockModalLevels.map((level) => {
                      const content = getUnlockContent(level);
                      return (
                        <article key={level} className="unlock-level-item">
                          <h3>{content.title}</h3>
                          <ul>
                            {content.features.map((feature) => (
                              <li key={feature}>{feature}</li>
                            ))}
                          </ul>
                        </article>
                      );
                    })}
                  </div>

                  <div className="modal-actions">
                    <button type="button" onClick={closeUnlockModal}>
                      Génial, continuer
                    </button>
                  </div>
                </article>
              </div>
            ) : null}

            {activeBadgeUnlock ? (
              <div className="modal-backdrop" role="dialog" aria-modal="true">
                <article className="card session-modal unlock-badge-modal">
                  <p className="page-subtitle">Badge débloqué</p>
                  <h2>Félicitations !</h2>
                  <div className="unlock-badge-art-wrap">
                    <img src={activeBadgeUnlock.art} alt={activeBadgeUnlock.title} className="unlock-badge-art" />
                  </div>
                  <p className="unlock-badge-title">{activeBadgeUnlock.title}</p>
                  <div className="modal-actions">
                    <button type="button" onClick={() => setActiveBadgeUnlock(null)}>
                      Continuer
                    </button>
                  </div>
                </article>
              </div>
            ) : null}

            <Routes>
              <Route path="/" element={<Navigate to="/explications" replace />} />
              <Route
                path="/statistiques"
                element={gateWithRunnerAssessment(
                  canAccessStats ? (
                    <Home
                      state={state}
                      gamificationState={gamificationState}
                      onReset={onReset}
                      onExportState={onExportState}
                      onImportState={onImportState}
                      isModoEnabled={effectiveModo}
                    />
                  ) : (
                    renderLockedPage(
                      'Statistiques',
                      5,
                      'Continue tes séances pour débloquer les statistiques détaillées.'
                    )
                  )
                )}
              />
              <Route
                path="/sessions"
                element={gateWithRunnerAssessment(
                  <Sessions
                    state={state}
                    onUpdateSession={onUpdateSession}
                    onDeleteSession={onDeleteSession}
                    onDuplicateSession={onDuplicateSession}
                    onExportFiltered={onExportFiltered}
                  />
                )}
              />
              <Route
                path="/add-session"
                element={gateWithRunnerAssessment(
                  <AddSession
                    existingSessions={state.sessions}
                    onAddSession={(session) => {
                      onAddSession(session);
                      showToast('success', `Séance ajoutée: +${session.xp} XP.`);
                    }}
                  />
                )}
              />
              <Route
                path="/missions"
                element={gateWithRunnerAssessment(
                  <Missions
                    state={state}
                    gamificationState={gamificationState}
                    gamificationMissions={gamificationMissions}
                    onClaimMission={onClaimMission}
                    onClaimMissionV1={onClaimMissionV1}
                    onUpdateGoals={onUpdateGoals}
                  />
                )}
              />
              <Route
                path="/badges"
                element={gateWithRunnerAssessment(
                  sessionUser ? (
                    <Badges
                      gamificationState={gamificationState}
                      gamificationMissions={gamificationMissions}
                      level={displayLevel}
                    />
                  ) : (
                    renderAuthLockedPage('Badges', 'Connecte-toi pour voir tes badges debloques.')
                  )
                )}
              />
              <Route
                path="/guide-xp"
                element={gateWithRunnerAssessment(<XpGuide state={state} gamificationState={gamificationState} />)}
              />
              <Route
                path="/profil-coureur"
                element={
                  sessionUser ? (
                    <RunnerAssessment
                      initialAnswers={state.runnerAssessment?.answers}
                      requiredFlow={!hasRunnerAssessment}
                      onApply={(snapshot) => onApplyRunnerAssessment(snapshot)}
                    />
                  ) : (
                    renderAuthLockedPage('Profil coureur', 'Connecte-toi pour lancer le questionnaire.')
                  )
                }
              />
              <Route path="/connexion" element={gateWithRunnerAssessment(<AuthSignIn />)} />
              <Route
                path="/profil"
                element={gateWithRunnerAssessment(
                  <Profile
                    runnerAssessment={state.runnerAssessment}
                    shouldPromptRunnerAssessment={shouldPromptRunnerAssessment}
                  />
                )}
              />
              <Route
                path="/utilisateurs"
                element={gateWithRunnerAssessment(
                  sessionUser ? (
                    <Users isModoEnabled={effectiveModo} />
                  ) : (
                    renderAuthLockedPage(
                      'Communauté',
                      'Connecte-toi pour rechercher des coureurs et gérer tes contacts.'
                    )
                  )
                )}
              />
              <Route
                path="/abonnement"
                element={gateWithRunnerAssessment(
                  effectiveModo ? (
                    <Subscription />
                  ) : (
                    renderAuthLockedPage(
                      'Abonnement',
                      'Cette section est temporairement indisponible.'
                    )
                  )
                )}
              />
              <Route
                path="/progression"
                element={gateWithRunnerAssessment(
                  canAccessMonthly ? (
                    <Progression
                      sessions={state.sessions}
                      gamificationState={gamificationState}
                      view="MONTHLY"
                      onChooseMonthlyChallenge={onChooseMonthlyChallenge}
                      onResetMonthlyChallenge={onResetMonthlyChallenge}
                      onStartGoal8Weeks={onStartGoal8Weeks}
                      onResetGoal8Weeks={onResetGoal8Weeks}
                    />
                  ) : (
                    renderLockedPage(
                      'Défi mensuel',
                      10,
                      'Débloque ce module pour choisir un défi mensuel et gagner un bonus XP.'
                    )
                  )
                )}
              />
              <Route
                path="/defi-mensuel"
                element={gateWithRunnerAssessment(
                  canAccessMonthly ? (
                    <Progression
                      sessions={state.sessions}
                      gamificationState={gamificationState}
                      view="MONTHLY"
                      onChooseMonthlyChallenge={onChooseMonthlyChallenge}
                      onResetMonthlyChallenge={onResetMonthlyChallenge}
                      onStartGoal8Weeks={onStartGoal8Weeks}
                      onResetGoal8Weeks={onResetGoal8Weeks}
                    />
                  ) : (
                    renderLockedPage(
                      'Défi mensuel',
                      10,
                      'Débloque ce module pour choisir un défi mensuel et gagner un bonus XP.'
                    )
                  )
                )}
              />
              <Route
                path="/objectif-personnel"
                element={gateWithRunnerAssessment(
                  canAccessGoal ? (
                    <Progression
                      sessions={state.sessions}
                      gamificationState={gamificationState}
                      view="GOAL"
                      onChooseMonthlyChallenge={onChooseMonthlyChallenge}
                      onResetMonthlyChallenge={onResetMonthlyChallenge}
                      onStartGoal8Weeks={onStartGoal8Weeks}
                      onResetGoal8Weeks={onResetGoal8Weeks}
                    />
                  ) : (
                    renderLockedPage(
                      'Objectif personnel',
                      20,
                      'Atteins le niveau 20 pour déverrouiller cette section.'
                    )
                  )
                )}
              />
              <Route
                path="/objectif-8-semaines"
                element={gateWithRunnerAssessment(
                  canAccessGoal ? (
                    <Progression
                      sessions={state.sessions}
                      gamificationState={gamificationState}
                      view="GOAL"
                      onChooseMonthlyChallenge={onChooseMonthlyChallenge}
                      onResetMonthlyChallenge={onResetMonthlyChallenge}
                      onStartGoal8Weeks={onStartGoal8Weeks}
                      onResetGoal8Weeks={onResetGoal8Weeks}
                    />
                  ) : (
                    renderLockedPage(
                      'Objectif personnel',
                      20,
                      'Atteins le niveau 20 pour déverrouiller cette section.'
                    )
                  )
                )}
              />
              <Route
                path="/season"
                element={gateWithRunnerAssessment(
                  canAccessSeason ? (
                    <Season
                      gamificationState={gamificationState}
                      onSetRole={onSetAscensionRole}
                      onSetStats={onSetAscensionStats}
                      onCreateTeam={onCreateAscensionTeam}
                      onJoinByCode={onJoinAscensionTeamByCode}
                      onLeaveTeam={onLeaveAscensionTeam}
                    />
                  ) : (
                    renderLockedPage(
                      'Saison',
                      15,
                      'Atteins le niveau 15 pour rejoindre une équipe et démarrer la saison.'
                    )
                  )
                )}
              />
              <Route
                path="/explications"
                element={gateWithRunnerAssessment(<Explications isAuthenticated={Boolean(sessionUser)} />)}
              />
              <Route path="/mentions-legales" element={gateWithRunnerAssessment(<LegalMentions />)} />
              <Route path="/confidentialite" element={gateWithRunnerAssessment(<PrivacyPolicy />)} />
              <Route path="/cookies" element={gateWithRunnerAssessment(<CookiesPolicy />)} />
              <Route path="/cgu" element={gateWithRunnerAssessment(<TermsOfUse />)} />
              <Route path="/contact" element={gateWithRunnerAssessment(<ContactLegal />)} />
              <Route
                path="/coach"
                element={gateWithRunnerAssessment(
                  sessionUser ? (
                    <Coach />
                  ) : (
                    renderAuthLockedPage('Coach', 'Connecte-toi pour accéder à ton programme personnalisé.')
                  )
                )}
              />
              <Route
                path="/coach/test"
                element={gateWithRunnerAssessment(
                  sessionUser ? (
                    <CoachQuestionnaire />
                  ) : (
                    renderAuthLockedPage('Coach', 'Connecte-toi pour démarrer le questionnaire.')
                  )
                )}
              />
            </Routes>
            <CookieConsentModal />
          </main>
          <footer className="app-legal-footer" aria-label="Informations légales">
            <NavLink to="/mentions-legales">Mentions légales</NavLink>
            <NavLink to="/confidentialite">Confidentialité</NavLink>
            <NavLink to="/cookies">Cookies</NavLink>
            <NavLink to="/cgu">CGU</NavLink>
            <NavLink to="/contact">Contact</NavLink>
          </footer>
        </div>
      </div>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />);
