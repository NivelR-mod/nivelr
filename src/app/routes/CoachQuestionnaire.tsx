import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { saveCoachIntake } from '../../backend/coach';
import { sendContactEmail } from '../../backend/contactEmail';
import { getCurrentSessionUser } from '../../backend/localAuth';

type KnownMetric = 'OUI' | 'NON';

type CoachIntakeAnswers = {
  age: string;
  sexe: 'HOMME' | 'FEMME' | 'NSP' | '';
  tailleCm: string;
  poidsKg: string;
  profession: 'SEDENTAIRE' | 'ACTIF' | 'TRES_PHYSIQUE' | '';
  sommeilHeures: string;
  stressPercu: '1' | '2' | '3' | '4' | '5' | '';
  experienceCourse: string;
  seancesParSemaine: string;
  volumeHebdo: string;
  allureFacile: string;
  recordRecent: string;
  fcMaxConnue: KnownMetric;
  fcMaxValeur: string;
  vmaConnue: KnownMetric;
  vmaValeur: string;
  blessuresPassees: string;
  douleursActuelles: string;
  surfacePrincipale: 'ROUTE' | 'PISTE' | 'CHEMIN' | 'MIXTE' | 'TAPIS' | '';
  accesPiste: 'OUI' | 'NON' | '';
  autresSports: string;
  distanceCible: string;
  dateObjectif: string;
  chronoVise: string;
  importanceObjectif: '1' | '2' | '3' | '4' | '5' | '';
  maxSeancesPossible: string;
};

const DEFAULT_ANSWERS: CoachIntakeAnswers = {
  age: '',
  sexe: '',
  tailleCm: '',
  poidsKg: '',
  profession: '',
  sommeilHeures: '',
  stressPercu: '',
  experienceCourse: '',
  seancesParSemaine: '',
  volumeHebdo: '',
  allureFacile: '',
  recordRecent: '',
  fcMaxConnue: 'NON',
  fcMaxValeur: '',
  vmaConnue: 'NON',
  vmaValeur: '',
  blessuresPassees: '',
  douleursActuelles: '',
  surfacePrincipale: '',
  accesPiste: '',
  autresSports: '',
  distanceCible: '',
  dateObjectif: '',
  chronoVise: '',
  importanceObjectif: '',
  maxSeancesPossible: ''
};

function buildCoachMailMessage(answers: CoachIntakeAnswers, meta: { displayName: string; email: string }): string {
  return [
    'Nouveau questionnaire Coach reçu.',
    '',
    `Utilisateur: ${meta.displayName}`,
    `Email compte: ${meta.email}`,
    '',
    '=== PROFIL ===',
    `Âge: ${answers.age} ans`,
    `Sexe: ${answers.sexe}`,
    `Taille: ${answers.tailleCm} cm`,
    `Poids: ${answers.poidsKg} kg`,
    `Profession: ${answers.profession}`,
    `Sommeil moyen: ${answers.sommeilHeures}`,
    `Stress perçu (1-5): ${answers.stressPercu}`,
    '',
    '=== NIVEAU ACTUEL ===',
    `Depuis combien de temps cours-tu: ${answers.experienceCourse}`,
    `Nombre de séances/semaine: ${answers.seancesParSemaine}`,
    `Volume hebdomadaire approximatif: ${answers.volumeHebdo}`,
    `Allure facile approximative: ${answers.allureFacile}`,
    `Record récent (5/10/autre): ${answers.recordRecent || 'Non renseigné'}`,
    `FC max connue: ${answers.fcMaxConnue}${answers.fcMaxValeur ? ` (${answers.fcMaxValeur})` : ''}`,
    `VMA connue: ${answers.vmaConnue}${answers.vmaValeur ? ` (${answers.vmaValeur})` : ''}`,
    '',
    '=== BLESSURES & LIMITES ===',
    `Blessures passées: ${answers.blessuresPassees}`,
    `Douleurs actuelles: ${answers.douleursActuelles}`,
    `Surface principale: ${answers.surfacePrincipale}`,
    `Accès piste: ${answers.accesPiste}`,
    `Autres sports pratiqués: ${answers.autresSports || 'Aucun'}`,
    '',
    '=== OBJECTIF ===',
    `Distance cible: ${answers.distanceCible}`,
    `Date: ${answers.dateObjectif}`,
    `Chrono visé: ${answers.chronoVise || 'Non renseigné'}`,
    `Importance (1-5): ${answers.importanceObjectif}`,
    `Nombre max de séances/semaine possible: ${answers.maxSeancesPossible}`
  ].join('\n');
}

export default function CoachQuestionnaire(): JSX.Element {
  const navigate = useNavigate();
  const session = getCurrentSessionUser();
  const [answers, setAnswers] = useState<CoachIntakeAnswers>(DEFAULT_ANSWERS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!session) {
      setError('Connecte-toi pour envoyer ton questionnaire.');
      return;
    }
    setError('');
    setSaving(true);

    const payload = {
      ...answers,
      schemaVersion: 2,
      completedAt: new Date().toISOString()
    };

    const saveResult = await saveCoachIntake(payload);
    if (!saveResult.ok) {
      setSaving(false);
      setError(saveResult.error ?? 'Impossible d’enregistrer le questionnaire pour le moment.');
      return;
    }

    const mailResult = await sendContactEmail({
      replyEmail: session.email,
      subject: `Coach · Questionnaire · ${session.handle}`,
      message: buildCoachMailMessage(answers, {
        displayName: session.displayName,
        email: session.email
      }),
      senderName: session.displayName
    });

    setSaving(false);
    if (!mailResult.ok) {
      setError(mailResult.error ?? "Questionnaire enregistré, mais l'envoi email a échoué.");
      return;
    }
    navigate('/coach?intake=done', { replace: true });
  };

  return (
    <section className="page coach-page">
      <h1>Questionnaire Coach</h1>
      <p className="page-subtitle">Réponds à chaque section, tu es guidé pas à pas.</p>

      <form className="card premium-section form coach-card coach-intake-form" onSubmit={(event) => void onSubmit(event)}>
        <h2>Profil</h2>
        <div className="coach-intake-grid">
          <label>
            Âge
            <input
              type="number"
              min={10}
              max={99}
              value={answers.age}
              onChange={(event) => setAnswers((prev) => ({ ...prev, age: event.target.value }))}
              placeholder="Ex: 32"
              required
            />
            <small className="coach-field-helper">En années.</small>
          </label>

          <fieldset className="coach-inline-choice">
            <legend>Sexe</legend>
            <label><input type="radio" name="sexe" checked={answers.sexe === 'HOMME'} onChange={() => setAnswers((prev) => ({ ...prev, sexe: 'HOMME' }))} /> Homme</label>
            <label><input type="radio" name="sexe" checked={answers.sexe === 'FEMME'} onChange={() => setAnswers((prev) => ({ ...prev, sexe: 'FEMME' }))} /> Femme</label>
            <label><input type="radio" name="sexe" checked={answers.sexe === 'NSP'} onChange={() => setAnswers((prev) => ({ ...prev, sexe: 'NSP' }))} /> Ne se prononce pas</label>
          </fieldset>

          <label>
            Taille
            <input
              type="number"
              min={120}
              max={230}
              value={answers.tailleCm}
              onChange={(event) => setAnswers((prev) => ({ ...prev, tailleCm: event.target.value }))}
              placeholder="Ex: 178"
              required
            />
            <small className="coach-field-helper">En centimètres (cm).</small>
          </label>

          <label>
            Poids
            <input
              type="number"
              min={35}
              max={180}
              value={answers.poidsKg}
              onChange={(event) => setAnswers((prev) => ({ ...prev, poidsKg: event.target.value }))}
              placeholder="Ex: 72"
              required
            />
            <small className="coach-field-helper">En kilogrammes (kg).</small>
          </label>

          <label>
            Profession
            <select value={answers.profession} onChange={(event) => setAnswers((prev) => ({ ...prev, profession: event.target.value as CoachIntakeAnswers['profession'] }))} required>
              <option value="">Choisir</option>
              <option value="SEDENTAIRE">Sédentaire</option>
              <option value="ACTIF">Actif</option>
              <option value="TRES_PHYSIQUE">Très physique</option>
            </select>
          </label>

          <label>
            Sommeil moyen
            <select value={answers.sommeilHeures} onChange={(event) => setAnswers((prev) => ({ ...prev, sommeilHeures: event.target.value }))} required>
              <option value="">Choisir</option>
              <option value="< 5h">&lt; 5h</option>
              <option value="5h - 6h">5h - 6h</option>
              <option value="6h - 7h">6h - 7h</option>
              <option value="7h - 8h">7h - 8h</option>
              <option value="8h+">8h+</option>
            </select>
            <small className="coach-field-helper">Heures par nuit en moyenne.</small>
          </label>

          <label>
            Stress perçu
            <select value={answers.stressPercu} onChange={(event) => setAnswers((prev) => ({ ...prev, stressPercu: event.target.value as CoachIntakeAnswers['stressPercu'] }))} required>
              <option value="">Choisir</option>
              <option value="1">1 - Très faible</option>
              <option value="2">2 - Faible</option>
              <option value="3">3 - Modéré</option>
              <option value="4">4 - Élevé</option>
              <option value="5">5 - Très élevé</option>
            </select>
          </label>
        </div>

        <h2>Niveau actuel</h2>
        <div className="coach-intake-grid">
          <label>
            Depuis combien de temps cours-tu ?
            <select value={answers.experienceCourse} onChange={(event) => setAnswers((prev) => ({ ...prev, experienceCourse: event.target.value }))} required>
              <option value="">Choisir</option>
              <option value="Je débute / reprise">Je débute / reprise</option>
              <option value="1 - 3 mois">1 - 3 mois</option>
              <option value="3 - 12 mois">3 - 12 mois</option>
              <option value="1 - 3 ans">1 - 3 ans</option>
              <option value="3+ ans">3+ ans</option>
            </select>
          </label>

          <label>
            Séances par semaine actuellement
            <select value={answers.seancesParSemaine} onChange={(event) => setAnswers((prev) => ({ ...prev, seancesParSemaine: event.target.value }))} required>
              <option value="">Choisir</option>
              <option value="0 - 1">0 - 1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4+">4+</option>
            </select>
          </label>

          <label>
            Volume hebdomadaire approximatif
            <select value={answers.volumeHebdo} onChange={(event) => setAnswers((prev) => ({ ...prev, volumeHebdo: event.target.value }))} required>
              <option value="">Choisir</option>
              <option value="Je ne sais pas">Je ne sais pas</option>
              <option value="< 10 km">&lt; 10 km</option>
              <option value="10 - 20 km">10 - 20 km</option>
              <option value="20 - 35 km">20 - 35 km</option>
              <option value="35 - 50 km">35 - 50 km</option>
              <option value="50+ km">50+ km</option>
            </select>
          </label>

          <label>
            Allure facile approximative
            <input
              value={answers.allureFacile}
              onChange={(event) => setAnswers((prev) => ({ ...prev, allureFacile: event.target.value }))}
              placeholder="Ex: 6'20/km"
              required
            />
          </label>

          <label>
            Record récent (5 km / 10 km / autre)
            <input
              value={answers.recordRecent}
              onChange={(event) => setAnswers((prev) => ({ ...prev, recordRecent: event.target.value }))}
              placeholder="Ex: 10 km en 52:30"
            />
          </label>

          <fieldset className="coach-inline-choice">
            <legend>FC max connue ?</legend>
            <label><input type="radio" name="fcmax" checked={answers.fcMaxConnue === 'OUI'} onChange={() => setAnswers((prev) => ({ ...prev, fcMaxConnue: 'OUI' }))} /> Oui</label>
            <label><input type="radio" name="fcmax" checked={answers.fcMaxConnue === 'NON'} onChange={() => setAnswers((prev) => ({ ...prev, fcMaxConnue: 'NON', fcMaxValeur: '' }))} /> Non</label>
            {answers.fcMaxConnue === 'OUI' ? (
              <input
                type="number"
                min={120}
                max={230}
                value={answers.fcMaxValeur}
                onChange={(event) => setAnswers((prev) => ({ ...prev, fcMaxValeur: event.target.value }))}
                placeholder="Valeur FC max"
                required
              />
            ) : null}
          </fieldset>

          <fieldset className="coach-inline-choice">
            <legend>VMA connue ?</legend>
            <label><input type="radio" name="vma" checked={answers.vmaConnue === 'OUI'} onChange={() => setAnswers((prev) => ({ ...prev, vmaConnue: 'OUI' }))} /> Oui</label>
            <label><input type="radio" name="vma" checked={answers.vmaConnue === 'NON'} onChange={() => setAnswers((prev) => ({ ...prev, vmaConnue: 'NON', vmaValeur: '' }))} /> Non</label>
            {answers.vmaConnue === 'OUI' ? (
              <input
                value={answers.vmaValeur}
                onChange={(event) => setAnswers((prev) => ({ ...prev, vmaValeur: event.target.value }))}
                placeholder="Ex: 14.5 km/h"
                required
              />
            ) : null}
          </fieldset>
        </div>

        <h2>Blessures & limites</h2>
        <p className="coach-medical-warning">
          Prévention: ce coaching ne remplace pas un avis médical. En cas de doute, douleur persistante ou gêne
          inhabituelle, consulte impérativement un médecin.
        </p>
        <div className="coach-intake-grid">
          <label>
            Blessures passées
            <textarea
              value={answers.blessuresPassees}
              onChange={(event) => setAnswers((prev) => ({ ...prev, blessuresPassees: event.target.value }))}
              placeholder="Ex: tendinite TFL en 2024, arrêt 3 semaines"
              required
            />
          </label>
          <label>
            Douleurs actuelles
            <textarea
              value={answers.douleursActuelles}
              onChange={(event) => setAnswers((prev) => ({ ...prev, douleursActuelles: event.target.value }))}
              placeholder="Ex: gêne genou droit après 40 min"
              required
            />
          </label>
          <label>
            Surface principale
            <select value={answers.surfacePrincipale} onChange={(event) => setAnswers((prev) => ({ ...prev, surfacePrincipale: event.target.value as CoachIntakeAnswers['surfacePrincipale'] }))} required>
              <option value="">Choisir</option>
              <option value="ROUTE">Route</option>
              <option value="PISTE">Piste</option>
              <option value="CHEMIN">Chemin / trail</option>
              <option value="MIXTE">Mixte</option>
              <option value="TAPIS">Tapis</option>
            </select>
          </label>
          <fieldset className="coach-inline-choice">
            <legend>Accès piste ?</legend>
            <label><input type="radio" name="piste" checked={answers.accesPiste === 'OUI'} onChange={() => setAnswers((prev) => ({ ...prev, accesPiste: 'OUI' }))} /> Oui</label>
            <label><input type="radio" name="piste" checked={answers.accesPiste === 'NON'} onChange={() => setAnswers((prev) => ({ ...prev, accesPiste: 'NON' }))} /> Non</label>
          </fieldset>
          <label>
            Autres sports pratiqués
            <input
              value={answers.autresSports}
              onChange={(event) => setAnswers((prev) => ({ ...prev, autresSports: event.target.value }))}
              placeholder="Ex: vélo 2x/semaine, musculation"
            />
          </label>
        </div>

        <h2>Objectif</h2>
        <div className="coach-intake-grid">
          <label>
            Distance cible
            <select value={answers.distanceCible} onChange={(event) => setAnswers((prev) => ({ ...prev, distanceCible: event.target.value }))} required>
              <option value="">Choisir</option>
              <option value="5 km">5 km</option>
              <option value="10 km">10 km</option>
              <option value="Semi-marathon">Semi-marathon</option>
              <option value="Marathon">Marathon</option>
              <option value="Trail">Trail</option>
              <option value="Autre">Autre</option>
            </select>
          </label>
          <label>
            Date
            <input
              type="date"
              value={answers.dateObjectif}
              onChange={(event) => setAnswers((prev) => ({ ...prev, dateObjectif: event.target.value }))}
              required
            />
          </label>
          <label>
            Chrono visé (si pertinent)
            <input
              value={answers.chronoVise}
              onChange={(event) => setAnswers((prev) => ({ ...prev, chronoVise: event.target.value }))}
              placeholder="Ex: 49:00 sur 10 km"
            />
          </label>
          <label>
            Importance de l’objectif
            <select value={answers.importanceObjectif} onChange={(event) => setAnswers((prev) => ({ ...prev, importanceObjectif: event.target.value as CoachIntakeAnswers['importanceObjectif'] }))} required>
              <option value="">Choisir</option>
              <option value="1">1 - Faible</option>
              <option value="2">2</option>
              <option value="3">3 - Moyenne</option>
              <option value="4">4</option>
              <option value="5">5 - Prioritaire</option>
            </select>
          </label>
          <label>
            Nombre max de séances/semaine possible
            <select value={answers.maxSeancesPossible} onChange={(event) => setAnswers((prev) => ({ ...prev, maxSeancesPossible: event.target.value }))} required>
              <option value="">Choisir</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
              <option value="6">6</option>
              <option value="7">7</option>
            </select>
          </label>
        </div>

        {error ? <p className="error pseudo-error-note">{error}</p> : null}

        <div className="goal-actions runner-assessment-actions">
          <button type="button" onClick={() => navigate('/coach')} disabled={saving}>
            Retour à Coach
          </button>
          <button type="submit" disabled={saving || !answers.sexe || !answers.profession || !answers.surfacePrincipale || !answers.accesPiste}>
            {saving ? 'Envoi en cours...' : 'Terminer et envoyer'}
          </button>
        </div>
      </form>
    </section>
  );
}
