import { Session } from '../types/models';
import { GAMIFICATION_V1_CONFIG, getUnlockMessage } from './config';
import { getLevelFromXpV1, getXpToNextLevelV1 } from './levels';
import { getGamificationMissionCatalog } from './missionsCatalog';
import { getMissionsForUi } from './selectors';
import {
  GamificationMission,
  GamificationState,
  MissionProgressStatus,
  ProcessSessionResult,
  SessionValidationEvent,
  UserXpLogEntry
} from './types';
import { getWeekKey } from './storage';

function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 100000)}`;
}

function toDateKey(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function toSessionEvent(session: Session): SessionValidationEvent {
  return {
    sessionId: session.id,
    createdAt: session.createdAt,
    sportType: session.sportType,
    subtype: session.subtype,
    durationMin: session.durationMin,
    distanceKm: session.distanceKm
  };
}

export function computeActivityBaseXp(event: SessionValidationEvent, sessionXp?: number): number {
  if (typeof sessionXp === 'number' && Number.isFinite(sessionXp) && sessionXp > 0) {
    return Math.max(20, Math.round(sessionXp));
  }
  const keySubtypes = new Set(['VMA', 'SEUIL', 'SORTIE_LONGUE', 'RENFO']);
  if (keySubtypes.has(event.subtype)) return 50;
  if (event.durationMin < 30) return 30;
  return 40;
}

function weekXpTotal(log: UserXpLogEntry[], weekKey: string): number {
  return log.filter((entry) => entry.weekKey === weekKey).reduce((sum, entry) => sum + entry.amount, 0);
}

function hasSessionBaseXpAlready(log: UserXpLogEntry[], sessionId: string): boolean {
  return log.some((entry) => entry.reason === 'SESSION_BASE' && entry.sourceRef === `session:${sessionId}`);
}

function sessionXpCountForDay(log: UserXpLogEntry[], dateKey: string): number {
  return log.filter((entry) => entry.reason === 'SESSION_BASE' && entry.dateKey === dateKey && entry.amount > 0)
    .length;
}

function appendXpLog(
  state: GamificationState,
  amount: number,
  reason: UserXpLogEntry['reason'],
  sourceRef: string,
  date: Date
): GamificationState {
  if (amount <= 0) return state;
  const weekKey = getWeekKey(date);
  const currentWeekTotal = weekXpTotal(state.userXpLog, weekKey);
  const remainingWeeklyXp = Math.max(0, state.weeklyXpCap - currentWeekTotal);
  const awardedAmount = Math.min(Math.round(amount), remainingWeeklyXp);
  if (awardedAmount <= 0) return state;

  const entry: UserXpLogEntry = {
    id: generateId('xp'),
    userId: state.userId,
    weekKey,
    dateKey: toDateKey(date),
    amount: awardedAmount,
    reason,
    sourceRef,
    createdAt: date.toISOString()
  };

  const nextXpTotal = state.userLevel.xpTotal + awardedAmount;
  const nextLevel = getLevelFromXpV1(nextXpTotal);

  return {
    ...state,
    userXpLog: [entry, ...state.userXpLog],
    userLevel: {
      ...state.userLevel,
      level: nextLevel,
      xpTotal: nextXpTotal,
      xpToNextLevel: getXpToNextLevelV1(nextXpTotal),
      updatedAt: date.toISOString()
    }
  };
}

function getSessionsInRollingWindow(sessions: Session[], startDate: Date, endDate: Date): Session[] {
  const start = startDate.getTime();
  const end = endDate.getTime();
  return sessions.filter((session) => {
    const ts = new Date(session.createdAt).getTime();
    return ts >= start && ts <= end;
  });
}

interface ProgressionSignals {
  improvedFrequency: boolean;
  improvedDistance: boolean;
  improved5kPace: boolean;
}

function computeProgressionSignals(allSessions: Session[], refDate: Date): ProgressionSignals {
  const currentEnd = refDate;
  const currentStart = new Date(refDate);
  currentStart.setDate(refDate.getDate() - 27);

  const previousEnd = new Date(currentStart);
  previousEnd.setDate(previousEnd.getDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setDate(previousEnd.getDate() - 27);

  const current = getSessionsInRollingWindow(allSessions, currentStart, currentEnd);
  const previous = getSessionsInRollingWindow(allSessions, previousStart, previousEnd);

  const currentFreq = current.length;
  const previousFreq = previous.length;

  const currentDist = current.reduce((sum, session) => sum + (session.distanceKm ?? 0), 0);
  const previousDist = previous.reduce((sum, session) => sum + (session.distanceKm ?? 0), 0);

  const current5k = current
    .filter((session) => (session.distanceKm ?? 0) >= 4.5 && (session.distanceKm ?? 0) <= 5.5)
    .map((session) => session.durationMin / Math.max(0.1, session.distanceKm ?? 0));

  const previous5k = previous
    .filter((session) => (session.distanceKm ?? 0) >= 4.5 && (session.distanceKm ?? 0) <= 5.5)
    .map((session) => session.durationMin / Math.max(0.1, session.distanceKm ?? 0));

  const avgCurrent5k = current5k.length
    ? current5k.reduce((sum, value) => sum + value, 0) / current5k.length
    : Number.NaN;
  const avgPrevious5k = previous5k.length
    ? previous5k.reduce((sum, value) => sum + value, 0) / previous5k.length
    : Number.NaN;

  const improvedFrequency = previousFreq >= 2 && currentFreq >= previousFreq + 1;
  const improvedDistance = previousDist >= 15 && currentDist >= previousDist * 1.1 + 5;
  const improved5kPace = Number.isFinite(avgPrevious5k) && Number.isFinite(avgCurrent5k)
    ? avgCurrent5k <= avgPrevious5k * 0.98
    : false;

  return {
    improvedFrequency,
    improvedDistance,
    improved5kPace
  };
}

function countActiveWeeks(sessions: Session[]): number {
  return new Set(sessions.map((session) => getWeekKey(new Date(session.createdAt)))).size;
}

function getSessionsInRollingDays(sessions: Session[], now: Date, days: number): Session[] {
  const start = new Date(now);
  start.setDate(start.getDate() - Math.max(0, days - 1));
  start.setHours(0, 0, 0, 0);
  return getSessionsInRollingWindow(sessions, start, now);
}

function getSessionsInRollingWeeks(sessions: Session[], now: Date, weeks: number): Session[] {
  return getSessionsInRollingDays(sessions, now, Math.max(1, weeks) * 7);
}

function countActiveDaysInWeek(sessions: Session[], currentWeekKey: string): number {
  const days = new Set(
    sessions
      .filter((session) => getWeekKey(new Date(session.createdAt)) === currentWeekKey)
      .map((session) => toDateKey(new Date(session.createdAt)))
  );
  return days.size;
}

function countProgressionEvents(log: UserXpLogEntry[], mission: GamificationMission, now: Date): number {
  const progressionReasons: UserXpLogEntry['reason'][] = [
    'PROGRESSION_CHRONO',
    'PROGRESSION_DISTANCE',
    'PROGRESSION_FREQUENCY'
  ];
  const scopedLog = mission.criterion.rollingWeeks
    ? log.filter((entry) => {
        const deltaDays =
          (now.getTime() - new Date(entry.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        return deltaDays >= 0 && deltaDays <= mission.criterion.rollingWeeks! * 7;
      })
    : log;
  return scopedLog.filter((entry) => progressionReasons.includes(entry.reason)).length;
}

function evaluateMissionProgress(
  mission: GamificationMission,
  sessions: Session[],
  date: Date,
  currentWeekKey: string,
  state: GamificationState,
  signals: ProgressionSignals
): number {
  const weekSessions = sessions.filter((session) => getWeekKey(new Date(session.createdAt)) === currentWeekKey);
  const rollingDays = mission.criterion.rollingDays ?? 7;
  const rollingWeeks = mission.criterion.rollingWeeks ?? 2;
  const sessionsRollingDays = getSessionsInRollingDays(sessions, date, rollingDays);
  const sessionsRollingWeeks = getSessionsInRollingWeeks(sessions, date, rollingWeeks);
  const scopedSubtypes = mission.criterion.subtypes;
  const isKeySession = (session: Session): boolean =>
    scopedSubtypes?.length
      ? scopedSubtypes.includes(session.subtype)
      : ['VMA', 'SEUIL', 'SORTIE_LONGUE'].includes(session.subtype);

  switch (mission.criterion.kind) {
    case 'SESSIONS_COUNT':
      return mission.window === 'WEEKLY' ? weekSessions.length : sessions.length;
    case 'SESSIONS_IN_ROLLING_DAYS':
      return sessionsRollingDays.length;
    case 'SESSIONS_IN_ROLLING_WEEKS':
      return sessionsRollingWeeks.length;
    case 'RUN_DISTANCE_KM':
      return sessions.reduce((sum, session) => sum + (session.distanceKm ?? 0), 0);
    case 'RUN_DISTANCE_IN_ROLLING_DAYS':
      return sessionsRollingDays.reduce((sum, session) => sum + (session.distanceKm ?? 0), 0);
    case 'RUN_DISTANCE_IN_ROLLING_WEEKS':
      return sessionsRollingWeeks.reduce((sum, session) => sum + (session.distanceKm ?? 0), 0);
    case 'WEEKLY_DISTANCE_KM':
      return weekSessions.reduce((sum, session) => sum + (session.distanceKm ?? 0), 0);
    case 'ACTIVE_WEEKS':
      return countActiveWeeks(sessions);
    case 'ACTIVE_DAYS_COUNT':
      return countActiveDaysInWeek(sessions, currentWeekKey);
    case 'RUNNING_KEY_SESSIONS':
      return mission.criterion.rollingWeeks
        ? sessionsRollingWeeks.filter((session) => isKeySession(session)).length
        : weekSessions.filter((session) => isKeySession(session)).length;
    case 'RENFO_SESSIONS':
      return mission.criterion.rollingWeeks
        ? sessionsRollingWeeks.filter((session) => session.subtype === 'RENFO').length
        : weekSessions.filter((session) => session.subtype === 'RENFO').length;
    case 'SUBTYPE_VARIETY':
      return mission.criterion.rollingWeeks
        ? new Set(sessionsRollingWeeks.map((session) => session.subtype)).size
        : new Set(sessions.map((session) => session.subtype)).size;
    case 'LONGEST_DISTANCE_KM':
      return sessions.reduce((max, session) => Math.max(max, session.distanceKm ?? 0), 0);
    case 'LONGEST_DURATION_MIN':
      return sessions.reduce((max, session) => Math.max(max, session.durationMin), 0);
    case 'LOW_RPE_SESSIONS': {
      const maxRpe = mission.criterion.maxRpe ?? 6;
      const scoped = mission.criterion.rollingDays ? sessionsRollingDays : sessions;
      return scoped.filter((session) => session.feelings.rpe <= maxRpe).length;
    }
    case 'HIGH_RPE_SESSIONS': {
      const minRpe = mission.criterion.minRpe ?? 7;
      const scoped = mission.criterion.rollingWeeks
        ? sessionsRollingWeeks
        : mission.criterion.rollingDays
          ? sessionsRollingDays
          : sessions;
      return scoped.filter((session) => session.feelings.rpe >= minRpe).length;
    }
    case 'PROGRESSION_EVENTS_COUNT':
      return countProgressionEvents(state.userXpLog, mission, date);
    case 'WEEKLY_XP':
      return weekXpTotal(state.userXpLog, currentWeekKey);
    case 'IMPROVED_FREQUENCY':
      return signals.improvedFrequency ? 1 : 0;
    case 'IMPROVED_DISTANCE':
      return signals.improvedDistance ? 1 : 0;
    case 'IMPROVED_5K_PACE':
      return signals.improved5kPace ? 1 : 0;
    default:
      return 0;
  }
}

function refreshMissionProgress(state: GamificationState, sessions: Session[], date: Date): GamificationState {
  const weekKey = getWeekKey(date);
  const signals = computeProgressionSignals(sessions, date);
  const catalog = getGamificationMissionCatalog();
  const nextProgress = { ...state.missionsUserProgress };
  const nowIso = date.toISOString();
  const isCatalogMigration = state.missionCatalogVersion !== GAMIFICATION_V1_CONFIG.missionCatalogVersion;

  for (const mission of catalog) {
    const rawProgress = evaluateMissionProgress(mission, sessions, date, weekKey, state, signals);
    const current = nextProgress[mission.id];
    const isLocked = mission.minLevel > state.userLevel.level;

    if (isLocked) {
      if (current?.status === 'CLAIMED') continue;
      nextProgress[mission.id] = {
        userId: state.userId,
        missionId: mission.id,
        progressValue: current?.progressValue ?? 0,
        unlockBaseline: current?.unlockBaseline ?? rawProgress,
        status: 'LOCKED',
        updatedAt: nowIso,
        unlockedAt: current?.unlockedAt,
        claimedAt: current?.claimedAt
      };
      continue;
    }

    if (!current || current.status === 'LOCKED') {
      const migrationBaseline = isCatalogMigration ? 0 : rawProgress;
      nextProgress[mission.id] = {
        userId: state.userId,
        missionId: mission.id,
        progressValue: isCatalogMigration ? rawProgress : 0,
        unlockBaseline: migrationBaseline,
        status:
          current?.status === 'CLAIMED'
            ? 'CLAIMED'
            : isCatalogMigration && rawProgress >= mission.criterion.target
              ? 'DONE'
              : 'IN_PROGRESS',
        updatedAt: nowIso,
        unlockedAt: current?.unlockedAt ?? nowIso,
        claimedAt: current?.claimedAt
      };
      continue;
    }

    if (isCatalogMigration && current.status !== 'CLAIMED') {
      nextProgress[mission.id] = {
        userId: state.userId,
        missionId: mission.id,
        progressValue: rawProgress,
        unlockBaseline: 0,
        status: rawProgress >= mission.criterion.target ? 'DONE' : 'IN_PROGRESS',
        updatedAt: nowIso,
        unlockedAt: current.unlockedAt ?? nowIso,
        claimedAt: current.claimedAt
      };
      continue;
    }

    const baseline =
      current.unlockBaseline !== undefined
        ? current.unlockBaseline
        : Math.max(0, rawProgress - (current.progressValue ?? 0));
    const relativeProgress = Math.max(0, rawProgress - baseline);

    const status: MissionProgressStatus =
      current.status === 'CLAIMED'
        ? 'CLAIMED'
        : relativeProgress >= mission.criterion.target
          ? 'DONE'
          : 'IN_PROGRESS';

    nextProgress[mission.id] = {
      userId: state.userId,
      missionId: mission.id,
      progressValue: relativeProgress,
      unlockBaseline: baseline,
      status,
      updatedAt: nowIso,
      unlockedAt: current.unlockedAt ?? nowIso,
      claimedAt: current?.claimedAt
    };
  }

  return {
    ...state,
    missionCatalogVersion: GAMIFICATION_V1_CONFIG.missionCatalogVersion,
    missionsUserProgress: nextProgress
  };
}

function upsertLeaderboard(state: GamificationState, weekKey: string, seasonId: string): GamificationState {
  const weeklyScore = weekXpTotal(state.userXpLog, weekKey);
  const season = state.seasons.find((item) => item.id === seasonId);
  const seasonScore = season
    ? state.userXpLog
        .filter((entry) => {
          const created = new Date(entry.createdAt);
          return created >= new Date(season.startDate) && created <= new Date(season.endDate);
        })
        .reduce((sum, entry) => sum + entry.amount, 0)
    : state.userLevel.xpTotal;

  return {
    ...state,
    leaderboards: {
      weekly: [
        {
          subjectId: state.userId,
          subjectName: 'Moi',
          score: weeklyScore,
          rank: 1,
          isTeam: false
        }
      ],
      season: [
        {
          subjectId: state.userId,
          subjectName: 'Moi',
          score: seasonScore,
          rank: 1,
          isTeam: false
        }
      ],
      updatedAt: new Date().toISOString()
    }
  };
}

function maybeAwardStreakBonuses(state: GamificationState, sessions: Session[], date: Date): GamificationState {
  const weekKey = getWeekKey(date);
  const activeWeeks = countActiveWeeks(sessions);
  let next: GamificationState = {
    ...state,
    userStreak: {
      ...state.userStreak,
      activeWeeks,
      lastEvaluatedWeekKey: weekKey
    }
  };

  const thresholds: Array<{ weeks: number; xp: number; reason: UserXpLogEntry['reason'] }> = [
    { weeks: 3, xp: 150, reason: 'STREAK_3' },
    { weeks: 4, xp: 300, reason: 'STREAK_4' },
    { weeks: 8, xp: 600, reason: 'STREAK_8' }
  ];

  for (const threshold of thresholds) {
    if (activeWeeks < threshold.weeks) continue;
    const key = `${threshold.reason}:${weekKey}`;
    if (next.userStreak.awardedMilestones.includes(key)) continue;

    next = appendXpLog(next, threshold.xp, threshold.reason, key, date);
    next = {
      ...next,
      userStreak: {
        ...next.userStreak,
        awardedMilestones: [...next.userStreak.awardedMilestones, key]
      }
    };
  }

  return next;
}

function maybeAwardProgressionBonuses(state: GamificationState, sessions: Session[], date: Date): GamificationState {
  const weekKey = getWeekKey(date);
  const signals = computeProgressionSignals(sessions, date);
  const currentWeekProgression = state.userXpLog
    .filter((entry) => entry.weekKey === weekKey)
    .filter((entry) => entry.reason === 'PROGRESSION_CHRONO' || entry.reason === 'PROGRESSION_DISTANCE' || entry.reason === 'PROGRESSION_FREQUENCY')
    .reduce((sum, entry) => sum + entry.amount, 0);

  let remaining = Math.max(0, GAMIFICATION_V1_CONFIG.maxProgressionBonusPerWeek - currentWeekProgression);
  let next = state;

  const bonuses: Array<{ active: boolean; xp: number; reason: UserXpLogEntry['reason']; source: string }> = [
    { active: signals.improved5kPace, xp: 150, reason: 'PROGRESSION_CHRONO', source: `progress:chrono:${weekKey}` },
    { active: signals.improvedDistance, xp: 100, reason: 'PROGRESSION_DISTANCE', source: `progress:distance:${weekKey}` },
    { active: signals.improvedFrequency, xp: 100, reason: 'PROGRESSION_FREQUENCY', source: `progress:frequency:${weekKey}` }
  ];

  for (const bonus of bonuses) {
    if (!bonus.active || remaining <= 0) continue;
    const already = next.userXpLog.some((entry) => entry.sourceRef === bonus.source);
    if (already) continue;

    const awarded = Math.min(bonus.xp, remaining);
    if (awarded <= 0) continue;

    next = appendXpLog(next, awarded, bonus.reason, bonus.source, date);
    remaining -= awarded;
  }

  return next;
}

function ensureUnlockNotifications(prev: GamificationState, next: GamificationState, now: Date): GamificationState {
  if (next.userLevel.level <= prev.userLevel.level) return next;

  const unlocked = GAMIFICATION_V1_CONFIG.unlockLevels.filter(
    (level) => level > prev.userLevel.level && level <= next.userLevel.level
  );

  if (!unlocked.length) return next;

  const notifications = unlocked.map((level) => ({
    id: generateId('unlock'),
    level,
    message: getUnlockMessage(level),
    createdAt: now.toISOString(),
    seen: false
  }));

  return {
    ...next,
    unlockNotifications: [...notifications, ...next.unlockNotifications]
  };
}

export function processSessionValidated(
  state: GamificationState,
  allSessions: Session[],
  session: Session
): ProcessSessionResult {
  if (!state.enabled) {
    return {
      next: state,
      awardedXp: 0,
      levelUp: false,
      unlockedAtLevel: [],
      cappedByDayLimit: false,
      cappedByWeekLimit: false
    };
  }

  const event = toSessionEvent(session);
  const date = new Date(event.createdAt);
  const weekKey = getWeekKey(date);
  const dateKey = toDateKey(date);

  if (hasSessionBaseXpAlready(state.userXpLog, event.sessionId)) {
    const refreshed = refreshMissionProgress(state, allSessions, date);
    return {
      next: upsertLeaderboard(refreshed, weekKey, refreshed.currentSeasonId),
      awardedXp: 0,
      levelUp: false,
      unlockedAtLevel: [],
      cappedByDayLimit: false,
      cappedByWeekLimit: false
    };
  }

  const baseXp = computeActivityBaseXp(event, session.xp);
  const dailyCount = sessionXpCountForDay(state.userXpLog, dateKey);
  const cappedByDayLimit = dailyCount >= state.maxXpSessionsPerDay;
  const baseAfterDayCap = cappedByDayLimit ? 0 : baseXp;

  const currentWeekXp = weekXpTotal(state.userXpLog, weekKey);
  const remainingWeekXp = Math.max(0, state.weeklyXpCap - currentWeekXp);
  const awardedBaseXp = Math.min(baseAfterDayCap, remainingWeekXp);
  const cappedByWeekLimit = baseAfterDayCap > awardedBaseXp;

  let next = appendXpLog(state, awardedBaseXp, 'SESSION_BASE', `session:${event.sessionId}`, date);

  next = maybeAwardProgressionBonuses(next, allSessions, date);
  next = maybeAwardStreakBonuses(next, allSessions, date);
  next = refreshMissionProgress(next, allSessions, date);
  next = upsertLeaderboard(next, weekKey, next.currentSeasonId);

  const withUnlock = ensureUnlockNotifications(state, next, date);
  const unlockedAtLevel = withUnlock.unlockNotifications
    .filter((item) => item.createdAt === date.toISOString())
    .map((item) => item.level);

  return {
    next: withUnlock,
    awardedXp: awardedBaseXp,
    levelUp: withUnlock.userLevel.level > state.userLevel.level,
    unlockedAtLevel,
    cappedByDayLimit,
    cappedByWeekLimit
  };
}

export function claimMissionReward(
  state: GamificationState,
  missionId: string,
  sessions: Session[],
  nowDate: Date = new Date()
): GamificationState {
  if (!state.enabled) return state;

  const missionView = getMissionsForUi(sessions, state, nowDate).find(
    (item) => item.mission.id === missionId
  );
  const progress = state.missionsUserProgress[missionId];
  const isClaimable =
    progress?.status === 'DONE' || missionView?.status === 'DONE' || missionView?.status === 'CLAIMED';
  if (!isClaimable) return state;

  const mission = getGamificationMissionCatalog().find((item) => item.id === missionId);
  if (!mission) return state;

  if (progress?.status === 'CLAIMED') return state;

  let next = appendXpLog(state, mission.xpReward, 'MISSION_CLAIM', `mission:${missionId}`, nowDate);
  next = {
    ...next,
    missionsUserProgress: {
      ...next.missionsUserProgress,
      [missionId]: {
        ...(progress ?? {
          userId: state.userId,
          missionId,
          progressValue: mission.criterion.target,
          unlockBaseline: 0,
          unlockedAt: nowDate.toISOString()
        }),
        status: 'CLAIMED',
        claimedAt: nowDate.toISOString(),
        updatedAt: nowDate.toISOString()
      }
    }
  };

  const refreshed = getMissionsForUi(sessions, next, nowDate).reduce<GamificationState['missionsUserProgress']>(
    (acc, item) => {
      const current = next.missionsUserProgress[item.mission.id];
      acc[item.mission.id] = {
        userId: next.userId,
        missionId: item.mission.id,
        progressValue: current?.progressValue ?? item.progressValue,
        status: current?.status === 'CLAIMED' ? 'CLAIMED' : item.status,
        unlockBaseline: current?.unlockBaseline ?? 0,
        updatedAt: nowDate.toISOString(),
        unlockedAt: current?.unlockedAt,
        claimedAt: current?.claimedAt
      };
      return acc;
    },
    { ...next.missionsUserProgress }
  );

  next = {
    ...next,
    missionsUserProgress: refreshed
  };

  return ensureUnlockNotifications(state, next, nowDate);
}

export function markUnlockNotificationsSeen(state: GamificationState): GamificationState {
  if (!state.unlockNotifications.some((item) => !item.seen)) return state;
  return {
    ...state,
    unlockNotifications: state.unlockNotifications.map((item) => ({ ...item, seen: true }))
  };
}

export function awardExternalMissionXp(
  state: GamificationState,
  amount: number,
  sourceRef: string,
  nowDate: Date = new Date()
): GamificationState {
  if (!state.enabled) return state;
  if (!Number.isFinite(amount) || amount <= 0) return state;
  const next = appendXpLog(state, Math.round(amount), 'MISSION_CLAIM', sourceRef, nowDate);
  return ensureUnlockNotifications(state, next, nowDate);
}

export function removeSessionFromGamification(
  state: GamificationState,
  sessionId: string,
  sessionsAfterDelete: Session[],
  nowDate: Date = new Date()
): GamificationState {
  if (!state.enabled) return state;

  const sourceRef = `session:${sessionId}`;
  const filteredLog = state.userXpLog.filter((entry) => entry.sourceRef !== sourceRef);
  const nextXpTotal = filteredLog.reduce((sum, entry) => sum + entry.amount, 0);
  const nextLevel = getLevelFromXpV1(nextXpTotal);

  let next: GamificationState = {
    ...state,
    userXpLog: filteredLog,
    userLevel: {
      ...state.userLevel,
      level: nextLevel,
      xpTotal: nextXpTotal,
      xpToNextLevel: getXpToNextLevelV1(nextXpTotal),
      updatedAt: nowDate.toISOString()
    }
  };

  next = refreshMissionProgress(next, sessionsAfterDelete, nowDate);
  next = upsertLeaderboard(next, getWeekKey(nowDate), next.currentSeasonId);

  return next;
}
