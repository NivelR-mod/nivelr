export const GAMIFICATION_V1_ENABLED = (import.meta.env.VITE_GAMIFICATION_V1 ?? 'true') !== 'false';

export const GAMIFICATION_V1_CONFIG = {
  storageKey: 'sport-gamification-v1',
  missionCatalogVersion: 'v1.1.0',
  weeklyXpCap: 1200,
  maxXpSessionsPerDay: 2,
  maxProgressionBonusPerWeek: 250,
  maxLevel: 30,
  prestigeKeepXp: true,
  prestigePermanentBonusPercent: 2,
  unlockLevels: [5, 10, 15, 20, 25, 30] as number[],
  seasonDurationWeeks: 12,
  seasonCarryOverRatio: 0.3,
  defaultUserId: 'local-user-1'
} as const;

export function getUnlockMessage(level: number): string {
  return `Niveau ${level} atteint: nouveau contenu debloque.`;
}
