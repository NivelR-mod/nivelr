import { CSSProperties, useEffect, useMemo, useState } from 'react';
import MissionCard from '../../components/MissionCard';
import GamificationMissionCard from '../../components/gamification/GamificationMissionCard';
import { getMissions, getMissionProgressText, getMissionStatus } from '../../domain/missions';
import { getWeekKeyFromDate } from '../../storage/localStore';
import { AppState, GoalConfig, MissionTier } from '../../types/models';
import { GAMIFICATION_V1_ENABLED } from '../../gamification/config';
import { GamificationState, MissionProgressStatus } from '../../gamification/types';
import missionsGoalsBg from '../../assets/missions-goals-bg.jpg';

interface MissionsProps {
  state: AppState;
  gamificationState: GamificationState;
  gamificationMissions: Array<{
    mission: import('../../gamification/types').GamificationMission;
    progressValue: number;
    status: MissionProgressStatus;
  }>;
  onClaimMission: (missionId: string) => void;
  onClaimMissionV1: (missionId: string) => void;
  onUpdateGoals: (goals: GoalConfig) => void;
}

function toTierLabel(tier: MissionTier): 'Bronze' | 'Argent' | 'Or' {
  if (tier === 'GOLD') return 'Or';
  if (tier === 'SILVER') return 'Argent';
  return 'Bronze';
}

export default function Missions({
  state,
  gamificationState,
  gamificationMissions,
  onClaimMission,
  onClaimMissionV1,
  onUpdateGoals
}: MissionsProps): JSX.Element {
  const [sessionsTarget, setSessionsTarget] = useState<string>(String(state.goals.weeklySessionsTarget));
  const [minutesTarget, setMinutesTarget] = useState<string>(String(state.goals.weeklyMinutesTarget));
  const [v1View, setV1View] = useState<'ACTIVE' | 'UNLOCKS' | 'CLAIMED'>('ACTIVE');
  const [selectedUnlockRange, setSelectedUnlockRange] = useState<string>('0-5');

  useEffect(() => {
    setSessionsTarget(String(state.goals.weeklySessionsTarget));
    setMinutesTarget(String(state.goals.weeklyMinutesTarget));
  }, [state.goals.weeklyMinutesTarget, state.goals.weeklySessionsTarget]);

  const weekSessions = state.sessions.filter(
    (s) => getWeekKeyFromDate(new Date(s.createdAt)) === state.missionWeekKey
  );

  const context = {
    sessions: state.sessions,
    weekSessions
  };

  const missions = useMemo(
    () => getMissions(state.goals, state.missionWeekKey),
    [state.goals, state.missionWeekKey]
  );
  const enrichedMissions = useMemo(() => {
    return missions
      .map((mission) => {
        const status = getMissionStatus(mission, context, state);
        const progressRaw = mission.getProgress(context);
        const progressRatio = mission.target > 0 ? Math.min(1, progressRaw / mission.target) : 0;
        return {
          mission,
          status,
          progressText: getMissionProgressText(mission, context),
          progressRatio
        };
      })
      .sort((a, b) => {
        const statusPriority: Record<typeof a.status, number> = {
          DONE: 0,
          IN_PROGRESS: 1,
          CLAIMED: 2
        };
        return statusPriority[a.status] - statusPriority[b.status] || b.progressRatio - a.progressRatio;
      });
  }, [missions, context, state]);

  const weeklyMissions = enrichedMissions.filter((item) => item.mission.type === 'WEEKLY');
  const unlockedV1Missions = gamificationMissions.filter(
    (item) => item.mission.minLevel <= gamificationState.userLevel.level
  );
  const v1DoneRatio = unlockedV1Missions.length
    ? unlockedV1Missions.filter((item) => item.status === 'CLAIMED').length / unlockedV1Missions.length
    : 0;
  const activeV1Missions = gamificationMissions.filter(
    (item) => item.status === 'IN_PROGRESS' || item.status === 'DONE'
  );
  const claimedV1Missions = gamificationMissions.filter((item) => item.status === 'CLAIMED');
  const unlockRanges = useMemo(
    () => [
      { key: '0-5', min: 0, max: 5 },
      { key: '6-10', min: 6, max: 10 },
      { key: '11-15', min: 11, max: 15 },
      { key: '16-20', min: 16, max: 20 },
      { key: '21-25', min: 21, max: 25 },
      { key: '26-30', min: 26, max: 30 }
    ],
    []
  );
  const unlockRangesWithCount = useMemo(
    () =>
      unlockRanges.map((range) => ({
        ...range,
        count: gamificationMissions.filter(
          (item) => item.status === 'LOCKED' && item.mission.minLevel >= range.min && item.mission.minLevel <= range.max
        ).length
      })),
    [gamificationMissions, unlockRanges]
  );
  useEffect(() => {
    const selected = unlockRangesWithCount.find((range) => range.key === selectedUnlockRange);
    if (!selected || selected.count === 0) {
      const firstWithMissions = unlockRangesWithCount.find((range) => range.count > 0);
      if (firstWithMissions) setSelectedUnlockRange(firstWithMissions.key);
    }
  }, [selectedUnlockRange, unlockRangesWithCount]);
  const selectedRange = unlockRangesWithCount.find((range) => range.key === selectedUnlockRange) ?? unlockRangesWithCount[0];
  const missionsForUnlockRange = gamificationMissions.filter(
    (item) =>
      item.status === 'LOCKED' &&
      item.mission.minLevel >= selectedRange.min &&
      item.mission.minLevel <= selectedRange.max
  );

  const handleSaveGoals = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const sessions = Math.max(1, Math.min(14, Math.round(Number(sessionsTarget))));
    const minutes = Math.max(15, Math.min(1500, Math.round(Number(minutesTarget))));

    if (!Number.isFinite(sessions) || !Number.isFinite(minutes)) return;

    onUpdateGoals({
      weeklySessionsTarget: sessions,
      weeklyMinutesTarget: minutes
    });
  };

  return (
    <section className="page page-missions">
      <h1>Missions</h1>
      <p className="page-subtitle">
        Semaine active : {state.missionWeekKey} (reset hebdo automatique).
      </p>

      <form
        className="card goal-settings goal-settings-photo premium-section"
        onSubmit={handleSaveGoals}
        style={{ '--goals-bg-image': `url(${missionsGoalsBg})` } as CSSProperties}
      >
        <h2>Objectifs hebdo personnalisés</h2>
        <div className="goal-grid">
          <label>
            Séances hebdo (1-14)
            <input
              type="number"
              min={1}
              max={14}
              value={sessionsTarget}
              onChange={(e) => setSessionsTarget(e.target.value)}
              required
            />
          </label>

          <label>
            Minutes hebdo (15-1500)
            <input
              type="number"
              min={15}
              max={1500}
              step={5}
              value={minutesTarget}
              onChange={(e) => setMinutesTarget(e.target.value)}
              required
            />
          </label>
        </div>

        <div className="goal-actions">
          <button type="submit">Enregistrer les objectifs</button>
        </div>
      </form>

      {GAMIFICATION_V1_ENABLED ? (
        <>
          <article className="card premium-section missions-overview">
            <h2>Missions Gamification V1</h2>
            <p>
              Disponibles: {unlockedV1Missions.length}/{gamificationMissions.length} · Reclamees:{' '}
              {Math.round(v1DoneRatio * 100)}%
            </p>
            <div className="mission-progress-track" aria-hidden="true">
              <div className="mission-progress-fill" style={{ width: `${v1DoneRatio * 100}%` }} />
            </div>
          </article>

          <article className="card premium-section missions-v1-toolbar">
            <div className="missions-v1-view-switch">
              <button type="button" onClick={() => setV1View('ACTIVE')} disabled={v1View === 'ACTIVE'}>
                Missions actives ({activeV1Missions.length})
              </button>
              <button type="button" onClick={() => setV1View('UNLOCKS')} disabled={v1View === 'UNLOCKS'}>
                Catalogue verrouille
              </button>
              <button type="button" onClick={() => setV1View('CLAIMED')} disabled={v1View === 'CLAIMED'}>
                Missions validees ({claimedV1Missions.length})
              </button>
            </div>

            {v1View === 'UNLOCKS' ? (
              <div className="missions-v1-level-switch">
                {unlockRangesWithCount.map((range) => (
                  <button
                    key={range.key}
                    type="button"
                    onClick={() => setSelectedUnlockRange(range.key)}
                    className={selectedUnlockRange === range.key ? 'is-active' : ''}
                    disabled={range.count === 0}
                  >
                    {range.key}
                  </button>
                ))}
              </div>
            ) : null}
          </article>

          {v1View === 'ACTIVE' ? (
            <>
              <h2 className="section-title">Missions actives prioritaires</h2>
              <div className="list">
                {activeV1Missions.map(({ mission, progressValue, status }) => (
                  <GamificationMissionCard
                    key={mission.id}
                    mission={mission}
                    status={status}
                    progressValue={progressValue}
                    onClaim={onClaimMissionV1}
                  />
                ))}
              </div>
            </>
          ) : null}

          {v1View === 'UNLOCKS' ? (
            <>
              <h2 className="section-title">Contenu a debloquer (tranches de niveau)</h2>
              <div className="list">
                {missionsForUnlockRange.length > 0 ? (
                  missionsForUnlockRange.map(({ mission, progressValue, status }) => (
                    <GamificationMissionCard
                      key={mission.id}
                      mission={mission}
                      status={status}
                      progressValue={progressValue}
                      onClaim={onClaimMissionV1}
                    />
                  ))
                ) : (
                  <article className="card empty-state">
                    Aucune mission verrouillee sur ce palier.
                  </article>
                )}
              </div>
            </>
          ) : null}

          {v1View === 'CLAIMED' ? (
            <>
              <h2 className="section-title">Missions deja validees</h2>
              <div className="list">
                {claimedV1Missions.map(({ mission, progressValue, status }) => (
                  <GamificationMissionCard
                    key={mission.id}
                    mission={mission}
                    status={status}
                    progressValue={progressValue}
                    onClaim={onClaimMissionV1}
                  />
                ))}
              </div>
            </>
          ) : null}
        </>
      ) : null}

      <h2 className="section-title">Missions hebdo</h2>
      <div className="list">
        {weeklyMissions.map(({ mission, status, progressText, progressRatio }) => (
          <MissionCard
            key={mission.id}
            mission={mission}
            status={status}
            progressText={progressText}
            progressRatio={progressRatio}
            tierLabel={toTierLabel(mission.tier)}
            onClaim={onClaimMission}
          />
        ))}
      </div>

    </section>
  );
}
