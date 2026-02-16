import { ChallengeOption } from './types';

export const MONTHLY_CHALLENGE_REWARD = {
  STANDARD: 250,
  AVANCE: 450,
  EXPERT: 700
} as const;

export const MONTHLY_CHALLENGE_OPTIONS: ChallengeOption[] = [
  {
    id: 'S1',
    tier: 'STANDARD',
    title: '12 séances dans le mois',
    description: 'Valider 12 entraînements sur le mois.',
    rules: { kind: 'MONTHLY_WORKOUT_COUNT', target: 12 },
    xpReward: MONTHLY_CHALLENGE_REWARD.STANDARD
  },
  {
    id: 'S2',
    tier: 'STANDARD',
    title: '80 km sur le mois',
    description: 'Cumuler 80 km sur le mois.',
    rules: { kind: 'MONTHLY_DISTANCE', target: 80 },
    xpReward: MONTHLY_CHALLENGE_REWARD.STANDARD
  },
  {
    id: 'S3',
    tier: 'STANDARD',
    title: '4 semaines actives',
    description: 'Avoir 4 semaines actives (>= 3 séances/semaine).',
    rules: { kind: 'MONTHLY_ACTIVE_WEEKS', target: 4 },
    xpReward: MONTHLY_CHALLENGE_REWARD.STANDARD
  },
  {
    id: 'S4',
    tier: 'STANDARD',
    title: '1 sortie longue >= 75 min',
    description: 'Réaliser au moins une sortie de 75 minutes ou plus.',
    rules: { kind: 'MONTHLY_LONG_RUN_COUNT', target: 1, minDurationMin: 75 },
    xpReward: MONTHLY_CHALLENGE_REWARD.STANDARD
  },
  {
    id: 'S5',
    tier: 'STANDARD',
    title: '6 séances faciles',
    description: 'Réaliser 6 séances avec RPE <= 6.',
    rules: { kind: 'MONTHLY_EASY_SESSIONS', target: 6, maxRpe: 6 },
    xpReward: MONTHLY_CHALLENGE_REWARD.STANDARD
  },
  {
    id: 'S6',
    tier: 'STANDARD',
    title: 'Semaines intenses + renfo',
    description: '3 semaines avec >=2 séances intenses (RPE >= 7) et >=1 renfo.',
    rules: { kind: 'WEEKS_WITH_QUALITY_AND_RENFO', target: 3 },
    xpReward: MONTHLY_CHALLENGE_REWARD.STANDARD
  },
  {
    id: 'A1',
    tier: 'AVANCE',
    title: '100 km sur le mois',
    description: 'Cumuler 100 km sur le mois.',
    rules: { kind: 'MONTHLY_DISTANCE', target: 100 },
    xpReward: MONTHLY_CHALLENGE_REWARD.AVANCE
  },
  {
    id: 'A2',
    tier: 'AVANCE',
    title: '14 séances dans le mois',
    description: 'Valider 14 entraînements sur le mois.',
    rules: { kind: 'MONTHLY_WORKOUT_COUNT', target: 14 },
    xpReward: MONTHLY_CHALLENGE_REWARD.AVANCE
  },
  {
    id: 'A3',
    tier: 'AVANCE',
    title: '5 semaines actives sur 6',
    description: 'Sur les 6 dernières semaines, en activer au moins 5.',
    rules: { kind: 'ROLLING_ACTIVE_WEEKS', target: 5, weeksWindow: 6 },
    xpReward: MONTHLY_CHALLENGE_REWARD.AVANCE
  },
  {
    id: 'A4',
    tier: 'AVANCE',
    title: '2 sorties >= 90 min',
    description: 'Réaliser 2 sorties d’au moins 90 minutes.',
    rules: { kind: 'MONTHLY_LONG_RUN_COUNT', target: 2, minDurationMin: 90 },
    xpReward: MONTHLY_CHALLENGE_REWARD.AVANCE
  },
  {
    id: 'A5',
    tier: 'AVANCE',
    title: '3 semaines équilibrées consécutives',
    description: 'Obtenir 3 semaines équilibrées d’affilée.',
    rules: { kind: 'CONSECUTIVE_BALANCED_WEEKS', target: 3, streakLength: 3 },
    xpReward: MONTHLY_CHALLENGE_REWARD.AVANCE
  },
  {
    id: 'A6',
    tier: 'AVANCE',
    title: '+10% volume vs mois précédent',
    description: 'Faire au moins +10% de volume par rapport au mois précédent.',
    rules: { kind: 'MONTHLY_DISTANCE_VS_PREVIOUS', target: 1, percentageTarget: 10 },
    xpReward: MONTHLY_CHALLENGE_REWARD.AVANCE
  },
  {
    id: 'E1',
    tier: 'EXPERT',
    title: '120 km sur le mois',
    description: 'Cumuler 120 km sur le mois.',
    rules: { kind: 'MONTHLY_DISTANCE', target: 120 },
    xpReward: MONTHLY_CHALLENGE_REWARD.EXPERT
  },
  {
    id: 'E2',
    tier: 'EXPERT',
    title: '16 séances dans le mois',
    description: 'Valider 16 entraînements sur le mois.',
    rules: { kind: 'MONTHLY_WORKOUT_COUNT', target: 16 },
    xpReward: MONTHLY_CHALLENGE_REWARD.EXPERT
  },
  {
    id: 'E3',
    tier: 'EXPERT',
    title: '6 semaines actives sur 6',
    description: 'Sur les 6 dernières semaines, être actif chaque semaine.',
    rules: { kind: 'ROLLING_ACTIVE_WEEKS', target: 6, weeksWindow: 6 },
    xpReward: MONTHLY_CHALLENGE_REWARD.EXPERT
  },
  {
    id: 'E4',
    tier: 'EXPERT',
    title: '3 sorties >= 90 min',
    description: 'Réaliser 3 sorties d’au moins 90 minutes.',
    rules: { kind: 'MONTHLY_LONG_RUN_COUNT', target: 3, minDurationMin: 90 },
    xpReward: MONTHLY_CHALLENGE_REWARD.EXPERT
  },
  {
    id: 'E5',
    tier: 'EXPERT',
    title: '4 séances intenses (RPE >= 7)',
    description: 'Réaliser 4 séances intenses (RPE >= 7) sur le mois.',
    rules: { kind: 'MONTHLY_QUALITY_SESSIONS', target: 4 },
    xpReward: MONTHLY_CHALLENGE_REWARD.EXPERT
  },
  {
    id: 'E6',
    tier: 'EXPERT',
    title: 'Record personnel 5k/10k',
    description: 'Battre ton meilleur chrono 5 km ou 10 km sur le mois.',
    rules: { kind: 'MONTHLY_PR_DISTANCE', target: 1 },
    xpReward: MONTHLY_CHALLENGE_REWARD.EXPERT
  }
];
