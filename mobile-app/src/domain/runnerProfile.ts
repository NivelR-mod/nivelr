import {
  RunnerArchetype,
  RunnerAssessmentAnswers,
  RunnerAssessmentResult,
  RunnerFocus,
  RunnerLevel,
  RunnerMotivation,
  RunnerObjective
} from '../types/models';

const DAY_MS = 24 * 60 * 60 * 1000;

const CONSISTENCY_POINTS: Record<RunnerAssessmentAnswers['consistencyMonths'], number> = {
  DEBUT_REPRISE: 0,
  M1_3: 8,
  M3_12: 14,
  Y1_3: 20,
  Y3_PLUS: 24
};

const SESSIONS_POINTS: Record<RunnerAssessmentAnswers['sessionsPerWeek'], number> = {
  S0_1: 0,
  S2: 8,
  S3: 14,
  S4_PLUS: 20
};

const WEEKLY_KM_POINTS: Record<RunnerAssessmentAnswers['weeklyKm'], number> = {
  UNKNOWN: 4,
  KM_LT_10: 4,
  KM_10_20: 8,
  KM_20_35: 12,
  KM_35_50: 16,
  KM_50_PLUS: 20
};

const LONGEST_RUN_POINTS: Record<RunnerAssessmentAnswers['longestRecentRun'], number> = {
  LT_30: 0,
  M30_45: 6,
  M45_60: 10,
  M60_90: 14,
  M90_PLUS: 18
};

const TALK_TEST_POINTS: Record<RunnerAssessmentAnswers['easyPaceTalk'], number> = {
  ESSOUFFLE: 0,
  QUELQUES_PHRASES: 8,
  CONVERSATION: 14
};

const INJURY_POINTS: Record<RunnerAssessmentAnswers['injuryLast6Months'], number> = {
  NO: 10,
  LIGHT: 5,
  STOP_2PLUS: 0
};

const RECOVERY_POINTS: Record<RunnerAssessmentAnswers['usualRecovery'], number> = {
  FATIGUE_DOULEURS: 0,
  LIMITE: 6,
  RECUP_BIEN: 12
};

const AVAILABLE_DAYS_POINTS: Record<RunnerAssessmentAnswers['availableDays'], number> = {
  D1: 0,
  D2: 6,
  D3: 10,
  D4_PLUS: 14
};

const OBJECTIVE_FOCUS_WEIGHTS: Record<RunnerObjective, Partial<Record<RunnerFocus, number>>> = {
  REPRISE_REGULARITE: { ROUTINE: 2, PROGRESSION: 1 },
  FORME_GENERALE: { SANTE: 2, ROUTINE: 1, PROGRESSION: 1 },
  PREPA_COURSE: { PROGRESSION: 2, PERFORMANCE: 2 },
  PERFORMANCE: { PERFORMANCE: 3, PROGRESSION: 1 },
  SANTE_POIDS: { SANTE: 3, ROUTINE: 1 }
};

const MOTIVATION_FOCUS_WEIGHTS: Record<RunnerMotivation, Partial<Record<RunnerFocus, number>>> = {
  ROUTINE: { ROUTINE: 3 },
  VARIER: { EXPLORATION: 3 },
  DEPASSEMENT: { PERFORMANCE: 2, PROGRESSION: 1 },
  STRUCTUREE: { PROGRESSION: 3 }
};

const FOCUS_ORDER: RunnerFocus[] = ['PROGRESSION', 'ROUTINE', 'SANTE', 'PERFORMANCE', 'EXPLORATION'];

const BASE_RECOMMENDATIONS: Record<RunnerLevel, string[]> = {
  DEBUTANT_REPRISE: [
    '2 à 3 séances par semaine à allure facile.',
    '20 à 40 minutes par séance, sans chercher la vitesse.',
    'Progression de charge limitée à +10% max par semaine.',
    '0 à 1 séance qualité douce par semaine maximum.',
    'Priorité à la régularité, au sommeil et à la récupération.'
  ],
  REGULIER: [
    '3 séances par semaine avec majorité en endurance facile.',
    '1 séance qualité par semaine (seuil ou fractionné léger).',
    'Sortie longue de 45 à 75 minutes selon la forme.',
    'Semaine allégée toutes les 3 à 4 semaines.',
    'Objectif 5K/10K possible si récupération stable.'
  ],
  CONFIRME: [
    '3 à 5 séances selon disponibilité et fatigue.',
    '1 à 2 séances qualité uniquement si récupération suffisante.',
    'Cycles structurés avec semaines de consolidation.',
    "Travail d'allures spécifiques selon objectif.",
    'Prévention blessure et gestion de charge obligatoires.'
  ]
};

const FOCUS_RECOMMENDATION: Record<RunnerFocus, string> = {
  ROUTINE: 'Garde un planning simple et répété, avec horaires fixes.',
  EXPLORATION: "Varie les terrains et types de sorties pour maintenir l'envie.",
  PROGRESSION: 'Mesure une métrique clé chaque semaine pour suivre ta progression.',
  PERFORMANCE: 'Cible une séance clé par semaine puis protège ta récupération.',
  SANTE: "Vise la constance avant l'intensité, avec accent sur le bien-être global."
};

const LEVEL_CAUTION: Record<RunnerLevel, string> = {
  DEBUTANT_REPRISE: "Évite les 10 km rapides et le fractionné intense tant que la base aérobie est fragile.",
  REGULIER: "Augmente l'intensité progressivement pour limiter le risque de blessure.",
  CONFIRME: 'Ne cumule pas plusieurs séances dures sans fenêtre de récupération adaptée.'
};

const ARCHETYPE_FROM_FOCUS: Record<RunnerFocus, RunnerArchetype> = {
  EXPLORATION: 'EXPLORATEUR',
  ROUTINE: 'PILIER',
  PROGRESSION: 'STRATEGE',
  SANTE: 'STRATEGE',
  PERFORMANCE: 'PERFORMEUR'
};

export function evaluateRunnerProfile(answers: RunnerAssessmentAnswers): RunnerAssessmentResult {
  const rawScore =
    CONSISTENCY_POINTS[answers.consistencyMonths] +
    SESSIONS_POINTS[answers.sessionsPerWeek] +
    WEEKLY_KM_POINTS[answers.weeklyKm] +
    LONGEST_RUN_POINTS[answers.longestRecentRun] +
    TALK_TEST_POINTS[answers.easyPaceTalk] +
    INJURY_POINTS[answers.injuryLast6Months] +
    RECOVERY_POINTS[answers.usualRecovery] +
    AVAILABLE_DAYS_POINTS[answers.availableDays];

  const score = Math.max(0, Math.min(100, Math.round(rawScore)));
  let level: RunnerLevel = score >= 65 ? 'CONFIRME' : score >= 35 ? 'REGULIER' : 'DEBUTANT_REPRISE';

  if (answers.injuryLast6Months === 'STOP_2PLUS' && level === 'CONFIRME') {
    level = 'REGULIER';
  }

  if (
    answers.easyPaceTalk === 'ESSOUFFLE' &&
    (answers.longestRecentRun === 'LT_30' || answers.longestRecentRun === 'M30_45')
  ) {
    level = 'DEBUTANT_REPRISE';
  }

  const focusScores: Record<RunnerFocus, number> = {
    ROUTINE: 0,
    EXPLORATION: 0,
    PROGRESSION: 0,
    PERFORMANCE: 0,
    SANTE: 0
  };
  for (const objective of answers.objective8Weeks) {
    const weights = OBJECTIVE_FOCUS_WEIGHTS[objective];
    for (const focusKey of Object.keys(weights) as RunnerFocus[]) {
      focusScores[focusKey] += weights[focusKey] ?? 0;
    }
  }
  for (const motivation of answers.motivation) {
    const weights = MOTIVATION_FOCUS_WEIGHTS[motivation];
    for (const focusKey of Object.keys(weights) as RunnerFocus[]) {
      focusScores[focusKey] += weights[focusKey] ?? 0;
    }
  }
  const focus = FOCUS_ORDER.reduce((best, current) =>
    focusScores[current] > focusScores[best] ? current : best
  );
  const archetype = ARCHETYPE_FROM_FOCUS[focus];
  const recommendations = [...BASE_RECOMMENDATIONS[level], FOCUS_RECOMMENDATION[focus]];
  const answeredAt = new Date().toISOString();
  const nextRecommendedAt = new Date(Date.now() + 30 * DAY_MS).toISOString();

  return {
    score,
    level,
    focus,
    archetype,
    recommendations,
    caution: LEVEL_CAUTION[level],
    answeredAt,
    nextRecommendedAt
  };
}

export function shouldSuggestReassessment(nextRecommendedAt: string | undefined): boolean {
  if (!nextRecommendedAt) return false;
  const ts = Date.parse(nextRecommendedAt);
  if (!Number.isFinite(ts)) return false;
  return Date.now() >= ts;
}

export function formatRunnerLevel(level: RunnerLevel): string {
  if (level === 'DEBUTANT_REPRISE') return 'Débutant / Reprise';
  if (level === 'REGULIER') return 'Régulier';
  return 'Confirmé';
}

export function formatRunnerFocus(focus: RunnerFocus): string {
  if (focus === 'ROUTINE') return 'Routine';
  if (focus === 'EXPLORATION') return 'Exploration';
  if (focus === 'PROGRESSION') return 'Progression structurée';
  if (focus === 'PERFORMANCE') return 'Performance';
  return 'Santé';
}

export function formatRunnerArchetype(archetype: RunnerArchetype): string {
  if (archetype === 'EXPLORATEUR') return 'Explorateur';
  if (archetype === 'PILIER') return 'Pilier';
  if (archetype === 'STRATEGE') return 'Stratège';
  return 'Performeur';
}

export function getRunnerArchetypeDescription(archetype: RunnerArchetype): string {
  if (archetype === 'EXPLORATEUR') return 'Ancre ta progression sur la variété et le plaisir de bouger.';
  if (archetype === 'PILIER') return 'Ancre ta progression sur la régularité, semaine après semaine.';
  if (archetype === 'STRATEGE') return 'Ancre ta progression sur la maîtrise de la charge et des priorités.';
  return 'Ancre ta progression sur des objectifs clés pour performer au bon moment.';
}

export function getRunnerArchetypeMotivation(archetype: RunnerArchetype, level: RunnerLevel): string {
  if (archetype === 'EXPLORATEUR') {
    return `Ton niveau ${formatRunnerLevel(level)} est une base idéale pour progresser en gardant du plaisir et de la variété.`;
  }
  if (archetype === 'PILIER') {
    return `Ton niveau ${formatRunnerLevel(level)} montre une base solide: ta régularité est ton meilleur levier de progression.`;
  }
  if (archetype === 'STRATEGE') {
    return `Ton niveau ${formatRunnerLevel(level)} te permet de progresser intelligemment, avec structure et contrôle.`;
  }
  return `Ton niveau ${formatRunnerLevel(level)} est compatible avec une progression ambitieuse sur les moments clés.`;
}

export function getRunnerProfileWhyLines(answers: RunnerAssessmentAnswers): string[] {
  const lines: string[] = [];

  if (answers.sessionsPerWeek === 'S3' || answers.sessionsPerWeek === 'S4_PLUS') {
    lines.push("Tu as déjà une fréquence d'entraînement qui favorise une progression durable.");
  } else if (answers.sessionsPerWeek === 'S2') {
    lines.push('Tu maintiens une base de pratique stable qui peut rapidement monter en qualité.');
  } else {
    lines.push('Tu es dans une phase de construction de base, ce qui justifie une progression graduée.');
  }

  if (answers.objective8Weeks.includes('PERFORMANCE') || answers.objective8Weeks.includes('PREPA_COURSE')) {
    lines.push("Tes objectifs sont orientés résultat, ce qui demande un cadre d'entraînement adapté.");
  } else if (answers.objective8Weeks.includes('REPRISE_REGULARITE')) {
    lines.push('Ton objectif de régularité montre une priorité claire: reconstruire une base saine.');
  } else {
    lines.push('Tes objectifs privilégient une progression utile et réaliste sur les prochaines semaines.');
  }

  if (answers.motivation.includes('VARIER')) {
    lines.push('Ta motivation vient de la variété: alterner les contenus va t’aider à tenir dans la durée.');
  } else if (answers.motivation.includes('STRUCTUREE')) {
    lines.push('Tu es motivé par une progression structurée: un plan clair te fera gagner en constance.');
  } else if (answers.motivation.includes('DEPASSEMENT')) {
    lines.push('Tu aimes te dépasser: on canalise cette énergie pour progresser sans surcharge.');
  } else {
    lines.push('Ta motivation est la régularité: c’est un excellent prédicteur de progression long terme.');
  }

  return lines.slice(0, 3);
}
