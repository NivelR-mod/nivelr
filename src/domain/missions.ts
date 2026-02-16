import {
  AppState,
  GoalConfig,
  MissionDefinition,
  MissionEvaluationContext,
  MissionStatus
} from '../types/models';

export const DEFAULT_GOALS: GoalConfig = {
  weeklySessionsTarget: 3,
  weeklyMinutesTarget: 120
};

type WeeklyMissionFactory = (goals: GoalConfig) => MissionDefinition;

const WEEKLY_MISSION_POOL: WeeklyMissionFactory[] = [
  (goals) => {
    const sessionsTarget = Math.max(1, goals.weeklySessionsTarget);
    return {
      id: 'weekly-sessions-goal',
      title: 'Rythme régulier',
      description: `Faire ${sessionsTarget} séances cette semaine.`,
      type: 'WEEKLY',
      tier: 'BRONZE',
      xpReward: 40,
      target: sessionsTarget,
      unit: 'séances',
      getProgress: (ctx) => ctx.weekSessions.length
    };
  },
  (goals) => {
    const minutesTarget = Math.max(15, goals.weeklyMinutesTarget);
    return {
      id: 'weekly-minutes-goal',
      title: 'Temps de pratique',
      description: `Atteindre ${minutesTarget} minutes cette semaine.`,
      type: 'WEEKLY',
      tier: 'SILVER',
      xpReward: 80,
      target: minutesTarget,
      unit: 'minutes',
      getProgress: (ctx) => ctx.weekSessions.reduce((sum, s) => sum + s.durationMin, 0)
    };
  },
  () => ({
    id: 'weekly-running-2',
    title: 'Focus running',
    description: 'Réaliser 2 séances RUNNING cette semaine.',
    type: 'WEEKLY',
    tier: 'BRONZE',
    xpReward: 40,
    target: 2,
    unit: 'séances running',
    getProgress: (ctx) => ctx.weekSessions.filter((s) => s.sportType === 'RUNNING').length
  }),
  () => ({
    id: 'weekly-distance-18',
    title: 'Distance engagée',
    description: 'Cumuler 18 km sur la semaine.',
    type: 'WEEKLY',
    tier: 'SILVER',
    xpReward: 80,
    target: 18,
    unit: 'km',
    getProgress: (ctx) => ctx.weekSessions.reduce((sum, s) => sum + (s.distanceKm ?? 0), 0)
  }),
  () => ({
    id: 'weekly-intense-2',
    title: 'Qualité maîtrisée',
    description: 'Valider 2 séances intenses (RPE >= 7) cette semaine.',
    type: 'WEEKLY',
    tier: 'GOLD',
    xpReward: 120,
    target: 2,
    unit: 'séances intenses',
    getProgress: (ctx) => ctx.weekSessions.filter((s) => s.feelings.rpe >= 7).length
  }),
  () => ({
    id: 'weekly-renfo-1',
    title: 'Base solide',
    description: 'Ajouter 1 séance RENFO cette semaine.',
    type: 'WEEKLY',
    tier: 'BRONZE',
    xpReward: 40,
    target: 1,
    unit: 'séance renfo',
    getProgress: (ctx) => ctx.weekSessions.filter((s) => s.subtype === 'RENFO').length
  }),
  () => ({
    id: 'weekly-active-days-4',
    title: 'Présence régulière',
    description: 'Être actif 4 jours distincts dans la semaine.',
    type: 'WEEKLY',
    tier: 'SILVER',
    xpReward: 80,
    target: 4,
    unit: 'jours actifs',
    getProgress: (ctx) =>
      new Set(ctx.weekSessions.map((s) => new Date(s.createdAt).toISOString().slice(0, 10))).size
  }),
  () => ({
    id: 'weekly-variety-3',
    title: 'Semaine variée',
    description: 'Utiliser 3 types de séances différents cette semaine.',
    type: 'WEEKLY',
    tier: 'GOLD',
    xpReward: 120,
    target: 3,
    unit: 'types',
    getProgress: (ctx) => new Set(ctx.weekSessions.map((s) => s.subtype)).size
  })
];

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededShuffle<T>(items: T[], seed: string): T[] {
  const next = [...items];
  let state = hashString(seed) || 1;
  for (let i = next.length - 1; i > 0; i -= 1) {
    state = Math.imul(state ^ (state >>> 15), 2246822519);
    const j = Math.abs(state) % (i + 1);
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function selectWeeklyMissions(goals: GoalConfig, weekKey: string): MissionDefinition[] {
  const catalog = WEEKLY_MISSION_POOL.map((factory) => factory(goals));
  return seededShuffle(catalog, `nivelr-weekly:${weekKey}`).slice(0, 3);
}

export function getMissions(goals: GoalConfig = DEFAULT_GOALS, weekKey: string = 'default-week'): MissionDefinition[] {
  const sessionsTarget = Math.max(1, goals.weeklySessionsTarget);
  const minutesTarget = Math.max(15, goals.weeklyMinutesTarget);
  const weeklyMissions = selectWeeklyMissions(goals, weekKey);

  return [
    ...weeklyMissions,
    {
      id: 'oneshot-running-10',
      title: 'Cap 10 séances running',
      description: 'Cumuler 10 séances RUNNING au total.',
      type: 'ONE_SHOT',
      tier: 'SILVER',
      xpReward: 120,
      target: 10,
      unit: 'séances',
      getProgress: (ctx) => ctx.sessions.filter((s) => s.sportType === 'RUNNING').length
    },
    {
      id: 'oneshot-minutes-600',
      title: 'Volume 600 minutes',
      description: 'Cumuler 600 minutes d’entraînement.',
      type: 'ONE_SHOT',
      tier: 'GOLD',
      xpReward: 180,
      target: Math.max(600, minutesTarget * 4),
      unit: 'minutes',
      getProgress: (ctx) => ctx.sessions.reduce((sum, s) => sum + s.durationMin, 0)
    },
    {
      id: 'oneshot-distance-80',
      title: 'Distance cumulée',
      description: 'Cumuler 80 km au total.',
      type: 'ONE_SHOT',
      tier: 'GOLD',
      xpReward: 200,
      target: Math.max(80, sessionsTarget * 6),
      unit: 'km',
      getProgress: (ctx) => ctx.sessions.reduce((sum, s) => sum + (s.distanceKm ?? 0), 0)
    }
  ];
}

export function getMissionStatus(
  mission: MissionDefinition,
  context: MissionEvaluationContext,
  state: Pick<AppState, 'completedMissions' | 'weeklyClaimedMissions'>
): MissionStatus {
  const claimed =
    mission.type === 'WEEKLY'
      ? state.weeklyClaimedMissions.includes(mission.id)
      : state.completedMissions.includes(mission.id);

  if (claimed) return 'CLAIMED';

  const done = mission.getProgress(context) >= mission.target;
  return done ? 'DONE' : 'IN_PROGRESS';
}

export function getMissionProgressText(
  mission: MissionDefinition,
  context: MissionEvaluationContext
): string {
  const raw = mission.getProgress(context);
  const clamped = Math.min(raw, mission.target);
  return `${clamped}/${mission.target} ${mission.unit}`;
}
