import { Session } from '../types/models';
import {
  AscensionRole,
  AscensionSeason,
  AscensionState,
  AscensionStatKey,
  AscensionTeam,
  AscensionTeamMember,
  AscensionUserBuild,
  GamificationState
} from './types';

const ASCENSION_CONFIG = {
  seasonDurationWeeks: 4,
  teamMaxSize: 4,
  objectiveMinPa: 1500,
  intensityBonus: 2,
  regularityBonus: 1.5,
  roleBonusCap: 0.25,
  statsBonusCap: 0.25,
  totalBonusCap: 0.4,
  maxStatsPoints: 30
} as const;

const ROLE_BONUS_MAX_PERCENT: Record<AscensionRole, number> = {
  PERFORMEUR: 20,
  PILIER: 10,
  EXPLORATEUR: 20,
  STRATEGE: 15,
  MENTOR: 10
};

const ROLE_BONUS_STAT_KEY: Record<AscensionRole, AscensionStatKey> = {
  PERFORMEUR: 'INTENSITE',
  PILIER: 'REGULARITE',
  EXPLORATEUR: 'EXPLORATION',
  STRATEGE: 'MAITRISE',
  MENTOR: 'ENDURANCE'
};

const ROLE_BONUS_EXPONENT = 1.6;
const STAT_BONUS_CONFIG: Record<AscensionStatKey, { maxPercent: number; exponent: number }> = {
  ENDURANCE: { maxPercent: 18, exponent: 1.45 },
  INTENSITE: { maxPercent: 20, exponent: 1.7 },
  REGULARITE: { maxPercent: 14, exponent: 1.35 },
  MAITRISE: { maxPercent: 16, exponent: 1.6 },
  EXPLORATION: { maxPercent: 16, exponent: 1.55 }
};

const ASCENSION_SEASON_1_START = new Date(2026, 2, 1);

function toDayKey(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 1 - day);
  return d;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function weekKey(date: Date): string {
  return toDayKey(getWeekStart(date));
}

function isWeekActive(weekSessions: Session[]): boolean {
  return weekSessions.length >= 3;
}

function sumDistanceKm(sessions: Session[]): number {
  return sessions.reduce((sum, session) => sum + Math.max(0, session.distanceKm ?? 0), 0);
}

function getPreviousWeekSessions(sessions: Session[], targetDate: Date): Session[] {
  const previousWeekStart = addDays(getWeekStart(targetDate), -7);
  const key = toDayKey(previousWeekStart);
  return sessions.filter((session) => weekKey(new Date(session.createdAt)) === key);
}

function isWeekBalanced(weekSessions: Session[], allSessions: Session[], targetDate: Date): boolean {
  const hasEasy = weekSessions.some((session) => session.feelings.rpe <= 6);
  const hasIntense = weekSessions.some((session) => session.feelings.rpe >= 7);
  if (!hasEasy || !hasIntense) return false;

  const previousWeekSessions = getPreviousWeekSessions(allSessions, targetDate);
  const previousDistance = sumDistanceKm(previousWeekSessions);
  if (previousDistance <= 0) return true;

  const currentDistance = sumDistanceKm(weekSessions);
  return currentDistance <= previousDistance * 1.15;
}

function trainingFamilyForSubtype(subtype: Session['subtype']): string {
  if (subtype === 'EF') return 'ENDURANCE';
  if (subtype === 'SEUIL' || subtype === 'VMA') return 'QUALITE';
  if (subtype === 'SORTIE_LONGUE') return 'LONGUE';
  if (subtype === 'RENFO') return 'RENFO';
  if (subtype === 'MOBILITE') return 'MOBILITE';
  return 'AUTRE';
}

function weekHasVariety(weekSessions: Session[]): boolean {
  return new Set(weekSessions.map((session) => trainingFamilyForSubtype(session.subtype))).size >= 3;
}

export function getAscensionRoleStatKey(role: AscensionRole): AscensionStatKey {
  return ROLE_BONUS_STAT_KEY[role];
}

export function getAscensionRoleBonusPercent(role: AscensionRole, statPoints: number): number {
  const cappedPoints = Math.max(0, Math.min(25, Math.floor(statPoints)));
  const ratio = cappedPoints / 25;
  const scaled = Math.pow(ratio, ROLE_BONUS_EXPONENT);
  const maxPercent = ROLE_BONUS_MAX_PERCENT[role];
  return Math.round(maxPercent * scaled * 100) / 100;
}

export function getAscensionStatBonusPercent(key: AscensionStatKey, statPoints: number): number {
  const cappedPoints = Math.max(0, Math.min(25, Math.floor(statPoints)));
  const config = STAT_BONUS_CONFIG[key];
  const ratio = cappedPoints / 25;
  const scaled = Math.pow(ratio, config.exponent);
  return Math.round(config.maxPercent * scaled * 100) / 100;
}

function getSessionsInWeek(sessions: Session[], targetDate: Date): Session[] {
  const key = weekKey(targetDate);
  return sessions.filter((s) => weekKey(new Date(s.createdAt)) === key);
}

function getCurrentMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function endOfSeason(start: Date): Date {
  return addDays(start, ASCENSION_CONFIG.seasonDurationWeeks * 7 - 1);
}

function seasonStatusFor(now: Date, start: Date, end: Date): AscensionSeason['status'] {
  const ts = now.getTime();
  if (ts < start.getTime()) return 'UPCOMING';
  if (ts > end.getTime()) return 'ENDED';
  return 'ACTIVE';
}

function isBeforeSeasonStart(season: AscensionSeason, now: Date): boolean {
  return now.getTime() < new Date(season.startDate).getTime();
}

function isSeasonActiveNow(season: AscensionSeason, now: Date): boolean {
  const ts = now.getTime();
  const start = new Date(season.startDate).getTime();
  const end = new Date(season.endDate).getTime();
  return ts >= start && ts <= end;
}

function isAfterSeasonEnd(season: AscensionSeason, now: Date): boolean {
  return now.getTime() > new Date(season.endDate).getTime();
}

function defaultStats(): Record<AscensionStatKey, number> {
  return {
    ENDURANCE: 0,
    INTENSITE: 0,
    REGULARITE: 0,
    MAITRISE: 0,
    EXPLORATION: 0
  };
}

export function createDefaultAscensionState(userId: string, now: Date = new Date()): AscensionState {
  const start = new Date(ASCENSION_SEASON_1_START);
  const end = endOfSeason(start);
  const status = seasonStatusFor(now, start, end);
  const season: AscensionSeason = {
    id: `ascension-${toDayKey(start)}`,
    name: 'SAISON 1 - ASCENSION',
    theme: 'ASCENSION',
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    status,
    objectiveMinPa: ASCENSION_CONFIG.objectiveMinPa,
    objectivePa: null,
    calibrationWeekPa: null,
    milestoneReached: [],
    hallOfFamePublished: false
  };

  const build: AscensionUserBuild = {
    seasonId: season.id,
    userId,
    role: null,
    stats: defaultStats(),
    pointsUsed: 0,
    updatedAt: now.toISOString()
  };

  return {
    enabled: true,
    seasons: [season],
    currentSeasonId: season.id,
    teams: [],
    teamMembers: [],
    teamPa: [],
    userBuilds: [build]
  };
}

export function alignAscensionSeasonOneTimeline(state: AscensionState, now: Date = new Date()): AscensionState {
  const seasonIndex = state.seasons.findIndex(
    (season) => season.name === 'SAISON 1 - ASCENSION' || season.theme === 'ASCENSION'
  );
  if (seasonIndex < 0) return state;

  const start = new Date(ASCENSION_SEASON_1_START);
  const end = endOfSeason(start);
  const status = seasonStatusFor(now, start, end);

  const target = state.seasons[seasonIndex];
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const scheduleChanged = target.startDate !== startIso || target.endDate !== endIso;
  const normalizedSeason: AscensionSeason = {
    ...target,
    startDate: startIso,
    endDate: endIso,
    status
  };

  const nextSeasons = [...state.seasons];
  nextSeasons[seasonIndex] = normalizedSeason;

  let next: AscensionState = {
    ...state,
    seasons: nextSeasons
  };

  if (scheduleChanged && now.getTime() < start.getTime()) {
    next = {
      ...next,
      teams: [],
      teamMembers: [],
      teamPa: [],
      userBuilds: next.userBuilds.map((build) =>
        build.seasonId === normalizedSeason.id
          ? {
              ...build,
              role: null,
              stats: defaultStats(),
              pointsUsed: 0,
              updatedAt: now.toISOString()
            }
          : build
      ),
      seasons: next.seasons.map((season) =>
        season.id === normalizedSeason.id
          ? {
              ...season,
              objectivePa: null,
              calibrationWeekPa: null,
              milestoneReached: [],
              hallOfFamePublished: false
            }
          : season
      )
    };
  }

  return next;
}

function getCurrentSeason(state: AscensionState): AscensionSeason | null {
  return state.seasons.find((s) => s.id === state.currentSeasonId) ?? null;
}

function getOrCreateBuild(state: AscensionState, userId: string, seasonId: string): AscensionUserBuild {
  const existing = state.userBuilds.find((b) => b.userId === userId && b.seasonId === seasonId);
  if (existing) return existing;
  const build: AscensionUserBuild = {
    seasonId,
    userId,
    role: null,
    stats: defaultStats(),
    pointsUsed: 0,
    updatedAt: new Date().toISOString()
  };
  state.userBuilds.push(build);
  return build;
}

function isWeekOne(season: AscensionSeason, now: Date): boolean {
  const start = new Date(season.startDate).getTime();
  const endWeekOne = addDays(new Date(season.startDate), 6).getTime();
  const ts = now.getTime();
  return ts >= start && ts <= endWeekOne;
}

function isModoBypassEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem('nivelr_modo_enabled') === '1';
}

function activeMembership(state: AscensionState, userId: string, seasonId: string): AscensionTeamMember | null {
  return (
    state.teamMembers.find(
      (m) => m.userId === userId && m.seasonId === seasonId && m.leftAt === null
    ) ?? null
  );
}

function generateInviteCode(existingCodes: Set<string>): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 50; attempt += 1) {
    let suffix = '';
    for (let i = 0; i < 4; i += 1) {
      suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    const code = `ASC-${suffix}`;
    if (!existingCodes.has(code)) return code;
  }
  return `ASC-${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

function teamDiversityBonus(state: AscensionState, seasonId: string, teamId: string): number {
  const members = state.teamMembers.filter((m) => m.teamId === teamId && m.seasonId === seasonId && m.leftAt === null);
  const rolesByMember = members.map((member) =>
    state.userBuilds.find((b) => b.userId === member.userId && b.seasonId === seasonId)?.role ?? null
  );
  const roles = new Set(rolesByMember.filter((role): role is AscensionRole => Boolean(role)));
  const allMembersHaveRole = rolesByMember.every((role) => Boolean(role));
  if (roles.size >= 4) return 0.05;
  if (roles.size >= 3) return 0.03;
  if (allMembersHaveRole && roles.size <= 1 && members.length >= 2) return -0.05;
  return 0;
}

function mentorCollectiveBonus(state: AscensionState, season: AscensionSeason, teamId: string): number {
  if (!season.milestoneReached.length) return 0;
  const members = state.teamMembers.filter((m) => m.teamId === teamId && m.seasonId === season.id && m.leftAt === null);
  const hasMentor = members.some((member) => {
    const build = state.userBuilds.find((b) => b.userId === member.userId && b.seasonId === season.id);
    return build?.role === 'MENTOR';
  });
  return hasMentor ? 0.05 : 0;
}

function monthlyChallengeActiveForUser(gState: GamificationState, now: Date): boolean {
  const month = getCurrentMonthKey(now);
  return gState.userMonthlyChallenges.some((m) => m.userId === gState.userId && m.month === month && m.status === 'ACTIVE');
}

export function pa_calculation(
  gState: GamificationState,
  session: Session,
  sessionsAfterInsert: Session[],
  now: Date = new Date()
): { basePa: number; finalPa: number; details: string } {
  const asc = gState.ascension;
  const season = getCurrentSeason(asc);
  if (!season) return { basePa: 0, finalPa: 0, details: 'No active season' };
  const membership = activeMembership(asc, gState.userId, season.id);
  if (!membership) return { basePa: 0, finalPa: 0, details: 'No active team membership' };

  const build = getOrCreateBuild(asc, gState.userId, season.id);
  const sessionDate = new Date(session.createdAt);
  const weekSessions = getSessionsInWeek(sessionsAfterInsert, sessionDate);
  const weekSessionsBeforeInsert = weekSessions.filter((item) => item.id !== session.id);
  const weekActive = isWeekActive(weekSessions);
  const weekBecameActive = !isWeekActive(weekSessionsBeforeInsert) && weekActive;
  const weekBalanced = isWeekBalanced(weekSessions, sessionsAfterInsert, sessionDate);
  const weekVariety = weekHasVariety(weekSessions);

  let base = Math.max(0, session.distanceKm ?? 0);
  if (session.feelings.rpe >= 7) base += ASCENSION_CONFIG.intensityBonus;
  if (weekBecameActive) base += ASCENSION_CONFIG.regularityBonus;
  if (build.role === 'PILIER' && weekBecameActive) base += 10;

  let roleBonus = 0;
  const role = build.role;
  const roleStatPoints = role ? build.stats[getAscensionRoleStatKey(role)] : 0;
  const roleScaledBonus = role ? getAscensionRoleBonusPercent(role, roleStatPoints) / 100 : 0;
  if (role === 'PERFORMEUR' && session.feelings.rpe >= 7) roleBonus += roleScaledBonus;
  if (role === 'PILIER') roleBonus += roleScaledBonus;
  if (role === 'EXPLORATEUR' && weekVariety) roleBonus += roleScaledBonus;
  if (role === 'STRATEGE' && weekBalanced) roleBonus += roleScaledBonus;
  if (role === 'MENTOR' && monthlyChallengeActiveForUser(gState, now)) roleBonus += roleScaledBonus;

  let statsBonus = 0;
  if (session.feelings.rpe <= 6) {
    statsBonus += Math.min(
      ASCENSION_CONFIG.statsBonusCap,
      getAscensionStatBonusPercent('ENDURANCE', build.stats.ENDURANCE) / 100
    );
  }
  if (session.feelings.rpe >= 7) {
    statsBonus += Math.min(
      ASCENSION_CONFIG.statsBonusCap,
      getAscensionStatBonusPercent('INTENSITE', build.stats.INTENSITE) / 100
    );
  }
  if (weekBecameActive) {
    statsBonus += Math.min(
      ASCENSION_CONFIG.statsBonusCap,
      getAscensionStatBonusPercent('REGULARITE', build.stats.REGULARITE) / 100
    );
  }
  if (weekBalanced) {
    statsBonus += Math.min(
      ASCENSION_CONFIG.statsBonusCap,
      getAscensionStatBonusPercent('MAITRISE', build.stats.MAITRISE) / 100
    );
  }
  if (weekVariety) {
    statsBonus += Math.min(
      ASCENSION_CONFIG.statsBonusCap,
      getAscensionStatBonusPercent('EXPLORATION', build.stats.EXPLORATION) / 100
    );
  }

  const teamBonus = teamDiversityBonus(asc, season.id, membership.teamId) + mentorCollectiveBonus(asc, season, membership.teamId);
  const combinedBonus = Math.max(-0.1, Math.min(ASCENSION_CONFIG.totalBonusCap, roleBonus + statsBonus + teamBonus));
  const finalPa = Math.max(0, Math.round(base * (1 + combinedBonus) * 100) / 100);
  return {
    basePa: Math.round(base * 100) / 100,
    finalPa,
    details: `role=${(roleBonus * 100).toFixed(1)}% stats=${(statsBonus * 100).toFixed(1)}% team=${(teamBonus * 100).toFixed(1)}%`
  };
}

export function compute_season_objective(
  season: AscensionSeason,
  calibrationWeekPa: number
): number {
  return Math.max(Math.round(calibrationWeekPa * 4 * 1.2), season.objectiveMinPa);
}

function maybeCalibrateSeasonObjective(state: AscensionState, seasonId: string, now: Date): AscensionState {
  const season = state.seasons.find((s) => s.id === seasonId);
  if (!season || season.objectivePa !== null) return state;
  const endWeekOne = addDays(new Date(season.startDate), 6).getTime();
  if (now.getTime() <= endWeekOne) return state;

  const firstWeekStart = weekKey(new Date(season.startDate));
  const firstWeekPa = state.teamPa
    .filter((entry) => entry.seasonId === seasonId && weekKey(new Date(entry.createdAt)) === firstWeekStart)
    .reduce((sum, entry) => sum + entry.finalPa, 0);
  const objective = compute_season_objective(season, firstWeekPa);
  return {
    ...state,
    seasons: state.seasons.map((item) =>
      item.id === seasonId
        ? {
            ...item,
            calibrationWeekPa: Math.round(firstWeekPa * 100) / 100,
            objectivePa: objective
          }
        : item
    )
  };
}

function updateMilestones(state: AscensionState, seasonId: string, teamId: string): AscensionState {
  const season = state.seasons.find((s) => s.id === seasonId);
  if (!season || !season.objectivePa || season.objectivePa <= 0) return state;
  const total = state.teamPa
    .filter((entry) => entry.seasonId === seasonId && entry.teamId === teamId)
    .reduce((sum, entry) => sum + entry.finalPa, 0);
  const pct = (total / season.objectivePa) * 100;
  const reached = [25, 50, 75, 100].filter((m) => pct >= m);
  if (reached.length === season.milestoneReached.length) return state;
  return {
    ...state,
    seasons: state.seasons.map((item) => (item.id === seasonId ? { ...item, milestoneReached: reached } : item))
  };
}

export function processAscensionSession(
  gState: GamificationState,
  session: Session,
  sessionsAfterInsert: Session[],
  now: Date = new Date()
): GamificationState {
  const season = getCurrentSeason(gState.ascension);
  if (!season || !isSeasonActiveNow(season, now)) return gState;
  const membership = activeMembership(gState.ascension, gState.userId, season.id);
  if (!membership) return gState;
  if (gState.ascension.teamPa.some((entry) => entry.sessionId === session.id && entry.userId === gState.userId)) return gState;

  const calc = pa_calculation(gState, session, sessionsAfterInsert, now);
  if (calc.finalPa <= 0) return gState;
  let nextAsc: AscensionState = {
    ...gState.ascension,
    teamPa: [
      ...gState.ascension.teamPa,
      {
        id: `pa-${Date.now()}-${session.id}`,
        seasonId: season.id,
        teamId: membership.teamId,
        userId: gState.userId,
        sessionId: session.id,
        basePa: calc.basePa,
        finalPa: calc.finalPa,
        createdAt: session.createdAt,
        details: calc.details
      }
    ]
  };
  nextAsc = maybeCalibrateSeasonObjective(nextAsc, season.id, now);
  nextAsc = updateMilestones(nextAsc, season.id, membership.teamId);
  return {
    ...gState,
    ascension: nextAsc
  };
}

export function removeAscensionSession(
  gState: GamificationState,
  sessionId: string,
  sessionsAfterDelete: Session[],
  now: Date = new Date()
): GamificationState {
  const season = getCurrentSeason(gState.ascension);
  if (!season) return gState;
  const membership = activeMembership(gState.ascension, gState.userId, season.id);
  const teamId = membership?.teamId;
  const validSessionIds = new Set(sessionsAfterDelete.map((session) => session.id));
  const nextAsc: AscensionState = {
    ...gState.ascension,
    teamPa: gState.ascension.teamPa.filter((entry) => {
      if (entry.userId !== gState.userId) return true;
      if (entry.sessionId === sessionId) return false;
      return validSessionIds.has(entry.sessionId);
    })
  };
  const calibrated = maybeCalibrateSeasonObjective(nextAsc, season.id, now);
  const withMilestones = teamId ? updateMilestones(calibrated, season.id, teamId) : calibrated;
  return {
    ...gState,
    ascension: withMilestones
  };
}

export function setAscensionRole(
  gState: GamificationState,
  role: AscensionRole,
  now: Date = new Date()
): GamificationState {
  const season = getCurrentSeason(gState.ascension);
  const canEdit =
    season &&
    (isWeekOne(season, now) ||
      isBeforeSeasonStart(season, now) ||
      isAfterSeasonEnd(season, now) ||
      isModoBypassEnabled());
  if (!canEdit || !season) return gState;
  const build = getOrCreateBuild(gState.ascension, gState.userId, season.id);
  const nextBuild: AscensionUserBuild = { ...build, role, updatedAt: now.toISOString() };
  return {
    ...gState,
    ascension: {
      ...gState.ascension,
      userBuilds: gState.ascension.userBuilds.map((b) =>
        b.userId === build.userId && b.seasonId === build.seasonId ? nextBuild : b
      )
    }
  };
}

export function setAscensionStats(
  gState: GamificationState,
  stats: Record<AscensionStatKey, number>,
  now: Date = new Date()
): GamificationState {
  const season = getCurrentSeason(gState.ascension);
  const modoBypass = isModoBypassEnabled();
  const canEdit =
    season &&
    (isWeekOne(season, now) ||
      isBeforeSeasonStart(season, now) ||
      isAfterSeasonEnd(season, now) ||
      modoBypass);
  if (!canEdit || !season) return gState;
  const capped: Record<AscensionStatKey, number> = {
    ENDURANCE: Math.max(0, Math.min(25, Math.round(stats.ENDURANCE || 0))),
    INTENSITE: Math.max(0, Math.min(25, Math.round(stats.INTENSITE || 0))),
    REGULARITE: Math.max(0, Math.min(25, Math.round(stats.REGULARITE || 0))),
    MAITRISE: Math.max(0, Math.min(25, Math.round(stats.MAITRISE || 0))),
    EXPLORATION: Math.max(0, Math.min(25, Math.round(stats.EXPLORATION || 0)))
  };
  const pointsUsed = Object.values(capped).reduce((sum, v) => sum + v, 0);
  const maxStatsPoints = modoBypass
    ? ASCENSION_CONFIG.maxStatsPoints
    : Math.min(
        ASCENSION_CONFIG.maxStatsPoints,
        Math.max(0, Math.floor((gState.userLevel.level - 15) * 2))
      );
  if (pointsUsed > maxStatsPoints) return gState;

  const build = getOrCreateBuild(gState.ascension, gState.userId, season.id);
  const nextBuild: AscensionUserBuild = {
    ...build,
    stats: capped,
    pointsUsed,
    updatedAt: now.toISOString()
  };

  return {
    ...gState,
    ascension: {
      ...gState.ascension,
      userBuilds: gState.ascension.userBuilds.map((b) =>
        b.userId === build.userId && b.seasonId === build.seasonId ? nextBuild : b
      )
    }
  };
}

export function createAscensionTeam(
  gState: GamificationState,
  teamName: string,
  memberNames: string[],
  now: Date = new Date()
): GamificationState {
  const season = getCurrentSeason(gState.ascension);
  if (!season || !isBeforeSeasonStart(season, now)) return gState;
  if (activeMembership(gState.ascension, gState.userId, season.id)) return gState;

  const cleanName = teamName.trim();
  if (!cleanName) return gState;
  const rawMembers = Array.isArray(memberNames) ? memberNames : [];
  const memberList = rawMembers
    .map((name) => name.trim())
    .filter(Boolean)
    .slice(0, ASCENSION_CONFIG.teamMaxSize - 1);

  const team: AscensionTeam = {
    id: `asc-team-${Date.now()}`,
    seasonId: season.id,
    name: cleanName,
    ownerUserId: gState.userId,
    inviteCode: generateInviteCode(new Set(gState.ascension.teams.map((t) => t.inviteCode))),
    createdAt: now.toISOString()
  };
  const owner: AscensionTeamMember = {
    id: `asc-member-${Date.now()}-${gState.userId}`,
    seasonId: season.id,
    teamId: team.id,
    userId: gState.userId,
    displayName: 'Moi',
    joinedAt: now.toISOString(),
    leftAt: null,
    hasLeftSeason: false
  };
  const bots: AscensionTeamMember[] = memberList.map((name, index) => ({
    id: `asc-member-${Date.now()}-bot-${index}`,
    seasonId: season.id,
    teamId: team.id,
    userId: `bot-${team.id}-${index}`,
    displayName: name,
    joinedAt: now.toISOString(),
    leftAt: null,
    hasLeftSeason: false
  }));

  return {
    ...gState,
    ascension: {
      ...gState.ascension,
      teams: [...gState.ascension.teams, team],
      teamMembers: [...gState.ascension.teamMembers, owner, ...bots]
    }
  };
}

export function joinAscensionTeamByCode(
  gState: GamificationState,
  inviteCode: string,
  now: Date = new Date()
): GamificationState {
  const season = getCurrentSeason(gState.ascension);
  if (!season || !isBeforeSeasonStart(season, now)) return gState;
  if (activeMembership(gState.ascension, gState.userId, season.id)) return gState;

  const cleanCode = inviteCode.trim().toUpperCase();
  if (!cleanCode) return gState;
  const team = gState.ascension.teams.find(
    (item) => item.seasonId === season.id && item.inviteCode.toUpperCase() === cleanCode
  );
  if (!team) return gState;

  const activeMembers = gState.ascension.teamMembers.filter(
    (member) => member.seasonId === season.id && member.teamId === team.id && member.leftAt === null
  );
  if (activeMembers.length >= ASCENSION_CONFIG.teamMaxSize) return gState;

  const member: AscensionTeamMember = {
    id: `asc-member-${Date.now()}-${gState.userId}`,
    seasonId: season.id,
    teamId: team.id,
    userId: gState.userId,
    displayName: 'Moi',
    joinedAt: now.toISOString(),
    leftAt: null,
    hasLeftSeason: false
  };

  return {
    ...gState,
    ascension: {
      ...gState.ascension,
      teamMembers: [...gState.ascension.teamMembers, member]
    }
  };
}

export function leaveAscensionTeam(gState: GamificationState, now: Date = new Date()): GamificationState {
  const season = getCurrentSeason(gState.ascension);
  if (!season) return gState;
  if (!isBeforeSeasonStart(season, now)) return gState;
  const membership = activeMembership(gState.ascension, gState.userId, season.id);
  if (!membership) return gState;
  return {
    ...gState,
    ascension: {
      ...gState.ascension,
      teamMembers: gState.ascension.teamMembers.map((m) =>
        m.id === membership.id ? { ...m, leftAt: now.toISOString(), hasLeftSeason: true } : m
      )
    }
  };
}

export function getAscensionTeamOverview(gState: GamificationState): {
  team: AscensionTeam | null;
  members: Array<{
    id: string;
    name: string;
    role: AscensionRole | null;
    contributionPct: number;
    totalPa: number;
    stats: Record<AscensionStatKey, number>;
  }>;
  teamBonusPct: number;
  objectivePa: number | null;
  totalPa: number;
  milestoneReached: number[];
} {
  const season = getCurrentSeason(gState.ascension);
  if (!season) {
    return { team: null, members: [], teamBonusPct: 0, objectivePa: null, totalPa: 0, milestoneReached: [] };
  }
  const membership = activeMembership(gState.ascension, gState.userId, season.id);
  if (!membership) {
    return {
      team: null,
      members: [],
      teamBonusPct: 0,
      objectivePa: season.objectivePa,
      totalPa: 0,
      milestoneReached: season.milestoneReached
    };
  }
  const team = gState.ascension.teams.find((t) => t.id === membership.teamId && t.seasonId === season.id) ?? null;
  if (!team) {
    return {
      team: null,
      members: [],
      teamBonusPct: 0,
      objectivePa: season.objectivePa,
      totalPa: 0,
      milestoneReached: season.milestoneReached
    };
  }
  const membersRaw = gState.ascension.teamMembers.filter((m) => m.teamId === team.id && m.leftAt === null);
  const totalPa = gState.ascension.teamPa
    .filter((entry) => entry.teamId === team.id && entry.seasonId === season.id)
    .reduce((sum, entry) => sum + entry.finalPa, 0);

  const members = membersRaw.map((member) => {
    const memberTotal = gState.ascension.teamPa
      .filter((entry) => entry.seasonId === season.id && entry.teamId === team.id && entry.userId === member.userId)
      .reduce((sum, entry) => sum + entry.finalPa, 0);
    const build = gState.ascension.userBuilds.find((b) => b.seasonId === season.id && b.userId === member.userId);
    return {
      id: member.id,
      name: member.displayName,
      role: build?.role ?? null,
      contributionPct: totalPa > 0 ? Math.round((memberTotal / totalPa) * 1000) / 10 : 0,
      totalPa: Math.round(memberTotal * 100) / 100,
      stats: build?.stats ?? defaultStats()
    };
  });

  return {
    team,
    members,
    teamBonusPct: Math.round(teamDiversityBonus(gState.ascension, season.id, team.id) * 1000) / 10,
    objectivePa: season.objectivePa,
    totalPa: Math.round(totalPa * 100) / 100,
    milestoneReached: season.milestoneReached
  };
}
