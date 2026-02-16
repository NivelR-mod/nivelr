import { GAMIFICATION_V1_CONFIG } from './config';

export function getXpForLevel(level: number): number {
  const safeLevel = Math.max(1, Math.min(GAMIFICATION_V1_CONFIG.maxLevel, Math.floor(level)));
  const delta = safeLevel - 1;
  return Math.round(delta * 180 + delta * delta * 28);
}

export function getLevelFromXpV1(xpTotal: number): number {
  const cappedXp = Math.max(0, Math.floor(xpTotal));
  for (let level = GAMIFICATION_V1_CONFIG.maxLevel; level >= 1; level -= 1) {
    if (cappedXp >= getXpForLevel(level)) return level;
  }
  return 1;
}

export function getXpToNextLevelV1(xpTotal: number): number {
  const level = getLevelFromXpV1(xpTotal);
  if (level >= GAMIFICATION_V1_CONFIG.maxLevel) return 0;
  const nextLevelXp = getXpForLevel(level + 1);
  return Math.max(0, nextLevelXp - Math.max(0, Math.floor(xpTotal)));
}

export function getLevelProgressRatioV1(xpTotal: number): number {
  const level = getLevelFromXpV1(xpTotal);
  if (level >= GAMIFICATION_V1_CONFIG.maxLevel) return 1;

  const currentBase = getXpForLevel(level);
  const nextBase = getXpForLevel(level + 1);
  const span = Math.max(1, nextBase - currentBase);
  const inLevel = Math.max(0, Math.floor(xpTotal) - currentBase);

  return Math.max(0, Math.min(1, inLevel / span));
}
