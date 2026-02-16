import { CSSProperties, useState } from 'react';
import ProgressBar from '../../components/ProgressBar';
import {
  getLevelFromXp,
  getLevelProgressRatio,
  getXpIntoLevel,
  getXpToNextLevel
} from '../../domain/levels';
import { getWeekKeyFromDate } from '../../storage/localStore';
import { AppState, Session } from '../../types/models';
import { GAMIFICATION_V1_ENABLED } from '../../gamification/config';
import { getLevelProgressRatioV1, getXpForLevel } from '../../gamification/levels';
import { GamificationState } from '../../gamification/types';
import statsProgressionBg from '../../assets/stats-progression-bg.jpg';

type CurveMetric = 'MINUTES' | 'DISTANCE' | 'SESSIONS' | 'XP';
type CurvePeriod = 'WEEK' | 'MONTH' | 'YEAR';
const APP_START_DATE = new Date(2026, 0, 1);

interface HomeProps {
  state: AppState;
  gamificationState: GamificationState;
  onReset: () => void;
  onExportState: () => void;
  onImportState: (file: File) => void | Promise<void>;
}

interface CalendarDay {
  key: string;
  label: string;
  day: number;
  date: Date;
  sessions: Session[];
  hasSession: boolean;
  isToday: boolean;
}

interface FocusedDay {
  label: string;
  dateText: string;
  sessions: Session[];
}

function startOfIsoWeek(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return next;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1);
}

function addPeriodUnits(date: Date, period: CurvePeriod, units: number): Date {
  const next = new Date(date);
  if (period === 'WEEK') {
    next.setDate(next.getDate() + units * 7);
    return startOfIsoWeek(next);
  }
  if (period === 'MONTH') {
    return new Date(next.getFullYear(), next.getMonth() + units, 1);
  }
  return new Date(next.getFullYear() + units, 0, 1);
}

function diffInPeriodUnits(from: Date, to: Date, period: CurvePeriod): number {
  if (period === 'WEEK') {
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    return Math.floor((startOfIsoWeek(to).getTime() - startOfIsoWeek(from).getTime()) / msPerWeek);
  }
  if (period === 'MONTH') {
    return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  }
  return to.getFullYear() - from.getFullYear();
}

function bucketStartForPeriod(date: Date, period: CurvePeriod): Date {
  if (period === 'WEEK') return startOfIsoWeek(date);
  if (period === 'MONTH') return startOfMonth(date);
  return startOfYear(date);
}

function bucketKeyForPeriod(date: Date, period: CurvePeriod): string {
  const bucketStart = bucketStartForPeriod(date, period);
  return bucketStart.toISOString().slice(0, 10);
}

function periodWindowSize(period: CurvePeriod): number {
  if (period === 'WEEK') return 12;
  if (period === 'MONTH') return 12;
  return 6;
}

function windowStartOffset(page: number, visibleCount: number): number {
  const endOffset = -page * visibleCount;
  return endOffset - (visibleCount - 1);
}

function curvePeriodLabel(period: CurvePeriod): string {
  if (period === 'MONTH') return 'Mois';
  if (period === 'YEAR') return 'Année';
  return 'Semaine';
}

function formatBucketLabel(start: Date, period: CurvePeriod): string {
  if (period === 'MONTH') {
    return start.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '');
  }
  if (period === 'YEAR') {
    return String(start.getFullYear());
  }
  return start.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

function formatBucketTooltip(start: Date, period: CurvePeriod): string {
  if (period === 'MONTH') {
    return start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }
  if (period === 'YEAR') {
    return `Année ${start.getFullYear()}`;
  }
  return `Semaine du ${start.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  })}`;
}

function curveMetricLabel(metric: CurveMetric): string {
  if (metric === 'DISTANCE') return 'Distance';
  if (metric === 'SESSIONS') return 'Séances';
  if (metric === 'XP') return 'XP';
  return 'Temps';
}

function curveMetricUnit(metric: CurveMetric): string {
  if (metric === 'DISTANCE') return ' km';
  if (metric === 'SESSIONS') return ' séances';
  if (metric === 'XP') return ' XP';
  return ' min';
}

function metricIncrement(session: Session, metric: CurveMetric): number {
  if (metric === 'DISTANCE') return session.distanceKm ?? 0;
  if (metric === 'SESSIONS') return 1;
  if (metric === 'XP') return session.xp;
  return session.durationMin;
}

export default function Home({
  state,
  gamificationState,
  onReset,
  onExportState,
  onImportState
}: HomeProps): JSX.Element {
  const sessionsXp = state.sessions.reduce((sum, s) => sum + s.xp, 0);
  const totalXp = sessionsXp + state.bonusXp;
  const totalXpDisplay = GAMIFICATION_V1_ENABLED ? gamificationState.userLevel.xpTotal : totalXp;
  const weeklyXpDisplay = GAMIFICATION_V1_ENABLED
    ? gamificationState.userXpLog
        .filter((entry) => entry.weekKey === state.missionWeekKey)
        .reduce((sum, entry) => sum + entry.amount, 0)
    : state.sessions
        .filter((session) => getWeekKeyFromDate(new Date(session.createdAt)) === state.missionWeekKey)
        .reduce((sum, session) => sum + session.xp, 0);

  const level = GAMIFICATION_V1_ENABLED ? gamificationState.userLevel.level : getLevelFromXp(totalXpDisplay);
  const xpInto = GAMIFICATION_V1_ENABLED
    ? Math.max(0, gamificationState.userLevel.xpTotal - getXpForLevel(level))
    : getXpIntoLevel(totalXpDisplay);
  const xpToNext = GAMIFICATION_V1_ENABLED
    ? gamificationState.userLevel.xpToNextLevel
    : getXpToNextLevel(totalXpDisplay);
  const xpLevelGoal = xpInto + xpToNext;
  const ratio = GAMIFICATION_V1_ENABLED
    ? getLevelProgressRatioV1(gamificationState.userLevel.xpTotal)
    : getLevelProgressRatio(totalXpDisplay);

  const unlockLevels = [5, 10, 15, 20, 25, 30];
  const nextUnlock = unlockLevels.find((value) => value > level) ?? null;

  const [curveMetric, setCurveMetric] = useState<CurveMetric>('MINUTES');
  const [curvePeriod, setCurvePeriod] = useState<CurvePeriod>('WEEK');
  const [curvePage, setCurvePage] = useState(0);
  const [focusedDay, setFocusedDay] = useState<FocusedDay | null>(null);
  const appStartBucket = bucketStartForPeriod(APP_START_DATE, curvePeriod);
  const currentBucket = bucketStartForPeriod(new Date(), curvePeriod);
  const visibleCount = periodWindowSize(curvePeriod);
  const maxPastUnits = Math.max(0, diffInPeriodUnits(appStartBucket, currentBucket, curvePeriod));
  const maxPastPage = Math.floor(maxPastUnits / visibleCount);
  const safeCurvePage = Math.max(-2, Math.min(maxPastPage, curvePage));

  const curveData: {
    valuesByBucket: Map<string, number>;
    series: Array<{ bucketKey: string; label: string; value: number; bucketStart: Date }>;
    currentBucketKey: string;
  } = (() => {
    const valuesByBucket = new Map<string, number>();

    if (curveMetric === 'XP' && GAMIFICATION_V1_ENABLED) {
      for (const entry of gamificationState.userXpLog) {
        const bucketKey = bucketKeyForPeriod(new Date(entry.createdAt), curvePeriod);
        const current = valuesByBucket.get(bucketKey) ?? 0;
        valuesByBucket.set(bucketKey, current + entry.amount);
      }
    } else {
      for (const session of state.sessions) {
        const bucketKey = bucketKeyForPeriod(new Date(session.createdAt), curvePeriod);
        const current = valuesByBucket.get(bucketKey) ?? 0;
        valuesByBucket.set(bucketKey, current + metricIncrement(session, curveMetric));
      }
    }

    const now = new Date();
    const currentBucketStart = bucketStartForPeriod(now, curvePeriod);
    const minStartOffset = -maxPastUnits;
    const startOffset = Math.max(windowStartOffset(safeCurvePage, visibleCount), minStartOffset);

    const series: Array<{ bucketKey: string; label: string; value: number; bucketStart: Date }> = [];
    for (let i = 0; i < visibleCount; i += 1) {
      const offset = startOffset + i;
      const bucketStart = addPeriodUnits(currentBucketStart, curvePeriod, offset);
      const bucketKey = bucketKeyForPeriod(bucketStart, curvePeriod);
      series.push({
        bucketKey,
        label: formatBucketLabel(bucketStart, curvePeriod),
        value: valuesByBucket.get(bucketKey) ?? 0,
        bucketStart
      });
    }

    return {
      valuesByBucket,
      series,
      currentBucketKey: bucketKeyForPeriod(now, curvePeriod)
    };
  })();

  const maxValue = Math.max(1, ...curveData.series.map((item) => item.value));
  const bestBucket = curveData.series.reduce(
    (best, item) => (item.value > best.value ? item : best),
    curveData.series[0]
  );
  const currentPeriodValue = curveData.valuesByBucket.get(curveData.currentBucketKey) ?? 0;
  const canGoToPast = safeCurvePage < maxPastPage;
  const canGoToFuture = safeCurvePage > -2;

  const currentWeekStart = (() => {
    const start = startOfIsoWeek(new Date());
    return start < startOfIsoWeek(APP_START_DATE) ? startOfIsoWeek(APP_START_DATE) : start;
  })();
  const dayLabels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const weekCalendar: CalendarDay[] = dayLabels.map((label, index) => {
    const date = new Date(currentWeekStart);
    date.setDate(currentWeekStart.getDate() + index);
    const daySessions = state.sessions
      .filter((session) => sameDay(new Date(session.createdAt), date))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

    return {
      key: `${date.toISOString()}-${label}`,
      label,
      day: date.getDate(),
      date,
      sessions: daySessions,
      hasSession: daySessions.length > 0,
      isToday: sameDay(date, new Date())
    };
  });

  const activeDaysCount = weekCalendar.filter((day) => day.hasSession).length;

  const handleReset = (): void => {
    const ok = window.confirm('Réinitialiser toutes les données locales ?');
    if (ok) onReset();
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file) onImportState(file);
    event.currentTarget.value = '';
  };

  return (
    <section className="page page-home">
      <article
        className="card hero-card hero-card-photo"
        style={{ '--stats-progression-bg-image': `url(${statsProgressionBg})` } as CSSProperties}
      >
        <div className="hero-header">
          <h1>Tableau de progression</h1>
          <p className="page-subtitle">Ton hub d&apos;entraînement et de progression gamifiée.</p>
          <div className="home-sport-chips">
            <span>Suivi running</span>
            <span>Renfo & cardio</span>
            <span>Progression équipe</span>
          </div>
        </div>

        <div className="hero-kpis">
          <div className="kpi-chip">
            <span>XP totale</span>
            <strong>{totalXpDisplay}</strong>
          </div>
          <div className="kpi-chip">
            <span>Niveau</span>
            <strong>{level}</strong>
          </div>
          <div className="kpi-chip">
            <span>XP semaine</span>
            <strong>{weeklyXpDisplay}</strong>
          </div>
        </div>

        <ProgressBar
          ratio={ratio}
          label={`${xpInto}/${xpLevelGoal} XP vers le niveau suivant`}
        />
        <p className="next-level">Encore {xpToNext} XP pour le niveau suivant.</p>

        <div className="hero-strip">
          <span>Semaine active: {state.missionWeekKey}</span>
          <span>
            {nextUnlock ? `Prochain palier surprise: niveau ${nextUnlock}` : 'Tous les paliers sont débloqués'}
          </span>
        </div>

        <div className="home-actions">
          <button type="button" className="btn-compact" onClick={onExportState}>
            Export JSON
          </button>
          <label className="import-label btn-compact">
            Import JSON
            <input
              type="file"
              accept="application/json"
              onChange={handleImportFile}
              className="import-input"
            />
          </label>
          <button type="button" className="danger btn-compact" onClick={handleReset}>
            Reset
          </button>
        </div>
      </article>

      <article className="card premium-section week-calendar-card">
        <div className="week-calendar-head">
          <h2>Semaine en cours</h2>
          <p className="page-subtitle">{activeDaysCount}/7 jours actifs cette semaine.</p>
        </div>
        <div className="week-calendar-grid">
          {weekCalendar.map((day) => (
            <button
              key={day.key}
              type="button"
              className={`week-day ${day.hasSession ? 'is-trained' : ''} ${day.isToday ? 'is-today' : ''}`}
              onClick={() => {
                if (!day.hasSession) return;
                setFocusedDay({
                  label: day.label,
                  dateText: day.date.toLocaleDateString('fr-FR', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'long'
                  }),
                  sessions: day.sessions
                });
              }}
              disabled={!day.hasSession}
            >
              <span>{day.label}</span>
              <strong>{day.day}</strong>
              <em>{day.hasSession ? `Check (${day.sessions.length})` : '—'}</em>
            </button>
          ))}
        </div>
      </article>

      <article className="card premium-section week-curve-card">
        <div className="week-curve-head">
          <h2>Charge d&apos;entraînement</h2>
          <div className="curve-period-toggle">
            <button
              type="button"
              className={curvePeriod === 'WEEK' ? 'is-active' : ''}
              onClick={() => {
                setCurvePeriod('WEEK');
                setCurvePage(0);
              }}
            >
              Semaine
            </button>
            <button
              type="button"
              className={curvePeriod === 'MONTH' ? 'is-active' : ''}
              onClick={() => {
                setCurvePeriod('MONTH');
                setCurvePage(0);
              }}
            >
              Mois
            </button>
            <button
              type="button"
              className={curvePeriod === 'YEAR' ? 'is-active' : ''}
              onClick={() => {
                setCurvePeriod('YEAR');
                setCurvePage(0);
              }}
            >
              Année
            </button>
          </div>
          <div className="curve-toggle">
            <button
              type="button"
              className={curveMetric === 'MINUTES' ? 'is-active' : ''}
              onClick={() => setCurveMetric('MINUTES')}
            >
              Temps
            </button>
            <button
              type="button"
              className={curveMetric === 'DISTANCE' ? 'is-active' : ''}
              onClick={() => setCurveMetric('DISTANCE')}
            >
              Distance
            </button>
            <button
              type="button"
              className={curveMetric === 'SESSIONS' ? 'is-active' : ''}
              onClick={() => setCurveMetric('SESSIONS')}
            >
              Séances
            </button>
            <button
              type="button"
              className={curveMetric === 'XP' ? 'is-active' : ''}
              onClick={() => setCurveMetric('XP')}
            >
              XP
            </button>
          </div>
        </div>

        <div className="curve-gaming-kpis">
          <div>
            <span>Meilleure période visible</span>
            <strong>
              {bestBucket.label} ·{' '}
              {curveMetric === 'DISTANCE' ? bestBucket.value.toFixed(1) : Math.round(bestBucket.value)}
              {curveMetricUnit(curveMetric)}
            </strong>
          </div>
          <div>
            <span>Période actuelle</span>
            <strong>
              {curvePeriod === 'WEEK'
                ? 'Cette semaine'
                : curvePeriod === 'MONTH'
                  ? 'Ce mois'
                  : 'Cette année'}{' '}
              · {curveMetric === 'DISTANCE' ? currentPeriodValue.toFixed(1) : Math.round(currentPeriodValue)}
              {curveMetricUnit(curveMetric)}
            </strong>
          </div>
          <div>
            <span>Vue</span>
            <strong>{curvePeriodLabel(curvePeriod)} · {curveMetricLabel(curveMetric)}</strong>
          </div>
        </div>

        <div className="curve-nav">
          <button
            type="button"
            className="btn-compact"
            onClick={() => setCurvePage((prev) => Math.min(maxPastPage, prev + 1))}
            disabled={!canGoToPast}
          >
            ← Périodes précédentes
          </button>
          <button
            type="button"
            className="btn-compact"
            onClick={() => setCurvePage((prev) => Math.max(-2, prev - 1))}
            disabled={!canGoToFuture}
          >
            Périodes suivantes →
          </button>
        </div>

        <div className="curve-wrap">
          <div
            className="bars-grid"
            aria-label={`Graphique ${curvePeriodLabel(curvePeriod).toLowerCase()}`}
            style={{ gridTemplateColumns: `repeat(${curveData.series.length}, minmax(0, 1fr))` }}
          >
            {curveData.series.map((item) => {
              const height = Math.max(4, (item.value / maxValue) * 100);
              const isCurrent = item.bucketKey === curveData.currentBucketKey;
              const isBest = item.bucketKey === bestBucket.bucketKey;
              return (
                <div
                  key={item.bucketKey}
                  className={`bar-col ${isCurrent ? 'is-current' : ''} ${isBest ? 'is-best' : ''}`}
                  title={`${formatBucketTooltip(item.bucketStart, curvePeriod)}: ${
                    curveMetric === 'DISTANCE' ? item.value.toFixed(1) : Math.round(item.value)
                  }${curveMetricUnit(curveMetric)}`}
                >
                  <div className="bar-track">
                    <div className="bar-fill" style={{ height: `${height}%` }} />
                  </div>
                  <span className="bar-label">{item.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </article>

      {focusedDay ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <article className="card session-modal">
            <h2>Séances du {focusedDay.dateText}</h2>
            <p className="page-subtitle">
              {focusedDay.sessions.length} séance{focusedDay.sessions.length > 1 ? 's' : ''} validée
              {focusedDay.sessions.length > 1 ? 's' : ''}.
            </p>

            <div className="day-session-list">
              {focusedDay.sessions.map((session) => (
                <article key={session.id} className="day-session-item">
                  <p>
                    <strong>{session.sportType}</strong> · {session.subtype}
                  </p>
                  <p>
                    {session.durationMin} min
                    {typeof session.distanceKm === 'number' ? ` · ${session.distanceKm} km` : ''}
                  </p>
                  <p>
                    État de forme {session.feelings.feltState}/5 · RPE {session.feelings.rpe}/10 · Fatigue{' '}
                    {session.feelings.fatigue}/5
                  </p>
                  <p>
                    <strong>+{session.xp} XP</strong> ·{' '}
                    {new Date(session.createdAt).toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                  {session.comment ? <p className="session-comment">{session.comment}</p> : null}
                </article>
              ))}
            </div>

            <div className="modal-actions">
              <button type="button" onClick={() => setFocusedDay(null)}>
                Fermer
              </button>
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}
