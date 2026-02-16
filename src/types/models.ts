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
  missionWeekKey: string;
  goals: GoalConfig;
}
