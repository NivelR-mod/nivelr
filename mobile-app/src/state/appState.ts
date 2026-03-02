import {
  AppState,
  GoalConfig,
  RunnerAssessmentAnswers,
  RunnerAssessmentResult,
  RunnerAssessmentSnapshot,
  Session
} from '../types/models';

const DEFAULT_GOALS: GoalConfig = {
  weeklySessionsTarget: 3,
  weeklyMinutesTarget: 120
};

function toISOWeekNumber(date: Date): { year: number; week: number } {
  const tmp = new Date(date);
  tmp.setHours(0, 0, 0, 0);
  const day = tmp.getDay() || 7;
  tmp.setDate(tmp.getDate() + 4 - day);
  const yearStart = new Date(tmp.getFullYear(), 0, 1);
  const diffDays = Math.floor((tmp.getTime() - yearStart.getTime()) / 86400000) + 1;
  return { year: tmp.getFullYear(), week: Math.ceil(diffDays / 7) };
}

export function getCurrentWeekKey(): string {
  const { year, week } = toISOWeekNumber(new Date());
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function createDefaultState(): AppState {
  return {
    sessions: [],
    bonusXp: 0,
    completedMissions: [],
    weeklyClaimedMissions: [],
    missionWeekKey: getCurrentWeekKey(),
    goals: { ...DEFAULT_GOALS }
  };
}

function sanitizeSession(value: unknown): Session | null {
  const s = value as Session;
  if (!s || typeof s !== 'object') return null;
  if (typeof s.id !== 'string' || typeof s.createdAt !== 'string') return null;
  if (typeof s.durationMin !== 'number' || s.durationMin <= 0) return null;
  if (typeof s.xp !== 'number' || s.xp < 0) return null;
  if (typeof s.subtype !== 'string' || typeof s.sportType !== 'string') return null;

  return {
    ...s,
    feelings: {
      feltState: Math.max(1, Math.min(5, Math.round(Number(s.feelings?.feltState ?? 3)))),
      rpe: Math.max(1, Math.min(10, Math.round(Number(s.feelings?.rpe ?? 5)))),
      fatigue: Math.max(1, Math.min(5, Math.round(Number(s.feelings?.fatigue ?? 3))))
    }
  };
}

function sanitizeRunnerAssessmentResult(value: unknown): RunnerAssessmentResult | null {
  const raw = value as Partial<RunnerAssessmentResult>;
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.score !== 'number' || !Number.isFinite(raw.score)) return null;
  if (typeof raw.level !== 'string' || typeof raw.focus !== 'string') return null;
  if (!Array.isArray(raw.recommendations)) return null;
  if (typeof raw.caution !== 'string') return null;
  if (typeof raw.answeredAt !== 'string' || typeof raw.nextRecommendedAt !== 'string') return null;

  const levelValues: RunnerAssessmentResult['level'][] = ['DEBUTANT_REPRISE', 'REGULIER', 'CONFIRME'];
  const focusValues: RunnerAssessmentResult['focus'][] = [
    'ROUTINE',
    'EXPLORATION',
    'PROGRESSION',
    'PERFORMANCE',
    'SANTE'
  ];
  const archetypeValues: RunnerAssessmentResult['archetype'][] = [
    'EXPLORATEUR',
    'PILIER',
    'STRATEGE',
    'PERFORMEUR'
  ];
  if (!levelValues.includes(raw.level as RunnerAssessmentResult['level'])) return null;
  if (!focusValues.includes(raw.focus as RunnerAssessmentResult['focus'])) return null;
  const derivedArchetype = (() => {
    if (raw.focus === 'EXPLORATION') return 'EXPLORATEUR';
    if (raw.focus === 'ROUTINE') return 'PILIER';
    if (raw.focus === 'PERFORMANCE') return 'PERFORMEUR';
    return 'STRATEGE';
  })();

  return {
    score: Math.max(0, Math.min(100, Math.round(raw.score))),
    level: raw.level as RunnerAssessmentResult['level'],
    focus: raw.focus as RunnerAssessmentResult['focus'],
    archetype: archetypeValues.includes(raw.archetype as RunnerAssessmentResult['archetype'])
      ? (raw.archetype as RunnerAssessmentResult['archetype'])
      : derivedArchetype,
    recommendations: raw.recommendations.filter((item): item is string => typeof item === 'string').slice(0, 10),
    caution: raw.caution,
    answeredAt: raw.answeredAt,
    nextRecommendedAt: raw.nextRecommendedAt
  };
}

function sanitizeRunnerAssessmentAnswers(value: unknown): RunnerAssessmentAnswers | null {
  const raw = value as Partial<RunnerAssessmentAnswers> | undefined;
  if (!raw || typeof raw !== 'object') return null;
  const requiredSingle: Array<
    keyof Pick<
      RunnerAssessmentAnswers,
      | 'consistencyMonths'
      | 'sessionsPerWeek'
      | 'weeklyKm'
      | 'longestRecentRun'
      | 'easyPaceTalk'
      | 'injuryLast6Months'
      | 'usualRecovery'
      | 'availableDays'
    >
  > = [
    'consistencyMonths',
    'sessionsPerWeek',
    'weeklyKm',
    'longestRecentRun',
    'easyPaceTalk',
    'injuryLast6Months',
    'usualRecovery',
    'availableDays'
  ];
  for (const key of requiredSingle) {
    if (typeof raw[key] !== 'string') return null;
  }

  const objectiveValues: RunnerAssessmentAnswers['objective8Weeks'][number][] = [
    'REPRISE_REGULARITE',
    'FORME_GENERALE',
    'PREPA_COURSE',
    'PERFORMANCE',
    'SANTE_POIDS'
  ];
  const motivationValues: RunnerAssessmentAnswers['motivation'][number][] = [
    'ROUTINE',
    'VARIER',
    'DEPASSEMENT',
    'STRUCTUREE'
  ];

  const sanitizeArray = <T extends string>(candidate: unknown, allowed: T[], fallback: T): T[] => {
    if (Array.isArray(candidate)) {
      const filtered = candidate.filter((item): item is T => typeof item === 'string' && allowed.includes(item as T));
      return filtered.length ? Array.from(new Set(filtered)) : [fallback];
    }
    if (typeof candidate === 'string' && allowed.includes(candidate as T)) return [candidate as T];
    return [fallback];
  };

  return {
    consistencyMonths: raw.consistencyMonths as RunnerAssessmentAnswers['consistencyMonths'],
    sessionsPerWeek: raw.sessionsPerWeek as RunnerAssessmentAnswers['sessionsPerWeek'],
    weeklyKm: raw.weeklyKm as RunnerAssessmentAnswers['weeklyKm'],
    longestRecentRun: raw.longestRecentRun as RunnerAssessmentAnswers['longestRecentRun'],
    easyPaceTalk: raw.easyPaceTalk as RunnerAssessmentAnswers['easyPaceTalk'],
    injuryLast6Months: raw.injuryLast6Months as RunnerAssessmentAnswers['injuryLast6Months'],
    objective8Weeks: sanitizeArray(raw.objective8Weeks, objectiveValues, 'REPRISE_REGULARITE'),
    usualRecovery: raw.usualRecovery as RunnerAssessmentAnswers['usualRecovery'],
    availableDays: raw.availableDays as RunnerAssessmentAnswers['availableDays'],
    motivation: sanitizeArray(raw.motivation, motivationValues, 'ROUTINE')
  };
}

function sanitizeRunnerAssessment(value: unknown): RunnerAssessmentSnapshot | undefined {
  const raw = value as Partial<RunnerAssessmentSnapshot> | undefined;
  if (!raw || typeof raw !== 'object') return undefined;
  if (typeof raw.appliedAt !== 'string') return undefined;
  const answers = sanitizeRunnerAssessmentAnswers(raw.answers);
  const result = sanitizeRunnerAssessmentResult(raw.result);
  if (!answers || !result) return undefined;
  return { answers, result, appliedAt: raw.appliedAt };
}

export function normalizeState(input: unknown): AppState {
  const raw = (input ?? {}) as Partial<AppState>;
  const currentWeek = getCurrentWeekKey();

  const sessions = Array.isArray(raw.sessions)
    ? raw.sessions.map((s) => sanitizeSession(s)).filter((s): s is Session => Boolean(s))
    : [];

  const state: AppState = {
    sessions,
    bonusXp: typeof raw.bonusXp === 'number' ? Math.max(0, raw.bonusXp) : 0,
    completedMissions: Array.isArray(raw.completedMissions)
      ? raw.completedMissions.filter((x): x is string => typeof x === 'string')
      : [],
    weeklyClaimedMissions: Array.isArray(raw.weeklyClaimedMissions)
      ? raw.weeklyClaimedMissions.filter((x): x is string => typeof x === 'string')
      : [],
    missionWeekKey: typeof raw.missionWeekKey === 'string' ? raw.missionWeekKey : currentWeek,
    goals: {
      weeklySessionsTarget: Math.max(1, Math.min(14, Number(raw.goals?.weeklySessionsTarget ?? 3))),
      weeklyMinutesTarget: Math.max(15, Math.min(1500, Number(raw.goals?.weeklyMinutesTarget ?? 120)))
    },
    runnerAssessment: sanitizeRunnerAssessment(raw.runnerAssessment)
  };

  if (state.missionWeekKey !== currentWeek) {
    state.missionWeekKey = currentWeek;
    state.weeklyClaimedMissions = [];
  }

  return state;
}

export function getXpTotal(state: AppState): number {
  return state.sessions.reduce((sum, s) => sum + s.xp, 0) + state.bonusXp;
}

export function getLevelFromXp(xp: number): number {
  return 1 + Math.floor(Math.max(0, xp) / 500);
}
