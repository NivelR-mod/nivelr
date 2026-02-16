import { Session } from '../types/models';
import { getWeekKeyFromDate } from '../storage/localStore';

export interface DashboardStats {
  weekSessionsCount: number;
  weekMinutes: number;
  weekXp: number;
  avgFeltState: number;
  avgRpe: number;
  avgFatigue: number;
  runningCount: number;
  otherCount: number;
}

export interface WeeklyTrendStats {
  currentMinutes: number;
  previousMinutes: number;
  currentXp: number;
  previousXp: number;
  currentSessions: number;
  previousSessions: number;
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computeDashboardStats(
  sessions: Session[],
  activeWeekKey: string
): DashboardStats {
  const weekSessions = sessions.filter(
    (session) => getWeekKeyFromDate(new Date(session.createdAt)) === activeWeekKey
  );

  const totalSessions = sessions.length;
  const totals = sessions.reduce(
    (acc, session) => {
      acc.feltState += session.feelings.feltState;
      acc.rpe += session.feelings.rpe;
      acc.fatigue += session.feelings.fatigue;
      return acc;
    },
    { feltState: 0, rpe: 0, fatigue: 0 }
  );

  return {
    weekSessionsCount: weekSessions.length,
    weekMinutes: weekSessions.reduce((sum, session) => sum + session.durationMin, 0),
    weekXp: weekSessions.reduce((sum, session) => sum + session.xp, 0),
    avgFeltState: totalSessions ? roundOne(totals.feltState / totalSessions) : 0,
    avgRpe: totalSessions ? roundOne(totals.rpe / totalSessions) : 0,
    avgFatigue: totalSessions ? roundOne(totals.fatigue / totalSessions) : 0,
    runningCount: sessions.filter((session) => session.sportType === 'RUNNING').length,
    otherCount: sessions.filter((session) => session.sportType === 'OTHER').length
  };
}

export function computeWeeklyTrendStats(sessions: Session[], now: Date = new Date()): WeeklyTrendStats {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const nowMs = now.getTime();
  const currentWindowStart = nowMs - 7 * DAY_MS;
  const previousWindowStart = nowMs - 14 * DAY_MS;

  const current = sessions.filter((session) => {
    const createdAt = new Date(session.createdAt).getTime();
    return createdAt >= currentWindowStart && createdAt <= nowMs;
  });

  const previous = sessions.filter((session) => {
    const createdAt = new Date(session.createdAt).getTime();
    return createdAt >= previousWindowStart && createdAt < currentWindowStart;
  });

  return {
    currentMinutes: current.reduce((sum, session) => sum + session.durationMin, 0),
    previousMinutes: previous.reduce((sum, session) => sum + session.durationMin, 0),
    currentXp: current.reduce((sum, session) => sum + session.xp, 0),
    previousXp: previous.reduce((sum, session) => sum + session.xp, 0),
    currentSessions: current.length,
    previousSessions: previous.length
  };
}
