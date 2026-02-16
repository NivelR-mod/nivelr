import { describe, expect, it } from 'vitest';
import {
  getLevelFromXp,
  getLevelProgressRatio,
  getXpIntoLevel,
  getXpToNextLevel
} from '../levels';

describe('domain/levels', () => {
  it('calcule le niveau avec palier de 500 XP', () => {
    expect(getLevelFromXp(0)).toBe(1);
    expect(getLevelFromXp(499)).toBe(1);
    expect(getLevelFromXp(500)).toBe(2);
    expect(getLevelFromXp(1300)).toBe(3);
  });

  it('calcule XP dans le niveau et XP restant', () => {
    expect(getXpIntoLevel(1300)).toBe(300);
    expect(getXpToNextLevel(1300)).toBe(200);
  });

  it('calcule le ratio de progression', () => {
    expect(getLevelProgressRatio(250)).toBe(0.5);
    expect(getLevelProgressRatio(500)).toBe(0);
  });
});
