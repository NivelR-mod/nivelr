import { useEffect, useState } from 'react';
import { MissionDefinition, MissionStatus } from '../types/models';

interface MissionCardProps {
  mission: MissionDefinition;
  status: MissionStatus;
  progressText: string;
  progressRatio: number;
  tierLabel: 'Bronze' | 'Argent' | 'Or';
  showTier?: boolean;
  onClaim: (missionId: string) => void;
}

export default function MissionCard({
  mission,
  status,
  progressText,
  progressRatio,
  tierLabel,
  showTier = true,
  onClaim
}: MissionCardProps): JSX.Element {
  const canClaim = status === 'DONE';
  const safeRatio = Math.max(0, Math.min(1, progressRatio));
  const [isExpanded, setIsExpanded] = useState<boolean>(status !== 'CLAIMED');

  useEffect(() => {
    setIsExpanded(status !== 'CLAIMED');
  }, [status, mission.id]);

  const cardClassName = `card mission-card ${
    status === 'CLAIMED' ? 'is-claimed' : status === 'DONE' ? 'is-done' : 'is-in-progress'
  } ${status === 'CLAIMED' && !isExpanded ? 'is-compact' : ''}`;

  return (
    <article className={cardClassName}>
      <div className="mission-top">
        <h3>{mission.title}</h3>
        <div className="mission-tags">
          <span className={`pill ${mission.type === 'WEEKLY' ? 'pill-weekly' : 'pill-oneshot'}`}>
            {mission.type === 'WEEKLY' ? 'Hebdo' : 'Classique'}
          </span>
          {showTier ? <span className={`pill tier-pill tier-${tierLabel.toLowerCase()}`}>{tierLabel}</span> : null}
        </div>
      </div>

      {status === 'CLAIMED' && !isExpanded ? (
        <div className="mission-claimed-compact">
          <p className="mission-reward">+{mission.xpReward} XP gagné</p>
        </div>
      ) : (
        <>
          <p>{mission.description}</p>
          <p className="mission-progress">Progression : {progressText}</p>
          <div className="mission-progress-track" aria-hidden="true">
            <div className="mission-progress-fill" style={{ width: `${safeRatio * 100}%` }} />
          </div>
          <p className="mission-reward">Récompense : +{mission.xpReward} XP</p>
        </>
      )}

      <div className="mission-actions">
        {status === 'IN_PROGRESS' ? <span className="status in-progress">En cours</span> : null}
        {status === 'DONE' ? <span className="status done">Prêt à réclamer</span> : null}
        {status === 'CLAIMED' ? <span className="status claimed">Récompense prise</span> : null}

        {status === 'CLAIMED' ? (
          <button type="button" onClick={() => setIsExpanded((prev) => !prev)}>
            {isExpanded ? 'Réduire' : 'Voir le détail'}
          </button>
        ) : (
          <button type="button" onClick={() => onClaim(mission.id)} disabled={!canClaim}>
            Réclamer
          </button>
        )}
      </div>
    </article>
  );
}
