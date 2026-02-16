import { Session } from '../types/models';
import { GAMIFICATION_V1_CONFIG } from './config';
import { MONTHLY_CHALLENGE_OPTIONS } from './challengeOptions';
import {
  ChallengeOption,
  ChallengeTier,
  GamificationState,
  HallOfFameEntry,
  UserGoal8Weeks,
  UserMonthlyChallenge,
  UserTitle,
  WeeklyStat
} from './types';

const QUALITY_SUBTYPES = new Set(['SEUIL', 'VMA']);
const EASY_SUBTYPES = new Set(['EF']);

function toDayKey(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function isDevProgressionUnlockEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem('nivelr_modo_enabled') === '1';
}

export function toMonthKey(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

function parseMonthKey(month: string): Date {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, (m || 1) - 1, 1);
}

function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 1 - day);
  return d;
}

function weekStartKey(date: Date): string {
  return toDayKey(getWeekStart(date));
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function hashToSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function sampleOne<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

function getSessionsInMonth(sessions: Session[], monthKey: string): Session[] {
  return sessions.filter((s) => toMonthKey(new Date(s.createdAt)) === monthKey);
}

function getSessionsInWeeksWindow(sessions: Session[], now: Date, weeks: number): Session[] {
  const end = now.getTime();
  const start = new Date(now);
  start.setDate(start.getDate() - weeks * 7 + 1);
  start.setHours(0, 0, 0, 0);
  const startMs = start.getTime();
  return sessions.filter((s) => {
    const ts = new Date(s.createdAt).getTime();
    return ts >= startMs && ts <= end;
  });
}

export function computeWeeklyStats(sessions: Session[], userId: string): WeeklyStat[] {
  const byWeek = new Map<string, Session[]>();
  for (const session of sessions) {
    const key = weekStartKey(new Date(session.createdAt));
    byWeek.set(key, [...(byWeek.get(key) ?? []), session]);
  }

  return Array.from(byWeek.entries())
    .map(([weekStart, list]) => {
      const duration = list.reduce((sum, s) => sum + s.durationMin, 0);
      const distance = list.reduce((sum, s) => sum + (s.distanceKm ?? 0), 0);
      const load = list.reduce((sum, s) => sum + s.durationMin * s.feelings.rpe, 0);
      const avgRpe = list.length
        ? list.reduce((sum, s) => sum + s.feelings.rpe, 0) / list.length
        : 0;
      return {
        userId,
        weekStart,
        totalDurationMin: Math.round(duration),
        totalDistanceKm: Math.round(distance * 100) / 100,
        avgRpe: Math.round(avgRpe * 10) / 10,
        weeklyLoad: Math.round(load),
        updatedAt: new Date().toISOString()
      };
    })
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

export function getWeeklyLoadTrend(weeklyStats: WeeklyStat[]): { current: number; avg4: number; trend: 'UP' | 'FLAT' | 'DOWN' } {
  if (!weeklyStats.length) return { current: 0, avg4: 0, trend: 'FLAT' };
  const sorted = [...weeklyStats].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  const current = sorted[sorted.length - 1].weeklyLoad;
  const prev4 = sorted.slice(Math.max(0, sorted.length - 5), sorted.length - 1);
  const avg4 = prev4.length ? prev4.reduce((s, w) => s + w.weeklyLoad, 0) / prev4.length : current;
  const ratio = avg4 > 0 ? current / avg4 : 1;
  const trend = ratio > 1.08 ? 'UP' : ratio < 0.92 ? 'DOWN' : 'FLAT';
  return { current, avg4: Math.round(avg4), trend };
}

function isWeekActive(weekSessions: Session[]): boolean {
  return weekSessions.length >= 3;
}

function isBalancedWeek(weekSessions: Session[]): boolean {
  const buckets = new Set<string>();
  if (weekSessions.some((s) => EASY_SUBTYPES.has(s.subtype))) buckets.add('EASY');
  if (weekSessions.some((s) => QUALITY_SUBTYPES.has(s.subtype))) buckets.add('QUALITY');
  if (weekSessions.some((s) => s.subtype === 'SORTIE_LONGUE')) buckets.add('LONG');
  if (weekSessions.some((s) => s.subtype === 'RENFO')) buckets.add('RENFO');
  return buckets.size >= 3;
}

function previousMonthExistsWithDistance(sessions: Session[], currentMonth: string): boolean {
  const prevMonth = toMonthKey(addMonths(parseMonthKey(currentMonth), -1));
  const distance = getSessionsInMonth(sessions, prevMonth).reduce((sum, s) => sum + (s.distanceKm ?? 0), 0);
  return distance > 0;
}

function hasPRHistory(sessions: Session[]): boolean {
  const recent12w = getSessionsInWeeksWindow(sessions, new Date(), 12);
  const candidates = recent12w.filter((s) => (s.distanceKm ?? 0) >= 4.8 && (s.distanceKm ?? 0) <= 10.5);
  return candidates.length >= 3;
}

function optionsForTier(tier: ChallengeTier, sessions: Session[], monthKey: string, title: UserTitle | null): ChallengeOption[] {
  return MONTHLY_CHALLENGE_OPTIONS.filter((option) => {
    if (option.tier !== tier) return false;
    if (option.id === 'A6' && !previousMonthExistsWithDistance(sessions, monthKey)) return false;
    if (option.id === 'E6' && !hasPRHistory(sessions)) return false;
    return true;
  }).sort((a, b) => {
    if (title === 'MENTOR' && tier === 'EXPERT') return a.id.localeCompare(b.id);
    return a.id.localeCompare(b.id);
  });
}

function getEffectiveTitleForProgression(state: GamificationState): UserTitle | null {
  return state.userLevel.level >= 15 ? state.activeTitle : null;
}

export function ensureMonthlyChallengeChoices(
  state: GamificationState,
  sessions: Session[],
  now: Date = new Date()
): GamificationState {
  const unlocked = state.userLevel.level >= 10 || isDevProgressionUnlockEnabled();
  if (!unlocked) return state;
  const month = toMonthKey(now);
  if (state.monthlyChallenges.some((m) => m.month === month)) return state;
  const effectiveTitle = getEffectiveTitleForProgression(state);

  const rng = mulberry32(hashToSeed(`${state.userId}:${month}:${effectiveTitle ?? 'NONE'}`));
  const standard = optionsForTier('STANDARD', sessions, month, effectiveTitle);
  const advanced = optionsForTier('AVANCE', sessions, month, effectiveTitle);
  const expert = optionsForTier('EXPERT', sessions, month, effectiveTitle);
  if (!standard.length || !advanced.length || !expert.length) return state;

  const chosen = [sampleOne(standard, rng), sampleOne(advanced, rng), sampleOne(expert, rng)];
  const monthly = {
    id: `mc-${month}`,
    month,
    optionIds: chosen.map((c) => c.id),
    createdAt: now.toISOString()
  };

  return {
    ...state,
    challengeOptions: MONTHLY_CHALLENGE_OPTIONS,
    monthlyChallenges: [...state.monthlyChallenges, monthly]
  };
}

export function chooseMonthlyChallenge(
  state: GamificationState,
  optionId: string,
  now: Date = new Date()
): GamificationState {
  const month = toMonthKey(now);
  const unlocked = state.userLevel.level >= 10 || isDevProgressionUnlockEnabled();
  if (!unlocked) return state;
  const monthChoices = state.monthlyChallenges.find((m) => m.month === month);
  if (!monthChoices) return state;
  if (!monthChoices.optionIds.includes(optionId)) return state;
  if (state.userMonthlyChallenges.some((m) => m.month === month)) return state;
  const option = MONTHLY_CHALLENGE_OPTIONS.find((o) => o.id === optionId);
  if (!option) return state;

  const next: UserMonthlyChallenge = {
    id: `umc-${state.userId}-${month}`,
    userId: state.userId,
    month,
    chosenOptionId: optionId,
    status: 'ACTIVE',
    progressValue: 0,
    targetValue: option.rules.target,
    progressText: `0/${option.rules.target}`,
    lockedAt: now.toISOString(),
    updatedAt: now.toISOString()
  };

  return {
    ...state,
    userMonthlyChallenges: [...state.userMonthlyChallenges.filter((m) => m.month !== month), next]
  };
}

function evaluateChallengeProgress(
  option: ChallengeOption,
  sessions: Session[],
  now: Date
): { progressValue: number; target: number; completed: boolean; text: string } {
  const month = toMonthKey(now);
  const monthSessions = getSessionsInMonth(sessions, month);
  const byWeek = new Map<string, Session[]>();
  for (const session of monthSessions) {
    const k = weekStartKey(new Date(session.createdAt));
    byWeek.set(k, [...(byWeek.get(k) ?? []), session]);
  }

  switch (option.rules.kind) {
    case 'MONTHLY_WORKOUT_COUNT': {
      const value = monthSessions.length;
      return { progressValue: value, target: option.rules.target, completed: value >= option.rules.target, text: `${value}/${option.rules.target} séances` };
    }
    case 'MONTHLY_DISTANCE': {
      const value = monthSessions.reduce((sum, s) => sum + (s.distanceKm ?? 0), 0);
      return { progressValue: value, target: option.rules.target, completed: value >= option.rules.target, text: `${value.toFixed(1)}/${option.rules.target} km` };
    }
    case 'MONTHLY_ACTIVE_WEEKS': {
      const value = Array.from(byWeek.values()).filter(isWeekActive).length;
      return { progressValue: value, target: option.rules.target, completed: value >= option.rules.target, text: `${value}/${option.rules.target} semaines actives` };
    }
    case 'MONTHLY_LONG_RUN_COUNT': {
      const min = option.rules.minDurationMin ?? 90;
      const value = monthSessions.filter((s) => s.durationMin >= min).length;
      return { progressValue: value, target: option.rules.target, completed: value >= option.rules.target, text: `${value}/${option.rules.target} sorties >= ${min} min` };
    }
    case 'MONTHLY_EASY_SESSIONS': {
      const max = option.rules.maxRpe ?? 6;
      const value = monthSessions.filter((s) => s.feelings.rpe <= max).length;
      return { progressValue: value, target: option.rules.target, completed: value >= option.rules.target, text: `${value}/${option.rules.target} séances RPE<=${max}` };
    }
    case 'WEEKS_WITH_QUALITY_AND_RENFO': {
      const value = Array.from(byWeek.values()).filter((week) => {
        const intense = week.filter((s) => s.feelings.rpe >= 7).length;
        const renfo = week.filter((s) => s.subtype === 'RENFO').length;
        return intense >= 2 && renfo >= 1;
      }).length;
      return {
        progressValue: value,
        target: option.rules.target,
        completed: value >= option.rules.target,
        text: `${value}/${option.rules.target} semaines intenses+renfo`
      };
    }
    case 'ROLLING_ACTIVE_WEEKS': {
      const weeksWindow = option.rules.weeksWindow ?? 6;
      const rolling = getSessionsInWeeksWindow(sessions, now, weeksWindow);
      const map = new Map<string, Session[]>();
      for (const s of rolling) {
        const k = weekStartKey(new Date(s.createdAt));
        map.set(k, [...(map.get(k) ?? []), s]);
      }
      const value = Array.from(map.values()).filter(isWeekActive).length;
      return { progressValue: value, target: option.rules.target, completed: value >= option.rules.target, text: `${value}/${option.rules.target} semaines actives` };
    }
    case 'CONSECUTIVE_BALANCED_WEEKS': {
      const orderedWeeks = Array.from(byWeek.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      let best = 0;
      let streak = 0;
      for (const [, weekSessions] of orderedWeeks) {
        if (isBalancedWeek(weekSessions)) {
          streak += 1;
          best = Math.max(best, streak);
        } else {
          streak = 0;
        }
      }
      return { progressValue: best, target: option.rules.target, completed: best >= option.rules.target, text: `streak ${best}/${option.rules.target}` };
    }
    case 'MONTHLY_DISTANCE_VS_PREVIOUS': {
      const current = monthSessions.reduce((sum, s) => sum + (s.distanceKm ?? 0), 0);
      const prevMonthKey = toMonthKey(addMonths(parseMonthKey(month), -1));
      const previous = getSessionsInMonth(sessions, prevMonthKey).reduce((sum, s) => sum + (s.distanceKm ?? 0), 0);
      const required = previous * (1 + (option.rules.percentageTarget ?? 10) / 100);
      const ratio = required > 0 ? (current / required) * 100 : 0;
      return { progressValue: current, target: required, completed: current >= required && required > 0, text: `${current.toFixed(1)}/${required.toFixed(1)} km (${ratio.toFixed(0)}%)` };
    }
    case 'MONTHLY_QUALITY_SESSIONS': {
      const value = monthSessions.filter((s) => s.feelings.rpe >= 7).length;
      return { progressValue: value, target: option.rules.target, completed: value >= option.rules.target, text: `${value}/${option.rules.target} séances intenses (RPE >= 7)` };
    }
    case 'MONTHLY_PR_DISTANCE': {
      const value = 0;
      return { progressValue: value, target: option.rules.target, completed: false, text: 'Nécessite benchmark chrono (V2)' };
    }
    default:
      return { progressValue: 0, target: option.rules.target, completed: false, text: '0/0' };
  }
}

export function refreshMonthlyChallengeProgress(
  state: GamificationState,
  sessions: Session[],
  now: Date = new Date()
): { next: GamificationState; newlyCompleted: UserMonthlyChallenge | null } {
  const month = toMonthKey(now);
  const active = state.userMonthlyChallenges.find((m) => m.month === month);
  if (!active || active.status !== 'ACTIVE') return { next: state, newlyCompleted: null };
  const option = MONTHLY_CHALLENGE_OPTIONS.find((o) => o.id === active.chosenOptionId);
  if (!option) return { next: state, newlyCompleted: null };

  const evalResult = evaluateChallengeProgress(option, sessions, now);
  const status = evalResult.completed ? 'COMPLETED' : 'ACTIVE';
  const updated: UserMonthlyChallenge = {
    ...active,
    status,
    progressValue: Math.round(evalResult.progressValue * 100) / 100,
    targetValue: Math.round(evalResult.target * 100) / 100,
    progressText: evalResult.text,
    updatedAt: now.toISOString()
  };
  const next = {
    ...state,
    userMonthlyChallenges: state.userMonthlyChallenges.map((item) => (item.id === updated.id ? updated : item))
  };
  const newlyCompleted = updated.status === 'COMPLETED' ? updated : null;
  return { next, newlyCompleted };
}

export function canChangeTitle(state: GamificationState, now: Date = new Date()): boolean {
  if (state.userLevel.level < 15 && !isDevProgressionUnlockEnabled()) return false;
  if (!state.titleLastChangedAt) return true;
  const currentMonth = toMonthKey(now);
  const lastMonth = toMonthKey(new Date(state.titleLastChangedAt));
  return currentMonth !== lastMonth;
}

export function setActiveTitle(state: GamificationState, title: UserTitle, now: Date = new Date()): GamificationState {
  if (!canChangeTitle(state, now)) return state;
  return {
    ...state,
    activeTitle: title,
    titleLastChangedAt: now.toISOString()
  };
}

export function startGoal8Weeks(
  state: GamificationState,
  goalType: UserGoal8Weeks['goalType'],
  goalTarget: number,
  durationWeeks: number = 8,
  sessions: Session[] = [],
  now: Date = new Date()
): GamificationState {
  const unlocked = state.userLevel.level >= 20 || isDevProgressionUnlockEnabled();
  if (!unlocked) return state;
  if (state.userGoal8Weeks?.status === 'ACTIVE') return state;
  const safeDurationWeeks = Math.max(6, Math.min(16, Math.round(durationWeeks || 8)));
  const end = new Date(now);
  end.setDate(end.getDate() + safeDurationWeeks * 7);
  const prDistanceMap: Partial<Record<UserGoal8Weeks['goalType'], number>> = {
    PR_5K: 5,
    PR_10K: 10,
    PR_HALF: 21.1,
    PR_MARATHON: 42.2
  };
  const targetDistance = prDistanceMap[goalType];
  const lower = targetDistance ? targetDistance * 0.95 : 0;
  const upper = targetDistance ? targetDistance * 1.05 : 0;
  const beforeStart = sessions.filter((s) => new Date(s.createdAt).getTime() < now.getTime());
  const baselineCandidates = targetDistance
    ? beforeStart
        .filter((s) => (s.distanceKm ?? 0) >= lower && (s.distanceKm ?? 0) <= upper)
        .map((s) => s.durationMin / Math.max(0.1, s.distanceKm ?? targetDistance))
    : [];
  const baselinePace =
    baselineCandidates.length > 0
      ? Math.min(...baselineCandidates)
      : null;

  const goal: UserGoal8Weeks = {
    userId: state.userId,
    startDate: now.toISOString(),
    endDate: end.toISOString(),
    durationWeeks: safeDurationWeeks,
    goalType,
    status: 'ACTIVE',
    goalTarget,
    goalDistanceKm: targetDistance,
    targetPaceMinPerKm: targetDistance ? goalTarget / targetDistance : null,
    baselinePaceMinPerKm: baselinePace,
    bestPaceInCycleMinPerKm: null,
    progressValue: 0,
    progressText: baselinePace
      ? `Référence: ${baselinePace.toFixed(2)} min/km`
      : targetDistance
        ? 'Aucune référence historique, établis une séance benchmark.'
        : '0',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  return {
    ...state,
    userGoal8Weeks: goal
  };
}

export function resetGoal8Weeks(state: GamificationState): GamificationState {
  return {
    ...state,
    userGoal8Weeks: null
  };
}

export function resetMonthlyChallengeForMonth(
  state: GamificationState,
  month: string = toMonthKey(new Date())
): GamificationState {
  return {
    ...state,
    userMonthlyChallenges: state.userMonthlyChallenges.filter((item) => item.month !== month)
  };
}

export function resetActiveTitle(state: GamificationState): GamificationState {
  return {
    ...state,
    activeTitle: null,
    titleLastChangedAt: null
  };
}

export function refreshGoal8Weeks(state: GamificationState, sessions: Session[], now: Date = new Date()): GamificationState {
  const goal = state.userGoal8Weeks;
  if (!goal) return state;
  if (goal.status === 'FAILED') return state;
  const start = new Date(goal.startDate).getTime();
  const end = new Date(goal.endDate).getTime();
  const scoped = sessions.filter((s) => {
    const ts = new Date(s.createdAt).getTime();
    return ts >= start && ts <= end;
  });

  let progress = 0;
  let text = '0';
  if (goal.goalType === 'MONTHLY_DISTANCE') {
    progress = scoped.reduce((sum, s) => sum + (s.distanceKm ?? 0), 0);
    text = `${progress.toFixed(1)}/${goal.goalTarget} km`;
  } else if (goal.goalType === 'LONG_RUN_90MIN_X2') {
    progress = scoped.filter((s) => s.durationMin >= 90).length;
    text = `${progress}/${goal.goalTarget} sorties >=90min`;
  } else if (
    goal.goalType === 'PR_5K' ||
    goal.goalType === 'PR_10K' ||
    goal.goalType === 'PR_HALF' ||
    goal.goalType === 'PR_MARATHON'
  ) {
    const targetDistance = goal.goalDistanceKm ?? (goal.goalType === 'PR_5K'
      ? 5
      : goal.goalType === 'PR_10K'
        ? 10
        : goal.goalType === 'PR_HALF'
          ? 21.1
          : 42.2);
    const lower = targetDistance * 0.97;
    const upper = targetDistance * 1.1;
    const attempts = scoped
      .filter((s) => (s.distanceKm ?? 0) >= lower && (s.distanceKm ?? 0) <= upper && s.durationMin > 0)
      .map((s) => {
        const distance = Math.max(0.1, s.distanceKm ?? targetDistance);
        const equivalentTime = s.durationMin * (targetDistance / distance);
        return {
          session: s,
          equivalentTime,
          pace: equivalentTime / targetDistance
        };
      });
    const bestAttempt =
      attempts.length > 0
        ? attempts.reduce((best, current) => (current.equivalentTime < best.equivalentTime ? current : best))
        : null;
    const bestEquivalentTime = bestAttempt?.equivalentTime ?? null;
    const baseline = goal.baselinePaceMinPerKm;

    if (!baseline) {
      progress = attempts.length > 0 ? 1 : 0;
      text =
        attempts.length > 0
          ? `Benchmark créé (${attempts.length} tentative${attempts.length > 1 ? 's' : ''}).`
          : `En attente d'une première séance référence (~${targetDistance} km).`;
    } else {
      progress = bestEquivalentTime !== null ? Math.min(100, (goal.goalTarget / bestEquivalentTime) * 100) : 0;
      if (bestAttempt) {
        const rawDistance = bestAttempt.session.distanceKm ?? targetDistance;
        const rawDuration = bestAttempt.session.durationMin;
        text = `Cible ${goal.goalTarget.toFixed(2)} min · Équiv ${targetDistance} km: ${bestAttempt.equivalentTime.toFixed(
          2
        )} min (séance ${rawDistance.toFixed(2)} km en ${rawDuration.toFixed(2)} min)`;
      } else {
        text = 'Aucune tentative exploitable.';
      }
    }
  } else {
    progress = 0;
    text = 'Type d’objectif non reconnu';
  }

  let status: UserGoal8Weeks['status'] = 'ACTIVE';
  if (
    goal.goalType === 'PR_5K' ||
    goal.goalType === 'PR_10K' ||
    goal.goalType === 'PR_HALF' ||
    goal.goalType === 'PR_MARATHON'
  ) {
    status = progress >= 100 ? 'COMPLETED' : 'ACTIVE';
  } else if (progress >= goal.goalTarget) {
    status = 'COMPLETED';
  }
  else if (now.getTime() > end) status = 'FAILED';

  return {
    ...state,
    userGoal8Weeks: {
      ...goal,
      progressValue: Math.round(progress * 100) / 100,
      progressText: text,
      bestPaceInCycleMinPerKm:
        goal.goalType === 'PR_5K' ||
        goal.goalType === 'PR_10K' ||
        goal.goalType === 'PR_HALF' ||
        goal.goalType === 'PR_MARATHON'
          ? (() => {
              const targetDistance = goal.goalDistanceKm ?? (goal.goalType === 'PR_5K'
                ? 5
                : goal.goalType === 'PR_10K'
                  ? 10
                  : goal.goalType === 'PR_HALF'
                    ? 21.1
                    : 42.2);
              const lower = targetDistance * 0.97;
              const upper = targetDistance * 1.1;
              const attempts = scoped.filter(
                (s) => (s.distanceKm ?? 0) >= lower && (s.distanceKm ?? 0) <= upper && s.durationMin > 0
              );
              if (!attempts.length) return goal.bestPaceInCycleMinPerKm ?? null;
              return Math.min(
                ...attempts.map((s) => {
                  const distance = Math.max(0.1, s.distanceKm ?? targetDistance);
                  const equivalentTime = s.durationMin * (targetDistance / distance);
                  return equivalentTime / targetDistance;
                })
              );
            })()
          : goal.bestPaceInCycleMinPerKm ?? null,
      status,
      updatedAt: now.toISOString()
    }
  };
}

function titleScore(title: UserTitle, weeklyStats: WeeklyStat[], sessions: Session[], monthlyCompleted: number): number {
  const activeWeeks = weeklyStats.filter((w) => w.totalDurationMin > 0).length;
  const balancedWeeks = (() => {
    const byWeek = new Map<string, Session[]>();
    for (const s of sessions) {
      const k = weekStartKey(new Date(s.createdAt));
      byWeek.set(k, [...(byWeek.get(k) ?? []), s]);
    }
    return Array.from(byWeek.values()).filter(isBalancedWeek).length;
  })();
  const diversity = new Set(sessions.map((s) => s.subtype)).size;
  const progressionEvents = sessions.filter((s) => QUALITY_SUBTYPES.has(s.subtype)).length;

  if (title === 'PILIER') return activeWeeks * 10 + balancedWeeks * 3;
  if (title === 'STRATEGE') return balancedWeeks * 12 + activeWeeks * 4;
  if (title === 'EXPLORATEUR') return diversity * 15 + activeWeeks * 3;
  if (title === 'PERFORMEUR') return progressionEvents * 6 + monthlyCompleted * 20;
  return monthlyCompleted * 25 + activeWeeks * 2;
}

export function computeHallOfFameEntries(
  state: GamificationState,
  sessions: Session[],
  seasonId: string,
  now: Date = new Date()
): HallOfFameEntry[] {
  const season = state.seasons.find((s) => s.id === seasonId);
  if (!season) return [];
  const start = new Date(season.startDate).getTime();
  const end = new Date(season.endDate).getTime();
  const seasonSessions = sessions.filter((s) => {
    const ts = new Date(s.createdAt).getTime();
    return ts >= start && ts <= end;
  });
  const seasonWeekly = computeWeeklyStats(seasonSessions, state.userId);
  const completedMonthly = state.userMonthlyChallenges.filter((m) => m.status === 'COMPLETED').length;
  const categories: UserTitle[] = ['EXPLORATEUR', 'STRATEGE', 'PERFORMEUR', 'PILIER', 'MENTOR'];
  return categories.map((category) => ({
    id: `hof-${seasonId}-${category}-${state.userId}`,
    seasonId,
    titleCategory: category,
    userId: state.userId,
    rank: 1,
    score: titleScore(category, seasonWeekly, seasonSessions, completedMonthly),
    createdAt: now.toISOString()
  }));
}

export function applyPrestige(state: GamificationState): GamificationState {
  if (state.userLevel.level < 30) return state;
  const keepXp = GAMIFICATION_V1_CONFIG.prestigeKeepXp;
  return {
    ...state,
    prestigeLevel: state.prestigeLevel + 1,
    userLevel: {
      ...state.userLevel,
      level: 1,
      xpTotal: keepXp ? state.userLevel.xpTotal : 0,
      xpToNextLevel: 208,
      updatedAt: new Date().toISOString()
    }
  };
}
