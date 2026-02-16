import { useMemo, useState } from 'react';
import { computeSessionXp, SPORT_SUBTYPES } from '../domain/sessions';
import { Session, SessionInput, SportType } from '../types/models';

interface SessionEditorModalProps {
  session: Session;
  onClose: () => void;
  onSave: (session: Session) => void;
}

interface FormState {
  sportType: SportType;
  subtype: string;
  durationMin: string;
  distanceKm: string;
  feltState: string;
  rpe: string;
  fatigue: string;
  comment: string;
}

export default function SessionEditorModal({
  session,
  onClose,
  onSave
}: SessionEditorModalProps): JSX.Element {
  const [form, setForm] = useState<FormState>({
    sportType: session.sportType,
    subtype: session.subtype,
    durationMin: String(session.durationMin),
    distanceKm: typeof session.distanceKm === 'number' ? String(session.distanceKm) : '',
    feltState: String(session.feelings.feltState),
    rpe: String(session.feelings.rpe),
    fatigue: String(session.feelings.fatigue),
    comment: session.comment ?? ''
  });
  const [error, setError] = useState<string>('');

  const subtypeOptions = useMemo(() => SPORT_SUBTYPES[form.sportType], [form.sportType]);

  const setField = (field: keyof FormState, value: string): void => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const validate = (): string | null => {
    const duration = Number(form.durationMin);
    const distance = form.distanceKm ? Number(form.distanceKm) : undefined;
    const feltState = Number(form.feltState);
    const rpe = Number(form.rpe);
    const fatigue = Number(form.fatigue);

    if (!Number.isFinite(duration) || duration <= 0) return 'La durée doit être > 0.';
    if (form.distanceKm && (!Number.isFinite(distance) || (distance ?? 0) < 0)) {
      return 'La distance doit être vide ou positive.';
    }
    if (!Number.isInteger(feltState) || feltState < 1 || feltState > 5) {
      return 'Le ressenti global doit être entre 1 et 5.';
    }
    if (!Number.isInteger(rpe) || rpe < 1 || rpe > 10) {
      return 'Le RPE doit être entre 1 et 10.';
    }
    if (!Number.isInteger(fatigue) || fatigue < 1 || fatigue > 5) {
      return 'La fatigue doit être entre 1 et 5.';
    }
    return null;
  };

  const handleSave = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    const input: SessionInput = {
      sportType: form.sportType,
      subtype: form.subtype as SessionInput['subtype'],
      durationMin: Number(form.durationMin),
      distanceKm: form.distanceKm ? Number(form.distanceKm) : undefined,
      feelings: {
        feltState: Number(form.feltState),
        rpe: Number(form.rpe),
        fatigue: Number(form.fatigue)
      },
      comment: form.comment.trim() || undefined
    };

    onSave({
      ...session,
      ...input,
      xp: computeSessionXp(input)
    });
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form className="card session-modal" onSubmit={handleSave}>
        <h2>Modifier la séance</h2>

        <label>
          Sport
          <select
            value={form.sportType}
            onChange={(event) => {
              const sportType = event.target.value as SportType;
              setForm((prev) => ({
                ...prev,
                sportType,
                subtype: SPORT_SUBTYPES[sportType][0],
                distanceKm: sportType === 'RUNNING' ? prev.distanceKm : ''
              }));
            }}
          >
            <option value="RUNNING">RUNNING</option>
            <option value="OTHER">OTHER</option>
          </select>
        </label>

        <label>
          Sous-type
          <select value={form.subtype} onChange={(event) => setField('subtype', event.target.value)}>
            {subtypeOptions.map((subtype) => (
              <option key={subtype} value={subtype}>
                {subtype}
              </option>
            ))}
          </select>
        </label>

        <label>
          Durée (minutes)
          <input
            type="number"
            min={1}
            value={form.durationMin}
            onChange={(event) => setField('durationMin', event.target.value)}
            required
          />
        </label>

        <label>
          Distance (km, optionnel)
          <input
            type="number"
            min={0}
            step={0.1}
            disabled={form.sportType !== 'RUNNING'}
            value={form.distanceKm}
            onChange={(event) => setField('distanceKm', event.target.value)}
          />
        </label>

        <label>
          Je me suis senti (1-5)
          <input
            type="number"
            min={1}
            max={5}
            value={form.feltState}
            onChange={(event) => setField('feltState', event.target.value)}
            required
          />
        </label>

        <label>
          RPE (1-10)
          <input
            type="number"
            min={1}
            max={10}
            value={form.rpe}
            onChange={(event) => setField('rpe', event.target.value)}
            required
          />
        </label>

        <label>
          Fatigue perçue (1-5)
          <input
            type="number"
            min={1}
            max={5}
            value={form.fatigue}
            onChange={(event) => setField('fatigue', event.target.value)}
            required
          />
        </label>

        <label>
          Commentaire
          <textarea
            rows={3}
            value={form.comment}
            onChange={(event) => setField('comment', event.target.value)}
          />
        </label>

        {error ? <p className="error">{error}</p> : null}

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Annuler
          </button>
          <button type="submit">Enregistrer</button>
        </div>
      </form>
    </div>
  );
}
