import { useMemo, useState } from 'react';
import {
  evaluateRunnerProfile,
  formatRunnerArchetype,
  formatRunnerLevel,
  getRunnerArchetypeDescription,
  getRunnerArchetypeMotivation,
  getRunnerProfileWhyLines
} from '../../domain/runnerProfile';
import {
  RunnerAssessmentAnswers,
  RunnerAssessmentSnapshot,
  RunnerMotivation,
  RunnerObjective
} from '../../types/models';

interface RunnerAssessmentProps {
  initialAnswers?: RunnerAssessmentAnswers;
  onApply: (snapshot: RunnerAssessmentSnapshot) => void;
  onCancel?: () => void;
  requiredFlow?: boolean;
}

const DEFAULT_ANSWERS: RunnerAssessmentAnswers = {
  consistencyMonths: 'DEBUT_REPRISE',
  sessionsPerWeek: 'S0_1',
  weeklyKm: 'UNKNOWN',
  longestRecentRun: 'LT_30',
  easyPaceTalk: 'ESSOUFFLE',
  injuryLast6Months: 'NO',
  objective8Weeks: ['REPRISE_REGULARITE'],
  usualRecovery: 'LIMITE',
  availableDays: 'D2',
  motivation: ['ROUTINE']
};

type MultiKey = 'objective8Weeks' | 'motivation';
type SingleKey = Exclude<keyof RunnerAssessmentAnswers, MultiKey>;
type AnyOption = RunnerAssessmentAnswers[SingleKey] | RunnerObjective | RunnerMotivation;

type QuestionDefinition =
  | {
      key: SingleKey;
      label: string;
      options: Array<{ value: RunnerAssessmentAnswers[SingleKey]; label: string }>;
      multiple?: false;
    }
  | {
      key: MultiKey;
      label: string;
      options: Array<{ value: RunnerObjective | RunnerMotivation; label: string }>;
      multiple: true;
      minSelections: number;
      helper: string;
    };

const QUESTIONS: QuestionDefinition[] = [
  {
    key: 'consistencyMonths',
    label: 'Depuis combien de temps cours-tu regulierement ?',
    options: [
      { value: 'DEBUT_REPRISE', label: 'Je debute / je reprends' },
      { value: 'M1_3', label: '1-3 mois' },
      { value: 'M3_12', label: '3-12 mois' },
      { value: 'Y1_3', label: '1-3 ans' },
      { value: 'Y3_PLUS', label: '3+ ans' }
    ]
  },
  {
    key: 'sessionsPerWeek',
    label: 'Combien de seances de course fais-tu en moyenne par semaine ?',
    options: [
      { value: 'S0_1', label: '0-1' },
      { value: 'S2', label: '2' },
      { value: 'S3', label: '3' },
      { value: 'S4_PLUS', label: '4+' }
    ]
  },
  {
    key: 'weeklyKm',
    label: 'Ton volume hebdo moyen (km/semaine) ?',
    options: [
      { value: 'UNKNOWN', label: 'Je ne sais pas' },
      { value: 'KM_LT_10', label: '< 10' },
      { value: 'KM_10_20', label: '10-20' },
      { value: 'KM_20_35', label: '20-35' },
      { value: 'KM_35_50', label: '35-50' },
      { value: 'KM_50_PLUS', label: '50+' }
    ]
  },
  {
    key: 'longestRecentRun',
    label: 'Ta sortie la plus longue recente ?',
    options: [
      { value: 'LT_30', label: '< 30 min' },
      { value: 'M30_45', label: '30-45 min' },
      { value: 'M45_60', label: '45-60 min' },
      { value: 'M60_90', label: '60-90 min' },
      { value: 'M90_PLUS', label: '90+ min' }
    ]
  },
  {
    key: 'easyPaceTalk',
    label: 'A quel point peux-tu parler en courant a allure facile ?',
    options: [
      { value: 'ESSOUFFLE', label: 'Je suis vite essouffle' },
      { value: 'QUELQUES_PHRASES', label: 'Je peux dire quelques phrases' },
      { value: 'CONVERSATION', label: 'Je peux tenir une conversation' }
    ]
  },
  {
    key: 'injuryLast6Months',
    label: 'As-tu eu une blessure liee a la course dans les 6 derniers mois ?',
    options: [
      { value: 'NO', label: 'Non' },
      { value: 'LIGHT', label: 'Oui, legere' },
      { value: 'STOP_2PLUS', label: 'Oui, arret > 2 semaines' }
    ]
  },
  {
    key: 'objective8Weeks',
    label: 'Ton objectif principal sur les 8 prochaines semaines ?',
    multiple: true,
    minSelections: 1,
    helper: 'Tu peux selectionner plusieurs objectifs.',
    options: [
      { value: 'REPRISE_REGULARITE', label: 'Reprendre / etre regulier' },
      { value: 'FORME_GENERALE', label: 'Ameliorer ma forme generale' },
      { value: 'PREPA_COURSE', label: 'Preparer une course' },
      { value: 'PERFORMANCE', label: 'Performance / chrono' },
      { value: 'SANTE_POIDS', label: 'Perte de poids / sante' }
    ]
  },
  {
    key: 'usualRecovery',
    label: 'Ton ressenti habituel apres une semaine classique ?',
    options: [
      { value: 'FATIGUE_DOULEURS', label: 'Souvent fatigue / douleurs' },
      { value: 'LIMITE', label: 'Ca passe mais limite' },
      { value: 'RECUP_BIEN', label: 'Je recupere bien' }
    ]
  },
  {
    key: 'availableDays',
    label: 'Combien de jours par semaine peux-tu reellement courir ?',
    options: [
      { value: 'D1', label: '1' },
      { value: 'D2', label: '2' },
      { value: 'D3', label: '3' },
      { value: 'D4_PLUS', label: '4+' }
    ]
  },
  {
    key: 'motivation',
    label: 'Qu est-ce qui te motive le plus ?',
    multiple: true,
    minSelections: 1,
    helper: 'Selection multiple autorisee.',
    options: [
      { value: 'ROUTINE', label: 'Tenir une routine' },
      { value: 'VARIER', label: 'Explorer et varier' },
      { value: 'DEPASSEMENT', label: 'Me depasser ponctuellement' },
      { value: 'STRUCTUREE', label: 'Progression structuree' }
    ]
  }
];

export default function RunnerAssessment({
  initialAnswers,
  onApply,
  onCancel,
  requiredFlow = false
}: RunnerAssessmentProps): JSX.Element {
  const [answers, setAnswers] = useState<RunnerAssessmentAnswers>(initialAnswers ?? DEFAULT_ANSWERS);
  const [step, setStep] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');

  const question = QUESTIONS[step];
  const progressPct = Math.round(((step + 1) / QUESTIONS.length) * 100);
  const result = useMemo(() => evaluateRunnerProfile(answers), [answers]);
  const whyLines = useMemo(() => getRunnerProfileWhyLines(answers), [answers]);

  const isSelected = (value: AnyOption): boolean => {
    if (question.multiple) {
      const current = answers[question.key] as string[];
      return current.includes(value as string);
    }
    return answers[question.key] === value;
  };

  const selectOption = (value: AnyOption): void => {
    if (question.multiple) {
      setAnswers((prev) => {
        const current = prev[question.key] as string[];
        const exists = current.includes(value as string);
        const next = exists ? current.filter((item) => item !== value) : [...current, value as string];
        if (!next.length) return prev;
        return { ...prev, [question.key]: next } as RunnerAssessmentAnswers;
      });
      return;
    }

    setAnswers((prev) => ({
      ...prev,
      [question.key]: value
    }));
  };

  const onNext = (): void => {
    if (question.multiple) {
      const selected = answers[question.key] as string[];
      if (selected.length < question.minSelections) return;
    }

    if (step === QUESTIONS.length - 1) {
      setShowResult(true);
      return;
    }
    setDirection('next');
    setStep((prev) => prev + 1);
  };

  const onPrevious = (): void => {
    if (step === 0) return;
    setDirection('prev');
    setStep((prev) => prev - 1);
  };

  const applyResult = (): void => {
    onApply({
      answers,
      result,
      appliedAt: new Date().toISOString()
    });
  };

  if (showResult) {
    return (
      <section className="page runner-assessment-page">
        <h1>Ton profil coureur</h1>
        <article className="card premium-section runner-assessment-card is-result">
          <div className="runner-assessment-result-head">
            <p className="runner-assessment-kicker">Evaluation terminee</p>
            <h2>Ton profil dominant</h2>
          </div>
          <div className="runner-assessment-hero">
            <p className="runner-assessment-level-pill">Niveau {formatRunnerLevel(result.level)}</p>
            <p className="runner-assessment-profile-name">{formatRunnerArchetype(result.archetype)}</p>
            <p className="runner-assessment-profile-desc">{getRunnerArchetypeDescription(result.archetype)}</p>
          </div>
          <p className="runner-assessment-caution">{getRunnerArchetypeMotivation(result.archetype, result.level)}</p>

          <article className="runner-assessment-why-card">
            <h3>Pourquoi ce profil te correspond</h3>
            <ul className="runner-assessment-reco-list">
              {whyLines.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="runner-assessment-why-card">
            <h3>Conseils adaptes a ton niveau</h3>
            <ul className="runner-assessment-reco-list">
              {result.recommendations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="runner-assessment-why-card">
            <h3>Cap de progression</h3>
            <p>{result.caution}</p>
          </article>
          <div className="goal-actions runner-assessment-actions">
            <button type="button" onClick={applyResult}>
              Appliquer a mon profil
            </button>
            <button type="button" onClick={() => setShowResult(false)}>
              Modifier mes reponses
            </button>
            {!requiredFlow ? (
              <button type="button" onClick={onCancel}>
                Annuler
              </button>
            ) : null}
          </div>
        </article>
      </section>
    );
  }

  return (
    <section className="page runner-assessment-page">
      <h1>Questionnaire profil coureur</h1>
      <p className="page-subtitle">10 questions max, recommandations personnalisees a la fin.</p>
      <article className="card premium-section form runner-assessment-card">
        <div className="runner-assessment-progress-head">
          <p>
            Etape <strong>{step + 1}</strong> / {QUESTIONS.length}
          </p>
          <p>{progressPct}%</p>
        </div>
        <div aria-hidden="true" className="runner-assessment-track">
          <div className="runner-assessment-fill" style={{ width: `${progressPct}%` }} />
        </div>

        <div key={`step-${step}`} className={`runner-assessment-step ${direction === 'next' ? 'is-next' : 'is-prev'}`}>
          <h2 className="runner-assessment-question">{question.label}</h2>
          {'helper' in question ? <p className="runner-assessment-helper">{question.helper}</p> : null}
          <div className="runner-assessment-options">
            {question.options.map((option) => (
              <label key={String(option.value)} className="runner-assessment-option">
                <input
                  type={question.multiple ? 'checkbox' : 'radio'}
                  name={String(question.key)}
                  value={String(option.value)}
                  checked={isSelected(option.value as AnyOption)}
                  onChange={() => selectOption(option.value as AnyOption)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="goal-actions runner-assessment-actions">
          <button type="button" onClick={onPrevious} disabled={step === 0}>
            Precedent
          </button>
          <button type="button" onClick={onNext}>
            {step === QUESTIONS.length - 1 ? 'Voir mon resultat' : 'Suivant'}
          </button>
          {!requiredFlow && onCancel ? (
            <button type="button" onClick={onCancel}>
              Plus tard
            </button>
          ) : null}
        </div>
      </article>
    </section>
  );
}
