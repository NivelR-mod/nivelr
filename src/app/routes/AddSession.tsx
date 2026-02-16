import { CSSProperties, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { computeSessionXp, createSession } from '../../domain/sessions';
import { getWeekKeyFromDate } from '../../storage/localStore';
import { Session, SessionInput } from '../../types/models';
import addSessionRecoBg from '../../assets/add-session-reco-bg.jpg';

interface AddSessionProps {
  onAddSession: (session: Session) => void;
  existingSessions?: Session[];
}

type SessionKind =
  | 'EF'
  | 'ENDURANCE_ACTIVE'
  | 'SEUIL'
  | 'FRACTIONNE_COURT'
  | 'FRACTIONNE_LONG'
  | 'SORTIE_LONGUE'
  | 'FARTLEK'
  | 'COTES'
  | 'RENFO_COURSE'
  | 'RECUP';
type Surface = 'ROUTE' | 'TRAIL' | 'TAPIS';
type GoalRespect = 'YES' | 'PARTIAL' | 'NO';

interface FormState {
  distanceKm: string;
  durationHours: string;
  durationMinutes: string;
  durationSeconds: string;
  rpe: string;
  kind: SessionKind;
  hrAvg: string;
  elevationM: string;
  comment: string;
  surface: Surface;
  goalRespect: GoalRespect;
}

interface SessionRecommendation {
  kind: SessionKind;
  reason: string;
  checks: string[];
}

const SESSION_KIND_OPTIONS: Array<{ value: SessionKind; label: string; short: string }> = [
  { value: 'EF', label: 'Endurance fondamentale (EF)', short: 'EF' },
  { value: 'ENDURANCE_ACTIVE', label: 'Endurance active / tempo léger', short: 'Tempo' },
  { value: 'SEUIL', label: 'Seuil (tempo soutenu)', short: 'Seuil' },
  { value: 'FRACTIONNE_COURT', label: 'Fractionné court (VMA/vitesse)', short: 'Frac court' },
  { value: 'FRACTIONNE_LONG', label: 'Fractionné long', short: 'Frac long' },
  { value: 'SORTIE_LONGUE', label: 'Sortie longue', short: 'Longue' },
  { value: 'FARTLEK', label: 'Fartlek', short: 'Fartlek' },
  { value: 'COTES', label: 'Côtes / travail en montée', short: 'Côtes' },
  { value: 'RENFO_COURSE', label: 'Renforcement spécifique course', short: 'Renfo' },
  { value: 'RECUP', label: 'Récupération / footing léger', short: 'Récup' }
];

function mapKindToSessionInput(
  kind: SessionKind
): { sportType: SessionInput['sportType']; subtype: SessionInput['subtype'] } {
  if (kind === 'EF' || kind === 'RECUP') return { sportType: 'RUNNING', subtype: 'EF' };
  if (kind === 'ENDURANCE_ACTIVE' || kind === 'SEUIL' || kind === 'FRACTIONNE_LONG') {
    return { sportType: 'RUNNING', subtype: 'SEUIL' };
  }
  if (kind === 'FRACTIONNE_COURT' || kind === 'FARTLEK' || kind === 'COTES') {
    return { sportType: 'RUNNING', subtype: 'VMA' };
  }
  if (kind === 'SORTIE_LONGUE') return { sportType: 'RUNNING', subtype: 'SORTIE_LONGUE' };
  if (kind === 'RENFO_COURSE') return { sportType: 'OTHER', subtype: 'RENFO' };
  return { sportType: 'OTHER', subtype: 'MOBILITE' };
}

function kindLabel(kind: SessionKind): string {
  if (kind === 'ENDURANCE_ACTIVE') return 'Endurance active';
  if (kind === 'FRACTIONNE_COURT') return 'Fractionné court';
  if (kind === 'FRACTIONNE_LONG') return 'Fractionné long';
  if (kind === 'SORTIE_LONGUE') return 'Sortie longue';
  if (kind === 'RENFO_COURSE') return 'Renforcement';
  if (kind === 'RECUP') return 'Récupération';
  if (kind === 'SEUIL') return 'Seuil';
  if (kind === 'FARTLEK') return 'Fartlek';
  if (kind === 'COTES') return 'Côtes';
  return 'Endurance fondamentale';
}

function kindHint(kind: SessionKind): string {
  if (kind === 'EF') return 'Allure confortable, base aérobie.';
  if (kind === 'ENDURANCE_ACTIVE') return 'Soutenu mais contrôlé.';
  if (kind === 'SEUIL') return 'Tempo soutenu stable.';
  if (kind === 'FRACTIONNE_COURT') return 'Intervalles courts intenses.';
  if (kind === 'FRACTIONNE_LONG') return 'Intervalles longs orientés performance.';
  if (kind === 'SORTIE_LONGUE') return 'Volume long en endurance.';
  if (kind === 'FARTLEK') return 'Alternance libre des allures.';
  if (kind === 'COTES') return 'Travail de force en montée.';
  if (kind === 'RENFO_COURSE') return 'Prévention blessures et force spécifique.';
  return 'Footing très facile de régénération.';
}

function deriveFeltStateFromRpe(rpe: number): number {
  if (rpe <= 3) return 5;
  if (rpe <= 5) return 4;
  if (rpe <= 7) return 3;
  if (rpe <= 8) return 2;
  return 1;
}

function deriveFatigueFromRpe(rpe: number): number {
  if (rpe <= 3) return 1;
  if (rpe <= 5) return 2;
  if (rpe <= 7) return 3;
  if (rpe <= 8) return 4;
  return 5;
}

function formatPace(distanceKm: number, durationMin: number): string {
  if (distanceKm <= 0) return '--';
  const pace = durationMin / distanceKm;
  const min = Math.floor(pace);
  const sec = Math.round((pace - min) * 60)
    .toString()
    .padStart(2, '0');
  return `${min}:${sec}/km`;
}

function goalRespectLabel(value: GoalRespect): string {
  if (value === 'YES') return 'oui';
  if (value === 'PARTIAL') return 'partiellement';
  return 'non';
}

function isDistanceRequired(kind: SessionKind): boolean {
  return kind !== 'RENFO_COURSE';
}

function inferMainGoal(existingSessions: Session[]): 'PERFORMANCE' | 'LONG_DISTANCE' | 'HEALTH' {
  const recent = existingSessions
    .slice()
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 20);
  const longCount = recent.filter((session) => session.subtype === 'SORTIE_LONGUE').length;
  const avgDistance =
    recent.length > 0
      ? recent.reduce((sum, session) => sum + (session.distanceKm ?? 0), 0) / recent.length
      : 0;
  const intenseCount = recent.filter((session) => session.feelings.rpe >= 7).length;

  if (longCount >= 2 || avgDistance >= 11) return 'LONG_DISTANCE';
  if (intenseCount >= 4) return 'PERFORMANCE';
  return 'HEALTH';
}

function getWeekSessions(existingSessions: Session[]): Session[] {
  const currentWeek = getWeekKeyFromDate(new Date());
  return existingSessions.filter(
    (session) => getWeekKeyFromDate(new Date(session.createdAt)) === currentWeek
  );
}

function getRecommendedKind(existingSessions: Session[]): SessionRecommendation {
  const mainGoal = inferMainGoal(existingSessions);
  const weekSessions = getWeekSessions(existingSessions);
  const intenseCount = weekSessions.filter((session) => session.feelings.rpe >= 7).length;
  const longCount = weekSessions.filter((session) => session.subtype === 'SORTIE_LONGUE').length;
  const easyCount = weekSessions.filter((session) => session.subtype === 'EF').length;
  const renfoCount = weekSessions.filter((session) => session.subtype === 'RENFO').length;

  const recent7d = existingSessions.filter((session) => {
    const delta = Date.now() - new Date(session.createdAt).getTime();
    return delta >= 0 && delta <= 7 * 24 * 60 * 60 * 1000;
  });
  const avgRecentRpe = recent7d.length
    ? recent7d.reduce((sum, session) => sum + session.feelings.rpe, 0) / recent7d.length
    : 0;

  const recent3d = existingSessions.filter((session) => {
    const delta = Date.now() - new Date(session.createdAt).getTime();
    return delta >= 0 && delta <= 3 * 24 * 60 * 60 * 1000;
  }).length;

  if (intenseCount >= 2 && longCount >= 1) {
    return {
      kind: 'EF',
      reason: 'Ta semaine est déjà intense. Une sortie facile optimise ta progression.',
      checks: ['2 séances intenses (RPE >= 7) déjà réalisées', '1 sortie longue validée']
    };
  }

  if (avgRecentRpe >= 7 || recent3d >= 3) {
    return {
      kind: 'RECUP',
      reason: 'Charge récente élevée. Un footing léger améliore la récupération.',
      checks: ['Fatigue implicite détectée', 'Récupération priorisée']
    };
  }

  if (easyCount >= 3 && intenseCount === 0) {
    return {
      kind: mainGoal === 'PERFORMANCE' ? 'FRACTIONNE_COURT' : 'SEUIL',
      reason: 'Ajoute une séance intense (RPE >= 7) pour débloquer ton bonus équilibre.',
      checks: ['3 sorties faciles déjà faites', 'Aucune séance intense (RPE >= 7) cette semaine']
    };
  }

  if (mainGoal === 'LONG_DISTANCE' && longCount === 0) {
    return {
      kind: 'SORTIE_LONGUE',
      reason: 'Essentielle pour progresser vers ton objectif distance longue.',
      checks: ['Objectif longue distance détecté', 'Aucune sortie longue cette semaine']
    };
  }

  if (renfoCount === 0 && weekSessions.length >= 3) {
    return {
      kind: 'RENFO_COURSE',
      reason: 'Ajoute 1 séance renforcement pour réduire ton risque de blessure.',
      checks: ['Aucune séance renfo cette semaine', 'Volume suffisant pour inclure du renfo']
    };
  }

  return {
    kind: 'EF',
    reason: 'Base fiable pour progresser avec régularité sans surcharge.',
    checks: ['Semaine en construction', 'Choix sûr pour maintenir le rythme']
  };
}

export default function AddSession({ onAddSession, existingSessions = [] }: AddSessionProps): JSX.Element {
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>({
    distanceKm: '',
    durationHours: '0',
    durationMinutes: '30',
    durationSeconds: '0',
    rpe: '5',
    kind: 'EF',
    hrAvg: '',
    elevationM: '',
    comment: '',
    surface: 'ROUTE',
    goalRespect: 'YES'
  });

  const [error, setError] = useState<string>('');
  const [duplicateHint, setDuplicateHint] = useState<string>('');
  const [manualChoice, setManualChoice] = useState<boolean>(false);

  const setField = (field: keyof FormState, value: string): void => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const recommendation = useMemo(() => getRecommendedKind(existingSessions), [existingSessions]);
  const durationTotalMin = useMemo(() => {
    const hours = Number(form.durationHours);
    const minutes = Number(form.durationMinutes);
    const seconds = Number(form.durationSeconds);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) return NaN;
    return hours * 60 + minutes + seconds / 60;
  }, [form.durationHours, form.durationMinutes, form.durationSeconds]);

  useEffect(() => {
    if (!manualChoice) {
      setForm((prev) => ({ ...prev, kind: recommendation.kind }));
    }
  }, [manualChoice, recommendation.kind]);

  const validate = (): string | null => {
    const distanceRequired = isDistanceRequired(form.kind);
    const hours = Number(form.durationHours);
    const minutes = Number(form.durationMinutes);
    const seconds = Number(form.durationSeconds);
    const duration = durationTotalMin;
    const distance = Number(form.distanceKm);
    const rpe = Number(form.rpe);
    const hrAvg = form.hrAvg ? Number(form.hrAvg) : undefined;
    const elevation = form.elevationM ? Number(form.elevationM) : undefined;

    if (distanceRequired && (!Number.isFinite(distance) || distance <= 0)) {
      return 'La distance doit être un nombre supérieur à 0.';
    }
    if (!Number.isInteger(hours) || hours < 0) {
      return 'Les heures doivent être un entier positif.';
    }
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
      return 'Les minutes doivent être entre 0 et 59.';
    }
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 59) {
      return 'Les secondes doivent être entre 0 et 59.';
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      return 'La durée doit être supérieure à 0.';
    }
    if (!Number.isInteger(rpe) || rpe < 1 || rpe > 10) {
      return 'Le RPE doit être un entier entre 1 et 10.';
    }
    if (form.hrAvg && (!Number.isFinite(hrAvg) || (hrAvg ?? 0) <= 0)) {
      return 'La fréquence cardiaque moyenne doit être vide ou positive.';
    }
    if (form.elevationM && (!Number.isFinite(elevation) || (elevation ?? 0) < 0)) {
      return 'Le dénivelé doit être vide ou positif.';
    }
    return null;
  };

  const pacePreview = useMemo(() => {
    if (!isDistanceRequired(form.kind)) return '--';
    const distance = Number(form.distanceKm);
    const duration = durationTotalMin;
    if (!Number.isFinite(distance) || distance <= 0) return '--';
    if (!Number.isFinite(duration) || duration <= 0) return '--';
    return formatPace(distance, duration);
  }, [form.distanceKm, durationTotalMin, form.kind]);

  const xpPreview = useMemo(() => {
    const distanceRequired = isDistanceRequired(form.kind);
    const distance = Number(form.distanceKm);
    const duration = durationTotalMin;
    const rpe = Number(form.rpe);
    if (distanceRequired && (!Number.isFinite(distance) || distance <= 0)) return null;
    if (!Number.isFinite(duration) || duration <= 0) return null;
    if (!Number.isInteger(rpe) || rpe < 1 || rpe > 10) return null;

    const mapped = mapKindToSessionInput(form.kind);
    const input: SessionInput = {
      sportType: mapped.sportType,
      subtype: mapped.subtype,
      distanceKm: distanceRequired ? distance : undefined,
      durationMin: duration,
      feelings: {
        rpe,
        feltState: deriveFeltStateFromRpe(rpe),
        fatigue: deriveFatigueFromRpe(rpe)
      }
    };

    return computeSessionXp(input);
  }, [form.distanceKm, durationTotalMin, form.kind, form.rpe]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    const distanceRequired = isDistanceRequired(form.kind);
    const distance = Number(form.distanceKm);
    const duration = durationTotalMin;
    const rpe = Number(form.rpe);

    const mapped = mapKindToSessionInput(form.kind);

    const metaParts: string[] = [];
    if (form.hrAvg) metaParts.push(`FC moy: ${Math.round(Number(form.hrAvg))} bpm`);
    if (form.elevationM) metaParts.push(`D+: ${Math.round(Number(form.elevationM))} m`);
    metaParts.push(`Catégorie: ${kindLabel(form.kind)}`);
    metaParts.push(`Surface: ${form.surface.toLowerCase()}`);
    metaParts.push(`Objectif respecté: ${goalRespectLabel(form.goalRespect)}`);
    if (distanceRequired) {
      metaParts.push(`Allure auto: ${formatPace(distance, duration)}`);
    }

    const comments = [form.comment.trim(), metaParts.join(' · ')].filter(Boolean).join('\n');

    const payload: SessionInput = {
      sportType: mapped.sportType,
      subtype: mapped.subtype,
      durationMin: duration,
      distanceKm: distanceRequired ? distance : undefined,
      feelings: {
        rpe,
        feltState: deriveFeltStateFromRpe(rpe),
        fatigue: deriveFatigueFromRpe(rpe)
      },
      comment: comments || undefined
    };

    const duplicate = existingSessions.find((session) => {
      const deltaMs = Math.abs(Date.now() - new Date(session.createdAt).getTime());
      const withinTwoHours = deltaMs <= 2 * 60 * 60 * 1000;
      return (
        withinTwoHours &&
        Math.abs((session.distanceKm ?? 0) - (payload.distanceKm ?? 0)) <= 0.4 &&
        Math.abs(session.durationMin - payload.durationMin) <= 10
      );
    });

    if (duplicate) {
      setDuplicateHint('Séance similaire détectée récemment. Vérifie si ce n’est pas un doublon.');
      const proceed = window.confirm(
        'Une séance similaire a été détectée récemment. Veux-tu vraiment enregistrer cette nouvelle séance ?'
      );
      if (!proceed) return;
    } else {
      setDuplicateHint('');
    }

    const session = createSession(payload);
    onAddSession(session);
    navigate('/sessions');
  };

  return (
    <section className="page page-add">
      <h1>Nouvelle séance</h1>
      <p className="page-subtitle">Minimum en 20 secondes, puis options si tu veux aller plus loin.</p>

      <form className="card form premium-section add-v2-form" onSubmit={handleSubmit}>
        <article
          className="recommendation-box recommendation-box-compact recommendation-box-photo"
          style={{ '--add-session-reco-bg-image': `url(${addSessionRecoBg})` } as CSSProperties}
        >
          <div className="recommendation-head-row">
            <p className="recommendation-kicker">Séance recommandée</p>
            <h3>{kindLabel(recommendation.kind)}</h3>
          </div>
          <p>{recommendation.reason}</p>
          <div className="recommendation-actions">
            <button
              type="button"
              className={!manualChoice ? 'is-selected' : ''}
              onClick={() => {
                setField('kind', recommendation.kind);
                setManualChoice(false);
              }}
            >
              Utiliser cette suggestion
            </button>
            <button
              type="button"
              className={manualChoice ? 'is-selected' : ''}
              onClick={() => setManualChoice(true)}
            >
              Choisir un autre type
            </button>
          </div>
          <details className="recommendation-details">
            <summary>Pourquoi cette suggestion ?</summary>
            <ul>
              {recommendation.checks.map((check) => (
                <li key={check}>✔ {check}</li>
              ))}
            </ul>
            <p className="recommendation-mode">
              {manualChoice
                ? 'Mode manuel actif: choisis librement ta catégorie ci-dessous.'
                : 'Mode guidé actif: la catégorie recommandée est préselectionnée.'}
            </p>
          </details>
        </article>

        <fieldset className="form-group required-group">
          <legend>Obligatoire</legend>
          <div className="quick-metrics-row">
            <label className="field-compact">
              Distance (km){isDistanceRequired(form.kind) ? '' : ' (optionnelle pour renfo)'}
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={form.distanceKm}
                onChange={(e) => setField('distanceKm', e.target.value)}
                required={isDistanceRequired(form.kind)}
              />
            </label>

            <label className="field-compact">
              Durée (h/min/sec)
              <div className="duration-inputs">
                <input
                  type="number"
                  aria-label="Durée (heures)"
                  min={0}
                  max={23}
                  value={form.durationHours}
                  onChange={(e) => setField('durationHours', e.target.value)}
                  required
                />
                <input
                  type="number"
                  aria-label="Durée (minutes)"
                  min={0}
                  max={59}
                  value={form.durationMinutes}
                  onChange={(e) => setField('durationMinutes', e.target.value)}
                  required
                />
                <input
                  type="number"
                  aria-label="Durée (secondes)"
                  min={0}
                  max={59}
                  value={form.durationSeconds}
                  onChange={(e) => setField('durationSeconds', e.target.value)}
                  required
                />
              </div>
            </label>
          </div>

          <div className="quick-required-grid">
            <div className="session-kind-field">
              <span>Type de séance</span>
              <div role="radiogroup" aria-label="Type de séance" className="session-kind-grid">
                {SESSION_KIND_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={form.kind === option.value}
                    className={`session-kind-card ${form.kind === option.value ? 'is-active' : ''}`}
                    onClick={() => {
                      setField('kind', option.value);
                      setManualChoice(true);
                    }}
                    title={option.label}
                  >
                    <strong>{option.short}</strong>
                    <small>{option.label}</small>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="inline-info">{kindHint(form.kind)}</p>

          <div className="rpe-row">
            <label htmlFor="rpe-input-v2">Ressenti global (RPE {form.rpe}/10)</label>
            <input
              id="rpe-input-v2"
              type="range"
              min={1}
              max={10}
              value={form.rpe}
              onChange={(e) => setField('rpe', e.target.value)}
              aria-label="RPE"
            />
          </div>
        </fieldset>

        <details className="optional-panel">
          <summary>Informations facultatives</summary>
          <fieldset className="form-group optional-group">
            <label>
              Fréquence cardiaque moyenne (bpm)
              <input
                type="number"
                min={1}
                value={form.hrAvg}
                onChange={(e) => setField('hrAvg', e.target.value)}
                placeholder="Ex: 152"
              />
            </label>

            <label>
              Dénivelé positif (m)
              <input
                type="number"
                min={0}
                value={form.elevationM}
                onChange={(e) => setField('elevationM', e.target.value)}
                placeholder="Ex: 340"
              />
            </label>

            <label>
              Surface
              <select value={form.surface} onChange={(e) => setField('surface', e.target.value as Surface)}>
                <option value="ROUTE">Route</option>
                <option value="TRAIL">Trail</option>
                <option value="TAPIS">Tapis</option>
              </select>
            </label>

            <label>
              Objectif respecté
              <select
                value={form.goalRespect}
                onChange={(e) => setField('goalRespect', e.target.value as GoalRespect)}
              >
                <option value="YES">Oui</option>
                <option value="PARTIAL">Partiellement</option>
                <option value="NO">Non</option>
              </select>
            </label>

            <label>
              Commentaire libre
              <textarea
                rows={3}
                value={form.comment}
                onChange={(e) => setField('comment', e.target.value)}
                placeholder="Optionnel: ressenti, météo, points marquants..."
              />
            </label>
          </fieldset>
        </details>

        <div className="smart-summary">
          <p>
            <strong>Allure calculée automatiquement:</strong> {pacePreview}
          </p>
          <p>
            <strong>XP estimée:</strong> {xpPreview ?? '--'}
          </p>
          <p>
            NIVELR calcule ensuite automatiquement la séance clé, la progression et l&apos;impact missions.
          </p>
        </div>

        {error ? <p className="error">{error}</p> : null}
        {duplicateHint ? <p className="inline-info">{duplicateHint}</p> : null}

        <button type="submit">Valider la séance</button>
      </form>
    </section>
  );
}
