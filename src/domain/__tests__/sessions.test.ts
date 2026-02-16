import { describe, expect, it } from 'vitest';
import { computeSessionXp, createSession } from '../sessions';
import { SessionInput } from '../../types/models';

const baseInput: SessionInput = {
  sportType: 'RUNNING',
  subtype: 'EF',
  durationMin: 45,
  distanceKm: 8,
  feelings: {
    feltState: 4,
    rpe: 6,
    fatigue: 2
  }
};

describe('domain/sessions', () => {
  it('calcule un XP positif et cohérent', () => {
    const xp = computeSessionXp(baseInput);
    expect(xp).toBeGreaterThanOrEqual(20);
  });

  it('retourne un minimum de 20 XP même pour petite séance', () => {
    const xp = computeSessionXp({
      sportType: 'OTHER',
      subtype: 'MOBILITE',
      durationMin: 1,
      feelings: {
        feltState: 1,
        rpe: 1,
        fatigue: 5
      }
    });
    expect(xp).toBe(20);
  });

  it('createSession génère id/date/xp', () => {
    const session = createSession(baseInput);
    expect(session.id.length).toBeGreaterThan(0);
    expect(new Date(session.createdAt).toString()).not.toBe('Invalid Date');
    expect(session.xp).toBe(computeSessionXp(baseInput));
  });
});
