const XP_PER_LEVEL = 500;

export function getLevelFromXp(xpTotal: number): number {
  const safeXp = Math.max(0, xpTotal);
  return 1 + Math.floor(safeXp / XP_PER_LEVEL);
}

export function getXpIntoLevel(xpTotal: number): number {
  const safeXp = Math.max(0, xpTotal);
  return safeXp % XP_PER_LEVEL;
}

export function getXpToNextLevel(xpTotal: number): number {
  const into = getXpIntoLevel(xpTotal);
  return into === 0 ? XP_PER_LEVEL : XP_PER_LEVEL - into;
}

export function getLevelProgressRatio(xpTotal: number): number {
  return getXpIntoLevel(xpTotal) / XP_PER_LEVEL;
}
