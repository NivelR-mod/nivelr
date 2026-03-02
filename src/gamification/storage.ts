import { GAMIFICATION_V1_CONFIG, GAMIFICATION_V1_ENABLED } from './config';
import { MONTHLY_CHALLENGE_OPTIONS } from './challengeOptions';
import { getLevelFromXpV1, getXpToNextLevelV1 } from './levels';
import { GamificationState, Season } from './types';
import { alignAscensionSeasonOneTimeline, createDefaultAscensionState } from './ascension';
import { scopedStorageKey } from '../storage/userScope';

const LEGACY_GAMI_MIGRATION_KEY = 'sport-gamification-v1-migrated';

function getDateKey(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getISOWeekNumber(date: Date): { year: number; week: number } {
  const tmp = new Date(date);
  tmp.setHours(0, 0, 0, 0);

  const day = tmp.getDay() || 7;
  tmp.setDate(tmp.getDate() + 4 - day);

  const yearStart = new Date(tmp.getFullYear(), 0, 1);
  const diffDays = Math.floor((tmp.getTime() - yearStart.getTime()) / 86400000) + 1;
  const week = Math.ceil(diffDays / 7);

  return { year: tmp.getFullYear(), week };
}

export function getWeekKey(date: Date): string {
  const { year, week } = getISOWeekNumber(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function addWeeks(date: Date, weeks: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + weeks * 7);
  return next;
}

function parseWeekKey(weekKey: string): { year: number; week: number } | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  if (!match) return null;
  return { year: Number(match[1]), week: Number(match[2]) };
}

function dateFromWeekKey(weekKey: string): Date {
  const parsed = parseWeekKey(weekKey);
  if (!parsed) return new Date();

  const simple = new Date(parsed.year, 0, 1 + (parsed.week - 1) * 7);
  const dow = simple.getDay();
  if (dow <= 4) {
    simple.setDate(simple.getDate() - simple.getDay() + 1);
  } else {
    simple.setDate(simple.getDate() + 8 - simple.getDay());
  }
  simple.setHours(0, 0, 0, 0);
  return simple;
}

function ensureSeasonCovering(currentWeekKey: string, seasons: Season[]): { seasons: Season[]; currentSeasonId: string } {
  const nowWeekDate = dateFromWeekKey(currentWeekKey);
  const active = seasons.find((season) => {
    const start = new Date(season.startDate);
    const end = new Date(season.endDate);
    return nowWeekDate >= start && nowWeekDate <= end;
  });

  if (active) {
    return {
      seasons: seasons.map((season) => {
        if (season.id === active.id) return { ...season, state: 'ACTIVE' };
        if (new Date(season.endDate) < nowWeekDate) return { ...season, state: 'ENDED' };
        return { ...season, state: 'UPCOMING' };
      }),
      currentSeasonId: active.id
    };
  }

  const start = nowWeekDate;
  const end = addWeeks(start, GAMIFICATION_V1_CONFIG.seasonDurationWeeks);
  end.setDate(end.getDate() - 1);

  const id = `S${start.getFullYear()}-${getDateKey(start)}`;
  const created: Season = {
    id,
    label: `Saison ${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    state: 'ACTIVE',
    carryOverRatio: GAMIFICATION_V1_CONFIG.seasonCarryOverRatio
  };

  const nextSeasons: Season[] = seasons
    .map((season) => {
      if (new Date(season.endDate) < nowWeekDate) return { ...season, state: 'ENDED' as const };
      return season;
    })
    .concat(created);

  return {
    seasons: nextSeasons,
    currentSeasonId: id
  };
}

export function createDefaultGamificationState(): GamificationState {
  const now = new Date();
  const weekKey = getWeekKey(now);
  const seasonInfo = ensureSeasonCovering(weekKey, []);

  return {
    enabled: GAMIFICATION_V1_ENABLED,
    userId: GAMIFICATION_V1_CONFIG.defaultUserId,
    weeklyXpCap: GAMIFICATION_V1_CONFIG.weeklyXpCap,
    maxXpSessionsPerDay: GAMIFICATION_V1_CONFIG.maxXpSessionsPerDay,
    missionCatalogVersion: GAMIFICATION_V1_CONFIG.missionCatalogVersion,
    activeTitle: null,
    titleLastChangedAt: null,
    prestigeLevel: 0,
    userXpLog: [],
    userLevel: {
      userId: GAMIFICATION_V1_CONFIG.defaultUserId,
      level: 1,
      xpTotal: 0,
      xpToNextLevel: getXpToNextLevelV1(0),
      updatedAt: now.toISOString()
    },
    userStreak: {
      userId: GAMIFICATION_V1_CONFIG.defaultUserId,
      activeWeeks: 0,
      jokerRemaining: 1,
      lastEvaluatedWeekKey: null,
      awardedMilestones: []
    },
    weeklyStats: [],
    challengeOptions: MONTHLY_CHALLENGE_OPTIONS,
    monthlyChallenges: [],
    userMonthlyChallenges: [],
    userGoal8Weeks: null,
    hallOfFameEntries: [],
    missionsUserProgress: {},
    seasons: seasonInfo.seasons,
    currentSeasonId: seasonInfo.currentSeasonId,
    leaderboards: {
      weekly: [],
      season: [],
      updatedAt: now.toISOString()
    },
    teams: [],
    teamMembers: [],
    ascension: createDefaultAscensionState(GAMIFICATION_V1_CONFIG.defaultUserId, now),
    unlockNotifications: []
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

export function normalizeGamificationState(input: unknown): GamificationState {
  const fallback = createDefaultGamificationState();
  if (!isObject(input)) return fallback;

  const enabled = typeof input.enabled === 'boolean' ? input.enabled : fallback.enabled;
  const userId = typeof input.userId === 'string' ? input.userId : fallback.userId;
  const weeklyXpCap =
    typeof input.weeklyXpCap === 'number' && Number.isFinite(input.weeklyXpCap)
      ? Math.max(200, Math.min(3000, Math.round(input.weeklyXpCap)))
      : fallback.weeklyXpCap;

  const maxXpSessionsPerDay =
    typeof input.maxXpSessionsPerDay === 'number' && Number.isFinite(input.maxXpSessionsPerDay)
      ? Math.max(1, Math.min(5, Math.round(input.maxXpSessionsPerDay)))
      : fallback.maxXpSessionsPerDay;

  const userXpLog = Array.isArray(input.userXpLog) ? (input.userXpLog as GamificationState['userXpLog']) : [];
  const xpTotalRaw = isObject(input.userLevel) && typeof input.userLevel.xpTotal === 'number' ? input.userLevel.xpTotal : 0;
  const xpTotalFromLog = userXpLog.reduce((sum, entry) => sum + (Number.isFinite(entry.amount) ? entry.amount : 0), 0);
  const xpTotal = Math.max(0, Math.round(Math.max(xpTotalRaw, xpTotalFromLog)));
  const level = getLevelFromXpV1(xpTotal);

  const state: GamificationState = {
    ...fallback,
    enabled,
    userId,
    weeklyXpCap,
    maxXpSessionsPerDay,
    missionCatalogVersion:
      typeof input.missionCatalogVersion === 'string' ? input.missionCatalogVersion : fallback.missionCatalogVersion,
    activeTitle:
      input.activeTitle === 'EXPLORATEUR' ||
      input.activeTitle === 'STRATEGE' ||
      input.activeTitle === 'PERFORMEUR' ||
      input.activeTitle === 'PILIER' ||
      input.activeTitle === 'MENTOR'
        ? input.activeTitle
        : null,
    titleLastChangedAt: typeof input.titleLastChangedAt === 'string' ? input.titleLastChangedAt : null,
    prestigeLevel:
      typeof input.prestigeLevel === 'number' && Number.isFinite(input.prestigeLevel)
        ? Math.max(0, Math.floor(input.prestigeLevel))
        : 0,
    userXpLog,
    userLevel: {
      userId,
      level,
      xpTotal,
      xpToNextLevel: getXpToNextLevelV1(xpTotal),
      updatedAt:
        isObject(input.userLevel) && typeof input.userLevel.updatedAt === 'string'
          ? input.userLevel.updatedAt
          : fallback.userLevel.updatedAt
    },
    userStreak: isObject(input.userStreak)
      ? {
          userId,
          activeWeeks:
            typeof input.userStreak.activeWeeks === 'number' && Number.isFinite(input.userStreak.activeWeeks)
              ? Math.max(0, Math.round(input.userStreak.activeWeeks))
              : 0,
          jokerRemaining:
            typeof input.userStreak.jokerRemaining === 'number' && Number.isFinite(input.userStreak.jokerRemaining)
              ? Math.max(0, Math.min(1, Math.round(input.userStreak.jokerRemaining)))
              : 1,
          lastEvaluatedWeekKey:
            typeof input.userStreak.lastEvaluatedWeekKey === 'string' ? input.userStreak.lastEvaluatedWeekKey : null,
          awardedMilestones: Array.isArray(input.userStreak.awardedMilestones)
            ? input.userStreak.awardedMilestones.filter((v): v is string => typeof v === 'string')
            : []
        }
      : fallback.userStreak,
    weeklyStats: Array.isArray(input.weeklyStats) ? (input.weeklyStats as GamificationState['weeklyStats']) : [],
    // Always trust current code catalog to avoid stale labels from old localStorage snapshots.
    challengeOptions: MONTHLY_CHALLENGE_OPTIONS,
    monthlyChallenges: Array.isArray(input.monthlyChallenges)
      ? (input.monthlyChallenges as GamificationState['monthlyChallenges'])
      : [],
    userMonthlyChallenges: Array.isArray(input.userMonthlyChallenges)
      ? (input.userMonthlyChallenges as GamificationState['userMonthlyChallenges'])
      : [],
    userGoal8Weeks: isObject(input.userGoal8Weeks)
      ? (input.userGoal8Weeks as unknown as GamificationState['userGoal8Weeks'])
      : null,
    hallOfFameEntries: Array.isArray(input.hallOfFameEntries)
      ? (input.hallOfFameEntries as GamificationState['hallOfFameEntries'])
      : [],
    missionsUserProgress: isObject(input.missionsUserProgress)
      ? (input.missionsUserProgress as GamificationState['missionsUserProgress'])
      : {},
    seasons: Array.isArray(input.seasons) ? (input.seasons as Season[]) : fallback.seasons,
    currentSeasonId: typeof input.currentSeasonId === 'string' ? input.currentSeasonId : fallback.currentSeasonId,
    leaderboards: isObject(input.leaderboards)
      ? {
          weekly: Array.isArray(input.leaderboards.weekly)
            ? (input.leaderboards.weekly as GamificationState['leaderboards']['weekly'])
            : [],
          season: Array.isArray(input.leaderboards.season)
            ? (input.leaderboards.season as GamificationState['leaderboards']['season'])
            : [],
          updatedAt:
            typeof input.leaderboards.updatedAt === 'string'
              ? input.leaderboards.updatedAt
              : fallback.leaderboards.updatedAt
        }
      : fallback.leaderboards,
    teams: Array.isArray(input.teams) ? (input.teams as GamificationState['teams']) : [],
    teamMembers: Array.isArray(input.teamMembers)
      ? (input.teamMembers as GamificationState['teamMembers'])
      : [],
    ascension: isObject(input.ascension)
      ? ({
          enabled:
            typeof input.ascension.enabled === 'boolean'
              ? input.ascension.enabled
              : fallback.ascension.enabled,
          seasons: Array.isArray(input.ascension.seasons)
            ? (input.ascension.seasons as GamificationState['ascension']['seasons'])
            : fallback.ascension.seasons,
          currentSeasonId:
            typeof input.ascension.currentSeasonId === 'string'
              ? input.ascension.currentSeasonId
              : fallback.ascension.currentSeasonId,
          teams: Array.isArray(input.ascension.teams)
            ? (input.ascension.teams as Array<Record<string, unknown>>).map((team, index) => ({
                id: typeof team.id === 'string' ? team.id : `asc-team-legacy-${index}`,
                seasonId:
                  typeof team.seasonId === 'string'
                    ? team.seasonId
                    : fallback.ascension.currentSeasonId,
                name: typeof team.name === 'string' ? team.name : `Equipe ${index + 1}`,
                ownerUserId:
                  typeof team.ownerUserId === 'string' ? team.ownerUserId : userId,
                inviteCode:
                  typeof team.inviteCode === 'string' && team.inviteCode.trim()
                    ? team.inviteCode
                    : `ASC-L${String(index + 1).padStart(3, '0')}`,
                createdAt:
                  typeof team.createdAt === 'string'
                    ? team.createdAt
                    : fallback.userLevel.updatedAt
              }))
            : [],
          teamMembers: Array.isArray(input.ascension.teamMembers)
            ? (input.ascension.teamMembers as GamificationState['ascension']['teamMembers'])
            : [],
          teamPa: Array.isArray(input.ascension.teamPa)
            ? (input.ascension.teamPa as GamificationState['ascension']['teamPa'])
            : [],
          userBuilds: Array.isArray(input.ascension.userBuilds)
            ? (input.ascension.userBuilds as GamificationState['ascension']['userBuilds'])
            : fallback.ascension.userBuilds
        } as GamificationState['ascension'])
      : fallback.ascension,
    unlockNotifications: Array.isArray(input.unlockNotifications)
      ? (input.unlockNotifications as GamificationState['unlockNotifications'])
      : []
  };

  const currentWeekKey = getWeekKey(new Date());
  const seasonInfo = ensureSeasonCovering(currentWeekKey, state.seasons);
  state.seasons = seasonInfo.seasons;
  state.currentSeasonId = seasonInfo.currentSeasonId;
  state.ascension = alignAscensionSeasonOneTimeline(state.ascension);

  return state;
}

export function loadGamificationState(): GamificationState {
  try {
    const storageKey = scopedStorageKey(GAMIFICATION_V1_CONFIG.storageKey);
    const raw = localStorage.getItem(storageKey);
    if (!raw) return createDefaultGamificationState();
    return normalizeGamificationState(JSON.parse(raw));
  } catch {
    return createDefaultGamificationState();
  }
}

export function saveGamificationState(state: GamificationState): void {
  const storageKey = scopedStorageKey(GAMIFICATION_V1_CONFIG.storageKey);
  localStorage.setItem(storageKey, JSON.stringify(state));
}

export function resetGamificationState(): void {
  const storageKey = scopedStorageKey(GAMIFICATION_V1_CONFIG.storageKey);
  localStorage.removeItem(storageKey);
}

function migrateLegacyGamificationIfNeeded(): void {
  try {
    if (localStorage.getItem(LEGACY_GAMI_MIGRATION_KEY) === '1') return;
    const storageKey = scopedStorageKey(GAMIFICATION_V1_CONFIG.storageKey);
    if (!localStorage.getItem(storageKey)) {
      const legacyRaw = localStorage.getItem(GAMIFICATION_V1_CONFIG.storageKey);
      if (legacyRaw) {
        localStorage.setItem(storageKey, legacyRaw);
      }
    }
    localStorage.removeItem(GAMIFICATION_V1_CONFIG.storageKey);
    localStorage.setItem(LEGACY_GAMI_MIGRATION_KEY, '1');
  } catch {
    // no-op
  }
}

migrateLegacyGamificationIfNeeded();
