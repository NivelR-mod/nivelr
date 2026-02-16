export type GamificationTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
export type GamificationMissionWindow = 'WEEKLY' | 'ONE_SHOT' | 'SEASON';
export type GamificationMissionDiscipline = 'RUN' | 'RENFO' | 'MIX';

export type GamificationCriterionKind =
  | 'SESSIONS_COUNT'
  | 'SESSIONS_IN_ROLLING_DAYS'
  | 'SESSIONS_IN_ROLLING_WEEKS'
  | 'RUN_DISTANCE_KM'
  | 'RUN_DISTANCE_IN_ROLLING_DAYS'
  | 'RUN_DISTANCE_IN_ROLLING_WEEKS'
  | 'WEEKLY_DISTANCE_KM'
  | 'ACTIVE_WEEKS'
  | 'ACTIVE_DAYS_COUNT'
  | 'RUNNING_KEY_SESSIONS'
  | 'RENFO_SESSIONS'
  | 'SUBTYPE_VARIETY'
  | 'LONGEST_DISTANCE_KM'
  | 'LONGEST_DURATION_MIN'
  | 'LOW_RPE_SESSIONS'
  | 'HIGH_RPE_SESSIONS'
  | 'PROGRESSION_EVENTS_COUNT'
  | 'WEEKLY_XP'
  | 'IMPROVED_FREQUENCY'
  | 'IMPROVED_DISTANCE'
  | 'IMPROVED_5K_PACE';

export type MissionProgressStatus = 'LOCKED' | 'IN_PROGRESS' | 'DONE' | 'CLAIMED';

export interface GamificationMissionCriterion {
  kind: GamificationCriterionKind;
  target: number;
  rollingDays?: number;
  rollingWeeks?: number;
  maxRpe?: number;
  minRpe?: number;
  subtypes?: string[];
}

export interface GamificationMission {
  id: string;
  title: string;
  description: string;
  tier: GamificationTier;
  discipline: GamificationMissionDiscipline;
  window: GamificationMissionWindow;
  xpReward: number;
  minLevel: number;
  criterion: GamificationMissionCriterion;
}

export interface UserXpLogEntry {
  id: string;
  userId: string;
  weekKey: string;
  dateKey: string;
  amount: number;
  reason:
    | 'SESSION_BASE'
    | 'PLAN_SESSION_DONE'
    | 'PLAN_WEEK_80'
    | 'PLAN_WEEK_100'
    | 'STREAK_3'
    | 'STREAK_4'
    | 'STREAK_8'
    | 'PROGRESSION_CHRONO'
    | 'PROGRESSION_DISTANCE'
    | 'PROGRESSION_FREQUENCY'
    | 'MISSION_CLAIM'
    | 'TEAM_MISSION'
    | 'SEASON_REWARD';
  sourceRef: string;
  createdAt: string;
}

export interface UserLevelState {
  userId: string;
  level: number;
  xpTotal: number;
  xpToNextLevel: number;
  updatedAt: string;
}

export interface UserStreakState {
  userId: string;
  activeWeeks: number;
  jokerRemaining: number;
  lastEvaluatedWeekKey: string | null;
  awardedMilestones: string[];
}

export interface MissionUserProgress {
  userId: string;
  missionId: string;
  progressValue: number;
  unlockBaseline: number;
  status: MissionProgressStatus;
  updatedAt: string;
  unlockedAt?: string;
  claimedAt?: string;
}

export interface Season {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  state: 'UPCOMING' | 'ACTIVE' | 'ENDED';
  carryOverRatio: number;
}

export type UserTitle = 'EXPLORATEUR' | 'STRATEGE' | 'PERFORMEUR' | 'PILIER' | 'MENTOR';

export interface WeeklyStat {
  userId: string;
  weekStart: string;
  totalDurationMin: number;
  totalDistanceKm: number;
  avgRpe: number;
  weeklyLoad: number;
  updatedAt: string;
}

export type ChallengeTier = 'STANDARD' | 'AVANCE' | 'EXPERT';

export interface ChallengeRuleSet {
  kind:
    | 'MONTHLY_WORKOUT_COUNT'
    | 'MONTHLY_DISTANCE'
    | 'MONTHLY_ACTIVE_WEEKS'
    | 'MONTHLY_LONG_RUN_COUNT'
    | 'MONTHLY_EASY_SESSIONS'
    | 'WEEKS_WITH_QUALITY_AND_RENFO'
    | 'ROLLING_ACTIVE_WEEKS'
    | 'CONSECUTIVE_BALANCED_WEEKS'
    | 'MONTHLY_DISTANCE_VS_PREVIOUS'
    | 'MONTHLY_QUALITY_SESSIONS'
    | 'MONTHLY_PR_DISTANCE';
  target: number;
  minDurationMin?: number;
  maxRpe?: number;
  weeksWindow?: number;
  streakLength?: number;
  percentageTarget?: number;
  distanceChoiceKm?: 5 | 10;
}

export interface ChallengeOption {
  id: string;
  tier: ChallengeTier;
  title: string;
  description: string;
  rules: ChallengeRuleSet;
  xpReward: number;
}

export interface MonthlyChallenge {
  id: string;
  month: string;
  optionIds: string[];
  createdAt: string;
}

export interface UserMonthlyChallenge {
  id: string;
  userId: string;
  month: string;
  chosenOptionId: string;
  status: 'ACTIVE' | 'COMPLETED' | 'FAILED';
  progressValue: number;
  targetValue: number;
  progressText: string;
  lockedAt: string;
  updatedAt: string;
}

export interface UserGoal8Weeks {
  userId: string;
  startDate: string;
  endDate: string;
  durationWeeks?: number;
  goalType:
    | 'PR_5K'
    | 'PR_10K'
    | 'PR_HALF'
    | 'PR_MARATHON'
    | 'MONTHLY_DISTANCE'
    | 'LONG_RUN_90MIN_X2';
  status: 'ACTIVE' | 'COMPLETED' | 'FAILED';
  goalTarget: number;
  goalDistanceKm?: number;
  targetPaceMinPerKm?: number | null;
  baselinePaceMinPerKm?: number | null;
  bestPaceInCycleMinPerKm?: number | null;
  progressValue: number;
  progressText: string;
  createdAt: string;
  updatedAt: string;
}

export interface HallOfFameEntry {
  id: string;
  seasonId: string;
  titleCategory: UserTitle;
  userId: string;
  rank: number;
  score: number;
  createdAt: string;
}

export interface LeaderboardEntry {
  subjectId: string;
  subjectName: string;
  score: number;
  rank: number;
  isTeam: boolean;
}

export interface LeaderboardsState {
  weekly: LeaderboardEntry[];
  season: LeaderboardEntry[];
  updatedAt: string;
}

export interface Team {
  id: string;
  name: string;
  createdAt: string;
}

export interface TeamMember {
  teamId: string;
  userId: string;
  role: 'OWNER' | 'MEMBER';
  joinedAt: string;
}

export type AscensionRole = 'PERFORMEUR' | 'PILIER' | 'EXPLORATEUR' | 'STRATEGE' | 'MENTOR';
export type AscensionStatKey = 'ENDURANCE' | 'INTENSITE' | 'REGULARITE' | 'MAITRISE' | 'EXPLORATION';

export interface AscensionSeason {
  id: string;
  name: string;
  theme: string;
  startDate: string;
  endDate: string;
  status: 'ACTIVE' | 'ENDED' | 'UPCOMING';
  objectiveMinPa: number;
  objectivePa: number | null;
  calibrationWeekPa: number | null;
  milestoneReached: number[];
  hallOfFamePublished: boolean;
}

export interface AscensionTeam {
  id: string;
  seasonId: string;
  name: string;
  ownerUserId: string;
  inviteCode: string;
  createdAt: string;
}

export interface AscensionTeamMember {
  id: string;
  seasonId: string;
  teamId: string;
  userId: string;
  displayName: string;
  joinedAt: string;
  leftAt: string | null;
  hasLeftSeason: boolean;
}

export interface AscensionTeamPa {
  id: string;
  seasonId: string;
  teamId: string;
  userId: string;
  sessionId: string;
  basePa: number;
  finalPa: number;
  createdAt: string;
  details: string;
}

export interface AscensionUserBuild {
  seasonId: string;
  userId: string;
  role: AscensionRole | null;
  stats: Record<AscensionStatKey, number>;
  pointsUsed: number;
  updatedAt: string;
}

export interface AscensionState {
  enabled: boolean;
  seasons: AscensionSeason[];
  currentSeasonId: string;
  teams: AscensionTeam[];
  teamMembers: AscensionTeamMember[];
  teamPa: AscensionTeamPa[];
  userBuilds: AscensionUserBuild[];
}

export interface UnlockNotification {
  id: string;
  level: number;
  message: string;
  createdAt: string;
  seen: boolean;
}

export interface GamificationState {
  enabled: boolean;
  userId: string;
  weeklyXpCap: number;
  maxXpSessionsPerDay: number;
  missionCatalogVersion: string;
  activeTitle: UserTitle | null;
  titleLastChangedAt: string | null;
  prestigeLevel: number;
  userXpLog: UserXpLogEntry[];
  userLevel: UserLevelState;
  userStreak: UserStreakState;
  weeklyStats: WeeklyStat[];
  challengeOptions: ChallengeOption[];
  monthlyChallenges: MonthlyChallenge[];
  userMonthlyChallenges: UserMonthlyChallenge[];
  userGoal8Weeks: UserGoal8Weeks | null;
  hallOfFameEntries: HallOfFameEntry[];
  missionsUserProgress: Record<string, MissionUserProgress>;
  seasons: Season[];
  currentSeasonId: string;
  leaderboards: LeaderboardsState;
  teams: Team[];
  teamMembers: TeamMember[];
  ascension: AscensionState;
  unlockNotifications: UnlockNotification[];
}

export interface SessionValidationEvent {
  sessionId: string;
  createdAt: string;
  sportType: 'RUNNING' | 'OTHER';
  subtype: string;
  durationMin: number;
  distanceKm?: number;
}

export interface ProcessSessionResult {
  next: GamificationState;
  awardedXp: number;
  levelUp: boolean;
  unlockedAtLevel: number[];
  cappedByDayLimit: boolean;
  cappedByWeekLimit: boolean;
}
