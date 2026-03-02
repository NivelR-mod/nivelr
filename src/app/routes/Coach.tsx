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
  const [feedbackSessions, setFeedbackSessions] = useState('');
  const [feedbackDistance, setFeedbackDistance] = useState('');
  const [feedbackDuration, setFeedbackDuration] = useState('');
  const [feedbackPace, setFeedbackPace] = useState('');
  const [feedbackRpe, setFeedbackRpe] = useState('');
  const [feedbackFatigue, setFeedbackFatigue] = useState('');
  const [feedbackPain, setFeedbackPain] = useState('');
  const [feedbackGeneralFeeling, setFeedbackGeneralFeeling] = useState('');
  const [feedbackNotes, setFeedbackNotes] = useState('');
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

    const sessions = feedbackSessions.trim();
    const distance = feedbackDistance.trim();
    const duration = feedbackDuration.trim();
    const pace = feedbackPace.trim();
    const rpe = feedbackRpe.trim();
    const fatigue = feedbackFatigue.trim();
    const pain = feedbackPain.trim();
    const generalFeeling = feedbackGeneralFeeling.trim();
    const notes = feedbackNotes.trim();

    if (!sessions || !distance || !duration || !pace || !rpe || !fatigue || !pain || !generalFeeling) {
      setError('Merci de compléter les champs essentiels du retour de semaine.');
      return;
    }

    const structuredFeedback = [
      '=== RETOUR DE SEMAINE ===',
      `Séance X: ${sessions}`,
      `Distances: ${distance}`,
      `Temps: ${duration}`,
      `Rythme (min/km): ${pace}`,
      `RPE moyen: ${rpe}`,
      `Fatigue (1-5): ${fatigue}`,
      `Douleurs éventuelles: ${pain}`,
      '',
      '=== RETOUR GÉNÉRAL ===',
      `Sensations générales: ${generalFeeling}`,
      `Notes libres sur la semaine: ${notes || 'Aucune note libre'}`
    ].join('\n');

    setError('');
    setFeedbackSuccess('');
    setSendingFeedback(true);
    const result = await submitCoachFeedback({
      weekNumber: hubData.activeProgram.weekNumber,
      feedbackText: structuredFeedback,
      readyForNextWeek
    });
    setSendingFeedback(false);
    if (!result.ok) {
      setError(result.error ?? 'Impossible d’envoyer ton retour pour le moment.');
      return;
    }

    setFeedbackSessions('');
    setFeedbackDistance('');
    setFeedbackDuration('');
    setFeedbackPace('');
    setFeedbackRpe('');
    setFeedbackFatigue('');
    setFeedbackPain('');
    setFeedbackGeneralFeeling('');
    setFeedbackNotes('');
    setFeedbackSuccess('Retour envoyé. Ton coach peut préparer la semaine suivante.');
    await refreshCoachData();
  };

  return (
    <section className="page coach-page">
      <h1>Coach</h1>

      <article className="card premium-section coach-card coach-hero-card">
        <h2>Avant de commencer</h2>
        <p>
          Le module Coach t’aide à suivre un plan progressif adapté à ton niveau. Tu commences par un test, puis ton
          programme est publié chaque semaine.
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
            <Link to="/coach/test" className="coach-action-btn">
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

      {!loading && shouldShowFeedbackForm ? (
        <article className="card premium-section coach-card">
          <h2>Retour de semaine</h2>
          <p>
            Pour recevoir la semaine suivante, complète ce retour guidé sur ta semaine en cours.
          </p>
          <form className="form coach-feedback-form" onSubmit={(event) => void onSubmitFeedback(event)}>
            <div className="coach-feedback-grid">
              <label>
                Séance X
                <input
                  value={feedbackSessions}
                  onChange={(event) => setFeedbackSessions(event.target.value)}
                  placeholder="Ex: 3 séances"
                  required
                />
              </label>
              <label>
                Distances
                <input
                  value={feedbackDistance}
                  onChange={(event) => setFeedbackDistance(event.target.value)}
                  placeholder="Ex: 24 km"
                  required
                />
              </label>
              <label>
                Temps
                <input
                  value={feedbackDuration}
                  onChange={(event) => setFeedbackDuration(event.target.value)}
                  placeholder="Ex: 2h20"
                  required
                />
              </label>
              <label>
                Rythme (min/km)
                <input
                  value={feedbackPace}
                  onChange={(event) => setFeedbackPace(event.target.value)}
                  placeholder="Ex: 6:05"
                  required
                />
              </label>
              <label>
                RPE moyen
                <select value={feedbackRpe} onChange={(event) => setFeedbackRpe(event.target.value)} required>
                  <option value="">Choisir</option>
                  <option value="1">1 - Très facile</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5 - Modéré</option>
                  <option value="6">6</option>
                  <option value="7">7</option>
                  <option value="8">8</option>
                  <option value="9">9</option>
                  <option value="10">10 - Maximal</option>
                </select>
              </label>
              <label>
                Fatigue (1-5)
                <select value={feedbackFatigue} onChange={(event) => setFeedbackFatigue(event.target.value)} required>
                  <option value="">Choisir</option>
                  <option value="1">1 - Très faible</option>
                  <option value="2">2 - Faible</option>
                  <option value="3">3 - Moyenne</option>
                  <option value="4">4 - Élevée</option>
                  <option value="5">5 - Très élevée</option>
                </select>
              </label>
              <label className="coach-feedback-field-full">
                Douleurs éventuelles
                <textarea
                  value={feedbackPain}
                  onChange={(event) => setFeedbackPain(event.target.value)}
                  className="contact-message"
                  placeholder="Ex: gêne légère mollet droit après la séance 2"
                  required
                />
              </label>
              <label className="coach-feedback-field-full">
                Sensations générales
                <textarea
                  value={feedbackGeneralFeeling}
                  onChange={(event) => setFeedbackGeneralFeeling(event.target.value)}
                  className="contact-message"
                  placeholder="Ex: semaine plutôt maîtrisée, bon ressenti global"
                  required
                />
              </label>
              <label className="coach-feedback-field-full">
                Notes libres sur la semaine
                <textarea
                  value={feedbackNotes}
                  onChange={(event) => setFeedbackNotes(event.target.value)}
                  className="contact-message"
                  placeholder="Ex: contraintes pro, météo, matériel, envie..."
                />
              </label>
            </div>
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
