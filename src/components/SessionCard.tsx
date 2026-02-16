import { Session } from '../types/models';

interface SessionCardProps {
  session: Session;
  onEdit?: (session: Session) => void;
  onDuplicate?: (session: Session) => void;
  onDelete?: (session: Session) => void;
  onSelect?: (session: Session) => void;
}

export default function SessionCard({
  session,
  onEdit,
  onDuplicate,
  onDelete,
  onSelect
}: SessionCardProps): JSX.Element {
  const date = new Date(session.createdAt).toLocaleString('fr-FR');
  return (
    <article
      className={`card session-card ${onSelect ? 'is-clickable' : ''}`}
      onClick={onSelect ? () => onSelect(session) : undefined}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={
        onSelect
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(session);
              }
            }
          : undefined
      }
    >
      <div className="session-top">
        <strong>{session.sportType}</strong>
        <span>{session.subtype}</span>
      </div>
      <p className="session-meta">
        {session.durationMin} min
        {typeof session.distanceKm === 'number' ? ` • ${session.distanceKm} km` : ''}
      </p>
      <p className="session-meta">
        État de forme {session.feelings.feltState}/5 • RPE {session.feelings.rpe}/10 • Fatigue {session.feelings.fatigue}/5
      </p>
      {session.comment ? <p className="session-comment">{session.comment}</p> : null}
      <div className="session-footer">
        <span>{date}</span>
        <strong>+{session.xp} XP</strong>
      </div>
      {onEdit || onDelete ? (
        <div className="session-actions">
          {onEdit ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(session);
              }}
            >
              Modifier
            </button>
          ) : null}
          {onDuplicate ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDuplicate(session);
              }}
            >
              Dupliquer
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              className="danger"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(session);
              }}
            >
              Supprimer
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
