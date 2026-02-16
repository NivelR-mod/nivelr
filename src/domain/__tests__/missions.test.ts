import { describe, expect, it } from 'vitest';
import { getMissions, getMissionStatus } from '../missions';
import { AppState, Session } from '../../types/models';

function buildSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 's-1',
    createdAt: new Date().toISOString(),
    sportType: 'RUNNING',
    subtype: 'EF',
    durationMin: 40,
    distanceKm: 6,
    feelings: { feltState: 4, rpe: 6, fatigue: 2 },
    xp: 100,
    ...overrides
  };
}

const baseState: Pick<AppState, 'completedMissions' | 'weeklyClaimedMissions'> = {
  completedMissions: [],
  weeklyClaimedMissions: []
};

describe('domain/missions', () => {
  it('retourne DONE si objectif atteint et non réclamé', () => {
    const mission = getMissions(
      { weeklySessionsTarget: 3, weeklyMinutesTarget: 120 },
      '2026-W06'
    ).find((m) => m.type === 'WEEKLY');
    expect(mission).toBeDefined();

    const weekSessions = [buildSession({ id: 'a' }), buildSession({ id: 'b' }), buildSession({ id: 'c' })];
    const status = getMissionStatus(mission!, { sessions: weekSessions, weekSessions }, baseState);
    expect(status).toBe('DONE');
  });

  it('retourne CLAIMED pour mission hebdo réclamée', () => {
    const mission = getMissions(
      { weeklySessionsTarget: 3, weeklyMinutesTarget: 120 },
      '2026-W06'
    ).find((m) => m.type === 'WEEKLY');
    expect(mission).toBeDefined();

    const claimedState: Pick<AppState, 'completedMissions' | 'weeklyClaimedMissions'> = {
      completedMissions: [],
      weeklyClaimedMissions: [mission!.id]
    };

    const status = getMissionStatus(
      mission!,
      { sessions: [buildSession()], weekSessions: [buildSession()] },
      claimedState
    );
    expect(status).toBe('CLAIMED');
  });
});
