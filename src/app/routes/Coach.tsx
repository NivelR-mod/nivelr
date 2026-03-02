import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getCurrentSessionUser } from '../../backend/localAuth';
import {
  CoachHubData,
  getCoachHubData,
  openCoachProgramPdf,
  submitCoachFeedback
} from '../../backend/coach';

export default function Coach(): JSX.Element {
  const session = getCurrentSessionUser();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [openingProgram, setOpeningProgram] = useState(false);
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [error, setError] = useState('');
  const [hubData, setHubData] = useState<CoachHubData | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [readyForNextWeek, setReadyForNextWeek] = useState(true);
  const [feedbackSuccess, setFeedbackSuccess] = useState('');

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

  const canOpenProgram = Boolean(hubData?.intakeCompleted && hubData?.activeProgram);
  const shouldShowFeedbackForm = Boolean(
    hubData?.intakeCompleted && hubData.activeProgram && !hubData.feedbackAlreadySent
  );
  const activeWeekLabel = useMemo(() => {
    if (!hubData?.activeProgram) return null;
    return `Semaine ${hubData.activeProgram.weekNumber}`;
  }, [hubData?.activeProgram]);

  const onOpenProgram = async (): Promise<void> => {
    if (!hubData?.activeProgram) return;
    setOpeningProgram(true);
    setError('');
    const result = await openCoachProgramPdf(hubData.activeProgram);
    setOpeningProgram(false);
    if (!result.ok || !result.url) {
      setError(result.error ?? 'Programme indisponible pour le moment.');
      return;
    }
    window.open(result.url, '_blank', 'noopener,noreferrer');
  };

  const onSubmitFeedback = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!hubData?.activeProgram) return;
    const trimmedFeedback = feedbackText.trim();
    if (trimmedFeedback.length < 20) {
      setError('Ton retour doit contenir au moins 20 caractères.');
      return;
    }

    setError('');
    setFeedbackSuccess('');
    setSendingFeedback(true);
    const result = await submitCoachFeedback({
      weekNumber: hubData.activeProgram.weekNumber,
      feedbackText: trimmedFeedback,
      readyForNextWeek
    });
    setSendingFeedback(false);
    if (!result.ok) {
      setError(result.error ?? 'Impossible d’envoyer ton retour pour le moment.');
      return;
    }

    setFeedbackText('');
    setFeedbackSuccess('Retour envoyé. Ton coach peut préparer la semaine suivante.');
    await refreshCoachData();
  };

  return (
    <section className="page coach-page">
      <h1>Coach</h1>
      <p className="page-subtitle">
        Programme personnalisé semaine par semaine, construit à partir de ton profil et de ton retour réel.
      </p>

      <article className="card premium-section coach-card coach-hero-card">
        <h2>Avant de commencer</h2>
        <p>
          Le module Coach t’aide à suivre un plan progressif adapté à ton niveau. Tu commences par un test, puis ton
          programme est publié chaque semaine.
        </p>
        <p className="coach-medical-warning">
          Le Coach ne remplace en aucun cas un médecin. En cas de doute, douleur persistante ou antécédent médical,
          il est impératif de consulter un professionnel de santé.
        </p>

        {!session ? (
          <p className="error pseudo-error-note">Connecte-toi pour accéder à ton coaching personnalisé.</p>
        ) : null}

        {loading ? <p className="inline-info">Chargement de ton espace Coach...</p> : null}
        {error ? <p className="error pseudo-error-note">{error}</p> : null}
        {intakeJustCompleted ? (
          <p className="inline-info">Questionnaire enregistré. Ton espace Coach est prêt.</p>
        ) : null}

        {!loading && hubData && !hubData.intakeCompleted ? (
          <div className="coach-cta-row">
            <p>Ton test n’est pas encore complété. Il est requis avant d’ouvrir ton programme.</p>
            <Link to="/coach/test" className="btn-compact">
              Démarrer le test
            </Link>
          </div>
        ) : null}

        {!loading && hubData?.intakeCompleted ? (
          <>
            <div className="coach-cta-row">
              <div>
                <p className="coach-program-label">{activeWeekLabel ?? 'Programme en attente de publication'}</p>
                <p className="coach-program-hint">
                  {hubData.activeProgram
                    ? 'Ton programme est disponible en PDF. Ouvre-le et applique la semaine.'
                    : 'Ton coach prépare ton premier programme. Il apparaîtra ici dès publication.'}
                </p>
              </div>
              <button type="button" onClick={() => void onOpenProgram()} disabled={!canOpenProgram || openingProgram}>
                {openingProgram ? 'Ouverture...' : 'Ouvrir mon programme'}
              </button>
            </div>

            <div className="coach-cta-row is-secondary">
              <p>Tu veux recalibrer ton plan ?</p>
              <Link to="/coach/test" className="btn-compact">
                Refaire le test
              </Link>
            </div>
          </>
        ) : null}
      </article>

      {!loading && shouldShowFeedbackForm ? (
        <article className="card premium-section coach-card">
          <h2>Retour de semaine</h2>
          <p>
            Pour recevoir la semaine suivante, envoie ton feedback sur la semaine en cours (ressenti, charge,
            difficultés, points réussis).
          </p>
          <form className="form coach-feedback-form" onSubmit={(event) => void onSubmitFeedback(event)}>
            <label>
              Ton retour
              <textarea
                value={feedbackText}
                onChange={(event) => setFeedbackText(event.target.value)}
                className="contact-message"
                placeholder="Ex: J’ai tenu 3 séances, fatigue modérée sur la sortie longue..."
                minLength={20}
                required
              />
            </label>
            <label className="auth-checkbox-row">
              <input
                type="checkbox"
                checked={readyForNextWeek}
                onChange={(event) => setReadyForNextWeek(event.target.checked)}
              />
              Je suis prêt à recevoir la semaine suivante.
            </label>
            {feedbackSuccess ? <p className="inline-info">{feedbackSuccess}</p> : null}
            <button type="submit" disabled={sendingFeedback}>
              {sendingFeedback ? 'Envoi du retour...' : 'Envoyer mon retour'}
            </button>
          </form>
        </article>
      ) : null}

      {!loading && hubData?.feedbackAlreadySent && hubData.activeProgram ? (
        <article className="card premium-section coach-card">
          <h2>Feedback envoyé</h2>
          <p>
            Merci pour ton retour sur la semaine {hubData.activeProgram.weekNumber}. Ton coach peut maintenant publier
            la suite.
          </p>
        </article>
      ) : null}
    </section>
  );
}
