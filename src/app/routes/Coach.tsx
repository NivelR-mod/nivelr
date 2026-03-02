import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getCurrentSessionUser } from '../../backend/localAuth';
import {
  CoachHubData,
  getCoachHubData,
  openCoachProgramPdf,
  submitCoachFeedback
} from '../../backend/coach';

interface CoachSessionFeedbackRow {
  id: string;
  sessionLabel: string;
  distance: string;
  duration: string;
  pace: string;
  rpe: string;
  fatigue: string;
  pain: string;
}

function createSessionFeedbackRow(index: number): CoachSessionFeedbackRow {
  return {
    id: `session-${Date.now()}-${index}`,
    sessionLabel: `Séance ${index + 1}`,
    distance: '',
    duration: '',
    pace: '',
    rpe: '',
    fatigue: '',
    pain: ''
  };
}

export default function Coach(): JSX.Element {
  const session = getCurrentSessionUser();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [openingProgram, setOpeningProgram] = useState(false);
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [error, setError] = useState('');
  const [hubData, setHubData] = useState<CoachHubData | null>(null);
  const [sessionFeedbackRows, setSessionFeedbackRows] = useState<CoachSessionFeedbackRow[]>([
    createSessionFeedbackRow(0)
  ]);
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

    const generalFeeling = feedbackGeneralFeeling.trim();
    const notes = feedbackNotes.trim();

    if (!sessionFeedbackRows.length) {
      setError('Ajoute au moins un retour de séance avant envoi.');
      return;
    }

    const incompleteRow = sessionFeedbackRows.find(
      (row) =>
        !row.sessionLabel.trim() ||
        !row.distance.trim() ||
        !row.duration.trim() ||
        !row.pace.trim() ||
        !row.rpe.trim() ||
        !row.fatigue.trim() ||
        !row.pain.trim()
    );
    if (incompleteRow) {
      setError('Merci de compléter tous les champs de chaque retour de séance.');
      return;
    }

    if (!generalFeeling) {
      setError('Renseigne tes sensations générales de la semaine.');
      return;
    }

    const structuredFeedback = [
      '=== RETOUR DE SEMAINE ===',
      ...sessionFeedbackRows.flatMap((row, index) => [
        '',
        `--- Séance ${index + 1} ---`,
        `Séance X: ${row.sessionLabel.trim()}`,
        `Distances: ${row.distance.trim()}`,
        `Temps: ${row.duration.trim()}`,
        `Rythme (min/km): ${row.pace.trim()}`,
        `RPE moyen: ${row.rpe.trim()}`,
        `Fatigue (1-5): ${row.fatigue.trim()}`,
        `Douleurs éventuelles: ${row.pain.trim()}`
      ]),
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

    setSessionFeedbackRows([createSessionFeedbackRow(0)]);
    setFeedbackGeneralFeeling('');
    setFeedbackNotes('');
    setFeedbackSuccess('Retour envoyé. Ton coach peut préparer la semaine suivante.');
    await refreshCoachData();
  };

  const addSessionFeedbackRow = (): void => {
    setSessionFeedbackRows((prev) => [...prev, createSessionFeedbackRow(prev.length)]);
  };

  const removeSessionFeedbackRow = (id: string): void => {
    setSessionFeedbackRows((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((row) => row.id !== id);
    });
  };

  const updateSessionFeedbackRow = (
    id: string,
    key: keyof Omit<CoachSessionFeedbackRow, 'id'>,
    value: string
  ): void => {
    setSessionFeedbackRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [key]: value } : row))
    );
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
            <div className="coach-feedback-session-list">
              {sessionFeedbackRows.map((row, index) => (
                <article key={row.id} className="coach-feedback-session-card">
                  <div className="coach-feedback-session-head">
                    <h3>Retour séance {index + 1}</h3>
                    {sessionFeedbackRows.length > 1 ? (
                      <button
                        type="button"
                        className="coach-remove-session-btn"
                        onClick={() => removeSessionFeedbackRow(row.id)}
                      >
                        Supprimer
                      </button>
                    ) : null}
                  </div>
                  <div className="coach-feedback-grid">
                    <label>
                      Séance X
                      <input
                        value={row.sessionLabel}
                        onChange={(event) =>
                          updateSessionFeedbackRow(row.id, 'sessionLabel', event.target.value)
                        }
                        placeholder="Ex: Fractionné 8x400"
                        required
                      />
                    </label>
                    <label>
                      Distances
                      <input
                        value={row.distance}
                        onChange={(event) => updateSessionFeedbackRow(row.id, 'distance', event.target.value)}
                        placeholder="Ex: 7.2 km"
                        required
                      />
                    </label>
                    <label>
                      Temps
                      <input
                        value={row.duration}
                        onChange={(event) => updateSessionFeedbackRow(row.id, 'duration', event.target.value)}
                        placeholder="Ex: 45 min"
                        required
                      />
                    </label>
                    <label>
                      Rythme (min/km)
                      <input
                        value={row.pace}
                        onChange={(event) => updateSessionFeedbackRow(row.id, 'pace', event.target.value)}
                        placeholder="Ex: 5:58"
                        required
                      />
                    </label>
                    <label>
                      RPE moyen
                      <select
                        value={row.rpe}
                        onChange={(event) => updateSessionFeedbackRow(row.id, 'rpe', event.target.value)}
                        required
                      >
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
                      <select
                        value={row.fatigue}
                        onChange={(event) => updateSessionFeedbackRow(row.id, 'fatigue', event.target.value)}
                        required
                      >
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
                        value={row.pain}
                        onChange={(event) => updateSessionFeedbackRow(row.id, 'pain', event.target.value)}
                        className="contact-message"
                        placeholder="Ex: gêne légère mollet droit"
                        required
                      />
                    </label>
                  </div>
                </article>
              ))}
            </div>
            <button type="button" className="coach-add-session-btn" onClick={addSessionFeedbackRow}>
              + Ajouter un retour de séance
            </button>

            <div className="coach-feedback-grid">
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
