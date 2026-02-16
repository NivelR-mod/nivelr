import { getMissions, getMissionStatus } from './missions';
import { AppState, MissionDefinition, MissionEvaluationContext, Session } from '../types/models';
import { getWeekKeyFromDate } from '../storage/localStore';

export interface BadgeDefinition {
  id: string;
  label: string;
  icon: string;
  description: string;
  isUnlocked: (sessions: Session[], totalXp: number) => boolean;
}

export const BADGES: BadgeDefinition[] = [
  {
    id: 'badge-first-session',
    label: 'Décollage',
    icon: '🚀',
    description: 'Compléter 1 séance',
    isUnlocked: (sessions) => sessions.length >= 1
  },
  {
    id: 'badge-xp-1000',
    label: 'Niveau Acier',
    icon: '⚡',
    description: 'Atteindre 1000 XP',
    isUnlocked: (_, totalXp) => totalXp >= 1000
  },
  {
    id: 'badge-running-10',
    label: 'Runner Focus',
    icon: '🏃',
    description: 'Valider 10 séances RUNNING',
    isUnlocked: (sessions) => sessions.filter((session) => session.sportType === 'RUNNING').length >= 10
  },
  {
    id: 'badge-variety-4',
    label: 'Polyvalent',
    icon: '🎯',
    description: 'Réaliser 4 sous-types différents',
    isUnlocked: (sessions) => new Set(sessions.map((session) => session.subtype)).size >= 4
  }
];

export interface WeeklyStreakResult {
  streak: number;
  jokerUsed: boolean;
}

export function computeWeeklyStreak(
  sessions: Session[],
  referenceDate: Date = new Date()
): WeeklyStreakResult {
  if (!sessions.length) return { streak: 0, jokerUsed: false };

  const playedWeeks = new Set(sessions.map((session) => getWeekKeyFromDate(new Date(session.createdAt))));
  let streak = 0;
  let jokerUsed = false;
  const cursor = new Date(referenceDate);

  while (true) {
    const weekKey = getWeekKeyFromDate(cursor);
    if (playedWeeks.has(weekKey)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 7);
      continue;
    }
    if (!jokerUsed && streak > 0) {
      jokerUsed = true;
      streak += 1;
      cursor.setDate(cursor.getDate() - 7);
      continue;
    }
    break;
  }

  return { streak, jokerUsed };
}

export function getBadgesProgress(
  sessions: Session[],
  totalXp: number
): Array<BadgeDefinition & { unlocked: boolean }> {
  return BADGES.map((badge) => ({
    ...badge,
    unlocked: badge.isUnlocked(sessions, totalXp)
  }));
}

export function getClosestMission(
  state: AppState,
  context: MissionEvaluationContext
): { mission: MissionDefinition; ratio: number } | null {
  const candidates = getMissions(state.goals, state.missionWeekKey)
    .filter((mission) => getMissionStatus(mission, context, state) !== 'CLAIMED')
    .map((mission) => {
      const progress = mission.getProgress(context);
      const ratio = mission.target > 0 ? Math.min(1, progress / mission.target) : 0;
      return { mission, ratio };
    })
    .sort((a, b) => b.ratio - a.ratio);

  return candidates[0] ?? null;
}
