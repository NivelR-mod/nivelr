import { Session } from '../types/models';
import { getGamificationMissionCatalog } from './missionsCatalog';
import { getWeekKey } from './storage';
import { GamificationMission, GamificationState, MissionProgressStatus } from './types';

function getSessionsInRollingDays(sessions: Session[], nowDate: Date, days: number): Session[] {
  const start = new Date(nowDate);
  start.setDate(start.getDate() - Math.max(0, days - 1));
  start.setHours(0, 0, 0, 0);
  const startMs = start.getTime();
  const endMs = nowDate.getTime();
  return sessions.filter((session) => {
    const ts = new Date(session.createdAt).getTime();
    return ts >= startMs && ts <= endMs;
  });
}

function getSessionsInRollingWeeks(sessions: Session[], nowDate: Date, weeks: number): Session[] {
  return getSessionsInRollingDays(sessions, nowDate, Math.max(1, weeks) * 7);
}

function countActiveWeeks(sessions: Session[]): number {
  return new Set(sessions.map((session) => getWeekKey(new Date(session.createdAt)))).size;
}

function evaluateRawMissionProgress(
  mission: GamificationMission,
  sessions: Session[],
  state: GamificationState,
  nowDate: Date
): number {
  const weekKey = getWeekKey(nowDate);
  const weekSessions = sessions.filter((session) => getWeekKey(new Date(session.createdAt)) === weekKey);
  const sessionsRollingDays = getSessionsInRollingDays(sessions, nowDate, mission.criterion.rollingDays ?? 7);
  const sessionsRollingWeeks = getSessionsInRollingWeeks(
    sessions,
    nowDate,
    mission.criterion.rollingWeeks ?? 2
  );
  const scopedSubtypes = mission.criterion.subtypes;
  const isKey = (session: Session): boolean =>
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
      return new Set(weekSessions.map((session) => new Date(session.createdAt).toISOString().slice(0, 10))).size;
    case 'RUNNING_KEY_SESSIONS':
      return mission.criterion.rollingWeeks
        ? sessionsRollingWeeks.filter((session) => isKey(session)).length
        : weekSessions.filter((session) => isKey(session)).length;
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
      const scope = mission.criterion.rollingDays ? sessionsRollingDays : sessions;
      return scope.filter((session) => session.feelings.rpe <= maxRpe).length;
    }
    case 'HIGH_RPE_SESSIONS': {
      const minRpe = mission.criterion.minRpe ?? 7;
      const scope = mission.criterion.rollingWeeks
        ? sessionsRollingWeeks
        : mission.criterion.rollingDays
          ? sessionsRollingDays
          : sessions;
      return scope.filter((session) => session.feelings.rpe >= minRpe).length;
    }
    case 'PROGRESSION_EVENTS_COUNT': {
      const progressionReasons = new Set(['PROGRESSION_CHRONO', 'PROGRESSION_DISTANCE', 'PROGRESSION_FREQUENCY']);
      const logs = mission.criterion.rollingWeeks
        ? state.userXpLog.filter((entry) => {
            const deltaDays = (nowDate.getTime() - new Date(entry.createdAt).getTime()) / (1000 * 60 * 60 * 24);
            return deltaDays >= 0 && deltaDays <= mission.criterion.rollingWeeks! * 7;
          })
        : state.userXpLog;
      return logs.filter((entry) => progressionReasons.has(entry.reason)).length;
    }
    case 'WEEKLY_XP':
      return state.userXpLog
        .filter((entry) => entry.weekKey === weekKey)
        .reduce((sum, entry) => sum + entry.amount, 0);
    case 'IMPROVED_FREQUENCY':
    case 'IMPROVED_DISTANCE':
    case 'IMPROVED_5K_PACE':
      return state.missionsUserProgress[mission.id]?.progressValue ?? 0;
    default:
      return 0;
  }
}

function resolveMissionStatus(
  mission: GamificationMission,
  state: GamificationState,
  rawProgressValue: number
): { status: MissionProgressStatus; progressValue: number } {
  const missionState = state.missionsUserProgress[mission.id];
  if (missionState?.status === 'CLAIMED') {
    return {
      status: 'CLAIMED',
      progressValue: Math.max(missionState.progressValue, mission.criterion.target)
    };
  }

  if (mission.minLevel > state.userLevel.level) {
    return {
      status: 'LOCKED',
      progressValue: missionState?.progressValue ?? 0
    };
  }

  const unlockBaseline = missionState?.unlockBaseline ?? rawProgressValue;
  const relativeProgress = missionState?.progressValue ?? Math.max(0, rawProgressValue - unlockBaseline);

  if (relativeProgress >= mission.criterion.target) {
    return { status: 'DONE', progressValue: relativeProgress };
  }

  return { status: 'IN_PROGRESS', progressValue: relativeProgress };
}

export function getMissionsForUi(
  sessions: Session[],
  state: GamificationState,
  nowDate: Date = new Date()
): Array<{
  mission: GamificationMission;
  progressValue: number;
  status: MissionProgressStatus;
}> {
  return getGamificationMissionCatalog()
    .map((mission) => {
      const rawProgressValue = evaluateRawMissionProgress(mission, sessions, state, nowDate);
      const resolved = resolveMissionStatus(mission, state, rawProgressValue);
      return {
        mission,
        progressValue: resolved.progressValue,
        status: resolved.status
      };
    })
    .sort((a, b) => {
      const order: Record<MissionProgressStatus, number> = {
        DONE: 0,
        IN_PROGRESS: 1,
        LOCKED: 2,
        CLAIMED: 3
      };
      return (
        order[a.status] - order[b.status] ||
        a.mission.minLevel - b.mission.minLevel ||
        a.mission.id.localeCompare(b.mission.id)
      );
    });
}
