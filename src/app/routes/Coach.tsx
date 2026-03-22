import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getCurrentSessionUser } from '../../backend/localAuth';
import {
  buildCoachFeedbackTextFromSessions,
  CoachHubData,
  getCoachHubData,
  getCoachSessionSummaries,
  getCoachSubmissionDeadline,
  getCurrentWeekCoachSessions,
  openCoachProgramPdf,
  submitCoachFeedback
} from '../../backend/coach';
import { Session } from '../../types/models';

interface CoachProps {
  sessions: Session[];
}

function formatDeadlineLabel(deadline: Date): string {
  return deadline.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long'
  }) + ' à 20:30';
}

export default function Coach({ sessions }: CoachProps): JSX.Element {
  const session = getCurrentSessionUser();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [openingProgram, setOpeningProgram] = useState(false);
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [error, setError] = useState('');
  const [hubData, setHubData] = useState<CoachHubData | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState('');
  const [nowTick, setNowTick] = useState(() => Date.now());

  const intakeJustCompleted = searchParams.get('intake') === 'done';

  const refreshCoachData = async (): Promise<void> => {
    setLoading(true);
    setError('');
    const result = await getCoachHubData();
    setLoading(false);
    if (!result.ok || !result.data) {
      setError(result.error ?? 'Impossible de charger la section Coach.');
      return;
    }
    setHubData(result.data);
  };

  useEffect(() => {
    void refreshCoachData();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTick(Date.now());
    }, 60000);
    return () => window.clearInterval(timer);
  }, []);

  const deadline = useMemo(() => getCoachSubmissionDeadline(new Date(nowTick)), [nowTick]);
  const weekSessions = useMemo(() => getCurrentWeekCoachSessions(sessions, new Date(nowTick)), [sessions, nowTick]);
  const sessionSummaries = useMemo(() => getCoachSessionSummaries(weekSessions), [weekSessions]);

  const latestPublishedWeek = hubData?.publishedPrograms.length
    ? hubData.publishedPrograms[hubData.publishedPrograms.length - 1].weekNumber
    : 0;
  const weekButtonCount = latestPublishedWeek > 0 ? latestPublishedWeek + 1 : 1;
  const weekButtons = Array.from({ length: weekButtonCount }, (_, index) => index + 1);
  const programsByWeek = new Map((hubData?.publishedPrograms ?? []).map((program) => [program.weekNumber, program]));
  const canSendCurrentWeek = Boolean(hubData?.intakeCompleted && hubData.activeProgram && weekSessions.length);
  const shouldAutoSend = Boolean(
    hubData?.intakeCompleted &&
      hubData.activeProgram &&
      !hubData.feedbackAlreadySent &&
      weekSessions.length > 0 &&
      Date.now() >= deadline.getTime()
  );

  const onOpenProgram = async (weekNumber: number): Promise<void> => {
    const program = programsByWeek.get(weekNumber);
    if (!program) return;
    setOpeningProgram(true);
    setError('');
    const result = await openCoachProgramPdf(program);
    setOpeningProgram(false);
    if (!result.ok || !result.url) {
      setError(result.error ?? 'Programme indisponible pour le moment.');
      return;
    }
    window.open(result.url, '_blank', 'noopener,noreferrer');
  };

  const sendCurrentWeekFeedback = async (trigger: 'manual' | 'auto'): Promise<void> => {
    if (!hubData?.activeProgram || !canSendCurrentWeek) return;
    setError('');
    setFeedbackSuccess('');
    setSendingFeedback(true);
    const result = await submitCoachFeedback({
      weekNumber: hubData.activeProgram.weekNumber,
      feedbackText: buildCoachFeedbackTextFromSessions(hubData.activeProgram.weekNumber, weekSessions, new Date()),
      readyForNextWeek: true
    });
    setSendingFeedback(false);
    if (!result.ok) {
      setError(result.error ?? 'Impossible d’envoyer le retour coach pour le moment.');
      return;
    }
    setFeedbackSuccess(
      result.warning ??
        (trigger === 'auto'
          ? 'Retour envoyé automatiquement au coach.'
          : 'Retour envoyé au coach.')
    );
    await refreshCoachData();
  };

  useEffect(() => {
    if (!shouldAutoSend || sendingFeedback) return;
    void sendCurrentWeekFeedback('auto');
  }, [shouldAutoSend, sendingFeedback]);

  return (
    <section className="page coach-page">
      <h1>Coach</h1>

      <article className="card premium-section coach-card coach-hero-card">
        <h2>Avant de commencer</h2>
        <p>
          Le module Coach t’aide à suivre un plan progressif adapté à ton niveau. Tes séances enregistrées cette semaine
          servent directement de base au retour coach.
        </p>

        {!session ? (
          <p className="error pseudo-error-note">Connecte-toi pour accéder à ton coaching personnalisé.</p>
        ) : null}
        {loading ? <p className="inline-info">Chargement de ton espace Coach...</p> : null}
        {error ? <p className="error pseudo-error-note">{error}</p> : null}
        {feedbackSuccess ? <p className="inline-info">{feedbackSuccess}</p> : null}
        {intakeJustCompleted ? <p className="inline-info">Questionnaire enregistré. Ton espace Coach est prêt.</p> : null}

        {!loading && hubData && !hubData.intakeCompleted ? (
          <div className="coach-cta-row">
            <p>Ton test n’est pas encore complété. Il est requis avant d’ouvrir ton programme.</p>
            <Link to="/coach/test" className="coach-action-btn">
              Démarrer le test
            </Link>
          </div>
        ) : null}

        {!loading && hubData?.intakeCompleted ? (
          <>
            <div className="coach-week-strip">
              <p className="coach-program-label">Programmes</p>
              <div className="coach-week-buttons">
                {weekButtons.map((weekNumber) => {
                  const isLocked = !programsByWeek.get(weekNumber);
                  return (
                    <button
                      key={weekNumber}
                      type="button"
                      className={`coach-week-btn${isLocked ? ' is-locked' : ''}`}
                      disabled={isLocked || openingProgram}
                      onClick={() => void onOpenProgram(weekNumber)}
                    >
                      {openingProgram && !isLocked ? 'Ouverture...' : `Semaine ${weekNumber}`}
                      {isLocked ? '  🔒' : ''}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="coach-cta-row is-secondary">
              <p>Tu veux recalibrer ton plan ?</p>
              <Link to="/coach/test" className="coach-action-btn">
                Refaire le test
              </Link>
            </div>
          </>
        ) : null}

        <p className="coach-medical-note">
          Le Coach ne remplace en aucun cas un médecin. En cas de doute, douleur persistante ou antécédent médical,
          il est impératif de consulter un professionnel de santé.
        </p>
      </article>

      {!loading && hubData?.intakeCompleted && hubData.activeProgram ? (
        <article className="card premium-section coach-card coach-feedback-card">
          <h2>Retour de semaine</h2>
          <p>Les séances saisies dans l’app sont reprises automatiquement. Aucun doublon de saisie.</p>

          <div className="coach-feedback-status-grid">
            <article className="coach-feedback-status-card">
              <span>Deadline d’envoi</span>
              <strong>{formatDeadlineLabel(deadline)}</strong>
            </article>
            <article className="coach-feedback-status-card">
              <span>Statut</span>
              <strong>{hubData.feedbackAlreadySent ? 'Retour déjà envoyé' : 'Envoi auto prévu'}</strong>
            </article>
            <article className="coach-feedback-status-card">
              <span>Séances de la semaine</span>
              <strong>{weekSessions.length}</strong>
            </article>
          </div>

          {sessionSummaries.length ? (
            <div className="coach-feedback-session-list">
              {sessionSummaries.map((row) => (
                <article key={row.id} className="coach-feedback-session-card">
                  <div className="coach-feedback-session-head">
                    <h3>{row.title}</h3>
                    <span>{row.dateLabel}</span>
                  </div>
                  <p className="coach-feedback-summary-line">
                    <strong>{row.distanceLabel}</strong> · {row.durationLabel} · {row.paceLabel} · RPE {row.rpe} · Fatigue{' '}
                    {row.fatigue}/5
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="coach-feedback-empty">Aucune séance enregistrée cette semaine pour le moment.</p>
          )}

          {!hubData.feedbackAlreadySent ? (
            <div className="coach-feedback-actions">
              <button
                type="button"
                disabled={!canSendCurrentWeek || sendingFeedback}
                onClick={() => void sendCurrentWeekFeedback('manual')}
              >
                {sendingFeedback ? 'Envoi...' : 'Envoyer au coach maintenant'}
              </button>
              <p className="page-subtitle">
                Si tu n’envoies rien avant, le retour partira automatiquement à la deadline affichée.
              </p>
            </div>
          ) : (
            <p className="inline-info">
              Le retour de cette semaine a déjà été transmis au coach. Les nouvelles séances seront prises en compte pour
              la prochaine semaine.
            </p>
          )}
        </article>
      ) : null}
    </section>
  );
}
