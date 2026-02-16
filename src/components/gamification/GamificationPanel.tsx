import ProgressBar from '../ProgressBar';
import { getLevelProgressRatioV1 } from '../../gamification/levels';
import { GamificationState } from '../../gamification/types';

interface GamificationPanelProps {
  state: GamificationState;
  inProgressMissionsCount: number;
  doneMissionsCount: number;
}

export default function GamificationPanel({
  state,
  inProgressMissionsCount,
  doneMissionsCount
}: GamificationPanelProps): JSX.Element {
  const ratio = getLevelProgressRatioV1(state.userLevel.xpTotal);
  const unseenUnlock = state.unlockNotifications.filter((item) => !item.seen).length;

  return (
    <article className="card premium-section gamification-v1-panel">
      <div className="gamification-v1-top">
        <h2>Gamification V1</h2>
        <span className={`pill ${state.enabled ? 'pill-weekly' : 'pill-oneshot'}`}>
          {state.enabled ? 'Active' : 'Desactivee'}
        </span>
      </div>

      <div className="gamification-v1-grid">
        <p>
          Niveau: <strong>{state.userLevel.level}</strong>
        </p>
        <p>
          XP globale: <strong>{state.userLevel.xpTotal}</strong>
        </p>
        <p>
          XP avant niveau suivant: <strong>{state.userLevel.xpToNextLevel}</strong>
        </p>
        <p>
          Streak (semaines actives): <strong>{state.userStreak.activeWeeks}</strong>
        </p>
        <p>
          Missions en cours: <strong>{inProgressMissionsCount}</strong>
        </p>
        <p>
          Missions reclamables: <strong>{doneMissionsCount}</strong>
        </p>
      </div>

      <ProgressBar ratio={ratio} label="Progression du niveau V1" />

      {unseenUnlock > 0 ? (
        <p className="inline-info">
          Nouveau contenu debloque: <strong>{unseenUnlock}</strong> notification(s)
        </p>
      ) : (
        <p className="page-subtitle">Prochains paliers surprise: 5 / 10 / 15 / 20 / 25 / 30</p>
      )}
    </article>
  );
}
