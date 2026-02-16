import { GamificationMission, MissionProgressStatus } from '../../gamification/types';

interface GamificationMissionCardProps {
  mission: GamificationMission;
  status: MissionProgressStatus;
  progressValue: number;
  onClaim: (missionId: string) => void;
}

function tierLabel(tier: GamificationMission['tier']): string {
  if (tier === 'SILVER') return 'Argent';
  if (tier === 'GOLD') return 'Or';
  if (tier === 'PLATINUM') return 'Platine';
  return 'Bronze';
}

export default function GamificationMissionCard({
  mission,
  status,
  progressValue,
  onClaim
}: GamificationMissionCardProps): JSX.Element {
  const ratio = Math.max(0, Math.min(1, progressValue / Math.max(1, mission.criterion.target)));

  return (
    <article
      className={`card mission-card ${
        status === 'CLAIMED' ? 'is-claimed' : status === 'DONE' ? 'is-done' : status === 'LOCKED' ? 'is-locked' : 'is-in-progress'
      }`}
    >
      <div className="mission-top">
        <h3>{mission.title}</h3>
        <div className="mission-tags">
          <span className={`pill tier-pill tier-${mission.tier.toLowerCase()}`}>{tierLabel(mission.tier)}</span>
          <span className="pill pill-oneshot">Niv. min {mission.minLevel}</span>
        </div>
      </div>

      <p>{mission.description}</p>
      <p className="mission-progress">
        Progression: {Math.min(progressValue, mission.criterion.target)}/{mission.criterion.target}
      </p>
      <div className="mission-progress-track" aria-hidden="true">
        <div className="mission-progress-fill" style={{ width: `${ratio * 100}%` }} />
      </div>
      <p className="mission-reward">Recompense: +{mission.xpReward} XP</p>

      <div className="mission-actions">
        {status === 'LOCKED' ? <span className="status in-progress">Bloquee</span> : null}
        {status === 'IN_PROGRESS' ? <span className="status in-progress">En cours</span> : null}
        {status === 'DONE' ? <span className="status done">Pret a reclamer</span> : null}
        {status === 'CLAIMED' ? <span className="status claimed">Reclamee</span> : null}
        <button type="button" disabled={status !== 'DONE'} onClick={() => onClaim(mission.id)}>
          Reclamer
        </button>
      </div>
    </article>
  );
}
