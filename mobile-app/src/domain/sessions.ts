import { Session, SessionInput, SessionSubtype } from '../types/models';

const SUBTYPE_BONUS: Record<SessionSubtype, number> = {
  EF: 8,
  SEUIL: 16,
  VMA: 18,
  SORTIE_LONGUE: 14,
  RENFO: 10,
  VELO: 12,
  NATATION: 13,
  MOBILITE: 7
};

function makeId(): string {
  return `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

export function computeSessionXp(input: SessionInput): number {
  const durationBase = Math.max(0, input.durationMin) * 2;
  const sportBonus = input.sportType === 'RUNNING' ? 20 : 12;
  const subtypeBonus = SUBTYPE_BONUS[input.subtype] ?? 8;
  const distanceBonus = input.distanceKm ? Math.max(0, input.distanceKm) * 3 : 0;

  const feltStateMultiplier = 0.86 + input.feelings.feltState * 0.065;
  const rpeBonus = input.feelings.rpe * 1.8;
  const fatiguePenalty = (input.feelings.fatigue - 1) * 1.7;

  return Math.max(
    20,
    Math.round(
      (durationBase + sportBonus + subtypeBonus + distanceBonus + rpeBonus - fatiguePenalty) *
        feltStateMultiplier
    )
  );
}

export function createSession(input: SessionInput): Session {
  return {
    ...input,
    id: makeId(),
    createdAt: new Date().toISOString(),
    xp: computeSessionXp(input)
  };
}
