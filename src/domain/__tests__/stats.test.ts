import { describe, expect, it } from 'vitest';
import { computeDashboardStats } from '../stats';
import { Session } from '../../types/models';

function session(overrides: Partial<Session>): Session {
  return {
    id: 's',
    createdAt: new Date().toISOString(),
    sportType: 'RUNNING',
    subtype: 'EF',
    durationMin: 30,
    feelings: { feltState: 3, rpe: 5, fatigue: 3 },
    xp: 80,
    ...overrides
  };
}

describe('domain/stats', () => {
  it('calcule les stats globales et hebdo', () => {
    const sessions: Session[] = [
      session({ id: '1', sportType: 'RUNNING', durationMin: 40, feelings: { feltState: 4, rpe: 7, fatigue: 2 } }),
      session({ id: '2', sportType: 'OTHER', durationMin: 20, feelings: { feltState: 3, rpe: 6, fatigue: 3 } })
    ];

    const stats = computeDashboardStats(sessions, '2099-W01');

    expect(stats.runningCount).toBe(1);
    expect(stats.otherCount).toBe(1);
    expect(stats.avgFeltState).toBe(3.5);
    expect(stats.avgRpe).toBe(6.5);
    expect(stats.avgFatigue).toBe(2.5);
    expect(stats.weekSessionsCount).toBe(0);
  });
});
