import { useMemo, useState } from 'react';
import { Session } from '../../types/models';
import { GamificationState } from '../../gamification/types';

interface ProgressionProps {
  sessions: Session[];
  gamificationState: GamificationState;
  view: 'MONTHLY' | 'GOAL';
  onChooseMonthlyChallenge: (optionId: string) => void;
  onResetMonthlyChallenge: () => void;
  onStartGoal8Weeks: (
    goalType: 'PR_5K' | 'PR_10K' | 'PR_HALF' | 'PR_MARATHON' | 'MONTHLY_DISTANCE' | 'LONG_RUN_90MIN_X2',
    target: number,
    durationWeeks: number
  ) => void;
  onResetGoal8Weeks: () => void;
}

type GoalTargetType = 'PR_5K' | 'PR_10K' | 'PR_HALF' | 'PR_MARATHON';
interface GoalSuggestion {
  label: string;
  minutes: number;
  reason: string;
}

const GOAL_OPTIONS: Array<{
  id: GoalTargetType;
  label: string;
  distanceKm: number;
  blurb: string;
}> = [
  { id: 'PR_5K', label: 'PR 5 km', distanceKm: 5, blurb: 'Travail vitesse et maîtrise de l’effort court.' },
  { id: 'PR_10K', label: 'PR 10 km', distanceKm: 10, blurb: 'Objectif équilibré entre endurance active et tempo.' },
  { id: 'PR_HALF', label: 'PR Semi-marathon', distanceKm: 21.1, blurb: 'Cap long, exigeant, axé constance et endurance.' },
  { id: 'PR_MARATHON', label: 'PR Marathon', distanceKm: 42.2, blurb: 'Défi majeur de fond avec gestion précise du rythme.' }
];

const GOAL_DURATION_RANGES: Record<GoalTargetType, number[]> = {
  PR_5K: [6, 7, 8],
  PR_10K: [8, 9, 10],
  PR_HALF: [10, 11, 12],
  PR_MARATHON: [12, 13, 14, 15, 16]
};

export default function Progression({
  sessions,
  gamificationState,
  view,
  onChooseMonthlyChallenge,
  onResetMonthlyChallenge,
  onStartGoal8Weeks,
  onResetGoal8Weeks
}: ProgressionProps): JSX.Element {
  const monthlyStatusLabel: Record<'ACTIVE' | 'COMPLETED' | 'FAILED', string> = {
    ACTIVE: 'En cours',
    COMPLETED: 'Terminé',
    FAILED: 'Non terminé'
  };
  const goalStatusLabel: Record<'ACTIVE' | 'COMPLETED' | 'FAILED', string> = {
    ACTIVE: 'En cours',
    COMPLETED: 'Atteint',
    FAILED: 'Non atteint'
  };
  const goalTypeLabelMap: Record<GoalTargetType, string> = {
    PR_5K: 'PR 5 km',
    PR_10K: 'PR 10 km',
    PR_HALF: 'PR Semi-marathon',
    PR_MARATHON: 'PR Marathon'
  };

  const formatClockDuration = (totalMin: number): string => {
    if (!Number.isFinite(totalMin) || totalMin <= 0) return '--:--';
    const seconds = Math.round(totalMin * 60);
    const hours = Math.floor(seconds / 3600);
    const remain = seconds % 3600;
    const minsPart = Math.floor(remain / 60);
    const secsPart = remain % 60;
    return `${hours} h ${String(minsPart).padStart(2, '0')} min ${String(secsPart).padStart(2, '0')} s`;
  };

  const formatPaceDuration = (totalMin: number): string => {
    if (!Number.isFinite(totalMin) || totalMin <= 0) return '--:--';
    const seconds = Math.round(totalMin * 60);
    const minsPart = Math.floor(seconds / 60);
    const secsPart = seconds % 60;
    return `${minsPart}:${secsPart.toString().padStart(2, '0')}`;
  };

  const parseDurationToMinutes = (hours: number, minutes: number, seconds: number): number => {
    const safeHours = Math.max(0, Math.floor(hours || 0));
    const safeMinutes = Math.max(0, Math.floor(minutes || 0));
    const safeSeconds = Math.max(0, Math.min(59, Math.floor(seconds || 0)));
    return safeHours * 60 + safeMinutes + safeSeconds / 60;
  };

  const applyMinutesToInputs = (totalMin: number): void => {
    const safe = Math.max(1, totalMin);
    const wholeMinTotal = Math.floor(safe);
    const hours = Math.floor(wholeMinTotal / 60);
    const minsOnly = wholeMinTotal % 60;
    const secs = Math.round((safe - wholeMinTotal) * 60);
    if (secs === 60) {
      const carriedTotal = wholeMinTotal + 1;
      setTargetHoursInput(Math.floor(carriedTotal / 60));
      setTargetMinutesInput(carriedTotal % 60);
      setTargetSecondsInput(0);
      return;
    }
    setTargetHoursInput(hours);
    setTargetMinutesInput(minsOnly);
    setTargetSecondsInput(secs);
  };

  const computeBestTimeForDistance = (targetDistanceKm: number): number | null => {
    const lower = targetDistanceKm * 0.95;
    const upper = targetDistanceKm * 1.05;
    const attempts = sessions.filter((s) => {
      const distance = s.distanceKm ?? 0;
      return distance >= lower && distance <= upper;
    });
    if (!attempts.length) return null;
    return Math.min(...attempts.map((s) => s.durationMin));
  };

  const formatDateFr = (date: Date): string =>
    date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  const getMonthDeadline = (monthKey: string): Date => {
    const [year, month] = monthKey.split('-').map(Number);
    return new Date(year, month, 0);
  };

  const [selectedGoalType, setSelectedGoalType] = useState<GoalTargetType | null>(null);
  const [selectedDurationWeeks, setSelectedDurationWeeks] = useState<number | null>(null);
  const [selectedAssistantSuggestion, setSelectedAssistantSuggestion] = useState<string | null>(null);
  const [targetHoursInput, setTargetHoursInput] = useState<number>(0);
  const [targetMinutesInput, setTargetMinutesInput] = useState<number>(25);
  const [targetSecondsInput, setTargetSecondsInput] = useState<number>(0);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthlyDeadline = getMonthDeadline(currentMonth);
  const monthChoices = gamificationState.monthlyChallenges.find((m) => m.month === currentMonth);
  const userMonthly = gamificationState.userMonthlyChallenges.find((m) => m.month === currentMonth);
  const selectedMonthlyOption = userMonthly
    ? gamificationState.challengeOptions.find((opt) => opt.id === userMonthly.chosenOptionId)
    : null;
  const options = useMemo(
    () =>
      (monthChoices?.optionIds ?? [])
        .map((id) => gamificationState.challengeOptions.find((opt) => opt.id === id))
        .filter((opt): opt is NonNullable<typeof opt> => Boolean(opt)),
    [gamificationState.challengeOptions, monthChoices?.optionIds]
  );
  const isDevMode =
    typeof window !== 'undefined' &&
    window.localStorage.getItem('nivelr_dev_unlock_progression') === '1';

  const selectedGoalOption = selectedGoalType
    ? GOAL_OPTIONS.find((option) => option.id === selectedGoalType) ?? null
    : null;
  const selectedGoalBestTime = selectedGoalOption ? computeBestTimeForDistance(selectedGoalOption.distanceKm) : null;
  const selectedGoalSuggestions = useMemo((): GoalSuggestion[] => {
    if (!selectedGoalOption) return [];
    const distance = selectedGoalOption.distanceKm;
    const roundToFiveSeconds = (minutes: number): number => {
      const seconds = Math.max(60, Math.round(minutes * 60));
      const rounded = Math.round(seconds / 5) * 5;
      return rounded / 60;
    };

    if (selectedGoalBestTime) {
      const safeBest = Math.max(2, selectedGoalBestTime);
      return [
        {
          label: 'Prudent',
          minutes: roundToFiveSeconds(safeBest * 0.985),
          reason: 'Objectif sécurisant pour une première tentative réussie.'
        },
        {
          label: 'Équilibré',
          minutes: roundToFiveSeconds(safeBest * 0.97),
          reason: 'Cible réaliste avec une progression régulière sur le cycle choisi.'
        },
        {
          label: 'Ambitieux',
          minutes: roundToFiveSeconds(safeBest * 0.945),
          reason: 'Objectif exigeant si tu peux tenir un bloc qualitatif complet.'
        }
      ];
    }

    const recentRuns = [...sessions]
      .filter((session) => (session.distanceKm ?? 0) > 0 && session.durationMin > 0)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 12);
    const paceFromRecent = recentRuns.length
      ? recentRuns.reduce((sum, session) => sum + session.durationMin / Math.max(0.1, session.distanceKm ?? 0), 0) /
        recentRuns.length
      : 6.2;
    const enduranceFactor =
      distance <= 5 ? 1 : distance <= 10 ? 1.04 : distance <= 21.1 ? 1.1 : 1.18;
    const baseEstimate = paceFromRecent * distance * enduranceFactor;
    return [
      {
        label: 'Prudent',
        minutes: roundToFiveSeconds(baseEstimate * 1.02),
        reason: 'Basé sur ton historique récent, avec une marge de confort.'
      },
      {
        label: 'Équilibré',
        minutes: roundToFiveSeconds(baseEstimate),
        reason: 'Projection neutre de ton niveau actuel sur cette distance.'
      },
      {
        label: 'Ambitieux',
        minutes: roundToFiveSeconds(baseEstimate * 0.97),
        reason: 'Projection haute si ta régularité reste solide sur le cycle.'
      }
    ];
  }, [selectedGoalBestTime, selectedGoalOption, sessions]);
  const selectedGoalTargetMin = parseDurationToMinutes(targetHoursInput, targetMinutesInput, targetSecondsInput);
  const selectedGoalTargetPace = selectedGoalOption
    ? selectedGoalTargetMin / selectedGoalOption.distanceKm
    : 0;
  const isGoalTargetValid = selectedGoalTargetMin > 1;
  const selectedGoalDurationOptions = selectedGoalType ? GOAL_DURATION_RANGES[selectedGoalType] : [];
  const isDurationValid = selectedDurationWeeks !== null;
  const activeGoalSummary = useMemo(() => {
    const goal = gamificationState.userGoal8Weeks;
    if (!goal) return null;
    const endTs = new Date(goal.endDate).getTime();
    const nowTs = Date.now();
    const daysLeft = Math.max(0, Math.ceil((endTs - nowTs) / (1000 * 60 * 60 * 24)));
    const isPrGoal =
      goal.goalType === 'PR_5K' ||
      goal.goalType === 'PR_10K' ||
      goal.goalType === 'PR_HALF' ||
      goal.goalType === 'PR_MARATHON';
    const targetDistance = goal.goalDistanceKm ?? null;
    const lower = targetDistance ? targetDistance * 0.97 : null;
    const upper = targetDistance ? targetDistance * 1.1 : null;

    if (!isPrGoal || !targetDistance || !lower || !upper) {
      return {
        daysLeft,
        attemptCount: 0,
        confidenceLabel: goal.status === 'COMPLETED' ? 'Objectif atteint' : 'En cours',
        validationRule: ''
      };
    }

    const startTs = new Date(goal.startDate).getTime();
    const attempts = sessions.filter((session) => {
      const ts = new Date(session.createdAt).getTime();
      const distance = session.distanceKm ?? 0;
      return ts >= startTs && ts <= endTs && distance >= lower && distance <= upper && session.durationMin > 0;
    });

    const bestEquivalent =
      attempts.length > 0
        ? Math.min(
            ...attempts.map((session) => {
              const distance = Math.max(0.1, session.distanceKm ?? targetDistance);
              return session.durationMin * (targetDistance / distance);
            })
          )
        : null;

    const ratio = bestEquivalent ? goal.goalTarget / bestEquivalent : 0;
    const confidenceLabel =
      goal.status === 'COMPLETED'
        ? 'Objectif atteint'
        : ratio >= 0.98
          ? 'Sprint final'
          : ratio >= 0.9
            ? 'En bonne voie'
            : 'A consolider';

    return {
      daysLeft,
      attemptCount: attempts.length,
      confidenceLabel,
      validationRule: `Validation auto si séance entre ${lower.toFixed(2)} et ${upper.toFixed(
        2
      )} km, puis temps équivalent sur ${targetDistance.toFixed(1)} km <= objectif.`
    };
  }, [gamificationState.userGoal8Weeks, sessions]);

  return (
    <section className="page">
      <h1>{view === 'MONTHLY' ? 'Défi mensuel' : 'Objectif personnel'}</h1>
      <p className="page-subtitle">
        {view === 'MONTHLY'
          ? 'Un seul défi à choisir et tenir sur le mois.'
          : 'Un cap clair à verrouiller avec la durée adaptée à ta distance.'}
      </p>
      {view === 'MONTHLY' ? (
          <article className="card premium-section">
            <h2>Défi mensuel</h2>
            <p className="page-subtitle">
              Deadline du mois: <strong>{formatDateFr(monthlyDeadline)}</strong>
            </p>
            {userMonthly ? (
            <div className="list">
              <article className="progression-active-card">
                <header className="progression-active-head">
                  <div>
                    <p className="progression-eyebrow">Choix validé</p>
                    <h3>{selectedMonthlyOption?.title ?? userMonthly.chosenOptionId}</h3>
                    {selectedMonthlyOption ? <p>{selectedMonthlyOption.description}</p> : null}
                  </div>
                  {selectedMonthlyOption ? (
                    <div className="progression-active-badges">
                      <span>{selectedMonthlyOption.tier}</span>
                      <span>+{selectedMonthlyOption.xpReward} XP</span>
                    </div>
                  ) : null}
                </header>
                <div className="progression-active-grid">
                  <div className="progression-active-kpi">
                    <span>Statut</span>
                    <strong>{monthlyStatusLabel[userMonthly.status]}</strong>
                  </div>
                  <div className="progression-active-kpi">
                    <span>Progression</span>
                    <strong>{userMonthly.progressText}</strong>
                  </div>
                  <div className="progression-active-kpi">
                    <span>Deadline</span>
                    <strong>{formatDateFr(monthlyDeadline)}</strong>
                  </div>
                </div>
                {activeGoalSummary ? (
                  <div className="progression-followup-card">
                    <p className="progression-eyebrow">Accompagnement</p>
                    <div className="progression-followup-grid">
                      <div>
                        <span>Cap actuel</span>
                        <strong>{activeGoalSummary.confidenceLabel}</strong>
                      </div>
                      <div>
                        <span>Temps restant</span>
                        <strong>{activeGoalSummary.daysLeft} jours</strong>
                      </div>
                      <div>
                        <span>Tentatives cycle</span>
                        <strong>{activeGoalSummary.attemptCount}</strong>
                      </div>
                    </div>
                    {activeGoalSummary.validationRule ? <p>{activeGoalSummary.validationRule}</p> : null}
                  </div>
                ) : null}
              </article>
              {isDevMode ? (
                <div className="goal-target-actions">
                  <button type="button" className="btn-compact" onClick={onResetMonthlyChallenge}>
                    Réinitialiser le défi mensuel (test)
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="list">
              {options.map((option) => (
                <article key={option.id} className="card mission-card is-in-progress">
                  <h3>{option.title}</h3>
                  <p>{option.description}</p>
                  <p>
                    Difficulté: <strong>{option.tier}</strong> · Récompense: <strong>+{option.xpReward} XP</strong>
                  </p>
                  <p>
                    Deadline: <strong>{formatDateFr(monthlyDeadline)}</strong>
                  </p>
                  <button type="button" onClick={() => onChooseMonthlyChallenge(option.id)}>
                    Choisir
                  </button>
                </article>
              ))}
            </div>
            )}
          </article>
      ) : null}

      {view === 'GOAL' ? (
          <article className="card premium-section">
            <h2>Objectif personnel</h2>
            {gamificationState.userGoal8Weeks ? (
            <div className="list">
              <article className="progression-active-card">
                <header className="progression-active-head">
                  <div>
                    <p className="progression-eyebrow">Objectif verrouillé</p>
                    <h3>
                      {goalTypeLabelMap[
                        gamificationState.userGoal8Weeks.goalType as GoalTargetType
                      ] ?? gamificationState.userGoal8Weeks.goalType.replace('PR_', 'PR ')}
                    </h3>
                    <p>{gamificationState.userGoal8Weeks.progressText}</p>
                  </div>
                  <div className="progression-active-badges">
                    <span>{goalStatusLabel[gamificationState.userGoal8Weeks.status]}</span>
                    <span>{gamificationState.userGoal8Weeks.durationWeeks ?? 8} semaines</span>
                  </div>
                </header>
                <div className="progression-active-grid">
                  <div className="progression-active-kpi">
                    <span>Temps cible</span>
                    <strong>{formatClockDuration(gamificationState.userGoal8Weeks.goalTarget)}</strong>
                  </div>
                  {gamificationState.userGoal8Weeks.goalDistanceKm ? (
                    <div className="progression-active-kpi">
                      <span>Distance</span>
                      <strong>{gamificationState.userGoal8Weeks.goalDistanceKm} km</strong>
                    </div>
                  ) : null}
                  {gamificationState.userGoal8Weeks.targetPaceMinPerKm ? (
                    <div className="progression-active-kpi">
                      <span>Allure cible</span>
                      <strong>{formatPaceDuration(gamificationState.userGoal8Weeks.targetPaceMinPerKm)} /km</strong>
                    </div>
                  ) : null}
                  {gamificationState.userGoal8Weeks.baselinePaceMinPerKm ? (
                    <div className="progression-active-kpi">
                      <span>Allure de départ</span>
                      <strong>{formatPaceDuration(gamificationState.userGoal8Weeks.baselinePaceMinPerKm)} /km</strong>
                    </div>
                  ) : null}
                  {gamificationState.userGoal8Weeks.bestPaceInCycleMinPerKm ? (
                    <div className="progression-active-kpi">
                      <span>Meilleure allure</span>
                      <strong>{formatPaceDuration(gamificationState.userGoal8Weeks.bestPaceInCycleMinPerKm)} /km</strong>
                    </div>
                  ) : null}
                  <div className="progression-active-kpi">
                    <span>Période</span>
                    <strong>
                      {formatDateFr(new Date(gamificationState.userGoal8Weeks.startDate))} →{' '}
                      {formatDateFr(new Date(gamificationState.userGoal8Weeks.endDate))}
                    </strong>
                  </div>
                </div>
              </article>
              {isDevMode ? (
                <div className="goal-target-actions">
                  <button type="button" className="btn-compact" onClick={onResetGoal8Weeks}>
                    Réinitialiser cet objectif (test)
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="list">
              {!selectedGoalOption ? (
                <div className="goal-select-grid">
                  {GOAL_OPTIONS.map((goal) => (
                    <button
                      key={goal.id}
                      type="button"
                      className="goal-select-btn"
                      onClick={() => {
                        setSelectedGoalType(goal.id);
                        setSelectedDurationWeeks(null);
                        setSelectedAssistantSuggestion(null);
                        const fallbackMinutes =
                          goal.id === 'PR_5K'
                            ? 25
                            : goal.id === 'PR_10K'
                              ? 50
                              : goal.id === 'PR_HALF'
                                ? 120
                                : 240;
                        applyMinutesToInputs(fallbackMinutes);
                      }}
                    >
                      <strong>{goal.label}</strong>
                      <span>{goal.blurb}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <article className="card goal-target-card">
                  <h3>{selectedGoalOption.label}</h3>
                  <p>{selectedGoalOption.blurb}</p>
                  <p>
                    Distance de référence: <strong>{selectedGoalOption.distanceKm} km</strong>
                  </p>
                  <div className="goal-suggestions">
                    <p className="goal-suggestions-title">Temps conseillé (assistant NIVELR)</p>
                    <div className="goal-suggestion-grid">
                      {selectedGoalSuggestions.map((suggestion) => (
                        <button
                          key={suggestion.label}
                          type="button"
                          className={`goal-suggestion-btn ${
                            selectedAssistantSuggestion === suggestion.label ? 'is-selected' : ''
                          }`}
                          onClick={() => {
                            applyMinutesToInputs(suggestion.minutes);
                            setSelectedAssistantSuggestion(suggestion.label);
                          }}
                        >
                          <strong>{suggestion.label}</strong>
                          <span>{formatClockDuration(suggestion.minutes)}</span>
                          <small>{suggestion.reason}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="goal-target-inputs">
                    <label>
                      Temps cible (h)
                      <input
                        type="number"
                        min={0}
                        max={24}
                        value={targetHoursInput}
                        onChange={(event) => {
                          setTargetHoursInput(Number(event.target.value));
                          setSelectedAssistantSuggestion(null);
                        }}
                      />
                    </label>
                    <label>
                      Temps cible (min)
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={targetMinutesInput}
                        onChange={(event) => {
                          setTargetMinutesInput(Number(event.target.value));
                          setSelectedAssistantSuggestion(null);
                        }}
                      />
                    </label>
                    <label>
                      Temps cible (sec)
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={targetSecondsInput}
                        onChange={(event) => {
                          setTargetSecondsInput(Number(event.target.value));
                          setSelectedAssistantSuggestion(null);
                        }}
                      />
                    </label>
                  </div>
                  <div className="goal-suggestions">
                    <p className="goal-suggestions-title">Durée estimée de préparation</p>
                    <div className="goal-suggestion-grid">
                      {selectedGoalDurationOptions.map((weeks) => (
                        <button
                          key={weeks}
                          type="button"
                          className={`goal-suggestion-btn ${
                            selectedDurationWeeks === weeks ? 'is-selected' : ''
                          }`}
                          onClick={() => setSelectedDurationWeeks(weeks)}
                        >
                          <strong>{weeks} semaines</strong>
                          <small>
                            Cycle {selectedGoalOption.id === 'PR_5K'
                              ? 'court'
                              : selectedGoalOption.id === 'PR_10K'
                                ? 'progressif'
                                : selectedGoalOption.id === 'PR_HALF'
                                  ? 'endurance'
                                  : 'long'}
                          </small>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="goal-target-kpis">
                    <p>
                      Temps cible final: <strong>{formatClockDuration(selectedGoalTargetMin)}</strong>
                    </p>
                    <p>
                      Allure cible: <strong>{formatPaceDuration(selectedGoalTargetPace)} /km</strong>
                    </p>
                    {selectedGoalBestTime ? (
                      <p>
                        Meilleur chrono connu:{' '}
                        <strong>{formatClockDuration(selectedGoalBestTime)}</strong>
                      </p>
                    ) : (
                      <p>Pas d&apos;historique exact sur cette distance: le premier effort servira de référence.</p>
                    )}
                  </div>
                  {!isGoalTargetValid ? (
                    <p className="error">Entre un temps cible supérieur à 1 minute.</p>
                  ) : null}
                  {!isDurationValid ? (
                    <p className="error">Choisis une durée estimée pour valider ton objectif.</p>
                  ) : null}
                  <div className="goal-target-actions">
                    <button
                      type="button"
                      disabled={!isGoalTargetValid || !isDurationValid}
                      onClick={() =>
                        onStartGoal8Weeks(
                          selectedGoalOption.id,
                          selectedGoalTargetMin,
                          selectedDurationWeeks ?? selectedGoalDurationOptions[0] ?? 8
                        )
                      }
                    >
                      Verrouiller cet objectif personnel
                    </button>
                    <button type="button" onClick={() => setSelectedGoalType(null)}>
                      Choisir une autre distance
                    </button>
                  </div>
                </article>
              )}
            </div>
            )}
          </article>
      ) : null}
    </section>
  );
}
