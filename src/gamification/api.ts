import { Session } from '../types/models';
import { GAMIFICATION_V1_CONFIG } from './config';
import {
  awardExternalMissionXp,
  claimMissionReward,
  markUnlockNotificationsSeen,
  removeSessionFromGamification,
  processSessionValidated
} from './engine';
import { getGamificationMissionCatalog } from './missionsCatalog';
import {
  createDefaultGamificationState,
  loadGamificationState,
  resetGamificationState,
  saveGamificationState
} from './storage';
import {
  GamificationMission,
  GamificationState,
  LeaderboardEntry,
  Team,
  TeamMember,
  UserGoal8Weeks,
  UserTitle
} from './types';
import { getLevelFromXpV1, getXpToNextLevelV1 } from './levels';
import {
  applyPrestige,
  chooseMonthlyChallenge,
  computeHallOfFameEntries,
  ensureMonthlyChallengeChoices,
  refreshGoal8Weeks,
  refreshMonthlyChallengeProgress,
  resetActiveTitle,
  resetMonthlyChallengeForMonth,
  resetGoal8Weeks,
  setActiveTitle,
  startGoal8Weeks,
  computeWeeklyStats
} from './progression';
import {
  createAscensionTeam,
  getAscensionTeamOverview,
  joinAscensionTeamByCode,
  leaveAscensionTeam,
  processAscensionSession,
  removeAscensionSession,
  setAscensionRole,
  setAscensionStats
} from './ascension';

const GOAL_COMPLETION_XP: Record<UserGoal8Weeks['goalType'], number> = {
  PR_5K: 250,
  PR_10K: 350,
  PR_HALF: 500,
  PR_MARATHON: 700,
  MONTHLY_DISTANCE: 300,
  LONG_RUN_90MIN_X2: 300
};

function syncGoalCompletionReward(state: GamificationState): GamificationState {
  const goal = state.userGoal8Weeks;
  if (!goal) return state;
  const sourceRef = `goal-complete:${goal.startDate}:${goal.goalType}`;
  const hasReward = state.userXpLog.some((entry) => entry.sourceRef === sourceRef);

  if (goal.status === 'COMPLETED' && !hasReward) {
    const amount = GOAL_COMPLETION_XP[goal.goalType] ?? 250;
    return awardExternalMissionXp(state, amount, sourceRef);
  }

  if (goal.status !== 'COMPLETED' && hasReward) {
    const filteredLog = state.userXpLog.filter((entry) => entry.sourceRef !== sourceRef);
    const nextXpTotal = filteredLog.reduce((sum, entry) => sum + entry.amount, 0);
    const nextLevel = getLevelFromXpV1(nextXpTotal);
    return {
      ...state,
      userXpLog: filteredLog,
      userLevel: {
        ...state.userLevel,
        level: nextLevel,
        xpTotal: nextXpTotal,
        xpToNextLevel: getXpToNextLevelV1(nextXpTotal),
        updatedAt: new Date().toISOString()
      }
    };
  }

  return state;
}

export function apiGetGamificationState(): GamificationState {
  return loadGamificationState();
}

export function apiPostSessionValidated(session: Session, sessionsAfterInsert: Session[]): GamificationState {
  const current = loadGamificationState();
  const result = processSessionValidated(current, sessionsAfterInsert, session);
  let next = result.next;
  next = {
    ...next,
    weeklyStats: computeWeeklyStats(sessionsAfterInsert, next.userId)
  };
  next = ensureMonthlyChallengeChoices(next, sessionsAfterInsert);
  const challengeUpdate = refreshMonthlyChallengeProgress(next, sessionsAfterInsert);
  next = challengeUpdate.next;
  next = refreshGoal8Weeks(next, sessionsAfterInsert);
  next = syncGoalCompletionReward(next);
  if (challengeUpdate.newlyCompleted) {
    next = awardExternalMissionXp(
      next,
      next.challengeOptions.find((o) => o.id === challengeUpdate.newlyCompleted?.chosenOptionId)?.xpReward ?? 0,
      `monthly-challenge:${challengeUpdate.newlyCompleted.id}`
    );
  }
  next = processAscensionSession(next, session, sessionsAfterInsert);
  saveGamificationState(next);
  return next;
}

export function apiPostMissionClaim(missionId: string, sessions: Session[]): GamificationState {
  const current = loadGamificationState();
  const next = claimMissionReward(current, missionId, sessions);
  saveGamificationState(next);
  return next;
}

export function apiPostLegacyMissionClaim(missionId: string, xpAmount: number, sourceSuffix: string): GamificationState {
  const current = loadGamificationState();
  const sourceRef = `legacy-mission:${missionId}:${sourceSuffix}`;
  const next = awardExternalMissionXp(current, xpAmount, sourceRef);
  saveGamificationState(next);
  return next;
}

export function apiDeleteSessionValidated(sessionId: string, sessionsAfterDelete: Session[]): GamificationState {
  const current = loadGamificationState();
  let next = removeSessionFromGamification(current, sessionId, sessionsAfterDelete);
  next = {
    ...next,
    weeklyStats: computeWeeklyStats(sessionsAfterDelete, next.userId)
  };
  next = ensureMonthlyChallengeChoices(next, sessionsAfterDelete);
  next = refreshMonthlyChallengeProgress(next, sessionsAfterDelete).next;
  next = refreshGoal8Weeks(next, sessionsAfterDelete);
  next = syncGoalCompletionReward(next);
  next = removeAscensionSession(next, sessionId, sessionsAfterDelete);
  saveGamificationState(next);
  return next;
}

export function apiGetMissionCatalog(): GamificationMission[] {
  return getGamificationMissionCatalog();
}

export function apiPatchGamificationEnabled(enabled: boolean): GamificationState {
  const current = loadGamificationState();
  const next: GamificationState = {
    ...current,
    enabled
  };
  saveGamificationState(next);
  return next;
}

export function apiPostTeamCreate(name: string, memberUserIds: string[]): GamificationState {
  const current = loadGamificationState();
  const cleanName = name.trim();
  if (!cleanName) return current;
  if (memberUserIds.length < 3 || memberUserIds.length > 8) return current;

  const team: Team = {
    id: `team-${Date.now()}`,
    name: cleanName,
    createdAt: new Date().toISOString()
  };

  const members: TeamMember[] = memberUserIds.map((userId, index) => ({
    teamId: team.id,
    userId,
    role: index === 0 ? 'OWNER' : 'MEMBER',
    joinedAt: new Date().toISOString()
  }));

  const next: GamificationState = {
    ...current,
    teams: [...current.teams, team],
    teamMembers: [...current.teamMembers, ...members]
  };

  saveGamificationState(next);
  return next;
}

export function apiPostTeamJoin(teamId: string, userId: string): GamificationState {
  const current = loadGamificationState();
  const team = current.teams.find((item) => item.id === teamId);
  if (!team) return current;

  const members = current.teamMembers.filter((member) => member.teamId === teamId);
  if (members.some((member) => member.userId === userId)) return current;
  if (members.length >= 8) return current;

  const next: GamificationState = {
    ...current,
    teamMembers: [
      ...current.teamMembers,
      {
        teamId,
        userId,
        role: 'MEMBER',
        joinedAt: new Date().toISOString()
      }
    ]
  };

  saveGamificationState(next);
  return next;
}

export function apiGetWeeklyLeaderboard(): LeaderboardEntry[] {
  return loadGamificationState().leaderboards.weekly;
}

export function apiGetSeasonLeaderboard(): LeaderboardEntry[] {
  return loadGamificationState().leaderboards.season;
}

export function apiPostSeasonRollover(): GamificationState {
  const current = loadGamificationState();
  const seasonEntries = computeHallOfFameEntries(current, [], current.currentSeasonId);
  const keptXp = Math.round(current.userLevel.xpTotal * GAMIFICATION_V1_CONFIG.seasonCarryOverRatio);
  const reset = createDefaultGamificationState();

  const next: GamificationState = {
    ...reset,
    enabled: current.enabled,
    userLevel: {
      ...reset.userLevel,
      xpTotal: keptXp
    },
    userXpLog: [],
    unlockNotifications: [],
    hallOfFameEntries: [...current.hallOfFameEntries, ...seasonEntries],
    teams: current.teams,
    teamMembers: current.teamMembers
  };

  saveGamificationState(next);
  return next;
}

export function apiPostUnlockNotificationsSeen(): GamificationState {
  const current = loadGamificationState();
  const next = markUnlockNotificationsSeen(current);
  saveGamificationState(next);
  return next;
}

export function apiDeleteGamificationData(): void {
  resetGamificationState();
}

export function apiPostChooseMonthlyChallenge(optionId: string): GamificationState {
  const current = loadGamificationState();
  const next = chooseMonthlyChallenge(current, optionId);
  saveGamificationState(next);
  return next;
}

export function apiPostSetActiveTitle(title: UserTitle): GamificationState {
  const current = loadGamificationState();
  const next = setActiveTitle(current, title);
  saveGamificationState(next);
  return next;
}

export function apiPostStartGoal8Weeks(
  goalType: 'PR_5K' | 'PR_10K' | 'PR_HALF' | 'PR_MARATHON' | 'MONTHLY_DISTANCE' | 'LONG_RUN_90MIN_X2',
  target: number,
  durationWeeks: number,
  sessions: Session[]
): GamificationState {
  const current = loadGamificationState();
  const next = startGoal8Weeks(current, goalType, target, durationWeeks, sessions);
  saveGamificationState(next);
  return next;
}

export function apiPostResetGoal8Weeks(): GamificationState {
  const current = loadGamificationState();
  const next = resetGoal8Weeks(current);
  saveGamificationState(next);
  return next;
}

export function apiPostResetMonthlyChallenge(month?: string): GamificationState {
  const current = loadGamificationState();
  const next = resetMonthlyChallengeForMonth(current, month);
  saveGamificationState(next);
  return next;
}

export function apiPostResetActiveTitle(): GamificationState {
  const current = loadGamificationState();
  const next = resetActiveTitle(current);
  saveGamificationState(next);
  return next;
}

export function apiPostActivatePrestige(): GamificationState {
  const current = loadGamificationState();
  const next = applyPrestige(current);
  saveGamificationState(next);
  return next;
}

export function apiPostAscensionSetRole(
  role: 'PERFORMEUR' | 'PILIER' | 'EXPLORATEUR' | 'STRATEGE' | 'MENTOR'
): GamificationState {
  const current = loadGamificationState();
  const next = setAscensionRole(current, role);
  saveGamificationState(next);
  return next;
}

export function apiPostAscensionSetStats(
  stats: { ENDURANCE: number; INTENSITE: number; REGULARITE: number; MAITRISE: number; EXPLORATION: number }
): GamificationState {
  const current = loadGamificationState();
  const next = setAscensionStats(current, stats);
  saveGamificationState(next);
  return next;
}

export function apiPostAscensionCreateTeam(teamName: string, memberNames: string[]): GamificationState {
  const current = loadGamificationState();
  const next = createAscensionTeam(current, teamName, memberNames);
  saveGamificationState(next);
  return next;
}

export function apiPostAscensionLeaveTeam(): GamificationState {
  const current = loadGamificationState();
  const next = leaveAscensionTeam(current);
  saveGamificationState(next);
  return next;
}

export function apiPostAscensionJoinTeamByCode(inviteCode: string): GamificationState {
  const current = loadGamificationState();
  const next = joinAscensionTeamByCode(current, inviteCode);
  saveGamificationState(next);
  return next;
}

export function apiGetAscensionTeamOverview() {
  const current = loadGamificationState();
  return getAscensionTeamOverview(current);
}
