import { AppState, GoalConfig, Session, SessionFeelings, SessionInput, SportType } from '../types/models';

const STORAGE_KEY = 'sport-mvp-state-v1';
const SNAPSHOTS_KEY = 'sport-mvp-snapshots-v1';
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
    missionWeekKey: asString(safeParsed.missionWeekKey) ?? defaultState.missionWeekKey,
    goals: sanitizeGoals(safeParsed.goals)
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
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();
    return normalizeState(JSON.parse(raw));
  } catch {
    return createDefaultState();
  }
}

export function saveState(state: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  persistDailySnapshot(state);
}

export function resetState(): void {
  localStorage.removeItem(STORAGE_KEY);
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
    const raw = localStorage.getItem(SNAPSHOTS_KEY);
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
  localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshots.slice(-SNAPSHOT_LIMIT)));
}

function persistDailySnapshot(state: AppState): void {
  const snapshots = loadSnapshots();
  const today = getDayKey();
  const lastSnapshot = snapshots[snapshots.length - 1];
  if (lastSnapshot?.day === today) return;

  snapshots.push({ day: today, state: normalizeState(state) });
  saveSnapshots(snapshots);
}
