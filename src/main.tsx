import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
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
import {
  getCurrentSessionUser,
  LOCAL_AUTH_CHANGED_EVENT,
  setModoEnabledLocal
} from './backend/localAuth';
import { getMissions, getMissionStatus } from './domain/missions';
import { getLevelFromXp, getXpToNextLevel } from './domain/levels';
import { createSession } from './domain/sessions';
import Toast, { ToastKind } from './components/Toast';
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

function App(): JSX.Element {
  const [state, setState] = useState<AppState>(() => loadState());
  const [gamificationState, setGamificationState] = useState<GamificationState>(() =>
    loadGamificationState()
  );
  const [toast, setToast] = useState<ToastState | null>(null);
  const [pendingImport, setPendingImport] = useState<ImportPreviewState | null>(null);
  const [deletedBuffer, setDeletedBuffer] = useState<{ session: Session; timeoutId: number } | null>(null);
  const [unlockModalLevels, setUnlockModalLevels] = useState<number[]>([]);
  const [sessionUser, setSessionUser] = useState(() => getCurrentSessionUser());
  const [modoEnabled, setModoEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('nivelr_modo_enabled') === '1';
  });

  const totalXp = state.sessions.reduce((sum, session) => sum + session.xp, 0) + state.bonusXp;
  const displayXp = GAMIFICATION_V1_ENABLED ? gamificationState.userLevel.xpTotal : totalXp;
  const displayLevel = GAMIFICATION_V1_ENABLED
    ? gamificationState.userLevel.level
    : getLevelFromXp(displayXp);
  const canAccessStats = modoEnabled || displayLevel >= 5;
  const canAccessMonthly = modoEnabled || displayLevel >= 10;
  const canAccessSeason = modoEnabled || displayLevel >= 15;
  const canAccessGoal = modoEnabled || displayLevel >= 20;
  const xpToNextLevel = GAMIFICATION_V1_ENABLED
    ? gamificationState.userLevel.xpToNextLevel
    : getXpToNextLevel(displayXp);
  const xpTarget = xpToNextLevel > 0 ? displayXp + xpToNextLevel : displayXp;
  const currentWeekKey = getCurrentWeekKey();
  const weekSessions = state.sessions.filter(
    (session) => getWeekKeyFromDate(new Date(session.createdAt)) === currentWeekKey
  );
  const weekMinutes = weekSessions.reduce((sum, session) => sum + session.durationMin, 0);
  const weekDistance = weekSessions.reduce((sum, session) => sum + (session.distanceKm ?? 0), 0);

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
    const syncSession = (): void => {
      setSessionUser(getCurrentSessionUser());
      setModoEnabled(window.localStorage.getItem('nivelr_modo_enabled') === '1');
    };
    window.addEventListener(LOCAL_AUTH_CHANGED_EVENT, syncSession);
    window.addEventListener('storage', syncSession);
    return () => {
      window.removeEventListener(LOCAL_AUTH_CHANGED_EVENT, syncSession);
      window.removeEventListener('storage', syncSession);
    };
  }, []);

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

  return (
    <BrowserRouter>
      <div className={`app-shell ${sessionUser ? 'is-authenticated' : 'is-guest'}`}>
        {sessionUser ? (
          <aside className="app-sidebar">
            <div className="brand-block">
              <div className="brand-logo-shell">
                <img src="/nivelr-logo.jpg" alt="NIVELR" className="brand-logo" />
              </div>
              <p className="brand-description">
                Earn Your Level.
              </p>
              <div className="sidebar-sport-glance">
                <span>{weekSessions.length} seance(s)</span>
                <span>{weekMinutes} min</span>
                <span>{weekDistance.toFixed(1)} km</span>
              </div>
            </div>

            <nav>
              <NavLink to="/add-session">Nouvelle séance</NavLink>
              <NavLink to="/sessions">Sessions</NavLink>
              <NavLink to="/missions">Missions</NavLink>
              <NavLink
                to="/"
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
              <NavLink to="/guide-xp">Guide XP</NavLink>
            </nav>

          </aside>
        ) : null}

        <div className="app-content">
          <header className="topbar topbar-global">
            <nav className="topbar-links" aria-label="Navigation globale">
              <button type="button" className={`modo-toggle-btn ${modoEnabled ? 'is-on' : ''}`} onClick={toggleModo}>
                {modoEnabled ? 'Modo ON' : 'Modo OFF'}
              </button>
              <NavLink to="/explications">Accueil</NavLink>
              {sessionUser ? <NavLink to="/utilisateurs">Communauté</NavLink> : null}
              {modoEnabled ? <NavLink to="/abonnement">Abonnement</NavLink> : null}
              {sessionUser ? (
                <>
                  <NavLink to="/profil" className="topbar-profile-link">
                    <span>Profil</span>
                  </NavLink>
                  <div className="topbar-profile-meta" aria-label="Niveau et progression XP">
                    <small>Lvl {displayLevel}</small>
                    <small>{displayXp}xp/{xpTarget}xp</small>
                  </div>
                </>
              ) : (
                <NavLink to="/connexion">Login</NavLink>
              )}
            </nav>
          </header>
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

            <Routes>
              <Route
                path="/"
                element={
                  canAccessStats ? (
                    <Home
                      state={state}
                      gamificationState={gamificationState}
                      onReset={onReset}
                      onExportState={onExportState}
                      onImportState={onImportState}
                      isModoEnabled={modoEnabled}
                    />
                  ) : (
                    renderLockedPage(
                      'Statistiques',
                      5,
                      'Continue tes séances pour débloquer les statistiques détaillées.'
                    )
                  )
                }
              />
              <Route
                path="/sessions"
                element={
                  <Sessions
                    state={state}
                    onUpdateSession={onUpdateSession}
                    onDeleteSession={onDeleteSession}
                    onDuplicateSession={onDuplicateSession}
                    onExportFiltered={onExportFiltered}
                  />
                }
              />
              <Route
                path="/add-session"
                element={
                  <AddSession
                    existingSessions={state.sessions}
                    onAddSession={(session) => {
                      onAddSession(session);
                      showToast('success', `Séance ajoutée: +${session.xp} XP.`);
                    }}
                  />
                }
              />
              <Route
                path="/missions"
                element={
                  <Missions
                    state={state}
                    gamificationState={gamificationState}
                    gamificationMissions={gamificationMissions}
                    onClaimMission={onClaimMission}
                    onClaimMissionV1={onClaimMissionV1}
                    onUpdateGoals={onUpdateGoals}
                  />
                }
              />
              <Route
                path="/guide-xp"
                element={<XpGuide state={state} gamificationState={gamificationState} />}
              />
              <Route path="/connexion" element={<AuthSignIn />} />
              <Route path="/profil" element={<Profile />} />
              <Route
                path="/utilisateurs"
                element={
                  sessionUser ? (
                    <Users />
                  ) : (
                    renderAuthLockedPage(
                      'Communauté',
                      'Connecte-toi pour rechercher des coureurs et gérer tes contacts.'
                    )
                  )
                }
              />
              <Route
                path="/abonnement"
                element={
                  modoEnabled ? (
                    <Subscription />
                  ) : (
                    renderAuthLockedPage(
                      'Abonnement',
                      'Cette section est temporairement indisponible.'
                    )
                  )
                }
              />
              <Route
                path="/progression"
                element={
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
                }
              />
              <Route
                path="/defi-mensuel"
                element={
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
                }
              />
              <Route
                path="/objectif-personnel"
                element={
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
                }
              />
              <Route
                path="/objectif-8-semaines"
                element={
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
                }
              />
              <Route
                path="/season"
                element={
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
                }
              />
              <Route path="/explications" element={<Explications />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />);
