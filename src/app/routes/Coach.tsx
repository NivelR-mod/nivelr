import { FormEvent, useEffect, useState } from 'react';
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
  sessionNotes: string;
}

interface CoachWeekSummary {
  generalFeeling: string;
  notes: string;
}

function createSessionFeedbackDraft(index: number): CoachSessionFeedbackRow {
  return {
    id: `session-${Date.now()}-${index}`,
    sessionLabel: `Séance ${index + 1}`,
    distance: '',
    duration: '',
    pace: '',
    rpe: '',
    fatigue: '',
    sessionNotes: ''
  };
}

function parseFeedbackText(feedbackText: string): {
  sessions: CoachSessionFeedbackRow[];
  weekSummary: CoachWeekSummary | null;
} {
  const lines = feedbackText.split('\n').map((line) => line.trim());
  const sessions: CoachSessionFeedbackRow[] = [];
  let currentSession: CoachSessionFeedbackRow | null = null;

  const flushCurrentSession = (): void => {
    if (!currentSession) return;
    sessions.push(currentSession);
    currentSession = null;
  };

  lines.forEach((line) => {
    if (!line) return;
    if (line.startsWith('--- Séance')) {
      flushCurrentSession();
      currentSession = {
        id: `session-${Date.now()}-${sessions.length + 1}`,
        sessionLabel: '',
        distance: '',
        duration: '',
        pace: '',
        rpe: '',
        fatigue: '',
        sessionNotes: ''
      };
      return;
    }

    if (!currentSession) return;
    if (line.startsWith('Séance:')) currentSession.sessionLabel = line.replace('Séance:', '').trim();
    if (line.startsWith('Distances:')) currentSession.distance = line.replace('Distances:', '').trim();
    if (line.startsWith('Temps:')) currentSession.duration = line.replace('Temps:', '').trim();
    if (line.startsWith('Rythme (min/km):')) currentSession.pace = line.replace('Rythme (min/km):', '').trim();
    if (line.startsWith('RPE moyen:')) currentSession.rpe = line.replace('RPE moyen:', '').trim();
    if (line.startsWith('Fatigue (1-5):')) currentSession.fatigue = line.replace('Fatigue (1-5):', '').trim();
    if (line.startsWith('Note libre séance:')) {
      const notes = line.replace('Note libre séance:', '').trim();
      currentSession.sessionNotes = notes === 'Aucune note' ? '' : notes;
    }
  });

  flushCurrentSession();

  const generalLine = lines.find((line) => line.startsWith('Sensations générales:'));
  const notesLine = lines.find((line) => line.startsWith('Notes libres sur la semaine:'));
  const weekSummary = generalLine
    ? {
        generalFeeling: generalLine.replace('Sensations générales:', '').trim(),
        notes: (notesLine?.replace('Notes libres sur la semaine:', '').trim() ?? '').replace(/^Aucune note libre$/, '')
      }
    : null;

  return { sessions, weekSummary };
}

function getNextSundayEnd(submittedAt: string): Date | null {
  const submitted = new Date(submittedAt);
  if (Number.isNaN(submitted.getTime())) return null;
  const deadline = new Date(submitted);
  const day = deadline.getDay();
  const daysUntilNextSunday = day === 0 ? 7 : 7 - day;
  deadline.setDate(deadline.getDate() + daysUntilNextSunday);
  deadline.setHours(23, 59, 59, 999);
  return deadline;
}

export default function Coach(): JSX.Element {
  const session = getCurrentSessionUser();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [openingProgram, setOpeningProgram] = useState(false);
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [error, setError] = useState('');
  const [hubData, setHubData] = useState<CoachHubData | null>(null);
  const [savedSessionFeedbackRows, setSavedSessionFeedbackRows] = useState<CoachSessionFeedbackRow[]>([]);
  const [sessionDraft, setSessionDraft] = useState<CoachSessionFeedbackRow | null>(null);
  const [weekSummary, setWeekSummary] = useState<CoachWeekSummary | null>(null);
  const [weekSummaryDraft, setWeekSummaryDraft] = useState<CoachWeekSummary | null>(null);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [pendingFeedbackPayload, setPendingFeedbackPayload] = useState<{
    weekNumber: number;
    feedbackText: string;
  } | null>(null);
  const [isEditingSubmittedFeedback, setIsEditingSubmittedFeedback] = useState(false);
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

  const latestPublishedWeek = hubData?.publishedPrograms.length
    ? hubData.publishedPrograms[hubData.publishedPrograms.length - 1].weekNumber
    : 0;
  const weekButtonCount = latestPublishedWeek > 0 ? latestPublishedWeek + 1 : 1;
  const weekButtons = Array.from({ length: weekButtonCount }, (_, index) => index + 1);
  const programsByWeek = new Map((hubData?.publishedPrograms ?? []).map((program) => [program.weekNumber, program]));
  const feedbackEditDeadline = hubData?.activeFeedback?.submittedAt
    ? getNextSundayEnd(hubData.activeFeedback.submittedAt)
    : null;
  const canEditSubmittedFeedback = Boolean(
    hubData?.feedbackAlreadySent && feedbackEditDeadline && new Date().getTime() <= feedbackEditDeadline.getTime()
  );
  const shouldShowFeedbackForm = Boolean(
    hubData?.intakeCompleted &&
      hubData.activeProgram &&
      (!hubData.feedbackAlreadySent || (hubData.feedbackAlreadySent && isEditingSubmittedFeedback))
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

  const onSubmitFeedback = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!hubData?.activeProgram) return;

    if (sessionDraft) {
      setError('Valide ou annule ton brouillon de séance avant l’envoi final.');
      return;
    }
    if (weekSummaryDraft) {
      setError('Valide ton retour de semaine avant l’envoi final.');
      return;
    }

    if (!savedSessionFeedbackRows.length) {
      setError('Ajoute au moins un retour de séance avant envoi.');
      return;
    }

    if (!weekSummary?.generalFeeling.trim()) {
      setError('Ajoute et valide ton retour de semaine avant l’envoi.');
      return;
    }
    const generalFeeling = weekSummary.generalFeeling.trim();
    const notes = weekSummary.notes.trim();

    const structuredFeedback = [
      '=== RETOUR DE SEMAINE ===',
      ...savedSessionFeedbackRows.flatMap((row, index) => [
        '',
        `--- Séance ${index + 1} ---`,
        `Séance: ${row.sessionLabel.trim()}`,
        `Distances: ${row.distance.trim()}`,
        `Temps: ${row.duration.trim()}`,
        `Rythme (min/km): ${row.pace.trim()}`,
        `RPE moyen: ${row.rpe.trim()}`,
        `Fatigue (1-5): ${row.fatigue.trim()}`,
        `Note libre séance: ${row.sessionNotes.trim() || 'Aucune note'}`
      ]),
      '',
      '=== RETOUR GÉNÉRAL ===',
      `Sensations générales: ${generalFeeling}`,
      `Notes libres sur la semaine: ${notes || 'Aucune note libre'}`
    ].join('\n');

    setPendingFeedbackPayload({
      weekNumber: hubData.activeProgram.weekNumber,
      feedbackText: structuredFeedback
    });
    setConfirmSubmitOpen(true);
  };

  const onConfirmSubmitFeedback = async (): Promise<void> => {
    if (!pendingFeedbackPayload) return;
    setError('');
    setFeedbackSuccess('');
    setSendingFeedback(true);
    const result = await submitCoachFeedback({
      weekNumber: pendingFeedbackPayload.weekNumber,
      feedbackText: pendingFeedbackPayload.feedbackText,
      readyForNextWeek: true
    });
    setSendingFeedback(false);
    if (!result.ok) {
      setError(result.error ?? 'Impossible d’envoyer ton retour pour le moment.');
      return;
    }

    setConfirmSubmitOpen(false);
    setPendingFeedbackPayload(null);
    setSavedSessionFeedbackRows([]);
    setSessionDraft(null);
    setWeekSummary(null);
    setWeekSummaryDraft(null);
    setIsEditingSubmittedFeedback(false);
    setFeedbackSuccess(
      result.warning ?? 'Retour envoyé. Ton coach peut préparer la semaine suivante.'
    );
    await refreshCoachData();
  };

  const onStartEditSubmittedFeedback = (): void => {
    if (!hubData?.activeFeedback) return;
    const parsed = parseFeedbackText(hubData.activeFeedback.feedbackText);
    setSavedSessionFeedbackRows(parsed.sessions);
    setWeekSummary(parsed.weekSummary);
    setWeekSummaryDraft(null);
    setSessionDraft(null);
    setFeedbackSuccess('');
    setError('');
    setIsEditingSubmittedFeedback(true);
  };

  const onStartSessionDraft = (): void => {
    setFeedbackSuccess('');
    setError('');
    setSessionDraft(createSessionFeedbackDraft(savedSessionFeedbackRows.length));
  };

  const onValidateSessionDraft = (): void => {
    if (!sessionDraft) return;
    const isComplete =
      sessionDraft.sessionLabel.trim() &&
      sessionDraft.distance.trim() &&
      sessionDraft.duration.trim() &&
      sessionDraft.pace.trim() &&
      sessionDraft.rpe.trim() &&
      sessionDraft.fatigue.trim();
    if (!isComplete) {
      setError('Complète les champs essentiels de la séance avant validation.');
      return;
    }
    setSavedSessionFeedbackRows((prev) => [...prev, sessionDraft]);
    setSessionDraft(null);
    setError('');
  };

  const onRemoveSavedSession = (id: string): void => {
    setSavedSessionFeedbackRows((prev) => prev.filter((row) => row.id !== id));
  };

  const updateSessionDraft = (
    key: keyof Omit<CoachSessionFeedbackRow, 'id'>,
    value: string
  ): void => {
    setSessionDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const onStartWeekSummaryDraft = (): void => {
    setFeedbackSuccess('');
    setError('');
    setWeekSummaryDraft(
      weekSummary ?? {
        generalFeeling: '',
        notes: ''
      }
    );
  };

  const onValidateWeekSummaryDraft = (): void => {
    if (!weekSummaryDraft?.generalFeeling.trim()) {
      setError('Renseigne au minimum les sensations générales.');
      return;
    }
    setWeekSummary({
      generalFeeling: weekSummaryDraft.generalFeeling.trim(),
      notes: weekSummaryDraft.notes.trim()
    });
    setWeekSummaryDraft(null);
    setError('');
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
            <div className="coach-cta-row coach-week-row">
              <div>
                <p className="coach-program-label">Mes semaines</p>
                <p className="coach-program-hint">
                  Ouvre une semaine disponible. La prochaine semaine apparaît verrouillée tant qu’elle n’est pas publiée.
                </p>
              </div>
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

      {!loading && shouldShowFeedbackForm ? (
        <article className="card premium-section coach-card">
          <h2>Retour de semaine</h2>
          <p>
            Pour recevoir la semaine suivante, complète ce retour guidé sur ta semaine en cours.
          </p>
          <form className="form coach-feedback-form" onSubmit={(event) => void onSubmitFeedback(event)}>
            <article className="coach-feedback-section">
              <div className="coach-feedback-section-head">
                <h3>Retours de séance</h3>
                {!sessionDraft ? (
                  <button type="button" className="coach-add-session-btn" onClick={onStartSessionDraft}>
                    + Ajouter une séance
                  </button>
                ) : null}
              </div>

              {savedSessionFeedbackRows.length ? (
                <div className="coach-feedback-session-list">
                  {savedSessionFeedbackRows.map((row, index) => (
                    <article key={row.id} className="coach-feedback-session-card">
                      <div className="coach-feedback-session-head">
                        <h3>Séance validée {index + 1}</h3>
                        <button
                          type="button"
                          className="coach-remove-session-btn"
                          onClick={() => onRemoveSavedSession(row.id)}
                        >
                          Supprimer
                        </button>
                      </div>
                      <p className="coach-feedback-summary-line">
                        <strong>{row.sessionLabel}</strong> · {row.distance} · {row.duration} · {row.pace} · RPE{' '}
                        {row.rpe} · Fatigue {row.fatigue}/5
                      </p>
                      {row.sessionNotes ? (
                        <p className="coach-feedback-summary-line">Note: {row.sessionNotes}</p>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="coach-feedback-empty">Aucune séance validée pour le moment.</p>
              )}

              {sessionDraft ? (
                <article className="coach-feedback-session-card is-draft">
                  <div className="coach-feedback-session-head">
                    <h3>Brouillon de séance</h3>
                    <button
                      type="button"
                      className="coach-remove-session-btn"
                      onClick={() => setSessionDraft(null)}
                    >
                      Annuler
                    </button>
                  </div>
                  <div className="coach-feedback-grid">
                    <label>
                      Séance
                      <input
                        value={sessionDraft.sessionLabel}
                        onChange={(event) => updateSessionDraft('sessionLabel', event.target.value)}
                        placeholder="Ex: Fractionné 8x400"
                      />
                    </label>
                    <label>
                      Distances
                      <input
                        value={sessionDraft.distance}
                        onChange={(event) => updateSessionDraft('distance', event.target.value)}
                        placeholder="Ex: 7.2 km"
                      />
                    </label>
                    <label>
                      Temps
                      <input
                        value={sessionDraft.duration}
                        onChange={(event) => updateSessionDraft('duration', event.target.value)}
                        placeholder="Ex: 45 min"
                      />
                    </label>
                    <label>
                      Rythme (min/km)
                      <input
                        value={sessionDraft.pace}
                        onChange={(event) => updateSessionDraft('pace', event.target.value)}
                        placeholder="Ex: 5:58"
                      />
                    </label>
                    <label>
                      RPE moyen
                      <select
                        value={sessionDraft.rpe}
                        onChange={(event) => updateSessionDraft('rpe', event.target.value)}
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
                        value={sessionDraft.fatigue}
                        onChange={(event) => updateSessionDraft('fatigue', event.target.value)}
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
                      Note libre séance
                      <textarea
                        value={sessionDraft.sessionNotes}
                        onChange={(event) => updateSessionDraft('sessionNotes', event.target.value)}
                        className="contact-message"
                        placeholder="Ex: bonnes sensations sur la fin, difficile sur la relance..."
                      />
                    </label>
                  </div>
                  <div className="coach-feedback-actions">
                    <button type="button" className="coach-add-session-btn" onClick={onValidateSessionDraft}>
                      Valider cette séance
                    </button>
                  </div>
                </article>
              ) : null}
            </article>

            <article className="coach-feedback-section">
              <div className="coach-feedback-section-head">
                <h3>Retour de semaine</h3>
                {!weekSummaryDraft ? (
                  <button type="button" className="coach-add-session-btn" onClick={onStartWeekSummaryDraft}>
                    {weekSummary ? 'Modifier le retour de semaine' : 'Ajouter un retour de semaine'}
                  </button>
                ) : null}
              </div>

              {weekSummary ? (
                <article className="coach-feedback-session-card">
                  <p className="coach-feedback-summary-line">
                    <strong>Sensations générales:</strong> {weekSummary.generalFeeling}
                  </p>
                  <p className="coach-feedback-summary-line">
                    <strong>Notes libres:</strong> {weekSummary.notes || 'Aucune note libre'}
                  </p>
                </article>
              ) : (
                <p className="coach-feedback-empty">Aucun retour de semaine validé pour le moment.</p>
              )}

              {weekSummaryDraft ? (
                <article className="coach-feedback-session-card is-draft">
                  <div className="coach-feedback-grid">
                    <label className="coach-feedback-field-full">
                      Sensations générales
                      <textarea
                        value={weekSummaryDraft.generalFeeling}
                        onChange={(event) =>
                          setWeekSummaryDraft((prev) =>
                            prev ? { ...prev, generalFeeling: event.target.value } : prev
                          )
                        }
                        className="contact-message"
                        placeholder="Ex: semaine plutôt maîtrisée, bon ressenti global"
                      />
                    </label>
                    <label className="coach-feedback-field-full">
                      Notes libres sur la semaine
                      <textarea
                        value={weekSummaryDraft.notes}
                        onChange={(event) =>
                          setWeekSummaryDraft((prev) => (prev ? { ...prev, notes: event.target.value } : prev))
                        }
                        className="contact-message"
                        placeholder="Ex: contraintes pro, météo, matériel, envie..."
                      />
                    </label>
                  </div>
                  <div className="coach-feedback-actions">
                    <button type="button" className="coach-add-session-btn" onClick={onValidateWeekSummaryDraft}>
                      Valider le retour de semaine
                    </button>
                    <button type="button" className="coach-remove-session-btn" onClick={() => setWeekSummaryDraft(null)}>
                      Annuler
                    </button>
                  </div>
                </article>
              ) : null}
            </article>
            {feedbackSuccess ? <p className="inline-info">{feedbackSuccess}</p> : null}
            <button type="submit" disabled={sendingFeedback || !!sessionDraft || !!weekSummaryDraft}>
              {sendingFeedback ? 'Envoi du retour...' : isEditingSubmittedFeedback ? 'Mettre à jour mon retour' : 'Envoyer mon retour'}
            </button>
          </form>
        </article>
      ) : null}

      {confirmSubmitOpen ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (sendingFeedback) return;
            setConfirmSubmitOpen(false);
            setPendingFeedbackPayload(null);
          }}
        >
          <article className="card session-modal style-confirm-modal coach-confirm-modal" onClick={(event) => event.stopPropagation()}>
            <h2>Confirmer l’envoi au coach ?</h2>
            <p>
              Ton retour de semaine va être transmis au coach. Tu pourras encore le modifier jusqu’au dimanche suivant
              23:59, mais cette étape évite les envois involontaires.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                onClick={() => {
                  setConfirmSubmitOpen(false);
                  setPendingFeedbackPayload(null);
                }}
                disabled={sendingFeedback}
              >
                Annuler
              </button>
              <button type="button" onClick={() => void onConfirmSubmitFeedback()} disabled={sendingFeedback}>
                {sendingFeedback ? 'Envoi...' : 'Confirmer l’envoi'}
              </button>
            </div>
          </article>
        </div>
      ) : null}

      {!loading && hubData?.feedbackAlreadySent && hubData.activeProgram ? (
        <article className="card premium-section coach-card">
          <h2>Feedback envoyé</h2>
          <p>
            Merci pour ton retour sur la semaine {hubData.activeProgram.weekNumber}. Ton coach peut maintenant publier
            la suite.
          </p>
          {canEditSubmittedFeedback && !isEditingSubmittedFeedback ? (
            <>
              <p className="coach-feedback-edit-note">
                Tu peux encore modifier ce retour jusqu’au{' '}
                {feedbackEditDeadline?.toLocaleDateString('fr-FR', {
                  weekday: 'long',
                  day: '2-digit',
                  month: 'long'
                })}{' '}
                à 23:59.
              </p>
              <button type="button" className="coach-action-btn" onClick={onStartEditSubmittedFeedback}>
                Modifier mon retour
              </button>
            </>
          ) : null}
          {!canEditSubmittedFeedback ? (
            <p className="coach-feedback-edit-note">
              La fenêtre de modification est fermée pour cette semaine.
            </p>
          ) : null}
        </article>
      ) : null}
    </section>
  );
}
