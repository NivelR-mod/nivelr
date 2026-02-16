import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultState,
  getCurrentWeekKey,
  loadState,
  normalizeState,
  resetState,
  saveState
} from '../localStore';

const STORAGE_KEY = 'sport-mvp-state-v1';

describe('storage/localStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saveState/loadState conservent les données', () => {
    const state = createDefaultState();
    state.bonusXp = 120;
    saveState(state);

    const loaded = loadState();
    expect(loaded.bonusXp).toBe(120);
    expect(loaded.missionWeekKey).toBe(getCurrentWeekKey());
  });

  it('resetState vide le localStorage', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(createDefaultState()));
    resetState();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('normalizeState nettoie les données invalides', () => {
    const normalized = normalizeState({
      sessions: [
        {
          id: 'ok-1',
          createdAt: new Date().toISOString(),
          sportType: 'RUNNING',
          subtype: 'EF',
          durationMin: 40,
          xp: 90,
          feelings: { feltState: 9, rpe: 11, fatigue: 0 }
        },
        {
          id: 'bad-1',
          createdAt: null,
          durationMin: -1,
          xp: -10
        }
      ],
      bonusXp: -100,
      completedMissions: ['m1', 23],
      weeklyClaimedMissions: ['w1', null]
    });

    expect(normalized.sessions).toHaveLength(1);
    expect(normalized.sessions[0].feelings.feltState).toBe(5);
    expect(normalized.sessions[0].feelings.rpe).toBe(10);
    expect(normalized.sessions[0].feelings.fatigue).toBe(1);
    expect(normalized.bonusXp).toBe(0);
    expect(normalized.completedMissions).toEqual(['m1']);
    expect(normalized.weeklyClaimedMissions).toEqual(['w1']);
  });

  it('loadState retourne défaut si JSON invalide', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValueOnce('{invalid-json');
    const loaded = loadState();
    expect(loaded).toEqual(createDefaultState());
  });
});
