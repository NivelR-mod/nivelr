import { describe, expect, it } from 'vitest';
import { Session } from '../../types/models';
import { computeActivityBaseXp, processSessionValidated } from '../engine';
import { createDefaultGamificationState } from '../storage';
import { getCatalogSummary } from '../missionsCatalog';
import { getLevelFromXpV1, getXpForLevel } from '../levels';

function buildSession(id: string, createdAt: string, durationMin: number, subtype: Session['subtype']): Session {
  return {
    id,
    createdAt,
    sportType: subtype === 'RENFO' ? 'OTHER' : 'RUNNING',
    subtype,
    durationMin,
    distanceKm: subtype === 'RENFO' ? undefined : 8,
    feelings: {
      feltState: 3,
      rpe: 5,
      fatigue: 3
    },
    xp: 100
  };
}

describe('gamification v1 rules', () => {
  it('applique la grille base xp brute', () => {
    expect(
      computeActivityBaseXp({
        sessionId: 's1',
        createdAt: new Date().toISOString(),
        sportType: 'RUNNING',
        subtype: 'EF',
        durationMin: 20
      })
    ).toBe(30);

    expect(
      computeActivityBaseXp({
        sessionId: 's2',
        createdAt: new Date().toISOString(),
        sportType: 'RUNNING',
        subtype: 'EF',
        durationMin: 45
      })
    ).toBe(40);

    expect(
      computeActivityBaseXp({
        sessionId: 's3',
        createdAt: new Date().toISOString(),
        sportType: 'OTHER',
        subtype: 'RENFO',
        durationMin: 40
      })
    ).toBe(50);
  });

  it('limite a 2 seances XP par jour', () => {
    const date = '2026-02-10T08:00:00.000Z';
    const state0 = createDefaultGamificationState();

    const s1 = buildSession('a', date, 35, 'EF');
    const r1 = processSessionValidated(state0, [s1], s1);

    const s2 = buildSession('b', '2026-02-10T12:00:00.000Z', 35, 'EF');
    const r2 = processSessionValidated(r1.next, [s2, s1], s2);

    const s3 = buildSession('c', '2026-02-10T18:00:00.000Z', 35, 'EF');
    const r3 = processSessionValidated(r2.next, [s3, s2, s1], s3);

    expect(r1.awardedXp).toBeGreaterThan(0);
    expect(r2.awardedXp).toBeGreaterThan(0);
    expect(r3.awardedXp).toBe(0);
    expect(r3.cappedByDayLimit).toBe(true);
  });

  it('respecte le plafond hebdo XP', () => {
    let state = createDefaultGamificationState();
    const sessions: Session[] = [];

    for (let i = 0; i < 40; i += 1) {
      const day = String(1 + (i % 7)).padStart(2, '0');
      const hour = String(8 + (i % 2) * 5).padStart(2, '0');
      const session = buildSession(
        `w-${i}`,
        `2026-03-${day}T${hour}:00:00.000Z`,
        40,
        i % 3 === 0 ? 'SEUIL' : 'EF'
      );
      sessions.unshift(session);
      const result = processSessionValidated(state, sessions, session);
      state = result.next;
    }

    const weekTotal = state.userXpLog
      .filter((entry) => entry.weekKey === state.userXpLog[0].weekKey)
      .reduce((sum, entry) => sum + entry.amount, 0);

    expect(weekTotal).toBeLessThanOrEqual(state.weeklyXpCap);
  });

  it('maintient la courbe de niveau jusqu au niveau 30', () => {
    const lvl5Xp = getXpForLevel(5);
    const lvl10Xp = getXpForLevel(10);
    const lvl30Xp = getXpForLevel(30);

    expect(lvl5Xp).toBeGreaterThan(900);
    expect(lvl10Xp).toBeGreaterThan(3000);
    expect(lvl30Xp).toBeGreaterThan(25000);
    expect(getLevelFromXpV1(lvl30Xp)).toBe(30);
  });

  it('charge un catalogue 100 missions avec repartition attendue', () => {
    const summary = getCatalogSummary();
    expect(summary.bronze).toBe(40);
    expect(summary.silver).toBe(30);
    expect(summary.gold).toBe(20);
    expect(summary.platinum).toBe(10);
  });
});
