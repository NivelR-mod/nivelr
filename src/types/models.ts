export type SportType = 'RUNNING' | 'OTHER';

export type RunningSubtype = 'EF' | 'SEUIL' | 'VMA' | 'SORTIE_LONGUE';
export type OtherSubtype = 'RENFO' | 'VELO' | 'NATATION' | 'MOBILITE';

export type SessionSubtype = RunningSubtype | OtherSubtype;

export interface SessionFeelings {
  feltState: number; // 1..5
  rpe: number; // 1..10
  fatigue: number; // 1..5
}

export interface SessionInput {
  sportType: SportType;
  subtype: SessionSubtype;
  durationMin: number;
  distanceKm?: number;
  feelings: SessionFeelings;
  comment?: string;
}

export interface Session extends SessionInput {
  id: string;
  createdAt: string;
  xp: number;
}

export interface GoalConfig {
  weeklySessionsTarget: number;
  weeklyMinutesTarget: number;
}

export type RunnerLevel = 'DEBUTANT_REPRISE' | 'REGULIER' | 'CONFIRME';

export type RunnerFocus = 'ROUTINE' | 'EXPLORATION' | 'PROGRESSION' | 'PERFORMANCE' | 'SANTE';
export type RunnerArchetype = 'EXPLORATEUR' | 'PILIER' | 'STRATEGE' | 'PERFORMEUR';
export type RunnerObjective =
  | 'REPRISE_REGULARITE'
  | 'FORME_GENERALE'
  | 'PREPA_COURSE'
  | 'PERFORMANCE'
  | 'SANTE_POIDS';
export type RunnerMotivation = 'ROUTINE' | 'VARIER' | 'DEPASSEMENT' | 'STRUCTUREE';

export interface RunnerAssessmentAnswers {
  consistencyMonths: 'DEBUT_REPRISE' | 'M1_3' | 'M3_12' | 'Y1_3' | 'Y3_PLUS';
  sessionsPerWeek: 'S0_1' | 'S2' | 'S3' | 'S4_PLUS';
  weeklyKm: 'UNKNOWN' | 'KM_LT_10' | 'KM_10_20' | 'KM_20_35' | 'KM_35_50' | 'KM_50_PLUS';
  longestRecentRun: 'LT_30' | 'M30_45' | 'M45_60' | 'M60_90' | 'M90_PLUS';
  easyPaceTalk: 'ESSOUFFLE' | 'QUELQUES_PHRASES' | 'CONVERSATION';
  injuryLast6Months: 'NO' | 'LIGHT' | 'STOP_2PLUS';
  objective8Weeks: RunnerObjective[];
  usualRecovery: 'FATIGUE_DOULEURS' | 'LIMITE' | 'RECUP_BIEN';
  availableDays: 'D1' | 'D2' | 'D3' | 'D4_PLUS';
  motivation: RunnerMotivation[];
}

export interface RunnerAssessmentResult {
  score: number;
  level: RunnerLevel;
  focus: RunnerFocus;
  archetype: RunnerArchetype;
  recommendations: string[];
  caution: string;
  answeredAt: string;
  nextRecommendedAt: string;
}

export interface RunnerAssessmentSnapshot {
  answers: RunnerAssessmentAnswers;
  result: RunnerAssessmentResult;
  appliedAt: string;
}

export type MissionType = 'WEEKLY' | 'ONE_SHOT';
export type MissionStatus = 'IN_PROGRESS' | 'DONE' | 'CLAIMED';
export type MissionTier = 'BRONZE' | 'SILVER' | 'GOLD';

export interface MissionEvaluationContext {
  sessions: Session[];
  weekSessions: Session[];
}

export interface MissionDefinition {
  id: string;
  title: string;
  description: string;
  type: MissionType;
  tier: MissionTier;
  xpReward: number;
  target: number;
  unit: string;
  getProgress: (context: MissionEvaluationContext) => number;
}

export interface AppState {
  sessions: Session[];
  bonusXp: number;
  completedMissions: string[];
  weeklyClaimedMissions: string[];
  seenBadgePopupIds: string[];
  missionWeekKey: string;
  goals: GoalConfig;
  runnerAssessment?: RunnerAssessmentSnapshot;
}
