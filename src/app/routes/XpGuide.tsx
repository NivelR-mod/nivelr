import { AppState } from '../../types/models';
import { GamificationState, UserXpLogEntry } from '../../gamification/types';
import { GAMIFICATION_V1_ENABLED } from '../../gamification/config';
import { getWeekKey } from '../../gamification/storage';

interface XpGuideProps {
  state: AppState;
  gamificationState: GamificationState;
}

interface XpBucket {
  id: string;
  label: string;
  total: number;
}

function toDateKey(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatReason(reason: UserXpLogEntry['reason']): string {
  switch (reason) {
    case 'SESSION_BASE':
      return 'Séance validée';
    case 'MISSION_CLAIM':
      return 'Mission réclamée';
    case 'PROGRESSION_CHRONO':
      return 'Bonus progression chrono';
    case 'PROGRESSION_DISTANCE':
      return 'Bonus progression distance';
    case 'PROGRESSION_FREQUENCY':
      return 'Bonus progression fréquence';
    case 'STREAK_3':
    case 'STREAK_4':
    case 'STREAK_8':
      return 'Bonus régularité (streak)';
    case 'PLAN_SESSION_DONE':
    case 'PLAN_WEEK_80':
    case 'PLAN_WEEK_100':
      return 'Bonus respect du plan';
    case 'TEAM_MISSION':
      return 'Bonus mission équipe';
    case 'SEASON_REWARD':
      return 'Bonus saison';
    default:
      return reason;
  }
}

function buildBuckets(entries: UserXpLogEntry[]): XpBucket[] {
  const totals = new Map<string, number>();
  const add = (key: string, amount: number): void => {
    totals.set(key, (totals.get(key) ?? 0) + amount);
  };

  for (const entry of entries) {
    if (entry.reason === 'SESSION_BASE') add('activity', entry.amount);
    else if (entry.reason === 'MISSION_CLAIM') add('missions', entry.amount);
    else if (
      entry.reason === 'PROGRESSION_CHRONO' ||
      entry.reason === 'PROGRESSION_DISTANCE' ||
      entry.reason === 'PROGRESSION_FREQUENCY'
    ) {
      add('progression', entry.amount);
    } else if (entry.reason === 'STREAK_3' || entry.reason === 'STREAK_4' || entry.reason === 'STREAK_8') {
      add('streak', entry.amount);
    } else if (
      entry.reason === 'PLAN_SESSION_DONE' ||
      entry.reason === 'PLAN_WEEK_80' ||
      entry.reason === 'PLAN_WEEK_100'
    ) {
      add('plan', entry.amount);
    } else {
      add('other', entry.amount);
    }
  }

  const labels: Record<string, string> = {
    activity: 'Séances',
    missions: 'Missions',
    progression: 'Progression',
    streak: 'Régularité',
    plan: 'Plan',
    other: 'Autres bonus'
  };

  return Array.from(totals.entries())
    .map(([id, total]) => ({ id, total, label: labels[id] ?? id }))
    .sort((a, b) => b.total - a.total);
}

export default function XpGuide({ state, gamificationState }: XpGuideProps): JSX.Element {
  const allEntries = gamificationState.userXpLog;
  const now = new Date();
  const todayKey = toDateKey(now);
  const currentWeekKey = getWeekKey(now);
  const weekEntries = allEntries.filter((entry) => entry.weekKey === currentWeekKey);
  const todayEntries = allEntries.filter((entry) => entry.dateKey === todayKey);

  const totalFromLog = allEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const totalDisplayed = GAMIFICATION_V1_ENABLED
    ? gamificationState.userLevel.xpTotal
    : state.sessions.reduce((sum, session) => sum + session.xp, 0) + state.bonusXp;
  const legacyCarryOver = Math.max(0, totalDisplayed - totalFromLog);
  const weekXp = weekEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const todayXp = todayEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const missionBonus = allEntries
    .filter((entry) => entry.reason === 'MISSION_CLAIM')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const unseenUnlocks = gamificationState.unlockNotifications.filter((item) => !item.seen).length;

  const todayBaseXp = todayEntries
    .filter((entry) => entry.reason === 'SESSION_BASE')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const todayBaseSessionCount = todayEntries.filter((entry) => entry.reason === 'SESSION_BASE' && entry.amount > 0).length;
  const dailySessionUsage = gamificationState.maxXpSessionsPerDay > 0
    ? Math.min(1, todayBaseSessionCount / gamificationState.maxXpSessionsPerDay)
    : 0;
  const remainingDailyScoringSessions = Math.max(0, gamificationState.maxXpSessionsPerDay - todayBaseSessionCount);

  const weeklyCapUsage = gamificationState.weeklyXpCap > 0 ? Math.min(1, weekXp / gamificationState.weeklyXpCap) : 0;

  const weekBuckets = buildBuckets(weekEntries);
  const totalBuckets = buildBuckets(allEntries);
  const lastEntries = [...todayEntries].slice(0, 8);

  return (
    <section className="page">
      <article className="card premium-section info-section xp-guide-page">
        <h1>Guide XP</h1>
        <p className="page-subtitle">Lecture complète des points: origine, plafonds et progression réelle.</p>

        <div className="xp-flow" aria-label="Parcours XP">
          <div className="xp-flow-step">
            <span className="xp-flow-index">1</span>
            <p className="xp-flow-title">Tu valides une séance</p>
            <p className="xp-flow-text">L&apos;app crédite l&apos;XP de séance selon les règles du jour et de la semaine.</p>
          </div>
          <div className="xp-flow-arrow" aria-hidden="true">
            →
          </div>
          <div className="xp-flow-step">
            <span className="xp-flow-index">2</span>
            <p className="xp-flow-title">Tu réclames une mission</p>
            <p className="xp-flow-text">Le bonus mission est ajouté et visible dans la répartition de tes gains.</p>
          </div>
          <div className="xp-flow-arrow" aria-hidden="true">
            →
          </div>
          <div className="xp-flow-step">
            <span className="xp-flow-index">3</span>
            <p className="xp-flow-title">Tu montes de niveau</p>
            <p className="xp-flow-text">Ton XP totale alimente les paliers et les déblocages surprise.</p>
          </div>
        </div>

        <div className="xp-guide-dashboard">
          <article className="xp-guide-card is-highlight">
            <h3>Où tu en es maintenant</h3>
            <p>
              XP totale (niveau): <strong>{totalDisplayed}</strong>
            </p>
            <p>
              XP gagnée cette semaine ({currentWeekKey}): <strong>{weekXp}</strong>
            </p>
            <p>
              XP gagnée aujourd&apos;hui ({todayKey}): <strong>{todayXp}</strong>
            </p>
            <p>
              Bonus missions cumulés: <strong>{missionBonus}</strong>
            </p>
            <p>
              Déblocages non lus: <strong>{unseenUnlocks}</strong>
            </p>
            {legacyCarryOver > 0 ? (
              <p className="xp-note">
                Ajustement historique: <strong>+{legacyCarryOver}</strong> XP (conservé hors journal détaillé).
              </p>
            ) : null}
          </article>

          <article className="xp-guide-card">
            <h3>Cap journalière (séances qui rapportent XP)</h3>
            <p>
              Séances qui rapportent aujourd&apos;hui: <strong>{todayBaseSessionCount}</strong> /{' '}
              <strong>{gamificationState.maxXpSessionsPerDay}</strong>
            </p>
            <p>
              XP issue des séances aujourd&apos;hui: <strong>{todayBaseXp}</strong>
            </p>
            <div className="mission-progress-track" aria-hidden="true">
              <div className="mission-progress-fill" style={{ width: `${dailySessionUsage * 100}%` }} />
            </div>
            <p>Séance(s) encore comptabilisable(s) aujourd&apos;hui: {remainingDailyScoringSessions}.</p>
            <p className="xp-note">
              Le score par séance dépend de ta séance validée. La limite quotidienne porte sur le nombre de séances qui rapportent des points.
            </p>
          </article>
        </div>

        <div className="xp-guide-dashboard">
          <article className="xp-guide-card">
            <h3>Cap hebdo (global)</h3>
            <p>
              XP semaine totale: <strong>{weekXp}</strong> / <strong>{gamificationState.weeklyXpCap}</strong>
            </p>
            <div className="mission-progress-track" aria-hidden="true">
              <div className="mission-progress-fill" style={{ width: `${weeklyCapUsage * 100}%` }} />
            </div>
            <p className="xp-note">
              Ce plafond inclut les gains de séance, missions et bonus. Une fois atteint, aucun gain supplémentaire n&apos;est crédité cette semaine.
            </p>
          </article>

          <article className="xp-guide-card">
            <h3>Répartition de tes gains (semaine)</h3>
            <ul className="xp-breakdown">
              {weekBuckets.length ? (
                weekBuckets.map((bucket) => (
                  <li key={bucket.id}>
                    <span>{bucket.label}</span>
                    <strong>{bucket.total} XP</strong>
                  </li>
                ))
              ) : (
                <li>
                  <span>Aucun gain cette semaine</span>
                  <strong>0 XP</strong>
                </li>
              )}
            </ul>
          </article>
        </div>

        <article className="xp-guide-card">
          <h3>Répartition globale (depuis le début)</h3>
          <ul className="xp-breakdown">
            {totalBuckets.map((bucket) => (
              <li key={`total-${bucket.id}`}>
                <span>{bucket.label}</span>
                <strong>{bucket.total} XP</strong>
              </li>
            ))}
          </ul>
        </article>

        <article className="xp-guide-card faq-card">
          <h3>Historique du jour (détail)</h3>
          <ul className="xp-log-list">
            {lastEntries.length ? (
              lastEntries.map((entry) => (
                <li key={entry.id}>
                  <span>{formatReason(entry.reason)}</span>
                  <strong>+{entry.amount} XP</strong>
                </li>
              ))
            ) : (
              <li>
                <span>Aucun événement XP aujourd&apos;hui</span>
                <strong>0 XP</strong>
              </li>
            )}
          </ul>
        </article>
      </article>
    </section>
  );
}
