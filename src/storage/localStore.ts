import {
  AppState,
  GoalConfig,
  RunnerAssessmentAnswers,
  RunnerAssessmentResult,
  RunnerAssessmentSnapshot,
  Session,
  SessionFeelings,
  SessionInput,
  SportType
} from '../types/models';
import { scopedStorageKey } from './userScope';

const STORAGE_KEY_BASE = 'sport-mvp-state-v1';
const SNAPSHOTS_KEY_BASE = 'sport-mvp-snapshots-v1';
const LEGACY_MIGRATION_KEY = 'sport-mvp-state-v1-migrated';
const SNAPSHOT_LIMIT = 7;

export const DEFAULT_GOALS: GoalConfig = {
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
  const week = Math.ceil(diffDays / 7);

  return { year: tmp.getFullYear(), week };
}

export function getWeekKeyFromDate(date: Date): string {
  const { year, week } = toISOWeekNumber(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function getCurrentWeekKey(): string {
  return getWeekKeyFromDate(new Date());
}

export function createDefaultState(): AppState {
  return {
    sessions: [],
    bonusXp: 0,
    completedMissions: [],
    weeklyClaimedMissions: [],
    seenBadgePopupIds: [],
    missionWeekKey: getCurrentWeekKey(),
    goals: { ...DEFAULT_GOALS }
  };
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clampFeeling(value: unknown): number {
  const num = asNumber(value);
  if (num === null) return 3;
  return Math.max(1, Math.min(5, Math.round(num)));
}

function clampRpe(value: unknown): number {
  const num = asNumber(value);
  if (num === null) return 5;
  return Math.max(1, Math.min(10, Math.round(num)));
}

function sanitizePositiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const num = asNumber(value);
  if (num === null) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function sanitizeGoals(value: unknown): GoalConfig {
  const raw = value as Partial<GoalConfig> | undefined;
  return {
    weeklySessionsTarget: sanitizePositiveInt(
      raw?.weeklySessionsTarget,
      DEFAULT_GOALS.weeklySessionsTarget,
      1,
      14
    ),
    weeklyMinutesTarget: sanitizePositiveInt(
      raw?.weeklyMinutesTarget,
      DEFAULT_GOALS.weeklyMinutesTarget,
      15,
      1500
    )
  };
}

function sanitizeFeelings(value: unknown): SessionFeelings {
  const raw = value as Partial<SessionFeelings> | undefined;
  const legacy = raw as { energy?: number; pleasure?: number; fluidity?: number } | undefined;
  return {
    feltState: clampFeeling(raw?.feltState ?? legacy?.energy),
    rpe: clampRpe(raw?.rpe ?? legacy?.pleasure),
    fatigue: clampFeeling(raw?.fatigue ?? legacy?.fluidity)
  };
}

function sanitizeSportType(value: unknown): SportType {
  return value === 'RUNNING' ? 'RUNNING' : 'OTHER';
}

function sanitizeSession(value: unknown): Session | null {
  const raw = value as Partial<Session> | undefined;
  if (!raw || typeof raw !== 'object') return null;

  const id = asString(raw.id);
  const createdAt = asString(raw.createdAt);
  const subtype = asString(raw.subtype);
  const durationMin = asNumber(raw.durationMin);
  const xp = asNumber(raw.xp);

  if (!id || !createdAt || !subtype || durationMin === null || xp === null) return null;
  if (durationMin <= 0 || xp < 0) return null;

  const distance = asNumber(raw.distanceKm);
  const sessionInput: SessionInput = {
    sportType: sanitizeSportType(raw.sportType),
    subtype: raw.subtype as SessionInput['subtype'],
    durationMin: Math.round(durationMin),
    distanceKm: distance !== null && distance >= 0 ? distance : undefined,
    feelings: sanitizeFeelings(raw.feelings),
    comment: asString(raw.comment) ?? undefined
  };

  return {
    id,
    createdAt,
    xp: Math.round(xp),
    ...sessionInput
  };
}

function sanitizeRunnerAssessmentResult(value: unknown): RunnerAssessmentResult | null {
  const raw = value as Partial<RunnerAssessmentResult> | undefined;
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
  const parsed = input as Partial<AppState> | undefined;
  const safeParsed = parsed ?? {};
  const defaultState = createDefaultState();

  const sessions = Array.isArray(safeParsed.sessions)
    ? safeParsed.sessions
        .map((session) => sanitizeSession(session))
        .filter((session): session is Session => session !== null)
    : [];

  const state: AppState = {
    sessions,
    bonusXp: Math.max(0, asNumber(safeParsed.bonusXp) ?? 0),
    completedMissions: Array.isArray(safeParsed.completedMissions)
      ? safeParsed.completedMissions.filter((id): id is string => typeof id === 'string')
      : [],
    weeklyClaimedMissions: Array.isArray(safeParsed.weeklyClaimedMissions)
      ? safeParsed.weeklyClaimedMissions.filter((id): id is string => typeof id === 'string')
      : [],
    seenBadgePopupIds: Array.isArray(safeParsed.seenBadgePopupIds)
      ? safeParsed.seenBadgePopupIds.filter((id): id is string => typeof id === 'string')
      : [],
    missionWeekKey: asString(safeParsed.missionWeekKey) ?? defaultState.missionWeekKey,
    goals: sanitizeGoals(safeParsed.goals),
    runnerAssessment: sanitizeRunnerAssessment(safeParsed.runnerAssessment)
  };

  const currentWeek = getCurrentWeekKey();
  if (state.missionWeekKey !== currentWeek) {
    state.missionWeekKey = currentWeek;
    state.weeklyClaimedMissions = [];
  }

  return state;
}

export function loadState(): AppState {
  try {
    const storageKey = scopedStorageKey(STORAGE_KEY_BASE);
    const raw = localStorage.getItem(storageKey);
    if (!raw) return createDefaultState();
    return normalizeState(JSON.parse(raw));
  } catch {
    return createDefaultState();
  }
}

export function saveState(state: AppState): void {
  const storageKey = scopedStorageKey(STORAGE_KEY_BASE);
  localStorage.setItem(storageKey, JSON.stringify(state));
  persistDailySnapshot(state);
}

export function resetState(): void {
  const storageKey = scopedStorageKey(STORAGE_KEY_BASE);
  localStorage.removeItem(storageKey);
}

interface StateSnapshot {
  day: string;
  state: AppState;
}

function getDayKey(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function loadSnapshots(): StateSnapshot[] {
  try {
    const snapshotsKey = scopedStorageKey(SNAPSHOTS_KEY_BASE);
    const raw = localStorage.getItem(snapshotsKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StateSnapshot[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((snapshot) => ({
        day: typeof snapshot?.day === 'string' ? snapshot.day : getDayKey(),
        state: normalizeState(snapshot?.state)
      }))
      .filter((snapshot) => Boolean(snapshot.day));
  } catch {
    return [];
  }
}

function saveSnapshots(snapshots: StateSnapshot[]): void {
  const snapshotsKey = scopedStorageKey(SNAPSHOTS_KEY_BASE);
  localStorage.setItem(snapshotsKey, JSON.stringify(snapshots.slice(-SNAPSHOT_LIMIT)));
}

function migrateLegacyStateIfNeeded(): void {
  try {
    if (localStorage.getItem(LEGACY_MIGRATION_KEY) === '1') return;
    const storageKey = scopedStorageKey(STORAGE_KEY_BASE);
    const snapshotsKey = scopedStorageKey(SNAPSHOTS_KEY_BASE);
    if (!localStorage.getItem(storageKey)) {
      const legacyRaw = localStorage.getItem(STORAGE_KEY_BASE);
      if (legacyRaw) {
        localStorage.setItem(storageKey, legacyRaw);
      }
    }
    if (!localStorage.getItem(snapshotsKey)) {
      const legacySnapshotsRaw = localStorage.getItem(SNAPSHOTS_KEY_BASE);
      if (legacySnapshotsRaw) {
        localStorage.setItem(snapshotsKey, legacySnapshotsRaw);
      }
    }
    localStorage.removeItem(STORAGE_KEY_BASE);
    localStorage.removeItem(SNAPSHOTS_KEY_BASE);
    localStorage.setItem(LEGACY_MIGRATION_KEY, '1');
  } catch {
    // no-op
  }
}

migrateLegacyStateIfNeeded();

function persistDailySnapshot(state: AppState): void {
  const snapshots = loadSnapshots();
  const today = getDayKey();
  const lastSnapshot = snapshots[snapshots.length - 1];
  if (lastSnapshot?.day === today) return;

  snapshots.push({ day: today, state: normalizeState(state) });
  saveSnapshots(snapshots);
}
